import {z} from 'zod';
const address=z.object({email:z.string().email().max(320),name:z.string().max(1000)});
export const inboundEmailSchema=z.object({messageId:z.string().min(1).max(1000),envelopeFrom:z.string().max(320).optional(),inReplyTo:z.string().max(1000).nullable(),references:z.array(z.string().max(1000)).max(100),from:address,to:z.array(z.string().email().max(320)).max(100),cc:z.array(z.string().email().max(320)).max(100),subject:z.string().max(2000),date:z.string().datetime({offset:true}),text:z.string().max(50000),html:z.string().max(200000).nullable(),headers:z.object({messageId:z.string().max(1000).optional(),inReplyTo:z.string().max(1000).optional(),references:z.string().max(10000).optional(),autoSubmitted:z.string().max(500).optional(),precedence:z.string().max(500).optional(),xAutoreply:z.string().max(500).optional(),xAutorespond:z.string().max(500).optional(),authenticationResults:z.string().max(4000).optional(),to:z.string().max(2000).optional(),cc:z.string().max(2000).optional(),date:z.string().max(500).optional()}).strict(),attachments:z.array(z.object({filename:z.string().max(1000),mimeType:z.string().max(500),size:z.number().int().nonnegative().max(100000000)})).max(100)}).strict();
export type InboundEmail=z.infer<typeof inboundEmailSchema>;
const balancedComments=(value:string)=>{let depth=0;for(const c of value){if(c==='(')depth++;else if(c===')'&&--depth<0)return false;if(depth>1)return false;}return depth===0;};
const domainOf=(email:string)=>email.trim().toLowerCase().split('@').pop()??'';
/** The envelope domain aligns when it equals the From domain or is a subdomain of it; a parent domain (for example `com.ar`) never aligns. */
export function senderDomainAligned(from:string,envelopeFrom:string|undefined):boolean{const a=domainOf(from),b=envelopeFrom?domainOf(envelopeFrom):'';return !!a&&!!b&&(a===b||b.endsWith('.'+a));}
/** The From header is unauthenticated: trust it only with DMARC pass for its domain, or SPF pass for an aligned envelope sender, as reported in Authentication-Results. */
export function senderAuthenticated(from:string,envelopeFrom:string|undefined,authenticationResults:string|undefined):boolean{
 // The Worker passes only Cloudflare's own header (trusted authserv-id); each result is read on its own, without comments.
 const domain=domainOf(from);if(!authenticationResults||!domain)return false;
 // Quoted strings and nested comments are not parsed: reject them instead of risking a parser differential.
 if(/["\\]/.test(authenticationResults)||!balancedComments(authenticationResults))return false;
 const results=authenticationResults.toLowerCase().replace(/\([^)]*\)/g,' ').split(';').slice(1).map(r=>r.trim().split(/\s+/));
 const prop=(parts:string[],key:string)=>parts.find(p=>p.startsWith(key+'='))?.slice(key.length+1);
 const dmarc=results.some(r=>r[0]==='dmarc=pass'&&prop(r,'header.from')===domain);
 const spf=senderDomainAligned(from,envelopeFrom)&&results.some(r=>{const v=r[0]==='spf=pass'?prop(r,'smtp.mailfrom'):undefined;return !!v&&(v.includes('@')?domainOf(v):v)===domainOf(envelopeFrom??'');});
 return dmarc||spf;
}
export function normalizeMessageId(value:string):string{return value.trim().replace(/^<|>$/g,'').trim();}
export function isAutomaticEmail(headers:InboundEmail['headers']):boolean{return (!!headers.autoSubmitted&&headers.autoSubmitted.trim().toLowerCase()!=='no')||headers.xAutoreply!==undefined||headers.xAutorespond!==undefined||/^(auto_reply|bulk|junk)$/i.test(headers.precedence?.trim()??'');}
export type MatchCandidate={accountId:string;leadId:string|null;contactId:string|null;messageId:string|null;method:'in_reply_to'|'references'|'sender_email'};
export function chooseInboundMatch(candidates:{inReplyTo:MatchCandidate[];references:MatchCandidate[];sender:MatchCandidate[]}):MatchCandidate|null{
 // Evidence that points at several businesses stops matching: weaker evidence must not break the tie.
 for(const list of [candidates.inReplyTo,candidates.references,candidates.sender]){const accounts=new Map<string,MatchCandidate>();for(const item of list)accounts.set(item.accountId,item);if(accounts.size===1)return [...accounts.values()][0];if(accounts.size>1)return null;}
 return null;
}
