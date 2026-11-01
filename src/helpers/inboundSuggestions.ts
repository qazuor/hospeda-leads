import {normalizeInstagramUsername} from './instagramChat';
import {senderAuthenticated} from './inboundEmailPure';
import type {AddressOwner,UnmatchedGroup,UnmatchedSuggestion} from './inboundUnmatchedShared';

/** Spec 103 D1/D2: pure grouping and suggestion rules for «Mensajes sin asociar» (rows are read by `inboundUnmatched.ts`). */
export type UnmatchedRow={id:string;channel:string;channelDetail:string|null;isOutgoing:boolean;fromAddress:string;fromName:string;subject:string;excerpt:string;receivedAt:Date;instagramIgsid:string|null;headers:unknown};
/** A business the suggestions may name. Trashed and merged ones are never suggested; archived ones are (they accept incoming messages). */
export type SuggestionAccount={id:string;nombre:string;ciudad:string|null;archivedAt:Date|null;deletedAt:Date|null;mergedIntoId:string|null;email:string|null;sitioWeb:string|null;perfilInstagram:string|null;openLeadId:string|null};
export type SuggestionContact={id:string;accountId:string;name:string;email:string|null};
/** Free providers: a shared domain there says nothing about the business. */
export const FREE_EMAIL_DOMAINS:ReadonlySet<string>=new Set(['gmail','hotmail','outlook','yahoo','live','icloud'].flatMap(p=>[`${p}.com`,`${p}.com.ar`]).concat(['googlemail.com','me.com','msn.com']));
export const MAX_SUGGESTIONS=3;
const lower=(v:string|null|undefined)=>v?.trim().toLowerCase()||'';
export const emailDomain=(email:string|null|undefined):string=>{const v=lower(email),at=v.lastIndexOf('@');return at>0?v.slice(at+1):'';};
const websiteHost=(url:string|null|undefined):string=>{const v=url?.trim();if(!v)return '';try{return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v)?v:'https://'+v).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}};
const sameDomain=(host:string,domain:string)=>!!host&&!!domain&&(host===domain||host.endsWith('.'+domain));

/**
 * authserv-id of the Authentication-Results header Cloudflare adds; mirrors `TRUSTED_AUTHSERV_ID` in `workers/inbound-email/wrangler.toml`
 * (a unit test keeps them equal). The server cannot read the Worker's variable, so it carries the same value.
 */
export const TRUSTED_AUTHSERV_ID='mx.cloudflare.net';
/** Drops `( … )` comments (one level, as `senderAuthenticated` accepts). */
const withoutComments=(v:string)=>v.replace(/\([^)]*\)/g,' ');
/**
 * D4/D5: re-checks a stored Authentication-Results before trusting it. Rows saved by the Worker between 656ed9f and 6a0ea84 (23/10/2026) kept every
 * copy of the header, joined with «, » by `Headers.get`, including copies the sender forged. A stored value is trusted only when it is exactly one
 * result set (no comma outside comments: result sets never contain one) whose authserv-id is Cloudflare's; then DMARC must pass for the From domain.
 * The envelope sender is not stored, so SPF alone cannot verify it here.
 */
