import type {WorkOutcome} from './workOutcomes';
import type {WorkPurpose} from './nextStep';
/** Advice is presentation only; it never selects a stage or changes other work. */
export function workGuidance(purpose:WorkPurpose|'',outcome:WorkOutcome|''){
 if(!purpose||!outcome)return null;
 if(outcome==='do_not_contact')return {text:'Respetá el pedido y dejá constancia de lo que dijo. Se aplicará la restricción del negocio y se detendrán sus secuencias.',continuation:null};
 if(outcome==='no_answer')return {text:'Anotá el intento. Si corresponde volver a contactar, elegí una fecha para retomar.',continuation:'wait' as const};
 if(outcome==='interested'||outcome==='replied')return {text:'Anotá qué respondió y qué acordaron. Podés dejar una acción concreta con fecha para continuar.',continuation:'task' as const};
 if(outcome==='needs_help')return {text:'Describí qué ayuda necesita y dejá una acción con fecha para resolverla.',continuation:'task' as const};
 if(outcome==='awaiting_confirmation')return {text:'Indicá qué falta confirmar y hasta cuándo esperar antes de consultar de nuevo.',continuation:'wait' as const};
 if(outcome==='delivered')return {text:'Anotá qué se entregó y quién lo confirmó. Este resultado registra una entrega; no acredita un pago.',continuation:null};
 if(outcome==='care_completed')return {text:'Anotá cómo le fue y si quedó algo por resolver. Elegí si hace falta otra acción o terminar por ahora.',continuation:null};
 if(outcome==='not_interested')return {text:'Registrá el motivo, si lo conocés. Elegí si corresponde retomar más adelante o terminar por ahora; la etapa se revisa por separado.',continuation:null};
 return {text:'Describí lo que ocurrió y elegí explícitamente cómo continuar.',continuation:null};
}
