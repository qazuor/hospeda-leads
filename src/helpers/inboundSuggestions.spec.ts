// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {TRUSTED_AUTHSERV_ID,addressOwners,groupUnmatched,storedSenderVerified,suggestBusinesses,type SuggestionAccount,type UnmatchedRow} from './inboundSuggestions';
import {INBOUND_HISTORY_LABELS,addressOwnedElsewhere,dismissalText,rescanNotice,saveAddressOffer} from './inboundUnmatchedShared';

const at=(h:number)=>new Date(Date.UTC(2026,9,30,h));
const row=(over:Partial<UnmatchedRow>):UnmatchedRow=>({id:'m'+Math.random(),channel:'email',channelDetail:null,isOutgoing:false,fromAddress:'ana@cabanas.com.ar',fromName:'Ana',subject:'Consulta',excerpt:'Hola',receivedAt:at(10),instagramIgsid:null,headers:{},...over});
const account=(over:Partial<SuggestionAccount>):SuggestionAccount=>({id:'1',nombre:'Cabañas del Río',ciudad:'Colón',archivedAt:null,deletedAt:null,mergedIntoId:null,email:null,sitioWeb:null,perfilInstagram:null,openLeadId:null,...over});
const DMARC='mx.cloudflare.net; dmarc=pass header.from=cabanas.com.ar';

describe('groupUnmatched (D2)',()=>{
 it('makes one card per Instagram chat and one per email sender, newest first, with every message',()=>{
  const groups=groupUnmatched({rows:[row({id:'e1',receivedAt:at(9)}),row({id:'e2',fromAddress:'ANA@cabanas.com.ar',receivedAt:at(12),subject:'Otra'}),row({id:'i1',channel:'social',channelDetail:'instagram',fromAddress:'@huesped',instagramIgsid:'77',receivedAt:at(11)}),row({id:'i2',channel:'social',channelDetail:'instagram',isOutgoing:true,fromAddress:'@huesped',instagramIgsid:'77',receivedAt:at(8)})]});
  expect(groups.map(g=>[g.key,g.messages.map(m=>m.id)])).toEqual([['email:ana@cabanas.com.ar',['e2','e1']],['instagram:77',['i1','i2']]]);
  expect(groups[1]).toMatchObject({channel:'instagram',address:'@huesped',instagramUsername:'huesped',igsid:'77'});
  expect(groups[0].lastAt).toEqual(at(12));
 });
 it('names an IGSID-only chat with the user Meta returned, and keeps the number when unknown',()=>{
  const rows=[row({channel:'social',channelDetail:'instagram',fromAddress:'1789',instagramIgsid:'1789'}),row({channel:'social',channelDetail:'instagram',fromAddress:'1790',instagramIgsid:'1790'})];
  const [a,b]=groupUnmatched({rows,usernames:new Map([['1789','Ana.Rio']])});
  expect([a.address,a.instagramUsername,b.address,b.instagramUsername]).toEqual(['@ana.rio','ana.rio','1790',null]);
 });
 it('marks an email verified only with a stored DMARC pass for its domain',()=>{
  expect(storedSenderVerified({fromAddress:'ana@cabanas.com.ar',headers:{authenticationResults:DMARC}})).toBe(true);
  expect(storedSenderVerified({fromAddress:'ana@cabanas.com.ar',headers:{authenticationResults:'mx.cloudflare.net; dmarc=fail header.from=cabanas.com.ar'}})).toBe(false);
  expect(storedSenderVerified({fromAddress:'ana@cabanas.com.ar',headers:{}})).toBe(false);
  expect(storedSenderVerified({fromAddress:'ana@cabanas.com.ar',headers:null})).toBe(false);
  expect(groupUnmatched({rows:[row({}),row({headers:{authenticationResults:DMARC}})]})[0].verified).toBe(true);
 })
 it('does not trust merged Authentication-Results copies stored by Worker 656ed9f (23/10)',()=>{
  // Headers.get joined every copy with ", ": Cloudflare's real verdict first, then the copies the sender wrote (one even claiming Cloudflare's id).
  // The plain senderAuthenticated accepts both values below (red before this check).
  for(const forged of ['mx.cloudflare.net; dmarc=none header.from=cabanas.com.ar, mx.cloudflare.net; dmarc=pass header.from=cabanas.com.ar','mx.cloudflare.net; spf=none smtp.mailfrom=x.com, evil.example; dmarc=pass header.from=cabanas.com.ar'])
   expect(storedSenderVerified({fromAddress:'ana@cabanas.com.ar',headers:{authenticationResults:forged}})).toBe(false);
  expect(storedSenderVerified({fromAddress:'ana@cabanas.com.ar',headers:{authenticationResults:'evil.example; dmarc=pass header.from=cabanas.com.ar'}})).toBe(false);
  expect(storedSenderVerified({fromAddress:'ana@cabanas.com.ar',headers:{authenticationResults:'mx.cloudflare.net; spf=pass (sender a, b) smtp.mailfrom=cabanas.com.ar; dmarc=pass header.from=cabanas.com.ar'}})).toBe(true);
 });
 it('keeps the trusted authserv-id equal to the Worker configuration',()=>{
  expect(readFileSync('workers/inbound-email/wrangler.toml','utf8')).toMatch(new RegExp(`TRUSTED_AUTHSERV_ID\\s*=\\s*"${TRUSTED_AUTHSERV_ID.replace(/\./g,'\\.')}"`));
 });
});

