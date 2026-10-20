import {describe,expect,it} from 'vitest';
import {historyFilter,historyFilterKinds,journalTitle,stageChangeTitle} from './historyLabels';

describe('journalTitle',()=>{
 it('labels the raw contact_completed action instead of showing it',()=>{
  expect(journalTitle({kind:'communication',action:'contact_completed'})).toBe('Contacto realizado');
 });
 it('labels data changes and falls back to a generic title for unknown actions',()=>{
  expect(journalTitle({kind:'change',action:'account_updated'})).toBe('Datos del negocio editados');
  expect(journalTitle({kind:'change',action:'something_new'})).toBe('Cambio en los datos del negocio');
  expect(journalTitle({kind:'communication',action:'brevo_event_opened'})).toBe('Novedad del envío de email');
  expect(journalTitle({kind:'communication',action:'toString'})).toBe('Novedad en la comunicación');
 });
});
describe('stageChangeTitle',()=>{
 it('uses stage labels and a plain word for a missing stage',()=>{
  expect(stageChangeTitle({oldStage:null,newStage:'main:lost'})).toMatch(/^Sin etapa → .+/);
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
