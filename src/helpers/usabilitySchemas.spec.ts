import {describe,it,expect} from 'vitest';
import {workQuery,workMutation,day} from '../endpoints/work.schema';import {communicationMutation} from '../endpoints/communication.schema';import {pipelineMutation} from '../endpoints/pipeline.schema';import {workGuidance} from './workGuidance';
describe('guided workflows validate user choices',()=>{
 it('calendar false stays false and impossible dates are rejected',()=>{expect(workQuery.parse({calendar:'false'}).calendar).toBe(false);expect(workQuery.parse({calendar:'true'}).calendar).toBe(true);expect(day.safeParse('2026-02-30').success).toBe(false)});
 it('records structured result independently of free notes and validates the next step',()=>{const value=workMutation.parse({action:'task_status',id:'1',status:'completed',outcome:'interested',result:'Me dijo que le escriba la semana que viene',nextTask:{title:'Revisar propuesta',dueDate:'2027-01-15',typeId:'followup'}});expect('outcome' in value&&value.outcome).toBe('interested');expect(workMutation.safeParse({action:'task_status',id:'1',status:'completed',result:'Hecho',nextTask:{title:'',dueDate:'2027-01-15',typeId:'followup'}}).success).toBe(false)});
 it('accepts the canonical later outcome and a trimmed reason for not scheduling anything',()=>{
  const base={action:'activity_save',accountId:'1',title:'Llamada',typeId:'call',occurredAt:'2026-10-01T10:00:00-03:00'} as const;
  expect(workMutation.safeParse({...base,outcome:'later',continuation:'wait',nextTask:{title:'Retomar conversación',dueDate:'2026-11-01',typeId:'followup'}}).success).toBe(true);
  const done=workMutation.parse({...base,outcome:'not_interested',continuation:'done',continuationReason:'  Ya trabaja con otra empresa  '});expect('continuationReason' in done&&done.continuationReason).toBe('Ya trabaja con otra empresa');
  expect(workMutation.safeParse({...base,outcome:'no_answer',continuation:'done',continuationReason:' a '}).success).toBe(false);
  expect(workMutation.safeParse({...base,outcome:'no_answer',continuation:'done',continuationReason:'x'.repeat(501)}).success).toBe(false);
  expect(workMutation.safeParse({...base,outcome:'maybe'}).success).toBe(false);
 });
 it('guides a later outcome toward a date to resume',()=>{expect(workGuidance('commercial','later')?.continuation).toBe('wait');expect(workGuidance('care','later')?.continuation).toBe('wait');});
 it('guided won closure includes client conversion and care in the same command',()=>{const value=pipelineMutation.parse({action:'transition',leadId:'1',revision:0,stage:'Ganada',convertClient:true,onboarding:{title:'Acompañar al cliente',dueDate:'2027-01-15'}});expect(value.action).toBe('transition')});
 it('requires a summary and destination clarification for manual communication',()=>{expect(communicationMutation.safeParse({action:'manual_complete',id:'6b4b9e49-3900-4e5c-9a28-7a7d71e78b23',result:'manual_sent',summary:''}).success).toBe(false);expect(communicationMutation.safeParse({action:'response_create',id:'6b4b9e49-3900-4e5c-9a28-7a7d71e78b23',accountId:'1',leadId:null,contactId:null,channel:'call',recipient:'Negocio',recipientName:'Negocio',destination:null,linkedMessageId:null,category:'other',summary:'Respuesta',exactText:null,closeLeadIds:[]}).success).toBe(false)});
 it('accepts DNC with explicitly selected managements and requires a correction reason',()=>{
  const id='6b4b9e49-3900-4e5c-9a28-7a7d71e78b23';
  expect(communicationMutation.safeParse({action:'response_create',id,accountId:'1',leadId:null,contactId:null,channel:'call',recipient:'',recipientName:'Negocio',destination:null,linkedMessageId:null,category:'do_not_contact',summary:'Pidió no volver a llamar',exactText:null,otherDetail:null,confirmDoNotContact:true,closeLeadIds:['2']}).success).toBe(true);
  expect(communicationMutation.safeParse({action:'interaction_correct',id,result:'manual_sent',summary:'',reason:'ok'}).success).toBe(false);
  expect(communicationMutation.safeParse({action:'interaction_correct',id,result:'manual_sent',summary:'',reason:'Error de carga'}).success).toBe(true);
 });
});
