/** Staff identity used to redact free text: known user addresses plus the CRM's own email domains. */
export type StaffIdentity={readonly emails:readonly string[];readonly domains:readonly string[]};

const named:Readonly<Record<string,string>>={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'",commat:'@',period:'.',colon:':',nbsp:' '};
const decodeOnce=(text:string):string=>text
 .replace(/&#x([0-9a-f]{1,6});?/gi,(match,hex:string)=>{const code=Number.parseInt(hex,16);return code<=0x10ffff?String.fromCodePoint(code):match;})
 .replace(/&#([0-9]{1,7});?/g,(match,dec:string)=>{const code=Number(dec);return code<=0x10ffff?String.fromCodePoint(code):match;})
 .replace(/&([a-z]+);/gi,(match,name:string)=>named[name.toLowerCase()]??match)
 .replace(/(?:%[0-9a-f]{2})+/gi,match=>{try{return decodeURIComponent(match);}catch{return match;}});

/**
 * Normalize text before privacy checks: decode numeric and named character references and percent-encoding
 * repeatedly (nested encodings, capped) and apply NFKC so look-alike characters such as full-width `＠` become ASCII.
 */
export function normalizeForPrivacy(text:string):string{
 let current=text.normalize('NFKC');
 for(let pass=0;pass<5;pass++){const next=decodeOnce(current).normalize('NFKC');if(next===current)break;current=next;}
 return current;
}

/** Derive the CRM's own email domain from its public host (`crm.hospeda.com.ar` → `hospeda.com.ar`). IPs and single labels give none. */
export function staffDomainsFromHost(host:string):string[]{
 const name=host.toLowerCase().split(':')[0]??'';
 if(!name.includes('.')||/^[0-9.]+$/.test(name))return [];
 const parts=name.split('.');
 return [parts.length>=3?parts.slice(1).join('.'):name];
}

const escapeRegExp=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/**
 * Replace staff addresses inside CRM free text with `[equipo]`: any known user email anywhere in the text, or any
 * address on a staff domain (covers sender addresses that are not user emails). Text is normalized first.
 * Client addresses stay visible (owner decision D3). Null stays null.
 */
export function redactStaffEmails(value:unknown,staff:StaffIdentity):string|null{
 if(value===null||value===undefined)return null;
 let text=normalizeForPrivacy(String(value));
 for(const domain of staff.domains)if(domain)text=text.replace(new RegExp(`[a-z0-9._%+-]+@(?:[a-z0-9-]+\\.)*${escapeRegExp(domain)}(?![a-z0-9-]|\\.[a-z0-9])`,'gi'),'[equipo]');
 for(const email of staff.emails)if(email)text=text.replace(new RegExp(escapeRegExp(email),'gi'),'[equipo]');
 return text;
}

/** Fail closed for management history: true when a value, once normalized, contains any `@` (likely an email). */
export const containsAddress=(value:unknown):boolean=>value!==null&&value!==undefined&&normalizeForPrivacy(String(value)).includes('@');
