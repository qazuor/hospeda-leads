import type {WorkTask} from '../endpoints/work.schema';
import {taskBucket} from './workDates';

export type WorkPurpose='commercial'|'delivery'|'care'|'reactivation';
export const purposeNames:Record<WorkPurpose,string>={commercial:'Conversación comercial',delivery:'Entrega',care:'Acompañamiento',reactivation:'Retomar una conversación'};
export function pendingWork(tasks:WorkTask[],leadId?:string,includeGeneral=false):WorkTask[]{
 return tasks.filter(t=>t.status==='pending'&&!t.deletedAt&&(!leadId||t.leadId===leadId||(includeGeneral&&!t.leadId))).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||((a.dueAt?new Date(a.dueAt).getTime():Infinity)-(b.dueAt?new Date(b.dueAt).getTime():Infinity))||a.id.localeCompare(b.id,undefined,{numeric:true}));
}
export function nextStep({tasks,blocked=false,hasContact=true,classification='open',leadId,finished=false}:{tasks:WorkTask[];blocked?:boolean;hasContact?:boolean;classification?:string;leadId?:string;finished?:boolean}){
 const task=pendingWork(tasks,leadId,classification==='won')[0];
 if(blocked)return {kind:'blocked' as const,title:'Este negocio pidió no recibir contactos',help:'Respetá la restricción. Podés revisar la información y los compromisos pendientes.',task};
 if(!hasContact&&(!task||['call','message','followup'].includes(task.typeId)))return {kind:'contact' as const,title:'Falta una persona o un canal para hablar',help:'Agregá un teléfono o email antes de planificar el contacto.',task};
 if(task)return {kind:'task' as const,title:task.title,help:task.continuation==='wait'&&taskBucket(task.dueDate,task.dueAt)==='upcoming'?'Estamos esperando hasta la fecha acordada. Después toca retomar.':taskBucket(task.dueDate,task.dueAt)==='overdue'?'Esta acción está atrasada. Revisá si todavía corresponde.':taskBucket(task.dueDate,task.dueAt)==='today'?'Esta acción corresponde hoy.':'Ya hay un próximo paso programado.',task};
 if(finished)return {kind:'done' as const,title:'Por ahora no hay otro paso',help:'La última acción se guardó con la decisión de terminar por ahora. Podés planificar otra cuando corresponda.',task:undefined};
 return {kind:'plan' as const,title:classification==='won'?'Acompañar al cliente':classification==='lost'?'Decidir si retomamos la conversación':'Elegir el próximo paso',help:classification==='won'?'Revisá lo acordado y dejá una fecha para consultar cómo le fue.':classification==='lost'?'Podés conservar esta venta cerrada y dejar una fecha para conversar más adelante.':'No hay una acción pendiente en este alcance. Elegí qué hacer y cuándo.',task:undefined};
}
