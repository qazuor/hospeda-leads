import {describe,expect,it} from 'vitest';
import {RECONTACT_TASK_TITLE,isPastDay,recontactCancelReason,recontactNotice,recontactScheduled,scheduledForName} from './recontactTask';

describe('recontact task copy',()=>{
 it('tells the seller before and after saving which task is scheduled and on which Argentina calendar day',()=>{
  expect(RECONTACT_TASK_TITLE).toBe('Volver a contactar');
  expect(recontactNotice('2026-11-15')).toBe('Se va a agendar «Volver a contactar» para el 15 de nov de 2026.');
  expect(recontactScheduled('2026-11-15')).toBe('Agendamos «Volver a contactar» para el 15 de nov de 2026.');
  expect(recontactNotice('2026-01-01')).toContain('1 de ene de 2026');
 });
 it('names the assignee only when it is not the saver',()=>{
  expect(recontactNotice('2026-11-15','Marta')).toBe('Se va a agendar «Volver a contactar» para el 15 de nov de 2026 para Marta.');
  expect(recontactScheduled('2026-11-15','Marta')).toContain(' para Marta.');
  const users=[{email:'marta@example.com',displayName:'Marta'},{email:'sin@example.com',displayName:null}];
  expect(scheduledForName({responsibleEmail:'marta@example.com',currentUserEmail:'marta@example.com',users})).toBeNull();
  expect(scheduledForName({responsibleEmail:'marta@example.com',currentUserEmail:'ana@example.com',users})).toBe('Marta');
  expect(scheduledForName({responsibleEmail:'sin@example.com',currentUserEmail:'ana@example.com',users})).toBe('sin@example.com');
  expect(scheduledForName({responsibleEmail:null,currentUserEmail:'ana@example.com',users})).toBeNull();
 });
 it('detects a past Argentina day without using the UTC date',()=>{
  const lateEvening=new Date('2026-11-16T01:30:00Z');// still 15 Nov in Argentina
  expect(isPastDay('2026-11-15',lateEvening)).toBe(false);
  expect(isPastDay('2026-11-14',lateEvening)).toBe(true);
  expect(isPastDay('2026-11-16',lateEvening)).toBe(false);
 });
 it('gives a factual cancellation reason for each cause',()=>{
  expect(recontactCancelReason('status')).toMatch(/dejó de ser Recontactar/);
  expect(recontactCancelReason('date')).toMatch(/se quitó la fecha/);
  expect(recontactCancelReason('changed')).toMatch(/cambió a otro día/);
  expect(recontactCancelReason('dnc')).toMatch(/No contactar/);
  expect(recontactCancelReason('archived')).toMatch(/se archivó/);
 });
});
