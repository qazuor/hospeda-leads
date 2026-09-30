import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./settings_save_POST.schema";

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    if(user.role!=="admin")return new Response(superjson.stringify({error:"Solo administradores pueden modificar Configuración."}),{status:403});
    const input=schema.parse(superjson.parse(await request.text()));
    if(input.action==="addCity"){
      await db.insertInto("crmCities").values({name:input.name.trim()}).onConflict(oc=>oc.column("name").doUpdateSet({active:true})).execute();
    }
    if(input.action==="addSubtype"){
      await db.insertInto("crmSubtypes")
        .values({name:input.name.trim(),typeName:input.typeName?.trim()||null})
        .onConflict(oc=>oc.columns(["typeName","name"]).doUpdateSet({active:true}))
        .execute();
    }
    if(input.action==="addEmail"){
      const email=input.email.trim().toLowerCase();
      await db.insertInto("authorizedEmails").values({email,displayName:input.displayName?.trim()||email}).onConflict(oc=>oc.column("email").doUpdateSet({active:true,displayName:input.displayName?.trim()||email})).execute();
    }
    if(input.action==="saveUserSenderEmail"){
      const senderEmail=input.senderEmail?.trim().toLowerCase()||null;
      const userRow=await db.selectFrom("users").select(["id","displayName"]).where("id","=",input.userId).executeTakeFirst();
      if(!userRow)return new Response(superjson.stringify({error:"El usuario no existe."}),{status:404});
      if(senderEmail&&!senderEmail.endsWith("@hospeda.com.ar")){
        return new Response(superjson.stringify({error:"El remitente debe pertenecer a @hospeda.com.ar."}),{status:400});
      }
      if(senderEmail){
        const apiKey=(process.env as Record<string,string|undefined>).BREVO_API_KEY;
        if(!apiKey)return new Response(superjson.stringify({error:"BREVO_API_KEY no está configurada."}),{status:503});
        const headers={"accept":"application/json","api-key":apiKey};
        const sendersResponse=await fetch("https://api.brevo.com/v3/senders?domain=hospeda.com.ar",{headers});
        if(!sendersResponse.ok){
          return new Response(superjson.stringify({error:"No pude consultar los remitentes de Brevo."}),{status:502});
        }
        const sendersPayload=await sendersResponse.json() as {senders?:Array<{email?:string}>};
        const exists=(sendersPayload.senders??[]).some(sender=>sender.email?.toLowerCase()===senderEmail);
        if(!exists){
          const createResponse=await fetch("https://api.brevo.com/v3/senders",{
            method:"POST",
            headers:{...headers,"content-type":"application/json"},
            body:JSON.stringify({name:userRow.displayName,email:senderEmail})
          });
          if(!createResponse.ok){
            const raw=await createResponse.text();
            let detail=raw;
            try{
              const parsed=JSON.parse(raw) as {message?:string;code?:string};
              detail=[parsed.code,parsed.message].filter(Boolean).join(": ")||raw;
            }catch{}
            return new Response(superjson.stringify({error:"Brevo rechazó el remitente: "+detail}),{status:502});
          }
        }
        await db.insertInto("appSettings")
          .values({key:`brevo_user_sender_email:${input.userId}`,value:senderEmail})
          .onConflict(oc=>oc.column("key").doUpdateSet({value:senderEmail,updatedAt:new Date()}))
          .execute();
      }else{
        await db.deleteFrom("appSettings").where("key","=",`brevo_user_sender_email:${input.userId}`).execute();
      }
    }
    if(input.action==="saveEmailDelivery"){
      const rows=[
        {key:"brevo_sender_name",value:input.senderName.trim()},
        {key:"brevo_sender_email",value:input.senderEmail.trim().toLowerCase()},
        {key:"brevo_reply_to_email",value:input.replyToEmail.trim().toLowerCase()}
      ];
      for(const row of rows){
        await db.insertInto("appSettings")
          .values(row)
          .onConflict(oc=>oc.column("key").doUpdateSet({value:row.value,updatedAt:new Date()}))
          .execute();
      }
    }
    if(input.action==="saveTemplate"){
      if(input.channel==="whatsapp"&&input.commercialProfile==="Referente"){
        return new Response(superjson.stringify({error:"El perfil Referente solo admite templates de Email."}),{status:400});
      }
      if(input.id){
        await db.updateTable("messageTemplates").set({
          channel:input.channel,name:input.name.trim(),subject:input.channel==="email"?(input.subject?.trim()||null):null,
          body:input.body,vertical:input.vertical?.trim()||null,commercialProfile:input.commercialProfile??null,updatedAt:new Date()
        }).where("id","=",String(input.id)).execute();
      }else{
        await db.insertInto("messageTemplates").values({
          channel:input.channel,name:input.name.trim(),subject:input.channel==="email"?(input.subject?.trim()||null):null,body:input.body,
          vertical:input.vertical?.trim()||null,commercialProfile:input.commercialProfile??null
        }).execute();
      }
    }
    return new Response(superjson.stringify({ok:true} satisfies OutputType));
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo guardar configuración"}),{status:400});
  }
}