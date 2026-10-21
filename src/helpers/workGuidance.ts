import type {WorkOutcome} from './workOutcomes';
import type {WorkPurpose} from './nextStep';
/** Advice is presentation only; it never selects a stage or changes other work. */
export function workGuidance(purpose:WorkPurpose|'',outcome:WorkOutcome|''){
 if(!purpose||!outcome)return null;
 if(outcome==='do_not_contact')return {text:'Este resultado histórico se conserva. Para registrar un nuevo pedido, usá Comunicación: ahí se bloquea todo el negocio y podés elegir qué gestiones cerrar.',continuation:null};
 if(outcome==='no_answer')return {text:'Anotá el intento. Si corresponde volver a contactar, elegí una fecha para retomar.',continuation:'wait' as const};
 if(outcome==='later')return {text:'Anotá cuándo te pidió que lo vuelvas a contactar y elegí esa fecha para retomar.',continuation:'wait' as const};
 if(outcome==='interested'||outcome==='replied')return {text:'Anotá qué respondió y qué acordaron. Podés agendar una tarea con fecha para continuar.',continuation:'task' as const};
 if(outcome==='needs_help')return {text:'Describí qué ayuda necesita y agendá una tarea con fecha para resolverla.',continuation:'task' as const};
 if(outcome==='awaiting_confirmation')return {text:'Indicá qué falta confirmar y hasta cuándo esperar antes de consultar de nuevo.',continuation:'wait' as const};
 if(outcome==='delivered')return {text:'Anotá qué se entregó y quién lo confirmó. Este resultado registra una entrega; no acredita un pago.',continuation:null};
 if(outcome==='care_completed')return {text:'Anotá cómo le fue y si quedó algo por resolver. Elegí si hace falta otra acción o si preferís «No agendar nada».',continuation:null};
 if(outcome==='not_interested')return {text:'Registrá el motivo, si lo conocés. Elegí si corresponde retomar más adelante o si preferís «No agendar nada»; la etapa se revisa por separado.',continuation:null};
 return {text:'Describí lo que ocurrió y elegí explícitamente cómo continuar.',continuation:null};
}

/**
 * Who may save a NEW activity from the work editor: an admin, or the responsible of the management (or of the business when there is none).
 * Mirrors the server rule of `activity_save`; a delegated task assignee or a reader does not pass. "Pidió no ser contactado" is only offered to whoever passes.
 */
export function canLogNewActivity({admin,ownerEmail,userEmail}:{admin:boolean;ownerEmail?:string|null;userEmail?:string|null}):boolean{return admin||(!!ownerEmail&&!!userEmail&&ownerEmail===userEmail);}
