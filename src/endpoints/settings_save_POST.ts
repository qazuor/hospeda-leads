import { createHash, randomBytes } from "node:crypto";
import superjson from "superjson";
import { db } from "../helpers/db";
import { buildHospedaEmailHtml, buildHospedaEmailText } from "../helpers/hospedaEmailLayout";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./settings_save_POST.schema";

const INVITE_PREFIX="user_invitation:";
const INVITE_TTL_MS=7*24*60*60*1000;

const normalizeEmail=(value:string)=>value.trim().toLowerCase();
const escapeHtml=(value:string)=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");

const ensureHospedaSender=async(displayName:string,senderEmail:string|null)=>{
  if(!senderEmail)return;
  if(!senderEmail.endsWith("@hospeda.com.ar"))throw new Error("El remitente debe pertenecer a @hospeda.com.ar.");
  const apiKey=(process.env as Record<string,string|undefined>).BREVO_API_KEY;
  if(!apiKey)throw new Error("BREVO_API_KEY no está configurada.");
  const headers={"accept":"application/json","api-key":apiKey};
  const sendersResponse=await fetch("https://api.brevo.com/v3/senders?domain=hospeda.com.ar",{headers});
  if(!sendersResponse.ok)throw new Error("No pude consultar los remitentes de Brevo.");
  const sendersPayload=await sendersResponse.json() as {senders?:Array<{email?:string}>};
  const exists=(sendersPayload.senders??[]).some(sender=>sender.email?.toLowerCase()===senderEmail);
  if(exists)return;
  const createResponse=await fetch("https://api.brevo.com/v3/senders",{
    method:"POST",
    headers:{...headers,"content-type":"application/json"},
    body:JSON.stringify({name:displayName,email:senderEmail})
  });
  if(!createResponse.ok){
    const raw=await createResponse.text();
    let detail=raw;
    try{
      const parsed=JSON.parse(raw) as {message?:string;code?:string};
      detail=[parsed.code,parsed.message].filter(Boolean).join(": ")||raw;
    }catch{}
    throw new Error("Brevo rechazó el remitente: "+detail);
  }
};

const saveSenderSetting=async(userId:number,senderEmail:string|null)=>{
  const key=`brevo_user_sender_email:${userId}`;
  if(senderEmail){
    await db.insertInto("appSettings").values({key,value:senderEmail})
      .onConflict(oc=>oc.column("key").doUpdateSet({value:senderEmail,updatedAt:new Date()})).execute();
  }else{
    await db.deleteFrom("appSettings").where("key","=",key).execute();
  }
};

const invitationRows=()=>db.selectFrom("appSettings").select(["key","value"]).where("key","like",INVITE_PREFIX+"%").execute();

const deleteInvitationsForUser=async(userId:number,keepKey?:string)=>{
  const rows=await invitationRows();
  const keys=rows.flatMap(row=>{
    if(row.key===keepKey)return [];
    try{
      const parsed=JSON.parse(row.value) as {userId?:number};
      return parsed.userId===userId?[row.key]:[];
    }catch{return []}
  });
  if(keys.length)await db.deleteFrom("appSettings").where("key","in",keys).execute();
};

