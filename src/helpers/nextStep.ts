import type {WorkTask,WorkActivity} from '../endpoints/work.schema';
import {taskBucket} from './workDates';
import {formatDate} from './crmDates';

export type WorkPurpose='commercial'|'delivery'|'care'|'reactivation';
export const purposeNames:Record<WorkPurpose,string>={commercial:'Conversación comercial',delivery:'Entrega',care:'Acompañamiento',reactivation:'Retomar una conversación'};
export function pendingWork(tasks:WorkTask[],leadId?:string,includeGeneral=false):WorkTask[]{
 return tasks.filter(t=>t.status==='pending'&&!t.deletedAt&&(!leadId||t.leadId===leadId||(includeGeneral&&!t.leadId))).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||((a.dueAt?new Date(a.dueAt).getTime():Infinity)-(b.dueAt?new Date(b.dueAt).getTime():Infinity))||a.id.localeCompare(b.id,undefined,{numeric:true}));
}
/** "No agendar nada" decision of the newest visible activity (activities come newest first). Inside a management only its own activities count, plus general ones for a won sale; a newer activity with another continuation supersedes an older 'done'. */
export function latestDecision({activities,leadId,classification='open'}:{activities:readonly Pick<WorkActivity,'leadId'|'continuation'|'continuationReason'>[];leadId?:string;classification?:string}):{finished:boolean;finishedReason?:string|null}{
 const latest=activities.find(a=>!leadId||a.leadId===leadId||(classification==='won'&&!a.leadId));
 return latest?.continuation==='done'?{finished:true,finishedReason:latest.continuationReason}:{finished:false,finishedReason:undefined};
}
export function nextStep({tasks,blocked=false,hasContact=true,classification='open',leadId,finished=false,finishedReason}:{tasks:WorkTask[];blocked?:boolean;hasContact?:boolean;classification?:string;leadId?:string;finished?:boolean;finishedReason?:string|null}){
 const task=pendingWork(tasks,leadId,classification==='won')[0];
 const otherBusinessTask=finished&&finishedReason==='Ya tengo otra tarea agendada'&&!task?pendingWork(tasks)[0]:undefined;
 if(blocked)return {kind:'blocked' as const,title:'Este negocio pidió no recibir contactos',help:'Respetá la restricción. Podés revisar la información y los compromisos pendientes.',task};
 if(finished&&!task&&finishedReason==='Ya tengo otra tarea agendada'){
  if(otherBusinessTask)return {kind:'task' as const,title:'Tu próximo paso está en otra tarea',help:`Elegiste no agendar nada porque ya tenías otra tarea: ${otherBusinessTask.title} · ${formatDate(otherBusinessTask.dueDate)}.`,task:otherBusinessTask};
  return {kind:'done' as const,title:'No encontramos la otra tarea',help:'Elegiste no agendar nada porque ya tenías otra tarea, pero no vemos una pendiente en este negocio. Puede estar a nombre de otra persona. Revisá o agendá una.',task:undefined};
 }
 // In the business view (no leadId) the activity may belong to any management while others stay open: «Gestión cerrada» would mislabel the business, so that reason keeps the generic copy below.
 if(finished&&!task&&finishedReason&&!(finishedReason==='La gestión ya está cerrada'&&!leadId)){
  const reasons:Record<string,{title:string;help:string}>={'La gestión ya está cerrada':{title:'Gestión cerrada',help:'Elegiste no agendar nada porque la gestión ya está cerrada.'},'El negocio no quiere seguir por ahora':{title:'Sin próximo paso por ahora',help:'Elegiste no agendar nada: el negocio no quiere seguir por ahora.'}};
  return {kind:'done' as const,...(reasons[finishedReason]??{title:'Sin próximo paso por ahora',help:`Elegiste no agendar nada: «${finishedReason}».`}),task:undefined};
 }
 if(finished&&!task){
  return {kind:'done' as const,title:'Por ahora no hay otro paso',help:'La última acción se guardó con la decisión de terminar por ahora. Podés planificar otra cuando corresponda.',task:undefined};
 }
 if(!hasContact&&(!task||['call','message','followup'].includes(task.typeId)))return {kind:'contact' as const,title:'Falta una persona o un canal para hablar',help:'Agregá un teléfono o email antes de planificar el contacto.',task};
 if(task)return {kind:'task' as const,title:task.title,help:task.continuation==='wait'&&taskBucket(task.dueDate,task.dueAt)==='upcoming'?'Estamos esperando hasta la fecha acordada. Después toca retomar.':taskBucket(task.dueDate,task.dueAt)==='overdue'?'Esta acción está atrasada. Revisá si todavía corresponde.':taskBucket(task.dueDate,task.dueAt)==='today'?'Esta acción corresponde hoy.':'Ya hay un próximo paso programado.',task};
 return {kind:'plan' as const,title:classification==='won'?'Acompañar al cliente':classification==='lost'?'Decidir si retomamos la conversación':'Elegir el próximo paso',help:classification==='won'?'Revisá lo acordado y dejá una fecha para consultar cómo le fue.':classification==='lost'?'Podés conservar esta gestión cerrada y dejar una fecha para conversar más adelante.':'No hay una tarea pendiente para este negocio. Elegí qué hacer y cuándo.',task:undefined};
}
