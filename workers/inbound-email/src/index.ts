import PostalMime from 'postal-mime';

export interface Env { CRM_BASE_URL:string; INBOUND_EMAIL_TOKEN:string; FORWARD_TO:string; TRUSTED_AUTHSERV_ID?:string }
type EmailLike={from:string;to:string;raw:ReadableStream<Uint8Array>;headers:Headers;forward:(to:string)=>Promise<unknown>};
type Address={address?:string;name?:string};
let addressCache:{expires:number;addresses:Set<string>}|null=null;
const MAX_TEXT=50000,MAX_HTML=200000,MAX_LIST=100,EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const clip=(value:string|undefined,max:number)=>value===undefined?undefined:value.slice(0,max);
/** Status, cf-ray and the start of the body (tags stripped) of a failed CRM response, so a Cloudflare 5xx shows its 1xxx subcode in the logs. */
export async function describeFailure(label:string,response:Response):Promise<string>{
 const body=(await response.text().catch(()=>'')).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
 return `${label} HTTP ${response.status} cf-ray=${response.headers.get('cf-ray')??'-'} body=${body}`;
}
async function addresses(env:Env):Promise<Set<string>>{
 if(addressCache&&addressCache.expires>Date.now())return addressCache.addresses;
 try{const response=await fetch(`${env.CRM_BASE_URL}/_api/inbound/addresses`,{headers:{Authorization:`Bearer ${env.INBOUND_EMAIL_TOKEN}`}});if(!response.ok)throw new Error(await describeFailure('address list',response));const data=await response.json() as {addresses:string[]};if(!Array.isArray(data.addresses))throw new Error('invalid address list');const set=new Set(data.addresses.map(v=>v.trim().toLowerCase()).filter(Boolean));addressCache={addresses:set,expires:Date.now()+600000};return set;}catch(error){if(addressCache)return addressCache.addresses;throw error;}
}
const list=(input:Address|Address[]|undefined)=>{const values=Array.isArray(input)?input:input?[input]:[];return values.map(v=>v.address?.trim().toLowerCase()).filter((v):v is string=>!!v&&v.length<=320&&EMAIL.test(v)).slice(0,MAX_LIST);};
const header=(headers:Headers,name:string,max=500)=>clip(headers.get(name)??undefined,max);
/** Only the topmost Authentication-Results, added by Cloudflare, can be trusted, and only when its authserv-id is the configured one; senders can add their own copies further down. Without TRUSTED_AUTHSERV_ID nothing is passed and the CRM never matches by sender. */
export function trustedAuthResults(headers:{key:string;value:string}[]|undefined,authservId:string|undefined):string|undefined{
 const id=authservId?.trim().toLowerCase();if(!id)return undefined;
 const all=(headers??[]).filter(h=>h.key.toLowerCase()==='authentication-results').map(h=>h.value.replace(/\s+/g,' ').trim());
 const trusted=all.filter(v=>v.split(';')[0].trim().toLowerCase()===id);
 // A second copy with the trusted id means someone forged one: trust neither.
 return all.length&&trusted.length===1&&all[0]===trusted[0]?trusted[0].slice(0,4000):undefined;
}
const byteLength=(content:string|ArrayBuffer|Uint8Array)=>typeof content==='string'?new TextEncoder().encode(content).byteLength:content.byteLength;
export async function handleEmail(message:EmailLike,env:Env):Promise<void>{
 let messageId=message.headers.get('message-id')?.trim()||'';
 // Cloudflare documents reading raw before forward; buffer it first, but forward even if reading fails.
 let raw:ArrayBuffer|null=null;
 try{raw=await new Response(message.raw).arrayBuffer();}catch(error){console.error('Inbound email raw read failed',messageId,error);}
 // A failed forward is retried once and then thrown, so Email Routing reports the failure instead of dropping the mail silently.
 try{await message.forward(env.FORWARD_TO);}catch(first){console.error('Inbound email forward failed, retrying',messageId,first);try{await message.forward(env.FORWARD_TO);}catch(error){console.error('Inbound email forward failed',messageId,error);throw error;}}
 if(!raw)return;
 try{
  const allowed=await addresses(env);if(!allowed.has(message.to.trim().toLowerCase()))return;
  const parsed=await PostalMime.parse(raw);
  messageId=(parsed.messageId?.trim()||messageId||`missing-${crypto.randomUUID()}@inbound.hospeda`).slice(0,1000);
  const fromAddress=parsed.from?.address?.trim().toLowerCase();
  // Sender matching needs exactly one From header with one valid mailbox; otherwise no authentication result is passed.
  const fromHeaders=(parsed.headers??[]).filter(h=>h.key.toLowerCase()==='from');
  const singleFrom=fromHeaders.length===1&&!parsed.from?.group&&!!fromAddress&&fromAddress.length<=320&&EMAIL.test(fromAddress);
  const parsedDate=parsed.date?new Date(parsed.date):new Date();
  const payload={messageId,envelopeFrom:message.from.trim().toLowerCase().slice(0,320),inReplyTo:clip(parsed.inReplyTo,1000)??null,references:(Array.isArray(parsed.references)?parsed.references:String(parsed.references??'').split(/\s+/)).filter(r=>r&&r.length<=1000).slice(-MAX_LIST),from:{email:fromAddress&&fromAddress.length<=320&&EMAIL.test(fromAddress)?fromAddress:message.from.trim().toLowerCase(),name:(parsed.from?.name??'').slice(0,1000)},to:list(parsed.to),cc:list(parsed.cc),subject:(parsed.subject??'').slice(0,2000),date:Number.isNaN(parsedDate.getTime())?new Date().toISOString():parsedDate.toISOString(),text:(parsed.text??'').slice(0,MAX_TEXT),html:parsed.html?.slice(0,MAX_HTML)??null,headers:{messageId:header(message.headers,'message-id',1000),inReplyTo:header(message.headers,'in-reply-to',1000),references:header(message.headers,'references',10000),autoSubmitted:header(message.headers,'auto-submitted'),precedence:header(message.headers,'precedence'),xAutoreply:header(message.headers,'x-autoreply'),xAutorespond:header(message.headers,'x-autorespond'),authenticationResults:singleFrom?trustedAuthResults(parsed.headers,env.TRUSTED_AUTHSERV_ID):undefined,to:header(message.headers,'to',2000),cc:header(message.headers,'cc',2000),date:header(message.headers,'date')},attachments:(parsed.attachments??[]).slice(0,MAX_LIST).map(a=>({filename:(a.filename??'').slice(0,1000),mimeType:(a.mimeType??'application/octet-stream').slice(0,500),size:Math.min(a.content?byteLength(a.content):0,100000000)}))};
  const body=JSON.stringify(payload);let error:unknown;
  for(let attempt=0;attempt<3;attempt++){try{const response=await fetch(`${env.CRM_BASE_URL}/_api/inbound/email`,{method:'POST',headers:{Authorization:`Bearer ${env.INBOUND_EMAIL_TOKEN}`,'Content-Type':'application/json'},body});if(response.ok)return;if(response.status<500){console.error('Inbound CRM rejected email',messageId,await describeFailure('CRM',response));return;}error=new Error(await describeFailure('CRM',response));}catch(e){error=e;}if(attempt<2)await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));}
  console.error('Inbound CRM delivery failed',messageId,error);
 }catch(error){console.error('Inbound email processing failed',messageId,error);}
}
export default {async email(message:ForwardableEmailMessage,env:Env,ctx:ExecutionContext){await handleEmail(message,env);}};
