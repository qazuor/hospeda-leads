import {createHash,randomBytes} from "node:crypto";
import {sql} from "kysely";
import {db} from "../../helpers/db";

const digest=(value:string)=>createHash("sha256").update(value).digest("hex");

/** Create a single-use recovery token and send the standard recovery email. */
export async function createAndSendRecoveryEmail({userId,email,adminTriggered=false,beforeSend}:{userId:number;email:string;adminTriggered?:boolean;beforeSend?:()=>Promise<void>}):Promise<void>{
 const token=randomBytes(32).toString("hex"),tokenHash=digest(token);
 await sql`INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES(${tokenHash},${userId},now()+interval '30 minutes')`.execute(db);
 try{
  if(beforeSend)await beforeSend();
  const origin=new URL(process.env.PUBLIC_APP_URL!);const link=new URL("/reset-password",origin);link.hash=`token=${token}`;
  const rows=await db.selectFrom("appSettings").select(["key","value"]).where("key","in",["brevo_sender_name","brevo_sender_email","brevo_reply_to_email"]).execute();
  const config=Object.fromEntries(rows.map(r=>[r.key,r.value]));
  const extra=adminTriggered?"Un administrador solicitó este restablecimiento. Si no lo esperabas, contactá a tu administrador.":"Si no lo solicitaste, ignorá este correo. Tu contraseña actual sigue vigente hasta que la cambies.";
  const response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",signal:AbortSignal.timeout(10000),headers:{"api-key":process.env.BREVO_API_KEY!,"Content-Type":"application/json"},body:JSON.stringify({sender:{name:config.brevo_sender_name||"Hospeda",email:config.brevo_sender_email||"notificaciones@hospeda.com.ar"},to:[{email}],replyTo:{email:config.brevo_reply_to_email||"contacto@hospeda.com.ar"},subject:"Recuperar tu contraseña de Hospeda CRM",textContent:`Recuperá tu acceso a Hospeda CRM:\n${link.href}\n\nEl enlace vence en 30 minutos y puede usarse una sola vez. ${extra}`})});
  if(!response.ok)throw new Error(`Brevo rechazó el envío del correo de recuperación (HTTP ${response.status}).`);
 }catch(error){await sql`DELETE FROM password_reset_tokens WHERE token_hash=${tokenHash}`.execute(db).catch(()=>{});throw error;}
}
