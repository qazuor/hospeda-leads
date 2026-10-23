import {z} from 'zod';
const address=z.object({email:z.string().email().max(320),name:z.string().max(1000)});
export const inboundEmailSchema=z.object({messageId:z.string().min(1).max(1000),envelopeFrom:z.string().max(320).optional(),inReplyTo:z.string().max(1000).nullable(),references:z.array(z.string().max(1000)).max(100),from:address,to:z.array(z.string().email().max(320)).max(100),cc:z.array(z.string().email().max(320)).max(100),subject:z.string().max(2000),date:z.string().datetime({offset:true}),text:z.string().max(50000),html:z.string().max(200000).nullable(),headers:z.object({messageId:z.string().max(1000).optional(),inReplyTo:z.string().max(1000).optional(),references:z.string().max(10000).optional(),autoSubmitted:z.string().max(500).optional(),precedence:z.string().max(500).optional(),xAutoreply:z.string().max(500).optional(),xAutorespond:z.string().max(500).optional(),to:z.string().max(2000).optional(),cc:z.string().max(2000).optional(),date:z.string().max(500).optional()}).strict(),attachments:z.array(z.object({filename:z.string().max(1000),mimeType:z.string().max(500),size:z.number().int().nonnegative().max(100000000)})).max(100)}).strict();
export type InboundEmail=z.infer<typeof inboundEmailSchema>;
const domainOf=(email:string)=>email.trim().toLowerCase().split('@').pop()??'';
/** The From header is unauthenticated: sender matching requires the envelope sender (checked by SPF) to share its domain, or be a subdomain of it. */
export function senderDomainAligned(from:string,envelopeFrom:string|undefined):boolean{const a=domainOf(from),b=envelopeFrom?domainOf(envelopeFrom):'';return !!a&&!!b&&(a===b||b.endsWith('.'+a)||a.endsWith('.'+b));}
export function normalizeMessageId(value:string):string{return value.trim().replace(/^<|>$/g,'').trim();}
export function isAutomaticEmail(headers:InboundEmail['headers']):boolean{return (!!headers.autoSubmitted&&headers.autoSubmitted.trim().toLowerCase()!=='no')||headers.xAutoreply!==undefined||headers.xAutorespond!==undefined||/^(auto_reply|bulk|junk)$/i.test(headers.precedence?.trim()??'');}
export type MatchCandidate={accountId:string;leadId:string|null;contactId:string|null;messageId:string|null;method:'in_reply_to'|'references'|'sender_email'};
export function chooseInboundMatch(candidates:{inReplyTo:MatchCandidate[];references:MatchCandidate[];sender:MatchCandidate[]}):MatchCandidate|null{
 // Evidence that points at several businesses stops matching: weaker evidence must not break the tie.
 for(const list of [candidates.inReplyTo,candidates.references,candidates.sender]){const accounts=new Map<string,MatchCandidate>();for(const item of list)accounts.set(item.accountId,item);if(accounts.size===1)return [...accounts.values()][0];if(accounts.size>1)return null;}
 return null;
}
