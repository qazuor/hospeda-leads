import {setWorkActor} from "../helpers/workAudit";
import {lockAccounts} from "../helpers/crmPermissions";
import { createHash, randomBytes } from "node:crypto";
import superjson from "superjson";
import { db } from "../helpers/db";
import { buildHospedaEmailHtml, buildHospedaEmailText } from "../helpers/hospedaEmailLayout";
import {sql} from 'kysely';
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./settings_save_POST.schema";
import { validateMessageVariables } from "../helpers/messageVariables";
import {errorResponse} from '../helpers/errorResponse';
import {parseBody} from '../helpers/parseBody';
import {validateTemplateMaterials} from '../helpers/templateMaterialService';
import {findCityRow} from '../helpers/catalogCity';
import {normalizeWhatsappPhone} from '../helpers/userAdmin';
import {canChangeUserRole,canDeactivateUser} from '../helpers/userAdmin';
import {generatePasswordHash} from '../helpers/generatePasswordHash';
import {createAndSendRecoveryEmail} from './auth/passwordRecoveryEmail';

const INVITE_PREFIX="user_invitation:";
const INVITE_TTL_MS=7*24*60*60*1000;

const normalizeEmail=(value:string)=>value.trim().toLowerCase();
const escapeHtml=(value:string)=>value
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#39;");

const invitationRows=()=>db.selectFrom("appSettings")
  .select(["key","value"])
  .where("key","like",INVITE_PREFIX+"%")
  .execute();

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