const sendInvitationEmail=async({
  recipient,displayName,token,requestedByName
}:{
  recipient:string;displayName:string;token:string;requestedByName:string
})=>{
  const apiKey=(process.env as Record<string,string|undefined>).BREVO_API_KEY;
  if(!apiKey)throw new Error("BREVO_API_KEY no está configurada.");
  const appUrl=(process.env.PUBLIC_APP_URL??"").replace(/\/$/,"");
  if(!appUrl)throw new Error("PUBLIC_APP_URL no está configurada.");
  const settings=await db.selectFrom("appSettings").select(["key","value"]).where("key","in",[
    "brevo_sender_name","brevo_sender_email","brevo_reply_to_email"
  ]).execute();
  const config=Object.fromEntries(settings.map(row=>[row.key,row.value]));
  const senderName=config.brevo_sender_name||"Hospeda";
  const senderEmail=config.brevo_sender_email||"notificaciones@hospeda.com.ar";
  const replyToEmail=config.brevo_reply_to_email||"contacto@hospeda.com.ar";
  const inviteUrl=`${appUrl}/register?invite=${encodeURIComponent(token)}`;
  const safeName=escapeHtml(displayName);
  const safeUrl=escapeHtml(inviteUrl);
  const subject="Te invitaron al CRM de Hospeda";
  const bodyHtml=`<p>Hola <strong>${safeName}</strong>,</p><p>${escapeHtml(requestedByName)} te habilitó el acceso al CRM de Hospeda.</p><p>Para activar tu usuario, abrí el siguiente enlace y elegí tu contraseña:</p><p><a href="${safeUrl}">Crear mi acceso al CRM</a></p><p>Este enlace vence en 7 días y solo puede usarse una vez.</p><p>Si no esperabas esta invitación, podés ignorar este correo.</p>`;
  const textBody=buildHospedaEmailText({
    bodyText:`Hola ${displayName},\n\n${requestedByName} te habilitó el acceso al CRM de Hospeda.\n\nCreá tu contraseña desde este enlace:\n${inviteUrl}\n\nEl enlace vence en 7 días y solo puede usarse una vez.`,
    senderName
  });
  const htmlBody=buildHospedaEmailHtml({
    bodyHtml,
    senderName,
    subject,
    vertical:"CRM Hospeda",
    logoUrl:appUrl+"/hospeda-logo.jpg"
  });
  const response=await fetch("https://api.brevo.com/v3/smtp/email",{
    method:"POST",
    headers:{"accept":"application/json","api-key":apiKey,"content-type":"application/json"},
    body:JSON.stringify({
      sender:{name:senderName,email:senderEmail},
      to:[{email:recipient,name:displayName}],
      replyTo:{email:replyToEmail,name:senderName},
      subject,
      htmlContent:htmlBody,
      textContent:textBody
    })
  });
  if(!response.ok){
    const raw=await response.text();
    let detail=raw;
    try{
      const parsed=JSON.parse(raw) as {message?:string;code?:string};
      detail=[parsed.code,parsed.message].filter(Boolean).join(": ")||raw;
    }catch{}
    throw new Error("Brevo rechazó la invitación: "+detail);
  }
};