export function storedSenderVerified({fromAddress,headers}:{fromAddress:string;headers:unknown}):boolean{
 const results=headers&&typeof headers==='object'?(headers as {authenticationResults?:unknown}).authenticationResults:undefined;
 if(typeof results!=='string'||/["\\]/.test(results))return false;
 const plain=withoutComments(results);
 if(plain.includes(',')||plain.split(';')[0].trim().toLowerCase()!==TRUSTED_AUTHSERV_ID)return false;
 return senderAuthenticated(fromAddress,undefined,results);
}
const isInstagram=(row:Pick<UnmatchedRow,'channel'|'channelDetail'>)=>row.channel==='social'&&row.channelDetail==='instagram';
/** D2: an Instagram chat is one card (by IGSID, as the association already moves it); any other channel is one card per sender. */
export const groupKey=(row:Pick<UnmatchedRow,'channel'|'channelDetail'|'instagramIgsid'|'fromAddress'>):string=>isInstagram(row)?`instagram:${row.instagramIgsid??lower(row.fromAddress)}`:`${row.channel}:${lower(row.fromAddress)}`;

/** Groups rows (newest first) into cards, newest card first. `usernames` maps an IGSID to the user Meta returned, for chats stored with the number. */
export function groupUnmatched({rows,usernames=new Map()}:{rows:readonly UnmatchedRow[];usernames?:ReadonlyMap<string,string|null>}):UnmatchedGroup[]{
 const groups=new Map<string,UnmatchedRow[]>();
 for(const row of [...rows].sort((a,b)=>new Date(b.receivedAt).getTime()-new Date(a.receivedAt).getTime())){const key=groupKey(row);groups.set(key,[...(groups.get(key)??[]),row]);}
 return [...groups].map(([key,items])=>{
  const first=items[0],instagram=isInstagram(first),incoming=items.find(r=>!r.isOutgoing)??first;
  const handle=instagram?items.map(r=>r.fromAddress.trim()).find(a=>a.startsWith('@')):undefined;
  const instagramUsername=instagram?normalizeInstagramUsername(handle)??(first.instagramIgsid?normalizeInstagramUsername(usernames.get(first.instagramIgsid)??null):null):null;
  return {key,channel:instagram?'instagram' as const:first.channel==='email'?'email' as const:'other' as const,address:instagram&&instagramUsername?'@'+instagramUsername:incoming.fromAddress,name:items.map(r=>r.fromName.trim()).find(Boolean)??'',igsid:instagram?first.instagramIgsid:null,instagramUsername,verified:first.channel==='email'&&items.some(r=>storedSenderVerified(r)),messages:items.map(r=>({id:r.id,isOutgoing:r.isOutgoing,subject:r.subject,excerpt:r.excerpt,receivedAt:r.receivedAt})),lastAt:first.receivedAt,suggestions:[],addressOwners:[],dismissal:null};
 });
}

/**
 * D1 suggestions, at most {@link MAX_SUGGESTIONS}, exact ones first: the Instagram user stored in a business (the webhook's rule), the email stored
 * in a business or one of its people, then (never exact) a business whose email, website or people share the sender's non-free domain.
 * Exact data that points at several businesses lists them all, none of them exact. Trashed and merged businesses are left out.
 */
export function suggestBusinesses({group,accounts,contacts}:{group:Pick<UnmatchedGroup,'channel'|'address'|'instagramUsername'>;accounts:readonly SuggestionAccount[];contacts:readonly SuggestionContact[]}):UnmatchedSuggestion[]{
 const live=accounts.filter(a=>!a.deletedAt&&a.mergedIntoId==null),byId=new Map(live.map(a=>[String(a.id),a]));
 const people=contacts.filter(c=>byId.has(String(c.accountId)));
 const make=(a:SuggestionAccount,reason:UnmatchedSuggestion['reason'],exact:boolean,contact?:SuggestionContact):UnmatchedSuggestion=>({accountId:String(a.id),nombre:a.nombre,ciudad:a.ciudad,archived:!!a.archivedAt,reason,contactId:contact?String(contact.id):null,contactName:contact?.name??null,exact,instagramEmpty:!a.perfilInstagram?.trim(),emailEmpty:!a.email?.trim(),openLeadId:a.openLeadId});
 const out:UnmatchedSuggestion[]=[],seen=new Set<string>();
 const add=(items:UnmatchedSuggestion[])=>{for(const s of items)if(!seen.has(s.accountId)){seen.add(s.accountId);out.push(s);}};
 if(group.channel==='instagram'&&group.instagramUsername){const found=live.filter(a=>normalizeInstagramUsername(a.perfilInstagram)===group.instagramUsername);add(found.map(a=>make(a,'instagram',found.length===1)));}
 if(group.channel==='email'){
  const address=lower(group.address),viaContact=new Map<string,SuggestionContact>();
  for(const c of people)if(lower(c.email)===address&&!viaContact.has(String(c.accountId)))viaContact.set(String(c.accountId),c);
  const ids=[...new Set([...live.filter(a=>lower(a.email)===address).map(a=>String(a.id)),...viaContact.keys()])];
  add(ids.map(id=>{const contact=viaContact.get(id);return make(byId.get(id)!,contact?'email_contact':'email_account',ids.length===1,contact);}));
  const domain=emailDomain(address);
  if(domain&&!FREE_EMAIL_DOMAINS.has(domain)){
   const domainContacts=new Map<string,SuggestionContact>();for(const c of people)if(emailDomain(c.email)===domain&&!domainContacts.has(String(c.accountId)))domainContacts.set(String(c.accountId),c);
   add(live.filter(a=>emailDomain(a.email)===domain||sameDomain(websiteHost(a.sitioWeb),domain)||domainContacts.has(String(a.id))).map(a=>make(a,'domain',false)));
  }
 }
 return out.sort((a,b)=>Number(b.exact)-Number(a.exact)).slice(0,MAX_SUGGESTIONS);
}
/** D4: the live businesses that already hold the card's address: the @usuario in the business's Instagram, or the email in the business or one of its people. */
export function addressOwners({group,accounts,contacts}:{group:Pick<UnmatchedGroup,'channel'|'address'|'instagramUsername'>;accounts:readonly SuggestionAccount[];contacts:readonly SuggestionContact[]}):AddressOwner[]{
 const live=accounts.filter(a=>!a.deletedAt&&a.mergedIntoId==null),owner=(a:SuggestionAccount):AddressOwner=>({accountId:String(a.id),nombre:a.nombre,ciudad:a.ciudad});
 if(group.channel==='instagram')return group.instagramUsername?live.filter(a=>normalizeInstagramUsername(a.perfilInstagram)===group.instagramUsername).map(owner):[];
 if(group.channel!=='email')return [];
 const address=lower(group.address),viaPeople=new Set(contacts.filter(c=>lower(c.email)===address).map(c=>String(c.accountId)));
 return live.filter(a=>lower(a.email)===address||viaPeople.has(String(a.id))).map(owner);
}
