/** What the seller ticked in "¿Pasar la gestión a …?": the management, the stage and the revision she was looking at when she ticked. */
export type AcceptedStage={readonly leadId:string;readonly stage:string;readonly revision:number};
/** Copy shown when the server refuses the stage because the management changed (409); nothing was saved. */
export const STAGE_CONFLICT_MESSAGE='No se guardó nada: la gestión cambió mientras anotabas. Lo que escribiste sigue acá; revisá la etapa sugerida y volvé a guardar.';
/**
 * The `stageChange` to send, or undefined. It only applies while the same management and the same suggestion are still selected,
 * and it keeps the revision captured at tick time so a concurrent change is detected by the server instead of silently bypassed.
 */
export const stageChangeToSend=({accepted,suggestedKey,leadId}:{accepted:AcceptedStage|null;suggestedKey:string|null|undefined;leadId:string}):{stage:string;revision:number}|undefined=>accepted&&suggestedKey&&accepted.leadId===leadId&&accepted.stage===suggestedKey?{stage:accepted.stage,revision:accepted.revision}:undefined;
