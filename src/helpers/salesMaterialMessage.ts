import {SHARE_TOKEN_PATTERN,hashShareToken,normalizeShareSlug} from './salesMaterialShare';
import {isInstagramAttempt} from './instagramChat';
/** Channels that can carry a sales material link (spec 89 D8; Instagram since spec 98, link only). Also the share's stored `channel`. */
export type MaterialChannel='email'|'whatsapp'|'instagram';
/**
 * Spec 98 §5.2: the material channel of a message. An Instagram attempt is stored as `social` with `destination_detail='instagram'`, so its
 * share says `instagram` (D1). A manual «Red social» log, Hospeda's echo or any other channel carries no material (null).
 */
export function materialChannelOf(message:{channel:string;ownerEmail?:string|null;destinationDetail?:string|null}):MaterialChannel|null{
 return message.channel==='email'||message.channel==='whatsapp'?message.channel:isInstagramAttempt(message)?'instagram':null;
}
/** The channel `assertAccountContactAllowed` and restrictions use for a material channel: Instagram restrictions are stored on `social`. */
export const contactChannelOf=(channel:MaterialChannel):'email'|'whatsapp'|'social'=>channel==='instagram'?'social':channel;
/** No public base URL in production: a share link would point to localhost, so nothing is sent (fail closed). */
export class MaterialShareUrlUnavailable extends Error{constructor(){super('Falta configurar la dirección pública del CRM (PUBLIC_APP_URL): no se puede generar el enlace del material.');this.name='MaterialShareUrlUnavailable';}}
/**
 * Absolute public URL of a share path (`/m/<token>`), from `PUBLIC_APP_URL` like the rest of the outgoing email.
 * Outside production a missing base falls back to the local server; in production it throws {@link MaterialShareUrlUnavailable}.
 */
export function materialShareUrl({path,base=process.env.PUBLIC_APP_URL,production=process.env.NODE_ENV==='production'}:{path:string;base?:string|null;production?:boolean}):string{
 const root=base?.trim();
 if(!root&&production)throw new MaterialShareUrlUnavailable();
 return shareOrigin({base:root})+path;
}
/** Origin that share links are built with (`PUBLIC_APP_URL`, or the local server), without trailing slashes. */
export const shareOrigin=({base=process.env.PUBLIC_APP_URL}:{base?:string|null}={}):string=>(base?.trim()||'http://localhost:3001').replace(/\/+$/,'');
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const escapeRegExp=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Lead-in before an appended material link, written for the client (owner review of spec 96): «Podés ver «Título» en: URL». */
export const materialLinkLead=({title}:{title:string})=>`Podés ver «${title.trim()}» en:`;
/** The text added to a draft for one material: «Podés ver «Título» en: URL» on its own line (WhatsApp, Instagram) or a paragraph with the link (email). */
export function materialLinkSnippet({channel,title,url}:{channel:MaterialChannel;title:string;url:string}):string{
 return channel!=='email'?`${materialLinkLead({title})} ${url}`:`<p>${escapeHtml(materialLinkLead({title}))} <a href="${url}">${url}</a></p>`;
}
/** Appends the material link at the end of the body, separated from the previous text (spec 89 §8.1). */
export function appendMaterialLink({channel,body,title,url}:{channel:MaterialChannel;body:string;title:string;url:string}):string{
 const snippet=materialLinkSnippet({channel,title,url});
 if(channel==='email')return (/^\s*(<p>\s*<\/p>)?\s*$/.test(body)?'':body)+snippet;
 const text=body.replace(/\s+$/,'');return text?`${text}\n\n${snippet}`:snippet;
}
const GAP='\u0000';
/** Drops the placeholder left where a link was, without leaving double spaces or a space before punctuation. */
const closeGap=(text:string)=>text.replace(/[ \t]*\u0000[ \t]*(?=[.,;:!?)]|<\/|$)/g,'').replace(/(^|>)[ \t]*\u0000[ \t]*/g,'$1').replace(/[ \t]*\u0000[ \t]*/g,' ');
/**
 * Removes a material link from the body: the link itself and the lead-in the composer added before it («Podés ver «Título» en: », or the
 * older «Título: » of drafts saved before it; spec 89 §8.1).
 * Whatever else the seller wrote on that WhatsApp/Instagram line or in that email paragraph is kept; a line or paragraph left empty is dropped
 * (in plain text, with the blank line before it).
 */
