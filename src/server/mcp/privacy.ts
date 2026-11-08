/** Staff identity used to redact free text: known user addresses plus the CRM's own email domains. */
export type StaffIdentity={readonly emails:readonly string[];readonly domains:readonly string[]};

const entities:Readonly<Record<string,string>>={'&lt;':'<','&gt;':'>','&#64;':'@','&commat;':'@','&amp;':'&','%40':'@'};
/** Decode the HTML entities and percent-encoded `@` that commonly hide addresses in email bodies. */
export const decodeAddressEntities=(text:string):string=>text.replace(/&lt;|&gt;|&#64;|&commat;|&amp;|%40/gi,match=>entities[match.toLowerCase()]??match);

/** Derive the CRM's own email domain from its public host (`crm.hospeda.com.ar` → `hospeda.com.ar`). IPs and single labels give none. */
export function staffDomainsFromHost(host:string):string[]{
 const name=host.toLowerCase().split(':')[0]??'';
 if(!name.includes('.')||/^[0-9.]+$/.test(name))return [];
 const parts=name.split('.');
 return [parts.length>=3?parts.slice(1).join('.'):name];
}

const emailPattern=/[^\s@<>"'(),;:[\]]+@[^\s@<>"'(),;:[\]]+\.[^\s@<>"'(),;:[\]]+/gi;

/**
 * Replace staff addresses inside CRM free text with `[equipo]`: any known user email, or any address on a staff domain
 * (covers sender addresses that are not user emails). Client addresses stay visible (owner decision D3). Null stays null.
 */
export function redactStaffEmails(value:unknown,staff:StaffIdentity):string|null{
 if(value===null||value===undefined)return null;
 const known=new Set(staff.emails.map(email=>email.toLowerCase()));
 const domains=staff.domains.map(domain=>domain.toLowerCase());
 return decodeAddressEntities(String(value)).replace(emailPattern,match=>{
  const core=match.replace(/\.+$/,'');const address=core.toLowerCase();const domain=address.slice(address.lastIndexOf('@')+1);
  return known.has(address)||domains.some(staffDomain=>domain===staffDomain||domain.endsWith('.'+staffDomain))?'[equipo]'+match.slice(core.length):match;
 });
}
