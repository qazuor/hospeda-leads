import {describe,expect,it} from 'vitest';
import {historyFilter,historyFilterKinds,journalDetail,journalTitle,stageChangeTitle} from './historyLabels';

describe('journalTitle',()=>{
 it('labels the raw contact_completed action instead of showing it',()=>{
  expect(journalTitle({kind:'communication',action:'contact_completed'})).toBe('Contacto realizado');
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