const createAndSendInvitation=async(userId:number,email:string,displayName:string,requestedByName:string)=>{
  const token=randomBytes(32).toString("hex");
  const hash=createHash("sha256").update(token).digest("hex");
  const key=INVITE_PREFIX+hash;
  const expiresAt=new Date(Date.now()+INVITE_TTL_MS);
  await db.insertInto("appSettings").values({
    key,
    value:JSON.stringify({userId,email,expiresAt:expiresAt.toISOString()})
  }).execute();
  try{
    await sendInvitationEmail({recipient:email,displayName,token,requestedByName});
    await deleteInvitationsForUser(userId,key);
  }catch(error){
    await db.deleteFrom("appSettings").where("key","=",key).execute();
    throw error;
  }
};

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
      const email=normalizeEmail(input.email);
      await db.insertInto("authorizedEmails").values({email,displayName:input.displayName?.trim()||email})
        .onConflict(oc=>oc.column("email").doUpdateSet({active:true,displayName:input.displayName?.trim()||email})).execute();
    }
    if(input.action==="saveUserSenderEmail"){
      const senderEmail=input.senderEmail?normalizeEmail(input.senderEmail):null;
      const userRow=await db.selectFrom("users").select(["id","displayName"]).where("id","=",input.userId).executeTakeFirst();
      if(!userRow)return new Response(superjson.stringify({error:"El usuario no existe."}),{status:404});
      await ensureHospedaSender(userRow.displayName,senderEmail);
      await saveSenderSetting(userRow.id,senderEmail);
    }
    if(input.action==="inviteUser"){
      const email=normalizeEmail(input.email);
      const displayName=input.displayName.trim();
      const senderEmail=input.senderEmail?normalizeEmail(input.senderEmail):null;
      await ensureHospedaSender(displayName,senderEmail);
      const existing=await db.selectFrom("users").select(["id"]).where(eb=>eb.fn("lower",["email"]),"=",email).executeTakeFirst();
      let userId:number;
      if(existing){
        const password=await db.selectFrom("userPasswords").select("id").where("userId","=",existing.id).executeTakeFirst();
        if(password)return new Response(superjson.stringify({error:"Ese email ya pertenece a un usuario activo."}),{status:409});
        userId=existing.id;
        await db.updateTable("users").set({displayName,role:input.role,updatedAt:new Date()}).where("id","=",userId).execute();
      }else{
        const created=await db.insertInto("users").values({email,displayName,role:input.role}).returning("id").executeTakeFirstOrThrow();
        userId=created.id;
      }
      await db.insertInto("authorizedEmails").values({email,displayName,active:true})
        .onConflict(oc=>oc.column("email").doUpdateSet({active:true,displayName})).execute();
      await saveSenderSetting(userId,senderEmail);
      await createAndSendInvitation(userId,email,displayName,user.displayName);
    }
    if(input.action==="resendUserInvite"){
      const target=await db.selectFrom("users").select(["id","email","displayName"]).where("id","=",input.userId).executeTakeFirst();
      if(!target)return new Response(superjson.stringify({error:"El usuario no existe."}),{status:404});
      const password=await db.selectFrom("userPasswords").select("id").where("userId","=",target.id).executeTakeFirst();
      if(password)return new Response(superjson.stringify({error:"Ese usuario ya terminó de crear su acceso."}),{status:409});
      await createAndSendInvitation(target.id,target.email,target.displayName,user.displayName);
    }
    if(input.action==="updateUser"){
      const email=normalizeEmail(input.email);
      const displayName=input.displayName.trim();
      const senderEmail=input.senderEmail?normalizeEmail(input.senderEmail):null;
      const target=await db.selectFrom("users").select(["id","email","role"]).where("id","=",input.userId).executeTakeFirst();
      if(!target)return new Response(superjson.stringify({error:"El usuario no existe."}),{status:404});
      const collision=await db.selectFrom("users").select("id")
        .where(eb=>eb.fn("lower",["email"]),"=",email)
        .where("id","!=",target.id).executeTakeFirst();
      if(collision)return new Response(superjson.stringify({error:"Ese email ya está usado por otro usuario."}),{status:409});
      if(target.role==="admin"&&input.role==="user"){
        const admins=await db.selectFrom("users").select(({fn})=>fn.count<number>("id").as("count")).where("role","=","admin").executeTakeFirst();
        if(Number(admins?.count??0)<=1)return new Response(superjson.stringify({error:"Debe quedar al menos un administrador."}),{status:400});
      }
      await ensureHospedaSender(displayName,senderEmail);
      await db.transaction().execute(async trx=>{
        if(target.email.toLowerCase()!==email){
          await trx.updateTable("authorizedEmails").set({active:false}).where("email","=",target.email.toLowerCase()).execute();
        }
        await trx.insertInto("authorizedEmails").values({email,displayName,active:true})
          .onConflict(oc=>oc.column("email").doUpdateSet({active:true,displayName})).execute();
        await trx.updateTable("users").set({email,displayName,role:input.role,updatedAt:new Date()}).where("id","=",target.id).execute();
      });
      await saveSenderSetting(target.id,senderEmail);
      if(target.email.toLowerCase()!==email)await deleteInvitationsForUser(target.id);
    }
    if(input.action==="saveEmailDelivery"){
      const rows=[
        {key:"brevo_sender_name",value:input.senderName.trim()},
        {key:"brevo_sender_email",value:normalizeEmail(input.senderEmail)},
        {key:"brevo_reply_to_email",value:normalizeEmail(input.replyToEmail)}
      ];
      for(const row of rows){
        await db.insertInto("appSettings").values(row)
          .onConflict(oc=>oc.column("key").doUpdateSet({value:row.value,updatedAt:new Date()})).execute();
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