export function removeMaterialLink({channel,body,url,title}:{channel:MaterialChannel;body:string;url:string;title:string}):string{
 if(!url||!body.includes(url))return body;
 const u=escapeRegExp(url),name=title.trim(),leads=name?[...new Set([materialLinkLead({title:name}),escapeHtml(materialLinkLead({title:name})),escapeHtml(name)+':',name+':'])]:[],prefix=leads.length?`(?:(?:${leads.map(escapeRegExp).join('|')})[ \\t]*)?`:'';
 if(channel==='email'){
  const link=new RegExp(`${prefix}(?:<a\\b[^>]*${u}[^>]*>[\\s\\S]*?</a>|${u})`,'g'),strip=(text:string)=>closeGap(text.replace(link,GAP));
  return strip(body.replace(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<\/p>/g,p=>{
   if(!p.includes(url))return p;
   const open=p.match(/^<p\b[^>]*>/)![0],inner=strip(p.slice(open.length,-4));
   return /^(?:\s|<br\s*\/?>|&nbsp;)*$/i.test(inner)?'':open+inner+'</p>';
  }));
 }
 const link=new RegExp(`${prefix}${u}`,'g'),kept:string[]=[];
 for(const line of body.split('\n')){
  if(!line.includes(url)){kept.push(line);continue;}
  const rest=closeGap(line.replace(link,GAP));
  if(rest.trim()){kept.push(rest);continue;}
  if(kept.length&&kept[kept.length-1]!.trim()==='')kept.pop();
 }
 return kept.join('\n').replace(/\s+$/,'');
}
/** Strips the signed query (`X-Amz-*`) of every presigned URL in a provider error before it is stored in the outbox or the journal. */
export function redactPresignedUrls({text}:{text:string}):string{
 return text.replace(/(https?:\/\/[^\s"'<>?]+)\?[^\s"'<>]*X-Amz-[^\s"'<>]*/gi,'$1?[redacted]');
}
type LinkInBody={url:string;token:string;slug:string|null};
/**
 * Every share link of a body: legacy links (`/m/<43 chars>`, with or without origin) and short links (spec 101, `<origin>/m/<slug>-<4 chars>`).
 * Short links are only recognized with the CRM origin ({@link shareOrigin}, host in any case): a 4-character tail is common in other sites'
 * URLs, and an unrecognized link would block `dispatch`. The slug part is read loosely (any characters, or none): a seller who retyped it
 * still keeps the link in the text, and `dispatch` then checks it against the stored slug (`slug` is `''` when it was deleted).
 */
function linksInBody({body,origin}:{body:string;origin:string}):LinkInBody[]{
 const links:LinkInBody[]=[];
 for(const match of body.matchAll(/(?:https?:\/\/[^\s"'<>]+)?\/m\/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/g))links.push({url:match[0],token:match[1]!,slug:null});
 // Short links: any `/m/<segment>` on the CRM origin (host in any case) whose segment, without trailing punctuation, is `<anything>-<4>` or just
 // `<4>`. Deliberately tolerant: a slug the seller edited (`_`, `.`, deleted) must still be found, so dispatch refuses it with «se modificó»
 // instead of revoking it as removed and sending a dead link.
 for(const match of body.matchAll(new RegExp(`${escapeRegExp(origin)}/m/([^\\s"'<>/?#]+)`,'gi'))){
  const segment=match[1]!.replace(/[.,;:!?)\]»]+$/,''),short=/^(?:(.*)-)?([A-Za-z0-9]{4})$/.exec(segment);
  if(short)links.push({url:match[0].slice(0,match[0].length-match[1]!.length)+segment,token:short[2]!,slug:short[1]??''});
 }
 // A 43-character segment can read both ways. A generated slug is lower case, so then it is the short link; otherwise (about 1.4 % of legacy
 // tokens have a `-` before their last 4 characters) it is the legacy token, whose 38 first characters are practically never all lower case.
 const generated=(slug:string)=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
 const ambiguous=(l:LinkInBody)=>l.slug!=null&&SHARE_TOKEN_PATTERN.test(l.slug+'-'+l.token);
 const shortWins=new Set(links.filter(l=>ambiguous(l)&&generated(l.slug!)).map(l=>l.slug+'-'+l.token));
 return links.filter(l=>l.slug==null?!shortWins.has(l.token):!ambiguous(l)||generated(l.slug));
}
/** Share tokens present in a body (legacy and short links, see {@link linksInBody}), as their sha256: the only form the database keeps. */
export function shareTokenHashesInBody({body,origin=shareOrigin()}:{body:string;origin?:string}):Set<string>{
 return new Set(linksInBody({body,origin}).map(l=>hashShareToken({token:l.token})));
}
/** The full URL of a share whose token appears in the body (null when the seller removed it). */
export function shareUrlInBody({body,tokenHash,origin=shareOrigin()}:{body:string;tokenHash:string;origin?:string}):string|null{
 return linksInBody({body,origin}).find(l=>hashShareToken({token:l.token})===tokenHash)?.url??null;
}
/**
 * Spec 101 D2: true when the body carries the link of a short share with its slug intact (case and accents aside). A legacy share
 * (`publicSlug` null) only needs its token. `dispatch` refuses to send a link whose slug the seller changed: it would answer 404.
 */
export function shareSlugIntactInBody({body,tokenHash,publicSlug,origin=shareOrigin()}:{body:string;tokenHash:string;publicSlug:string|null;origin?:string}):boolean{
 const links=linksInBody({body,origin}).filter(l=>hashShareToken({token:l.token})===tokenHash);
 return publicSlug==null?links.length>0:links.some(l=>l.slug!=null&&normalizeShareSlug({slug:l.slug})===publicSlug);
}
/** «10 MB» style label of a byte limit. */
export const megabytesLabel=({bytes}:{bytes:number}):string=>`${Number((bytes/1048576).toFixed(1))} MB`;
/**
 * File extensions Brevo attaches on `POST /v3/smtp/email` (`attachment`), from developers.brevo.com «Send a transactional email»,
 * checked on 2026-10-27. Anything else (webp, webm, svg…) is refused, so it goes only as a link.
 */
export const BREVO_ATTACHMENT_EXTENSIONS:readonly string[]=['xlsx','xls','ods','docx','docm','doc','csv','pdf','txt','gif','jpg','jpeg','png','tif','tiff','rtf','bmp','cgm','css','shtml','html','htm','zip','xml','ppt','pptx','tar','ez','ics','mobi','msg','pub','eps','odt','mp3','m4a','m4v','wma','ogg','flac','wav','aif','aifc','aiff','mp4','mov','avi','mkv','mpeg','mpg','wmv','pkpass','xlsm'] as const;
/** Lower-case extension of a file name, or null when it has none. */
export const fileExtension=({fileName}:{fileName:string}):string|null=>{const m=fileName.trim().match(/\.([A-Za-z0-9]+)$/);return m?m[1]!.toLowerCase():null;};
/** One material of a draft, as far as attaching it is concerned. */
export type AttachCandidate={id:string;source:'file'|'url';fileName:string|null;byteSize:number|null;attach:boolean};
/**
 * Why each material cannot be attached (null = it can), spec 89 D8 and §8.3: WhatsApp and Instagram (spec 98 decision 3) never attach, external links have no file,
 * Brevo only attaches the extensions of {@link BREVO_ATTACHMENT_EXTENSIONS} (a file without a name is refused too),
 * a file over the limit is refused, and the attachments of one message together cannot exceed the limit either.
 */
export function attachBlockReasons({channel,items,limitBytes}:{channel:MaterialChannel;items:readonly AttachCandidate[];limitBytes:number}):Record<string,string|null>{
 const limit=megabytesLabel({bytes:limitBytes});
 const attached=items.filter(i=>i.attach).reduce((sum,i)=>sum+(i.byteSize??0),0);
 return Object.fromEntries(items.map(i=>[i.id,
  channel!=='email'?`${channel==='instagram'?'Instagram':'WhatsApp'} no adjunta archivos: va solo el enlace.`
  :i.source==='url'?'Es un enlace externo: va solo el enlace.'
  :!i.fileName?.trim()?'El archivo no tiene nombre: va solo el enlace.'
  :!BREVO_ATTACHMENT_EXTENSIONS.includes(fileExtension({fileName:i.fileName})??'')?`Brevo no adjunta este tipo de archivo${fileExtension({fileName:i.fileName})?` (.${fileExtension({fileName:i.fileName})})`:''}: va solo el enlace.`
  :i.byteSize==null?'No se conoce el tamaño del archivo.'
  :i.byteSize>limitBytes?`Supera el límite de adjuntos de email (${limit}).`
  :!i.attach&&attached+i.byteSize>limitBytes?`Con este archivo, los adjuntos superan el límite de email (${limit}).`
  :null]));
}
