import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import {db} from './db';
import {communicationJournal,lockCommunication} from './communicationService';
import {setWorkActor} from './workAudit';
import {chooseInboundMatch,isAutomaticEmail,normalizeMessageId,senderAuthenticated,type InboundEmail,type MatchCandidate} from './inboundEmailPure';
export async function inboundAddressList(){const rows=await sql<{email:string|null}>`SELECT sender_email AS email FROM users WHERE nullif(btrim(sender_email),'') IS NOT NULL UNION ALL SELECT value AS email FROM app_settings WHERE key='brevo_reply_to_email'`.execute(db);return [...new Set(rows.rows.map(r=>r.email?.trim().toLowerCase()).filter((v):v is string=>!!v))];}
export async function receiveInboundEmail(input:InboundEmail){
 const messageId=normalizeMessageId(input.messageId),reply=input.inReplyTo?normalizeMessageId(input.inReplyTo):null,refs=input.references.map(normalizeMessageId).filter(Boolean),automatic=isAutomaticEmail(input.headers),sender=input.from.email.toLowerCase();
 return db.transaction().execute(async e=>{
  const out=reply?(await sql<{accountId:string;leadId:string|null;contactId:string|null;messageId:string}>`SELECT m.account_id AS "accountId",m.lead_id AS "leadId",m.contact_id AS "contactId",m.id::text AS "messageId" FROM email_outbox o JOIN crm_messages m ON m.outbox_id=o.id WHERE trim(both '<>' from o.message_id)=${reply} LIMIT 2`.execute(e)).rows:[];
  const refMatches=refs.length?(await sql<{accountId:string;leadId:string|null;contactId:string|null;messageId:string|null}>`SELECT m.account_id AS "accountId",m.lead_id AS "leadId",m.contact_id AS "contactId",m.id::text AS "messageId" FROM email_outbox o JOIN crm_messages m ON m.outbox_id=o.id WHERE trim(both '<>' from o.message_id)=ANY(${refs}::text[]) UNION SELECT i.account_id,i.lead_id,i.contact_id,i.linked_message_id::text FROM crm_inbound_messages i WHERE i.channel='email' AND trim(both '<>' from i.external_id)=ANY(${refs}::text[]) AND i.account_id IS NOT NULL`.execute(e)).rows:[];
  const senders=!senderAuthenticated(sender,input.envelopeFrom,input.headers.authenticationResults)?[]:(await sql<{accountId:string;leadId:string|null;contactId:string|null;messageId:null}>`SELECT DISTINCT a.id::text AS "accountId",NULL::text AS "leadId",c.id::text AS "contactId",NULL::text AS "messageId" FROM crm_accounts a LEFT JOIN crm_contacts c ON c.account_id=a.id AND lower(c.email)=${sender} AND c.deleted_at IS NULL WHERE lower(a.email)=${sender} AND a.deleted_at IS NULL UNION SELECT DISTINCT c.account_id::text,NULL::text,c.id::text,NULL::text FROM crm_contacts c JOIN crm_accounts a ON a.id=c.account_id WHERE lower(c.email)=${sender} AND c.deleted_at IS NULL AND a.deleted_at IS NULL`.execute(e)).rows;
  const candidates=(rows:{accountId:string|number;leadId:string|null;contactId:string|null;messageId:string|null}[],method:MatchCandidate['method']):MatchCandidate[]=>rows.map(r=>({accountId:String(r.accountId),leadId:r.leadId==null?null:String(r.leadId),contactId:r.contactId==null?null:String(r.contactId),messageId:r.messageId,method}));
  const match=chooseInboundMatch({inReplyTo:candidates(out,'in_reply_to'),references:candidates(refMatches,'references'),sender:candidates(senders,'sender_email')});
  let leadId=match?.leadId??null;
  if(leadId){const live=(await sql<{id:string}>`SELECT id FROM leads WHERE id=${leadId} AND deleted_at IS NULL`.execute(e)).rows[0];if(!live)leadId=null;}
  if(match?.method==='sender_email'&&match.accountId){const opens=await sql<{id:string}>`SELECT l.id FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${match.accountId} AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id`.execute(e);if(opens.rows.length===1)leadId=String(opens.rows[0].id);}
  await lockCommunication(e,async()=>({accountIds:match?[match.accountId]:[]}));await setWorkActor(e,{email:'inbound-email-worker'});
  const id=randomUUID(),status=match?'pending_review':'unmatched',method=match?.method??'none';
  const inserted=await sql<{id:string}>`INSERT INTO crm_inbound_messages(id,channel,external_id,account_id,lead_id,contact_id,linked_message_id,match_method,from_address,from_name,subject,text_body,html_body,headers,attachments,is_automatic,received_at,status,source) VALUES(${id},'email',${messageId},${match?.accountId??null},${leadId},${match?.contactId??null},${match?.messageId??null},${method},${sender},${input.from.name},${input.subject},${input.text},${input.html},${JSON.stringify(input.headers)}::text::jsonb,${JSON.stringify(input.attachments)}::text::jsonb,${automatic},${new Date(input.date)},${status},'email_worker') ON CONFLICT(channel,external_id) DO NOTHING RETURNING id`.execute(e);
  if(!inserted.rows[0])return {id:null,duplicate:true,matched:!!match,matchMethod:method};
  if(match)await communicationJournal(e,{accountId:match.accountId,leadId,entityType:'inbound',entityId:id,action:'inbound_received',actor:null,automatic:true,triggeredBy:'inbound-email-worker',after:{from:sender,subject:input.subject,match_method:method,is_automatic:automatic}});
  return {id,duplicate:false,matched:!!match,matchMethod:method};
 });
}
