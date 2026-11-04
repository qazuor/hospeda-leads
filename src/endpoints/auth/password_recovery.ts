import {createHash} from "node:crypto";
import {sql} from "kysely";
import superjson from "superjson";
import {db} from "../../helpers/db";
import {generatePasswordHash} from "../../helpers/generatePasswordHash";
import {requestSchema,resetSchema} from "./password_recovery.schema";
import {createAndSendRecoveryEmail} from "./passwordRecoveryEmail";
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const reply=(message:string,status=200)=>new Response(superjson.stringify({message}),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const generic="Si el email tiene un acceso habilitado, recibirás un enlace para recuperar tu contraseña. Revisá también el spam.";
const invalid="El enlace venció o ya fue utilizado. Solicitá uno nuevo.";
export async function request(req:Request){
 try{
 const {email}=requestSchema.parse(superjson.parse(await req.text()));
 if(!process.env.BREVO_API_KEY||!process.env.PUBLIC_APP_URL)return reply("La recuperación no está disponible en este momento. Intentá más tarde.",503);
 new URL(process.env.PUBLIC_APP_URL);
 const userId=await db.transaction().execute(async tx=>{
  // Shared lock with login/reset prevents races; global cap limits distributed email floods.
  await sql`SELECT pg_advisory_xact_lock(hashtextextended('password-reset-request',0))`.execute(tx);
  await sql`DELETE FROM password_reset_requests WHERE requested_at < now()-interval '1 hour'`.execute(tx);
  const cap=await sql<{count:string}>`SELECT count(*) FROM password_reset_requests`.execute(tx);
  if(Number(cap.rows[0].count)>=100)return null;
  const allowed=await sql`INSERT INTO password_reset_requests(email_hash) VALUES(${digest(email)}) ON CONFLICT(email_hash) DO UPDATE SET requested_at=now() WHERE password_reset_requests.requested_at < now()-interval '5 minutes' RETURNING email_hash`.execute(tx);
  if(!allowed.rows.length)return null;
  const user=await tx.selectFrom("users").innerJoin("userPasswords","users.id","userPasswords.userId").innerJoin("authorizedEmails",join=>join.on(sql<boolean>`lower(authorized_emails.email)=lower(users.email)`)).select("users.id").where(sql`lower(users.email)`,"=",email).where("authorizedEmails.active","=",true).where("users.deactivatedAt","is",null).executeTakeFirst();
  await sql`DELETE FROM password_reset_tokens WHERE expires_at<=now()`.execute(tx);
  if(!user)return null;
  return user.id;
 });
 // Delivery runs after the uniform response path; account existence isn't exposed by provider latency.
 if(userId!==null)void createAndSendRecoveryEmail({userId,email}).catch(async()=>{
  console.error("Password recovery email could not be delivered");
 });
 return reply(generic);
 }catch{return reply("No se pudo procesar la solicitud. Revisá el email e intentá nuevamente.",400);}
}
export async function reset(req:Request){
 try{
 const input=resetSchema.parse(superjson.parse(await req.text()));
 const tokenHash=digest(input.token);
 const candidate=await sql<{userId:number;email:string}>`SELECT t.user_id,u.email FROM password_reset_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=${tokenHash} AND t.expires_at>now()`.execute(db);
 if(!candidate.rows[0])return reply(invalid,400);
 const {userId,email}=candidate.rows[0];
 const hash=await generatePasswordHash(input.password);
 const done=await db.transaction().execute(async tx=>{
 await sql`SELECT pg_advisory_xact_lock(hashtextextended(${email.toLowerCase()},0))`.execute(tx);
 const valid=await sql`DELETE FROM password_reset_tokens WHERE token_hash=${tokenHash} AND expires_at>now() AND EXISTS(SELECT 1 FROM users u JOIN authorized_emails a ON lower(a.email)=lower(u.email) WHERE u.id=password_reset_tokens.user_id AND a.active=true AND u.deactivated_at IS NULL) RETURNING user_id`.execute(tx);
 if(!valid.rows.length)return false;
 await tx.updateTable("userPasswords").set({passwordHash:hash}).where("userId","=",userId).execute();
 await tx.deleteFrom("sessions").where("userId","=",userId).execute();
 await tx.deleteFrom("loginAttempts").where(sql`lower(email)`,"=",email.toLowerCase()).execute();
 await sql`DELETE FROM password_reset_tokens WHERE user_id=${userId}`.execute(tx);
 return true;
 });
 return done?reply("Contraseña actualizada. Ingresá con tu nueva contraseña."):reply(invalid,400);
 }catch{return reply("No se pudo cambiar la contraseña. Revisá el enlace y las contraseñas.",400);}
}
