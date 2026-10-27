import {describe,expect,it} from 'vitest';
import {historyActorLabel,historyChannelLabel,historyMessageStatus,historyFilter,historyFilterKinds,journalDetail,journalTitle,stageChangeTitle} from './historyLabels';

describe('journalTitle',()=>{
 it('labels the raw contact_completed action instead of showing it',()=>{
  expect(journalTitle({kind:'communication',action:'contact_completed'})).toBe('Contacto realizado');
 });
 it('titles every inbound_* action instead of «Novedad en la comunicación» (spec 90)',()=>{
  expect(journalTitle({kind:'communication',action:'inbound_received',inbound:{channel:'social',detail:'instagram',from:'@qaz.uor'}})).toBe('Mensaje recibido por Instagram de @qaz.uor');
  expect(journalTitle({kind:'communication',action:'inbound_received',inbound:{channel:'whatsapp',from:'Ana'}})).toBe('Mensaje recibido por WhatsApp de Ana');
  expect(journalTitle({kind:'communication',action:'inbound_received',inbound:{channel:'email',from:' '}})).toBe('Mensaje recibido por Email');
  expect(journalTitle({kind:'communication',action:'inbound_received'})).toBe('Mensaje recibido');
  expect(journalTitle({kind:'communication',action:'inbound_matched'})).toBe('Mensaje asociado');
  expect(journalTitle({kind:'communication',action:'inbound_dismissed'})).toBe('Mensaje descartado');
  expect(journalTitle({kind:'communication',action:'inbound_registered'})).toBe('Respuesta registrada');
  for(const action of ['inbound_received','inbound_matched','inbound_registered','inbound_dismissed','inbound_future'])expect(journalTitle({kind:'communication',action})).not.toBe('Novedad en la comunicación');
 });
});
describe('historyChannelLabel',()=>{
 it('never shows raw social or call keys',()=>{
  expect(historyChannelLabel({channel:'social',instagram:true})).toBe('Instagram');
  expect(historyChannelLabel({channel:'social'})).toBe('Red social');
  expect(historyChannelLabel({channel:'call'})).toBe('Llamada');
  expect(historyChannelLabel({channel:'phone'})).toBe('Teléfono');
  expect(historyChannelLabel({channel:null})).toBeNull();
 });
 it('labels data changes and falls back to a generic title for unknown actions',()=>{
  expect(journalTitle({kind:'change',action:'account_updated'})).toBe('Datos del negocio editados');
  expect(journalTitle({kind:'change',action:'account_contact_data_updated'})).toBe('Datos de contacto corregidos');
  expect(journalTitle({kind:'change',action:'something_new'})).toBe('Cambio en los datos del negocio');
  expect(journalTitle({kind:'communication',action:'brevo_event_opened'})).toBe('Novedad del envío de email');
  expect(journalTitle({kind:'communication',action:'toString'})).toBe('Novedad en la comunicación');
 });
});
describe('stageChangeTitle',()=>{
 it('uses stage labels and a plain word for a missing stage',()=>{
  expect(stageChangeTitle({oldStage:null,newStage:'main:contact'})).toBe('Gestión iniciada → Por contactar');
  expect(stageChangeTitle({oldStage:'main:contact',newStage:'main:contacted'})).toBe('Por contactar → Contactado');
  expect(stageChangeTitle({oldStage:null,newStage:'main:lost'})).not.toContain('main:');
 });
});
describe('historyFilter',()=>{
 it('accepts the four filters and treats anything else as all',()=>{
  for(const value of ['all','contact','management','change'])expect(historyFilter(value)).toBe(value);
  for(const value of [null,undefined,'','nada','constructor'])expect(historyFilter(value)).toBe('all');
 });
 it('keeps contact kinds out of management and change',()=>{
  expect(historyFilterKinds.management).toEqual(['stage']);
  expect(historyFilterKinds.change).toEqual(['change']);
  expect(historyFilterKinds.contact).not.toContain('stage');
 });
});
describe('journalDetail',()=>{
 it('summarizes known fields in plain words and never echoes raw JSON or internal data',()=>{
  const text=journalDetail({after:{status:'manual_sent',channel:'whatsapp',recipientName:'Ana',destination:'5493442000000',content:'secreto',exactText:'x',recipient:'a@b.com',outboxId:7},before:{status:'draft'}});
  expect(text).toBe('Envío confirmado manualmente · WhatsApp · Ana');
  expect(text).not.toMatch(/[{}"]|5493442|secreto|a@b\.com|outbox/i);
 });
 it('returns null when nothing is readable and tolerates non-objects',()=>{
  expect(journalDetail({after:{status:'archived',responseId:'1'}})).toBeNull();
  expect(journalDetail({after:'x',before:[1]})).toBeNull();
  expect(journalDetail({after:{category:'interested'},automatic:true})).toBe('Respondió, le interesa · Registrado automáticamente');
 });
});

describe('Historial shows the Instagram echo like «Comunicación» (spec 90, C)',()=>{
 it('names the webhook account «Instagram de Hospeda» and keeps people by name',()=>{
  const users=[{email:'leo@example.com',displayName:'Leandro'}];
  expect(historyActorLabel({email:'instagram@hospeda',users})).toBe('Instagram de Hospeda');
  expect(historyActorLabel({email:'leo@example.com',users})).toBe('Leandro');
  expect(historyActorLabel({email:null,users})).toBe('Sin responsable registrado');
 });
 it('says an echo was sent from the Instagram app and recorded automatically',()=>{
  expect(historyMessageStatus({status:'manual_sent',channel:'social',actorEmail:'instagram@hospeda'})).toBe('Enviado desde la app de Instagram de Hospeda · registrado automáticamente');
  expect(historyMessageStatus({status:'manual_sent',channel:'social',actorEmail:'leo@example.com'})).toBe('Envío confirmado manualmente');
  expect(historyMessageStatus({status:'legacy_x',channel:'email',actorEmail:null})).toBe('Estado histórico: legacy_x');
 });
});
