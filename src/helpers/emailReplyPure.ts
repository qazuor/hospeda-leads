import {randomUUID} from 'node:crypto';
import {formatDateTime} from './crmDates';

export function replySubject(subject:string){const clean=subject.trim();if(!clean)return 'Re: (sin asunto)';const base=clean.replace(/^(?:re\s*:\s*)+/i,'').trim();return `Re: ${base||'(sin asunto)'}`;}
const messageIds=(value:string)=>value.match(/<[^<>\s]+@[^<>\s]+>/g)??[];
export function threadHeaders({inboundMessageId,inboundReferences}:{inboundMessageId:string;inboundReferences:string}){
 const inbound=messageIds(inboundMessageId)[0]??`<${inboundMessageId.replace(/^<|>$/g,'')}>`;
 const ids=[...new Set(messageIds(inboundReferences).filter(id=>id!==inbound)),inbound];let references=ids.join(' ');
 while(references.length>8000&&ids.length>1){ids.shift();references=ids.join(' ');}
 return {inReplyTo:inbound,references};
}
export function newMessageId(){return `<${randomUUID()}@hospeda.com.ar>`;}
const escapeHtml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function quotedHistory({receivedAt,fromName,fromAddress,textBody}:{receivedAt:Date|string;fromName:string;fromAddress:string;textBody:string}){
 const sender=(fromName.trim()||fromAddress).replace(/[\r\n]+/g,' '),date=formatDateTime(receivedAt),text=textBody.replace(/\r\n?/g,'\n');
 return {html:`<p>El ${escapeHtml(date)}, ${escapeHtml(sender)} escribió:</p><blockquote>${text.split('\n').map(line=>escapeHtml(line)).join('<br>')}</blockquote>`,text:`El ${date}, ${sender} escribió:\n${text.split('\n').map(line=>'> '+line).join('\n')}`};
}
export type SmtpErrorShape={code?:string;originalCode?:string;timeoutType?:string;command?:string;responseCode?:number};
const PRE_DATA_COMMAND=/^(CONN|EHLO|HELO|STARTTLS|AUTH|MAIL FROM|RCPT TO)\b/;
/**
 * Classifies a nodemailer send error. `failed` means the message body was never handed to the relay, so a later manual send cannot duplicate it:
 * authentication errors, refused connections (nodemailer reports them as ESOCKET with originalCode ECONNREFUSED), connect/greeting/STARTTLS timeouts,
 * and any server reply to a command before DATA. Everything else (socket timeouts, dropped connections, DATA or post-DATA errors) is `unknown`.
 */
export function classifySmtpOutcome(error:SmtpErrorShape):'failed'|'unknown'{
 if(error.code==='EAUTH'||error.code==='ECONNREFUSED'||error.originalCode==='ECONNREFUSED')return 'failed';
 if(error.code==='ETIMEDOUT'&&['CONNECT_TIMEOUT','GREETING_TIMEOUT','UPGRADE_TIMEOUT'].includes(error.timeoutType??''))return 'failed';
 if(error.responseCode!=null&&PRE_DATA_COMMAND.test(error.command?.toUpperCase()??''))return 'failed';
 return 'unknown';
}
