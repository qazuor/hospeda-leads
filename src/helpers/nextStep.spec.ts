import {describe,it,expect} from 'vitest';
import {nextStep,pendingWork,latestDecision} from './nextStep';
import type {WorkTask} from '../endpoints/work.schema';
const task=(id:string,leadId:string|null,date:string):WorkTask=>({id,accountId:'1',leadId,title:id,typeId:'call',description:null,assignedUserEmail:'a@example.com',dueDate:date,dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Prueba',city:null,opportunityName:null,deletedAt:null});
describe('next work across business and sales',()=>{
 it('shows waiting only before the scheduled followup date',()=>{const t={...task('1',null,'2099-10-02'),continuation:'wait' as const};expect(nextStep({tasks:[t]}).help).toContain('Estamos esperando');expect(nextStep({tasks:[{...t,dueDate:'2000-01-01'}]}).help).toContain('atrasada')});
 it('includes general care for won sales, excluding other proposals and removed work',()=>{const tasks=[task('1','2','2026-10-03'),task('2',null,'2026-10-02'),task('3','3','2026-10-01'),{...task('4',null,'2026-09-01'),deletedAt:new Date()}];expect(pendingWork(tasks,'2',true).map(t=>t.id)).toEqual(['2','1']);expect(pendingWork(tasks,'2').map(t=>t.id)).toEqual(['1']);expect(nextStep({tasks,leadId:'2',classification:'won'}).task?.id).toBe('2')});
 it('respects restrictions and an explicit decision to finish without overriding pending commitments',()=>{expect(nextStep({tasks:[],blocked:true,hasContact:false}).kind).toBe('blocked');expect(nextStep({tasks:[],finished:true}).kind).toBe('done');expect(nextStep({tasks:[],finished:true,hasContact:false}).kind).toBe('done');expect(nextStep({tasks:[task('1',null,'2026-10-02')],finished:true,finishedReason:'La gestión ya está cerrada'}).kind).toBe('task');expect(nextStep({tasks:[],hasContact:false}).kind).toBe('contact')});
 it('uses the chosen no-follow-up reason and reports when its task is not visible',()=>{
  const reason='Ya tengo otra tarea agendada';
  expect(nextStep({tasks:[],finished:true,finishedReason:reason}).title).toBe('No encontramos la otra tarea');
  // 2099: always upcoming, so the help does not depend on the real clock.
  expect(nextStep({tasks:[task('Llamar mañana',null,'2099-10-31')],finished:true,finishedReason:reason})).toMatchObject({kind:'task',title:'Llamar mañana'});
  expect(nextStep({tasks:[task('Llamar mañana',null,'2099-10-31')],finished:true,finishedReason:reason}).help).toBe('Ya hay un próximo paso programado.');
  expect(nextStep({tasks:[task('Otra gestión','10','2026-10-31')],leadId:'2',finished:true,finishedReason:reason}).title).toBe('Tu próximo paso está en otra tarea');
  expect(nextStep({tasks:[],leadId:'2',finished:true,finishedReason:'La gestión ya está cerrada'})).toMatchObject({title:'Gestión cerrada',help:'Elegiste no agendar nada porque la gestión ya está cerrada.'});
  expect(nextStep({tasks:[task('Otra',null,'2026-10-31')],finished:true,finishedReason:'La gestión ya está cerrada'})).toMatchObject({kind:'task',title:'Otra'});
  expect(nextStep({tasks:[],finished:true,finishedReason:'El negocio no quiere seguir por ahora'}).help).toBe('Elegiste no agendar nada: el negocio no quiere seguir por ahora.');
  expect(nextStep({tasks:[],finished:true,finishedReason:'No continuar'}).help).toBe('Elegiste no agendar nada: «No continuar».');
  expect(nextStep({tasks:[],finished:true}).help).toContain('decisión de terminar por ahora');
 });
 it('in the business view a closed management does not title the whole business as closed',()=>{
  // Other managements may still be open: the business scope keeps the generic "terminar por ahora" copy.
  expect(nextStep({tasks:[],finished:true,finishedReason:'La gestión ya está cerrada'})).toMatchObject({kind:'done',title:'Por ahora no hay otro paso',help:'La última acción se guardó con la decisión de terminar por ahora. Podés planificar otra cuando corresponda.'});
 });
 it('reads the decision from the newest visible activity, not from the newest done one',()=>{
  // Newest first, as /_api/work returns them. A newer "task" activity supersedes an older "No agendar nada".
  const activities=[{leadId:null,continuation:'task' as const,continuationReason:null},{leadId:null,continuation:'done' as const,continuationReason:'Ya tengo otra tarea agendada'}];
  expect(latestDecision({activities})).toEqual({finished:false,finishedReason:undefined});
  expect(nextStep({tasks:[],...latestDecision({activities})}).kind).toBe('plan');
  expect(latestDecision({activities:activities.slice(1)})).toEqual({finished:true,finishedReason:'Ya tengo otra tarea agendada'});
  // Inside a management only its own activities count (and general ones for a won sale).
  const scoped=[{leadId:'9',continuation:'task' as const,continuationReason:null},{leadId:'2',continuation:'done' as const,continuationReason:'La gestión ya está cerrada'},{leadId:null,continuation:'task' as const,continuationReason:null}];
  expect(latestDecision({activities:scoped,leadId:'2'})).toEqual({finished:true,finishedReason:'La gestión ya está cerrada'});
  expect(latestDecision({activities:[scoped[2],scoped[1]],leadId:'2',classification:'won'}).finished).toBe(false);
  expect(latestDecision({activities:[]})).toEqual({finished:false,finishedReason:undefined});
 });
 it('allows internal work without a contact channel and orders same day tasks by time',()=>{const a={...task('1',null,'2026-10-02'),typeId:'other',dueAt:new Date('2026-10-02T16:00:00Z')};const b={...task('2',null,'2026-10-02'),typeId:'other',dueAt:new Date('2026-10-02T14:00:00Z')};expect(nextStep({tasks:[a,b],hasContact:false}).task?.id).toBe('2')});
});
