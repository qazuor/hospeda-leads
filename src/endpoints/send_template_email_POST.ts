import { resolveCommercialContact } from "../helpers/commercialContact";
import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { htmlToPlainText, renderMessageTemplate, renderMessageTemplateHtml } from "../helpers/renderMessageTemplate";
import { buildHospedaEmailHtml, buildHospedaEmailText } from "../helpers/hospedaEmailLayout";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
import { schema, type OutputType } from "./send_template_email_POST.schema";

export async function handle(request:Request){
  let outboxId:string|null=null;
  try{
    const {user}=await getServerUserSession(request);
    const input=schema.parse(superjson.parse(await request.text()));
    const [lead,template,emailRows,senderUser]=await Promise.all([
      db.selectFrom("leads")
        .selectAll()
        .where("id","=",String(input.leadId))
        .where("deletedAt","is",null)
        .executeTakeFirst(),
      db.selectFrom("messageTemplates")
        .selectAll()
        .where("id","=",String(input.templateId))
        .where("active","=",true)
        .executeTakeFirst(),
      db.selectFrom("appSettings")
        .select(["key","value"])
        .where("key","in",["brevo_sender_name","brevo_sender_email","brevo_reply_to_email"])
        .execute(),
      db.selectFrom("users").select(["senderEmail","fullName","displayName"]).where("id","=",user.id).executeTakeFirst()
    ]);

    if(!lead)return new Response(superjson.stringify({error:"El lead ya no existe o está en la papelera."}),{status:404});
    if(!template||template.channel!=="email")return new Response(superjson.stringify({error:"El template seleccionado no es un template de Email."}),{status:400});
    let contact;
    try{contact=await resolveCommercialContact(db,lead,input.contactId)}catch(error){return new Response(superjson.stringify({error:error instanceof Error?error.message:"Contacto inválido"}),{status:400})}
    if(!contact.email)return new Response(superjson.stringify({error:"El destinatario seleccionado no tiene email cargado."}),{status:400});
    if(template.vertical&&template.vertical!==lead.tipo)return new Response(superjson.stringify({error:"El template no corresponde a la vertical de este lead."}),{status:400});
    if(template.commercialProfile&&template.commercialProfile!==lead.commercialProfile)return new Response(superjson.stringify({error:"El template no corresponde al perfil comercial de este lead."}),{status:400});

    const emailConfig=Object.fromEntries(emailRows.map(row=>[row.key,row.value]));
    const userSenderEmail=senderUser?.senderEmail?.trim()||"";
    const senderName=userSenderEmail?user.displayName:(emailConfig.brevo_sender_name||"Hospeda");
    const senderEmail=userSenderEmail||(emailConfig.brevo_sender_email||"notificaciones@hospeda.com.ar");
    const replyToEmail=userSenderEmail||(emailConfig.brevo_reply_to_email||"contacto@hospeda.com.ar");
    const replyToName=userSenderEmail?user.displayName:"Hospeda";
    const apiKey=(process.env as Record<string,string|undefined>).BREVO_API_KEY;
    if(!apiKey)return new Response(superjson.stringify({error:"Brevo todavía no está conectado al CRM. Conectá BREVO_API_KEY y volvé a intentar."}),{status:503});

    const templateSender=senderUser?.fullName?.trim()||user.fullName?.trim()||user.displayName;
    const templateSenderShort=senderUser?.displayName||user.displayName;
    const context={
      name:lead.nombre,
      contact:contact.name,
      contact_name:contact.name,
      city:lead.ciudad,
      type:lead.tipo,
      subtype:lead.subtipo,
      phone:contact.phone,
      email:contact.email,
      website:lead.sitioWeb,
      sender:templateSender,
      sender_short:templateSenderShort
    };
    const subject=renderMessageTemplate(template.subject??"",context).trim()||"Mensaje de Hospeda";
    const rendered=renderMessageTemplateHtml(template.body,context);
    const bodyText=htmlToPlainText(rendered);
    const htmlBody=buildHospedaEmailHtml({
      bodyHtml:rendered,
      senderName:templateSender,
      subject,
      vertical:lead.tipo,
      commercialProfile:lead.commercialProfile,
      logoUrl:(process.env.PUBLIC_APP_URL??"http://localhost:3001").replace(/\/$/,"")+"/hospeda-logo.jpg"
    });
    const textBody=buildHospedaEmailText({bodyText,senderName:templateSender});

    const inserted=await db.insertInto("emailOutbox").values({
      leadId:String(lead.id),
      templateId:String(template.id),
      recipientEmail:contact.email,
      recipientName:contact.name||lead.nombre,
      senderEmail,
      senderName,
      replyToEmail,
      replyToName,
      subject,
      htmlBody,
      textBody,
      status:"pending",
      attempts:0,
      requestedByUserId:user.id,
      requestedByEmail:user.email,
      requestedByName:user.displayName
    }).returning("id").executeTakeFirstOrThrow();
    outboxId=String(inserted.id);

    const response=await fetch("https://api.brevo.com/v3/smtp/email",{
      method:"POST",
      headers:{
        "accept":"application/json",
        "api-key":apiKey,
        "content-type":"application/json"
      },
      body:JSON.stringify({
        sender:{name:senderName,email:senderEmail},
        to:[{email:contact.email,name:contact.name||lead.nombre}],
        replyTo:{email:replyToEmail,name:replyToName},
        subject,
        htmlContent:htmlBody,
        textContent:textBody,
        headers:{
          "X-Hospeda-Lead-Id":String(lead.id),
          "X-Hospeda-Template-Id":String(template.id),
          "X-Hospeda-Outbox-Id":outboxId
        }
      })
    });

    const raw=await response.text();
    if(!response.ok){
      let detail=raw;
      try{
        const parsed=JSON.parse(raw) as {message?:string;code?:string};
        detail=[parsed.code,parsed.message].filter(Boolean).join(": ")||raw;
      }catch{}
      await db.updateTable("emailOutbox").set({
        status:"error",
        attempts:1,
        lastError:detail.slice(0,2000),
        updatedAt:new Date()
      }).where("id","=",outboxId).execute();
      return new Response(superjson.stringify({error:"Brevo rechazó el envío: "+detail}),{status:502});
    }

    let messageId="";
    try{
      const parsed=JSON.parse(raw) as {messageId?:string};
      messageId=parsed.messageId??"";
    }catch{}
    if(!messageId)messageId="brevo-accepted-"+outboxId;

    await db.transaction().execute(async trx=>{
      await trx.updateTable("emailOutbox").set({
        status:"sent",
        attempts:1,
        messageId,
        lastError:null,
        sentAt:new Date(),
        updatedAt:new Date()
      }).where("id","=",outboxId!).execute();
      await writeLeadJournal(trx,{
        leadId:String(lead.id),
        leadName:lead.nombre,
        leadCity:lead.ciudad,
        leadType:lead.tipo,
        actor:{id:user.id,email:user.email,displayName:user.displayName},
        action:"email_sent",
        metadata:{
          contactId:contact.contactId,
          channel:"email",
          templateId:String(template.id),
          templateName:template.name,
          recipient:contact.email,
          sender:`${senderName} <${senderEmail}>`,
          replyTo:replyToEmail,
          subject,
          messageId,
          outboxId
        }
      });
    });

    return new Response(superjson.stringify({ok:true,messageId,outboxId} satisfies OutputType),{
      headers:{"Content-Type":"application/json"}
    });
  }catch(error){
    const message=error instanceof Error?error.message:"No se pudo enviar el email";
    if(outboxId){
      try{
        await db.updateTable("emailOutbox").set({
          status:"error",
          attempts:1,
          lastError:message.slice(0,2000),
          updatedAt:new Date()
        }).where("id","=",outboxId).execute();
      }catch{}
    }
    return new Response(superjson.stringify({error:message}),{status:500});
  }
}