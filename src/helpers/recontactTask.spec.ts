import {describe,expect,it} from 'vitest';
import {RECONTACT_TASK_TITLE,recontactCancelReason,recontactNotice} from './recontactTask';

describe('recontact task copy',()=>{
 it('tells the seller which task is scheduled and on which Argentina calendar day',()=>{
  expect(RECONTACT_TASK_TITLE).toBe('Volver a contactar');
  expect(recontactNotice('2026-11-15')).toBe('Te agendamos «Volver a contactar» para el 15 de nov de 2026.');
  expect(recontactNotice('2026-01-01')).toContain('1 de ene de 2026');
 });
 it('gives a factual cancellation reason for each cause',()=>{
  expect(recontactCancelReason('status')).toMatch(/dejó de ser Recontactar/);
  expect(recontactCancelReason('date')).toMatch(/se quitó la fecha/);
 });
});