describe('addressOwners (D4)',()=>{
 it('lists the live businesses that already hold the @usuario or the email, and says where',()=>{
  const ig={channel:'instagram' as const,address:'@ana.rio',instagramUsername:'ana.rio'};
  const accounts=[account({id:'456',nombre:'Hotel Sol',ciudad:'Colón',perfilInstagram:'https://www.instagram.com/Ana.Rio/'}),account({id:'7',perfilInstagram:'@ana.rio.2'}),account({id:'8',perfilInstagram:'ana.rio',deletedAt:new Date()})];
  const owners=addressOwners({group:ig,accounts,contacts:[]});
  expect(owners).toEqual([{accountId:'456',nombre:'Hotel Sol',ciudad:'Colón'}]);
  expect(addressOwnedElsewhere({group:{...ig,addressOwners:owners},accountId:'9'})).toBe('Ese @ana.rio ya está en H456 · Hotel Sol · Colón.');
  expect(addressOwnedElsewhere({group:{...ig,addressOwners:owners},accountId:'456'})).toBeNull();
  const email={channel:'email' as const,address:'Ana@Cabanas.com.ar',instagramUsername:null};
  expect(addressOwners({group:email,accounts:[account({id:'3'}),account({id:'4',email:'otra@cabanas.com.ar'})],contacts:[{id:'c1',accountId:'3',name:'Ana',email:'ana@cabanas.com.ar'}]}).map(o=>o.accountId)).toEqual(['3']);
 });
});

describe('global history labels',()=>{
 it('names the D3 journal actions',()=>{
  expect(INBOUND_HISTORY_LABELS.resource_inbound_dismissed).toBe('Mensaje sin asociar descartado');
  expect(INBOUND_HISTORY_LABELS.resource_inbound_restored).toBe('Mensaje devuelto a «Sin asociar»');
 });
});

