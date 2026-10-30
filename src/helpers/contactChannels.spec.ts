import {CONTACT_ARCHIVED_REASON,CONTACT_DNC_REASON,CONTACT_LOADING_REASON,CONTACT_PERMISSION_REASON,EMAIL_MISSING_REASON,INSTAGRAM_MISSING_REASON,WHATSAPP_MISSING_REASON,channelDataBlock,contactChannelBlock} from './contactChannels';

const account=(over:Record<string,unknown>={})=>({doNotContact:false,archivedAt:null,status:'contacted',telefono:null,whatsapp:null,email:null,perfilInstagram:null,...over});
const GATE='Instalá el script de Hospeda para contactar por WhatsApp o Instagram desde la computadora.';

describe('channelDataBlock',()=>{
 it('needs a phone of the business or of an active person for WhatsApp',()=>{
  expect(channelDataBlock({channel:'whatsapp',account:account(),contacts:[]})).toBe(WHATSAPP_MISSING_REASON);
  expect(channelDataBlock({channel:'whatsapp',account:account(),contacts:[{phone:'+549',deletedAt:new Date()}]})).toBe(WHATSAPP_MISSING_REASON);
  expect(channelDataBlock({channel:'whatsapp',account:account({whatsapp:'+549'}),contacts:[]})).toBe('');
  expect(channelDataBlock({channel:'whatsapp',account:account(),contacts:[{phone:' +549 '}]})).toBe('');
 });
 it('needs an email for Email and a valid username for Instagram',()=>{
  expect(channelDataBlock({channel:'email',account:account(),contacts:[{email:'  '}]})).toBe(EMAIL_MISSING_REASON);
  expect(channelDataBlock({channel:'email',account:account(),contacts:[{email:'ana@example.com'}]})).toBe('');
  expect(channelDataBlock({channel:'instagram',account:account({perfilInstagram:'no es un perfil'}),contacts:[]})).toBe(INSTAGRAM_MISSING_REASON);
  expect(channelDataBlock({channel:'instagram',account:account({perfilInstagram:'https://instagram.com/hotel.sol'}),contacts:[]})).toBe('');
 });
});

describe('contactChannelBlock',()=>{
 it('applies the reasons in order: loading, No contactar, archived, permission, data, gate',()=>{
  const base={contacts:[],canContact:true,gateReason:GATE};
  expect(contactChannelBlock({...base,channel:'whatsapp',account:null})).toBe(CONTACT_LOADING_REASON);
  expect(contactChannelBlock({...base,channel:'whatsapp',account:account({doNotContact:true,archivedAt:new Date()})})).toBe(CONTACT_DNC_REASON);
  expect(contactChannelBlock({...base,channel:'whatsapp',account:account({status:'archived'})})).toBe(CONTACT_ARCHIVED_REASON);
  expect(contactChannelBlock({...base,canContact:false,channel:'whatsapp',account:account()})).toBe(CONTACT_PERMISSION_REASON);
  expect(contactChannelBlock({...base,channel:'whatsapp',account:account()})).toBe(WHATSAPP_MISSING_REASON);
  expect(contactChannelBlock({...base,channel:'whatsapp',account:account({telefono:'+549'})})).toBe(GATE);
 });
 it('never applies the user script gate to Email',()=>{
  expect(contactChannelBlock({channel:'email',account:account({email:'x@example.com'}),contacts:[],canContact:true,gateReason:GATE})).toBe('');
  expect(contactChannelBlock({channel:'instagram',account:account({perfilInstagram:'hotel.sol'}),contacts:[],canContact:true,gateReason:''})).toBe('');
 });
});