const ensureHospedaSender=async(displayName:string,senderEmail:string|null)=>{
  if(!senderEmail)return;
  if(!senderEmail.endsWith("@hospeda.com.ar"))throw new Error("El email de Hospeda debe pertenecer a @hospeda.com.ar.");

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

const sendInvitationEmail=async({
  recipient,token,requestedByName
}:{
  recipient:string;token:string;requestedByName:string
})=>{
  const apiKey=(process.env as Record<string,string|undefined>).BREVO_API_KEY;
  if(!apiKey)throw new Error("BREVO_API_KEY no está configurada.");

  const appUrl=(process.env.PUBLIC_APP_URL??"").replace(/\/$/,"");
  if(!appUrl)throw new Error("PUBLIC_APP_URL no está configurada.");

  const rows=await db.selectFrom("appSettings").select(["key","value"]).where("key","in",[
    "brevo_sender_name","brevo_sender_email","brevo_reply_to_email"
  ]).execute();
  const config=Object.fromEntries(rows.map(row=>[row.key,row.value]));
  const senderName=config.brevo_sender_name||"Hospeda";
  const senderEmail=config.brevo_sender_email||"notificaciones@hospeda.com.ar";
  const replyToEmail=config.brevo_reply_to_email||"contacto@hospeda.com.ar";
  const inviteUrl=`${appUrl}/register?invite=${encodeURIComponent(token)}`;
  const safeUrl=escapeHtml(inviteUrl);
  const subject="Te invitaron al CRM de Hospeda";
  const bodyHtml=`<p>Hola,</p>
<p>${escapeHtml(requestedByName)} te habilitó el acceso al CRM de Hospeda.</p>
<p>Para completar tu usuario, abrí este enlace. Ahí vas a cargar tus datos y elegir tu contraseña:</p>
<p><a href="${safeUrl}">Completar mi usuario</a></p>
<p>El enlace vence en 7 días y puede utilizarse una sola vez.</p>
<p>Si no esperabas esta invitación, podés ignorar este correo.</p>`;
  const bodyText=`Hola,\n\n${requestedByName} te habilitó el acceso al CRM de Hospeda.\n\nCompletá tu usuario y elegí tu contraseña desde este enlace:\n${inviteUrl}\n\nEl enlace vence en 7 días y puede utilizarse una sola vez.`;

  const response=await fetch("https://api.brevo.com/v3/smtp/email",{
    method:"POST",
    headers:{"accept":"application/json","api-key":apiKey,"content-type":"application/json"},
    body:JSON.stringify({
      sender:{name:senderName,email:senderEmail},
      to:[{email:recipient}],
      replyTo:{email:replyToEmail,name:senderName},
      subject,
      htmlContent:buildHospedaEmailHtml({
        bodyHtml,
        senderName,
        subject,
        logoUrl:appUrl+"/hospeda-logo.jpg"
      }),
      textContent:buildHospedaEmailText({bodyText,senderName})
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

const createAndSendInvitation=async(userId:number,email:string,requestedByName:string)=>{
  const token=randomBytes(32).toString("hex");
  const hash=createHash("sha256").update(token).digest("hex");
  const key=INVITE_PREFIX+hash;
  const expiresAt=new Date(Date.now()+INVITE_TTL_MS);

  await db.insertInto("appSettings").values({
    key,
    value:JSON.stringify({userId,email,expiresAt:expiresAt.toISOString()})
  }).execute();

  try{
    await sendInvitationEmail({recipient:email,token,requestedByName});
    await deleteInvitationsForUser(userId,key);
  }catch(error){
    await db.deleteFrom("appSettings").where("key","=",key).execute();
    throw error;
  }
};

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    if(user.role!=="admin"){
      return new Response(superjson.stringify({error:"Solo administradores pueden modificar Configuración."}),{status:403});
    }
    const input=schema.parse(await parseBody(request));

    if(input.action==="saveUserscriptAutoRegister"){
      await db.insertInto("appSettings").values({key:"crm_userscript_auto_register",value:JSON.stringify({enabled:input.enabled})})
        .onConflict(oc=>oc.column("key").doUpdateSet({value:JSON.stringify({enabled:input.enabled}),updatedAt:new Date()})).execute();
    }
    if(input.action==="saveUserscriptAttachFiles"){
      await db.insertInto("appSettings").values({key:"crm_userscript_attach_files",value:JSON.stringify({enabled:input.enabled})})
        .onConflict(oc=>oc.column("key").doUpdateSet({value:JSON.stringify({enabled:input.enabled}),updatedAt:new Date()})).execute();
    }

    if(input.action==="addCity"){
      // Spec 104 (37): no new city that differs from an existing one only by accents, case or spaces (ñ ≠ n). The exact spelling is used
      // as typed; an active match by `cityKey` is reported (409); an inactive one is reactivated. With duplicates, active wins, then exact.
      const name=input.name.trim(),existing=findCityRow({name,rows:await db.selectFrom("crmCities").select(["id","name","active"]).execute()});
      if(existing?.active&&existing.name!==name)return new Response(superjson.stringify({error:`Ya existe «${existing.name}». Usá esa.`}),{status:409});
      if(existing&&!existing.active)await db.updateTable("crmCities").set({active:true}).where("id","=",existing.id).execute();
      else if(!existing)await db.insertInto("crmCities").values({name}).onConflict(oc=>oc.column("name").doUpdateSet({active:true})).execute();
      return new Response(superjson.stringify({ok:true,city:existing?.name??name} satisfies OutputType));
    }

    if(input.action==="addSubtype"){
      await db.insertInto("crmSubtypes")
        .values({name:input.name.trim(),typeName:input.typeName?.trim()||null})
        .onConflict(oc=>oc.columns(["typeName","name"]).doUpdateSet({active:true}))
        .execute();
    }

    if(input.action==="editSubtype"){
      const target=await db.selectFrom("crmSubtypes").select(["id","name","typeName"]).where("id","=",String(input.id)).executeTakeFirst();
      if(!target)return new Response(superjson.stringify({error:"El subtipo no existe."}),{status:404});
      const nextName=input.name.trim();
      await db.transaction().execute(async trx=>{
        await setWorkActor(trx,user);
        // Lock the affected businesses first (before any write, which would also hold the live-version row), in id order: the leads active-account guard takes FOR SHARE on each business while
        // updating its leads, so locking leads first would invert the business-then-management order used by every other writer.
        let affected=trx.selectFrom("leads").select("accountId").distinct().where("subtipo","=",target.name);
        if(target.typeName)affected=affected.where("tipo","=",target.typeName);
        await lockAccounts(trx,(await affected.execute()).map(r=>r.accountId));
        await trx.updateTable("crmSubtypes").set({name:nextName,active:true}).where("id","=",target.id).execute();
        let leads=trx.updateTable("leads").set({subtipo:nextName,updatedAt:new Date()}).where("subtipo","=",target.name);
        if(target.typeName)leads=leads.where("tipo","=",target.typeName);
        await leads.execute();
      });
    }

    if(input.action==="deleteSubtype"){
      const target=await db.selectFrom("crmSubtypes").select(["id","name"]).where("id","=",String(input.id)).executeTakeFirst();
      if(!target)return new Response(superjson.stringify({error:"El subtipo no existe."}),{status:404});
      await db.updateTable("crmSubtypes").set({active:false}).where("id","=",target.id).execute();
    }

    if(input.action==="addEmail"){
      const email=normalizeEmail(input.email);
      await db.insertInto("authorizedEmails").values({
        email,displayName:input.displayName?.trim()||email
      }).onConflict(oc=>oc.column("email").doUpdateSet({
        active:true,displayName:input.displayName?.trim()||email
      })).execute();
    }

    if(input.action==="saveUserSenderEmail"){
      const senderEmail=input.senderEmail?normalizeEmail(input.senderEmail):null;
      const target=await db.selectFrom("users").select(["id","displayName"]).where("id","=",input.userId).executeTakeFirst();
      if(!target)return new Response(superjson.stringify({error:"El usuario no existe."}),{status:404});
      await ensureHospedaSender(target.displayName,senderEmail);
      await db.updateTable("users").set({senderEmail,updatedAt:new Date()}).where("id","=",target.id).execute();
    }

    if(input.action==="inviteUser"){
      const email=normalizeEmail(input.email);
      const existing=await db.selectFrom("users")
        .leftJoin("userPasswords","users.id","userPasswords.userId")
        .select(["users.id","userPasswords.id as passwordId"])
        .where(eb=>eb.fn("lower",["users.email"]),"=",email)
        .executeTakeFirst();

      let userId:number;
      if(existing){
        const inactive=await db.selectFrom("users").select("deactivatedAt").where("id","=",existing.id).executeTakeFirst();
        if(inactive?.deactivatedAt)return new Response(superjson.stringify({error:"El usuario está inactivo. Reactivalo antes de enviar una invitación."}),{status:409});
        if(existing.passwordId){
          return new Response(superjson.stringify({error:"Ese email ya pertenece a un usuario activo."}),{status:409});
        }
        userId=existing.id;
      }else{
        const placeholder=email.split("@")[0]||email;
        const created=await db.insertInto("users")
          .values({email,displayName:placeholder,fullName:null,phone:null,sex:null,senderEmail:null,role:"user"})
          .returning("id").executeTakeFirstOrThrow();
        userId=created.id;
      }

      await db.insertInto("authorizedEmails").values({email,displayName:email,active:true})
        .onConflict(oc=>oc.column("email").doUpdateSet({active:true})).execute();

      await createAndSendInvitation(userId,email,user.displayName);
    }

    if(input.action==="resendUserInvite"){
      const target=await db.selectFrom("users")
        .leftJoin("userPasswords","users.id","userPasswords.userId")
        .select(["users.id","users.email","users.deactivatedAt","userPasswords.id as passwordId"])
        .where("users.id","=",input.userId)
        .executeTakeFirst();
      if(!target)return new Response(superjson.stringify({error:"El usuario no existe."}),{status:404});
      if(target.deactivatedAt)return new Response(superjson.stringify({error:"El usuario está inactivo. Reactivalo antes de enviar una invitación."}),{status:409});
      if(target.passwordId){
        return new Response(superjson.stringify({error:"Ese usuario ya terminó de crear su acceso."}),{status:409});
      }
      await createAndSendInvitation(target.id,target.email,user.displayName);
    }

    if(input.action==="setUserRole"){
      const result=await db.transaction().execute(async trx=>{
        await sql`SELECT pg_advisory_xact_lock(706241901)`.execute(trx);
        const target=await trx.selectFrom('users').select(['id','role','deactivatedAt']).where('id','=',input.userId).forUpdate().executeTakeFirst();
        if(!target)return {error:"El usuario no existe.",status:404};
        if(target.deactivatedAt)return {error:"Reactivá al usuario antes de cambiar su rol.",status:409};
        const activeAdmins=Number((await sql<{n:string}>`SELECT count(*)::text n FROM users WHERE role='admin' AND deactivated_at IS NULL`.execute(trx)).rows[0]?.n??0);
        if(!canChangeUserRole({actorId:user.id,targetId:target.id,targetRole:target.role,nextRole:input.role,activeAdmins}))return {error:user.id===target.id?'No podés cambiar tu propio rol.':'Tiene que quedar al menos un administrador activo.',status:409};
        await trx.updateTable('users').set({role:input.role,updatedAt:new Date()}).where('id','=',target.id).execute();
        await trx.deleteFrom('sessions').where('userId','=',target.id).execute();
        return null;
      });
      if(result)return new Response(superjson.stringify({error:result.error}),{status:result.status});
    }

    if(input.action==="resetUserPassword"){
      const target=await db.selectFrom('users').innerJoin('userPasswords','users.id','userPasswords.userId').select(['users.id','users.email','users.deactivatedAt']).where('users.id','=',input.userId).executeTakeFirst();
      if(!target)return new Response(superjson.stringify({error:'El usuario no tiene una contraseña configurada.'}),{status:409});
      if(target.deactivatedAt)return new Response(superjson.stringify({error:'No se puede restablecer la contraseña de un usuario inactivo.'}),{status:409});
      if(!process.env.BREVO_API_KEY||!process.env.PUBLIC_APP_URL)return new Response(superjson.stringify({error:'La recuperación no está disponible: falta configurar el envío de correo.'}),{status:503});
      const throttle=await db.transaction().execute(async trx=>{
        await sql`SELECT pg_advisory_xact_lock(hashtextextended('password-reset-request',0))`.execute(trx);
        await sql`DELETE FROM password_reset_requests WHERE requested_at < now()-interval '1 hour'`.execute(trx);
        const cap=await sql<{n:string}>`SELECT count(*)::text n FROM password_reset_requests`.execute(trx);
        if(Number(cap.rows[0]?.n)>=100)return false;
        const allowed=await sql`INSERT INTO password_reset_requests(email_hash) VALUES(${createHash('sha256').update(target.email.toLowerCase()).digest('hex')}) ON CONFLICT(email_hash) DO UPDATE SET requested_at=now() WHERE password_reset_requests.requested_at < now()-interval '5 minutes' RETURNING email_hash`.execute(trx);
        return allowed.rows.length>0;
      });
      if(!throttle)return new Response(superjson.stringify({error:'Ya se solicitó una recuperación para este email en los últimos 5 minutos. Esperá antes de volver a intentar.'}),{status:429});
      const randomHash=await generatePasswordHash(randomBytes(48).toString('base64url'));
      try{await createAndSendRecoveryEmail({userId:target.id,email:target.email,adminTriggered:true,beforeSend:async()=>{await db.transaction().execute(async trx=>{await trx.updateTable('userPasswords').set({passwordHash:randomHash}).where('userId','=',target.id).execute();await trx.deleteFrom('sessions').where('userId','=',target.id).execute();await sql`UPDATE crm_userscript_tokens SET revoked_at=now() WHERE user_id=${target.id} AND revoked_at IS NULL`.execute(trx);await sql`DELETE FROM crm_mcp_credentials WHERE user_id=${target.id}`.execute(trx);});}});}
      catch{await sql`DELETE FROM password_reset_requests WHERE email_hash=${createHash('sha256').update(target.email.toLowerCase()).digest('hex')}`.execute(db);throw new Error('No se pudo enviar el correo de recuperación. Revisá la configuración del correo e intentá de nuevo.');}
    }

    if(input.action==="deactivateUser"){
      const result=await db.transaction().execute(async trx=>{
        await sql`SELECT pg_advisory_xact_lock(706241901)`.execute(trx);
        await setWorkActor(trx,user);
        const target=await trx.selectFrom('users').select(['id','email','role','deactivatedAt']).where('id','=',input.userId).forUpdate().executeTakeFirst();
        if(!target)return {error:'El usuario no existe.',status:404};
        if(target.deactivatedAt)return null;
        const activeAdmins=Number((await sql<{n:string}>`SELECT count(*)::text n FROM users WHERE role='admin' AND deactivated_at IS NULL`.execute(trx)).rows[0]?.n??0);
        if(!canDeactivateUser({actorId:user.id,targetId:target.id,targetRole:target.role,activeAdmins}))return {error:user.id===target.id?'No podés desactivar tu propio usuario.':'No podés desactivar al último administrador activo.',status:409};
        const counts=(await sql<{businesses:string;managements:string;tasks:string}>`SELECT
         (SELECT count(*) FROM crm_accounts WHERE assigned_user_email=${target.email} AND deleted_at IS NULL AND archived_at IS NULL AND merged_into_id IS NULL)::text businesses,
         (SELECT count(*) FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.assigned_user_email=${target.email} AND l.deleted_at IS NULL AND s.classification='open')::text managements,
         (SELECT count(*) FROM crm_tasks WHERE assigned_user_email=${target.email} AND deleted_at IS NULL AND status='pending')::text tasks`.execute(trx)).rows[0]!;
        const total=Number(counts.businesses)+Number(counts.managements)+Number(counts.tasks);
        if(total&&!input.reassignToUserId)return {error:'Elegí un usuario activo para reasignar el trabajo pendiente.',status:409};
        if(total){
          const recipient=await trx.selectFrom('users').select(['id','email','displayName']).where('id','=',input.reassignToUserId!).where('deactivatedAt','is',null).forUpdate().executeTakeFirst();
          if(!recipient||recipient.id===target.id)return {error:'Elegí otro usuario activo para recibir las asignaciones.',status:409};
          const actor=await trx.selectFrom('users').select('displayName').where('id','=',user.id).executeTakeFirst();
          const accounts=await trx.selectFrom('crmAccounts').select(['id','assignedUserEmail']).where('assignedUserEmail','=',target.email).where('deletedAt','is',null).where('archivedAt','is',null).where('mergedIntoId','is',null).forUpdate().execute();
          await trx.updateTable('crmAccounts').set({assignedUserEmail:recipient.email,updatedAt:new Date()}).where('assignedUserEmail','=',target.email).where('deletedAt','is',null).where('archivedAt','is',null).where('mergedIntoId','is',null).execute();
          if(accounts.length)await trx.insertInto('crmCommercialJournal').values(accounts.map(a=>({accountId:a.id,contactId:null,action:'business_assignment_rebalanced',actorEmail:user.email,actorName:actor?.displayName??user.displayName,metadata:sql`${JSON.stringify({before:{assignedUserEmail:target.email},after:{assignedUserEmail:recipient.email},reason:'user_deactivated'})}::text::jsonb`}))).execute();
          await sql`INSERT INTO lead_journal(lead_id,account_id,lead_name,lead_city,lead_type,action,field_name,old_value,new_value,actor_email,actor_name,actor_user_id,metadata)
            SELECT l.id,l.account_id,l.nombre,a.ciudad,l.tipo,'field_changed','assignedUserEmail',l.assigned_user_email,${recipient.email},${user.email},${actor?.displayName??user.displayName},${user.id},jsonb_build_object('reason','user_deactivated')
            FROM leads l JOIN crm_accounts a ON a.id=l.account_id JOIN crm_stages s ON s.name=l.estado
            WHERE l.assigned_user_email=${target.email} AND l.deleted_at IS NULL AND s.classification='open'`.execute(trx);
          await sql`SELECT set_config('crm.projecting','1',true)`.execute(trx);
          await sql`UPDATE leads SET assigned_user_email=${recipient.email},updated_at=now() WHERE assigned_user_email=${target.email} AND deleted_at IS NULL AND estado IN (SELECT name FROM crm_stages WHERE classification='open')`.execute(trx);
          await sql`SELECT set_config('crm.projecting','',true)`.execute(trx);
          await sql`UPDATE crm_tasks SET assigned_user_email=${recipient.email},updated_at=now() WHERE assigned_user_email=${target.email} AND deleted_at IS NULL AND status='pending'`.execute(trx);
        }
        await trx.updateTable('users').set({deactivatedAt:new Date(),updatedAt:new Date()}).where('id','=',target.id).execute();
        await trx.updateTable('authorizedEmails').set({active:false}).where(eb=>eb.fn('lower',['email']),'=',target.email.toLowerCase()).execute();
        await trx.deleteFrom('sessions').where('userId','=',target.id).execute();
        await sql`UPDATE crm_userscript_tokens SET revoked_at=now() WHERE user_id=${target.id} AND revoked_at IS NULL`.execute(trx);
        await sql`DELETE FROM crm_mcp_credentials WHERE user_id=${target.id}`.execute(trx);
        await sql`DELETE FROM password_reset_tokens WHERE user_id=${target.id}`.execute(trx);
        const inviteRows=await trx.selectFrom("appSettings").select(["key","value"]).where("key","like",INVITE_PREFIX+"%").execute();
        const invitationKeys=inviteRows.flatMap(row=>{try{return (JSON.parse(row.value) as {userId?:number}).userId===target.id?[row.key]:[]}catch{return []}});
        if(invitationKeys.length)await trx.deleteFrom("appSettings").where("key","in",invitationKeys).execute();
        return null;
      });
      if(result)return new Response(superjson.stringify({error:result.error}),{status:result.status});
    }

    if(input.action==="reactivateUser"){
      const target=await db.selectFrom('users').select(['id','email','displayName','deactivatedAt']).where('id','=',input.userId).executeTakeFirst();
      if(!target)return new Response(superjson.stringify({error:'El usuario no existe.'}),{status:404});
      if(!target.deactivatedAt)return new Response(superjson.stringify({error:'El usuario ya está activo.'}),{status:409});
      // Deactivation deleted pending invitations; a passwordless user gets a fresh one BEFORE the allowlist reopens, so self-registration without the invite link stays blocked.
      const hasPassword=!!await db.selectFrom('userPasswords').select('id').where('userId','=',target.id).executeTakeFirst();
      if(!hasPassword)await createAndSendInvitation(target.id,target.email,user.displayName);
      await db.transaction().execute(async trx=>{
        await trx.updateTable('users').set({deactivatedAt:null,updatedAt:new Date()}).where('id','=',target.id).execute();
        await trx.insertInto('authorizedEmails').values({email:target.email,displayName:target.displayName,active:true}).onConflict(oc=>oc.column('email').doUpdateSet({active:true,displayName:target.displayName})).execute();
      });
    }

    if(input.action==="updateUser"){
      const email=normalizeEmail(input.email);
      const senderEmail=input.senderEmail?normalizeEmail(input.senderEmail):null;
      const fullName=input.fullName?.trim()||null;
      const phone=input.phone?.trim()||null;
      const sex=input.sex||null;
      const whatsapp=normalizeWhatsappPhone(input.whatsappPhone);
      if(whatsapp.error)return new Response(superjson.stringify({error:whatsapp.error}),{status:400});
      const displayName=input.displayName.trim();

      const target=await db.selectFrom("users").select(["id","email","deactivatedAt"]).where("id","=",input.userId).executeTakeFirst();
      if(!target)return new Response(superjson.stringify({error:"El usuario no existe."}),{status:404});

      const collision=await db.selectFrom("users").select("id")
        .where(eb=>eb.fn("lower",["email"]),"=",email)
        .where("id","!=",target.id).executeTakeFirst();
      if(collision)return new Response(superjson.stringify({error:"Ese email ya está usado por otro usuario."}),{status:409});

      await ensureHospedaSender(displayName,senderEmail);

      await db.transaction().execute(async trx=>{
        await setWorkActor(trx,user);
        const locked=await trx.selectFrom('users').select(['id','email','deactivatedAt']).where('id','=',input.userId).forUpdate().executeTakeFirstOrThrow();
        if(locked.deactivatedAt)throw new Error('Reactivá al usuario antes de editarlo.');
        if(target.email.toLowerCase()!==email){
          await trx.updateTable("authorizedEmails").set({active:false})
            .where(eb=>eb.fn("lower",["email"]),"=",target.email.toLowerCase()).execute();
        }
        await trx.insertInto("authorizedEmails").values({email,displayName,active:!locked.deactivatedAt})
          .onConflict(oc=>oc.column("email").doUpdateSet({active:!locked.deactivatedAt,displayName})).execute();
        await trx.updateTable("users").set({
          email,fullName,displayName,phone,...(input.whatsappPhone!==undefined?{whatsappPhone:whatsapp.phone}:{}),sex,senderEmail,updatedAt:new Date()
        }).where("id","=",target.id).execute();
      });

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

    if(input.action==="saveMessageVariables"){
      const variables=validateMessageVariables(input.variables);
      const keys=new Set(variables.map(variable=>variable.key));
      for(const variable of variables){
        if(variable.source.kind==="variable"&&!keys.has(variable.source.key))throw new Error(`{{${variable.key}}} referencia una variable que no existe.`);
      }
      for(const start of variables){
        const visited=new Set<string>();
        let current:typeof start|undefined=start;
        while(current?.source.kind==="variable"){
          if(visited.has(current.key))throw new Error(`Hay una referencia circular que incluye {{${current.key}}}.`);
          visited.add(current.key);
          current=variables.find(item=>item.key===current?.source.key);
        }
      }
      await db.insertInto("appSettings").values({key:"crm_message_variables",value:JSON.stringify(variables)})
        .onConflict(oc=>oc.column("key").doUpdateSet({value:JSON.stringify(variables),updatedAt:new Date()})).execute();
    }

    if(input.action==="deleteTemplate"){
      const target=await db.selectFrom("messageTemplates").select(["id","name"]).where("id","=",String(input.id)).where("active","=",true).executeTakeFirst();
      if(!target)return new Response(superjson.stringify({error:"El template no existe o ya fue eliminado."}),{status:404});
      await db.updateTable("messageTemplates").set({active:false,updatedAt:new Date()}).where("id","=",target.id).execute();
    }

    if(input.action==="setTemplateActive"){
      await db.updateTable("messageTemplates").set({active:input.active,updatedAt:new Date()}).where("id","=",String(input.id)).execute();
    }

    if(input.action==="restoreTemplateVersion"){
      await db.transaction().execute(async trx=>{
        await setWorkActor(trx,user);
        const old=(await sql<{snapshot:any}>`SELECT snapshot FROM crm_message_template_versions WHERE template_id=${String(input.id)} AND version=${input.version} FOR UPDATE`.execute(trx)).rows[0];
        if(!old)throw new Error('No existe esa versión del modelo.');
        const v=old.snapshot;
        await validateTemplateMaterials(trx,{channel:v.channel,subject:v.subject??null,body:String(v.body??'')});
        await trx.updateTable('messageTemplates').set({channel:v.channel,name:v.name,subject:v.subject,body:v.body,vertical:v.vertical,managementType:v.management_type,commercialProfile:v.commercial_profile,purpose:v.purpose??null,updatedAt:new Date()}).where('id','=',String(input.id)).execute();
        const current=await sql<any>`SELECT to_jsonb(t) AS value FROM message_templates t WHERE id=${String(input.id)}`.execute(trx);
        const next=await sql<{version:number}>`SELECT coalesce(max(version),0)+1 AS version FROM crm_message_template_versions WHERE template_id=${String(input.id)}`.execute(trx);
        await sql`INSERT INTO crm_message_template_versions(template_id,version,snapshot,actor_email) VALUES(${String(input.id)},${next.rows[0].version},${JSON.stringify(current.rows[0].value)}::text::jsonb,${user.email})`.execute(trx);
      });
    }

    if(input.action==="saveTemplate"){
      await db.transaction().execute(async trx=>{
        await setWorkActor(trx,user);
        await validateTemplateMaterials(trx,{channel:input.channel,subject:input.channel==="email"?(input.subject??null):null,body:input.body});
        const values={channel:input.channel,name:input.name.trim(),subject:input.channel==="email"?(input.subject?.trim()||null):null,body:input.body,vertical:input.vertical?.trim()||null,managementType:input.managementType??null,commercialProfile:input.commercialProfile??null,purpose:input.purpose??null,updatedAt:new Date()};
        let templateId:string;
        if(input.id){const saved=await trx.updateTable('messageTemplates').set(values).where('id','=',String(input.id)).returning('id').executeTakeFirstOrThrow();templateId=String(saved.id);}
        else{const saved=await trx.insertInto('messageTemplates').values(values).returning('id').executeTakeFirstOrThrow();templateId=String(saved.id);}
        const snapshot=(await sql<any>`SELECT to_jsonb(t) AS value FROM message_templates t WHERE id=${templateId}`.execute(trx)).rows[0].value;
        const next=(await sql<{version:number}>`SELECT coalesce(max(version),0)+1 AS version FROM crm_message_template_versions WHERE template_id=${templateId}`.execute(trx)).rows[0].version;
        await sql`INSERT INTO crm_message_template_versions(template_id,version,snapshot,actor_email) VALUES(${templateId},${next},${JSON.stringify(snapshot)}::text::jsonb,${user.email})`.execute(trx);
      });
    }

    return new Response(superjson.stringify({ok:true} satisfies OutputType));
  }catch(error){
    return errorResponse(error);
  }
}