describe('suggestBusinesses (D1)',()=>{
 const ig={channel:'instagram' as const,address:'@cabanasrio',instagramUsername:'cabanasrio'};
 it('suggests the one business whose Instagram is the user, as exact, with D4 and management data',()=>{
  const [s]=suggestBusinesses({group:ig,accounts:[account({id:'5',perfilInstagram:'https://instagram.com/CabanasRio/',email:'x@y.com',openLeadId:'9'}),account({id:'6',perfilInstagram:'@otro'})],contacts:[]});
  expect(s).toMatchObject({accountId:'5',reason:'instagram',exact:true,instagramEmpty:false,emailEmpty:false,openLeadId:'9'});
 });
 it('lists every business when the same exact data points at several, none exact',()=>{
  const out=suggestBusinesses({group:ig,accounts:[account({id:'5',perfilInstagram:'@cabanasrio'}),account({id:'6',perfilInstagram:'cabanasrio'})],contacts:[]});
  expect(out.map(s=>[s.accountId,s.exact])).toEqual([['5',false],['6',false]]);
 });
 it('never suggests trashed or merged businesses, and flags archived ones',()=>{
  const out=suggestBusinesses({group:ig,accounts:[account({id:'5',perfilInstagram:'@cabanasrio',deletedAt:at(1)}),account({id:'6',perfilInstagram:'@cabanasrio',mergedIntoId:'7'}),account({id:'8',perfilInstagram:'@cabanasrio',archivedAt:at(1)})],contacts:[]});
  expect(out.map(s=>[s.accountId,s.exact,s.archived])).toEqual([['8',true,true]]);
 });
 it('matches the email of a business or of a person (case-insensitive), naming the person',()=>{
  const group={channel:'email' as const,address:'Marta@Hotel.test',instagramUsername:null};
  expect(suggestBusinesses({group,accounts:[account({id:'5',email:'marta@hotel.test'})],contacts:[]})[0]).toMatchObject({accountId:'5',reason:'email_account',exact:true});
  expect(suggestBusinesses({group,accounts:[account({id:'5'})],contacts:[{id:'3',accountId:'5',name:'Marta Gómez',email:'MARTA@hotel.test'}]})[0]).toMatchObject({accountId:'5',reason:'email_contact',contactId:'3',contactName:'Marta Gómez',exact:true});
 });
 it('suggests a shared non-free domain as possible only, and ignores free providers',()=>{
  const accounts=[account({id:'5',sitioWeb:'www.cabanas.com.ar'}),account({id:'6',email:'info@cabanas.com.ar'}),account({id:'7',email:'otro@gmail.com'})];
  expect(suggestBusinesses({group:{channel:'email',address:'ana@cabanas.com.ar',instagramUsername:null},accounts,contacts:[]}).map(s=>[s.accountId,s.reason,s.exact])).toEqual([['5','domain',false],['6','domain',false]]);
  expect(suggestBusinesses({group:{channel:'email',address:'ana@gmail.com',instagramUsername:null},accounts,contacts:[]})).toEqual([]);
 });
 it('puts exact suggestions first and returns at most three',()=>{
  const accounts=[1,2,3,4].map(i=>account({id:String(i),email:`r${i}@cabanas.com.ar`})).concat(account({id:'9',email:'ana@cabanas.com.ar'}));
  const out=suggestBusinesses({group:{channel:'email',address:'ana@cabanas.com.ar',instagramUsername:null},accounts,contacts:[]});
  expect(out.length).toBe(3);expect(out[0]).toMatchObject({accountId:'9',exact:true});
 });
});

describe('saveAddressOffer (D4)',()=>{
 const empty={instagramEmpty:true,emailEmpty:true},full={instagramEmpty:false,emailEmpty:false};
 it('offers the Instagram user only when the business has none',()=>{
  const group={channel:'instagram' as const,address:'@huesped',instagramUsername:'huesped',verified:false};
  expect(saveAddressOffer({group,account:empty})).toEqual({kind:'instagram',target:'account',label:'Guardar @huesped en el negocio'});
  expect(saveAddressOffer({group,account:full})).toBeNull();
  expect(saveAddressOffer({group:{...group,instagramUsername:null},account:empty})).toBeNull();
 });
 it('offers a verified email to the chosen empty person, else to the empty business; never unverified, filled or already stored',()=>{
  const group={channel:'email' as const,address:'ana@cabanas.com.ar',instagramUsername:null,verified:true};
  expect(saveAddressOffer({group,account:empty,contact:{name:'Ana',emailEmpty:true}})).toEqual({kind:'email',target:'contact',label:'Guardar ana@cabanas.com.ar en Ana'});
  expect(saveAddressOffer({group,account:empty,contact:{name:'Ana',emailEmpty:false}})).toBeNull();
  expect(saveAddressOffer({group,account:empty})).toEqual({kind:'email',target:'account',label:'Guardar ana@cabanas.com.ar en el negocio'});
  expect(saveAddressOffer({group,account:full})).toBeNull();
  expect(saveAddressOffer({group:{...group,verified:false},account:empty})).toBeNull();
  expect(saveAddressOffer({group,account:empty,alreadyStored:true})).toBeNull();
 });
});

describe('texts',()=>{
 it('writes the dismissal reason and the rescan result',()=>{
  expect(dismissalText({reason:'spam'})).toBe('Spam o publicidad');
  expect(dismissalText({reason:'other',detail:'  Proveedor  '})).toBe('Otro: Proveedor');
  expect(rescanNotice({associated:2,remaining:1,lookups:3,lookupsPending:0,unchecked:0})).toBe('Se asociaron 2; queda 1 sin asociar.');
  expect(rescanNotice({associated:1,remaining:5,lookups:50,lookupsPending:4,unchecked:0})).toBe('Se asoció 1; quedan 5 sin asociar. Faltan consultar 4 chats de Instagram: volvé a buscar para seguir.');
  expect(rescanNotice({associated:0,remaining:9,lookups:0,lookupsPending:0,unchecked:7})).toBe('Se asociaron 0; quedan 9 sin asociar. Quedan 7 por revisar: tocá de nuevo «Volver a buscar negocios».');
 });
});
