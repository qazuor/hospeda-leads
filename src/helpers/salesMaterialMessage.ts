import {hashShareToken} from './salesMaterialShare';
/** Message channels that can carry a sales material link (spec 89 D8). */
export type MaterialChannel='email'|'whatsapp';
/** No public base URL in production: a share link would point to localhost, so nothing is sent (fail closed). */
export class MaterialShareUrlUnavailable extends Error{constructor(){super('Falta configurar la dirección pública del CRM (PUBLIC_APP_URL): no se puede generar el enlace del material.');this.name='MaterialShareUrlUnavailable';}}
/**
 * Absolute public URL of a share path (`/m/<token>`), from `PUBLIC_APP_URL` like the rest of the outgoing email.
 * Outside production a missing base falls back to the local server; in production it throws {@link MaterialShareUrlUnavailable}.
 */
export function materialShareUrl({path,base=process.env.PUBLIC_APP_URL,production=process.env.NODE_ENV==='production'}:{path:string;base?:string|null;production?:boolean}):string{
 const root=base?.trim();
 if(!root&&production)throw new MaterialShareUrlUnavailable();
 return (root||'http://localhost:3001').replace(/\/+$/,'')+path;
}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const escapeRegExp=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** The text added to a draft for one material: «Título: URL» on its own line (WhatsApp) or a paragraph with the link (email). */
export function materialLinkSnippet({channel,title,url}:{channel:MaterialChannel;title:string;url:string}):string{
 return channel==='whatsapp'?`${title.trim()}: ${url}`:`<p>${escapeHtml(title.trim())}: <a href="${url}">${url}</a></p>`;
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
 * Removes a material link from the body: the link itself and the «Título: » prefix the composer added before it (spec 89 §8.1).
 * Whatever else the seller wrote on that WhatsApp line or in that email paragraph is kept; a line or paragraph left empty is dropped
 * (in WhatsApp, with the blank line before it).
 */
export function removeMaterialLink({channel,body,url,title}:{channel:MaterialChannel;body:string;url:string;title:string}):string{
 if(!url||!body.includes(url))return body;
 const u=escapeRegExp(url),name=title.trim(),prefix=name?`(?:(?:${[...new Set([escapeHtml(name),name])].map(escapeRegExp).join('|')}):[ \\t]*)?`:'';
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
/** Share tokens present in a body (`/m/<43 chars>`), as their sha256: the only form the database keeps. */
export function shareTokenHashesInBody({body}:{body:string}):Set<string>{
 const hashes=new Set<string>();
 for(const match of body.matchAll(/\/m\/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/g))hashes.add(hashShareToken({token:match[1]!}));
 return hashes;
}
/** The full URL of a share whose token appears in the body (null when the seller removed it). */
export function shareUrlInBody({body,tokenHash}:{body:string;tokenHash:string}):string|null{
 for(const match of body.matchAll(/(?:https?:\/\/[^\s"'<>]+)?\/m\/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/g))if(hashShareToken({token:match[1]!})===tokenHash)return match[0];
 return null;
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
 * Why each material cannot be attached (null = it can), spec 89 D8 and §8.3: WhatsApp never attaches, external links have no file,
 * Brevo only attaches the extensions of {@link BREVO_ATTACHMENT_EXTENSIONS} (a file without a name is refused too),
 * a file over the limit is refused, and the attachments of one message together cannot exceed the limit either.
 */
export function attachBlockReasons({channel,items,limitBytes}:{channel:MaterialChannel;items:readonly AttachCandidate[];limitBytes:number}):Record<string,string|null>{
 const limit=megabytesLabel({bytes:limitBytes});
 const attached=items.filter(i=>i.attach).reduce((sum,i)=>sum+(i.byteSize??0),0);
 return Object.fromEntries(items.map(i=>[i.id,
  channel!=='email'?'WhatsApp no adjunta archivos: va solo el enlace.'
  :i.source==='url'?'Es un enlace externo: va solo el enlace.'
  :!i.fileName?.trim()?'El archivo no tiene nombre: va solo el enlace.'
  :!BREVO_ATTACHMENT_EXTENSIONS.includes(fileExtension({fileName:i.fileName})??'')?`Brevo no adjunta este tipo de archivo${fileExtension({fileName:i.fileName})?` (.${fileExtension({fileName:i.fileName})})`:''}: va solo el enlace.`
  :i.byteSize==null?'No se conoce el tamaño del archivo.'
  :i.byteSize>limitBytes?`Supera el límite de adjuntos de email (${limit}).`
  :!i.attach&&attached+i.byteSize>limitBytes?`Con este archivo, los adjuntos superan el límite de email (${limit}).`
  :null]));
}
