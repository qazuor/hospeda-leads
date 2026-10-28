import type {ContactOutcome} from './workOutcomes';

/** Spec 96 §10.1: shown next to an outcome a registered response set, until a person corrects it. */
export const AUTO_OUTCOME_NOTE='Resultado registrado automáticamente desde la respuesta';

/** A send of the business still waiting for «¿Cómo salió?»: its management (null without one) and when it happened. */
export type OpenSend={readonly id:string;readonly leadId:string|null;readonly lastInteractionAt:Date};

/** Categories a registered response can have (communication.schema `response_create`). */
export type ResponseCategory='interested'|'information'|'later'|'rejected'|'not_now'|'operational'|'do_not_contact'|'other';

const outcomes:Record<ResponseCategory,ContactOutcome>={interested:'interested',information:'other',later:'later',rejected:'not_interested',not_now:'later',operational:'other',do_not_contact:'do_not_contact',other:'other'};

/** The canonical outcome a response category records. Only what the seller registered: «Pidió información» is not taken as interest. */
export function responseOutcome({category}:{category:ResponseCategory}):{outcome:ContactOutcome}{return {outcome:outcomes[category]};}

/**
 * Whether «Anotar lo que pasó» must be refused because the contact already has an outcome. Only a person's outcome blocks it: one a
 * registered response set automatically (`outcome_response_id` set) is overwritten by the person's log, as a correction (spec 96 §10.1).
 */
export function contactLogBlocked({outcome,outcomeResponseId}:{outcome:string|null;outcomeResponseId:string|null}):boolean{return !!outcome&&outcomeResponseId==null;}

const latest=(sends:readonly OpenSend[])=>[...sends].sort((a,b)=>b.lastInteractionAt.getTime()-a.lastInteractionAt.getTime())[0]?.id??null;

/**
 * Which open send a registered response answers (spec 96 §10.1), or null when it cannot be told without guessing.
 * 1. A response linked to a message answers that message, but only while it is still open (never another one instead).
 * 2. A response about a management answers the most recent open send of that management; none there means none.
 * 3. A response without management answers the most recent open send only when all open sends share one context (one
 *    management, or all without one); open sends in different contexts are ambiguous and stay pending.
 * Only sends that happened at or before `answeredAt` count (when the response was received, or registered when there is no message):
 * a response cannot answer a later send, so an old message registered late never resolves what was sent after it.
 * Nothing is inferred from received messages: only the registered response counts.
 */
export function attributeResponseToSend({sends:all,linkedMessageId,leadId,answeredAt}:{sends:readonly OpenSend[];linkedMessageId:string|null;leadId:string|null;answeredAt:Date}):{messageId:string|null}{
 const sends=all.filter(s=>s.lastInteractionAt.getTime()<=answeredAt.getTime());
 if(linkedMessageId)return {messageId:sends.some(s=>s.id===linkedMessageId)?linkedMessageId:null};
 if(leadId)return {messageId:latest(sends.filter(s=>s.leadId===leadId))};
 return {messageId:new Set(sends.map(s=>s.leadId)).size===1?latest(sends):null};
}
