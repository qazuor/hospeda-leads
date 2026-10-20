import {stageLabel} from './crmLabels';

/** Filters of the unified "Qué pasó" timeline. */
export const historyFilters=['all','contact','management','change'] as const;
export type HistoryFilter=typeof historyFilters[number];
/** Chip text per filter. */
export const historyFilterLabels:Readonly<Record<HistoryFilter,string>>={all:'Todo',contact:'Contactos',management:'Gestiones',change:'Cambios de datos'};
/** Event kinds each filter keeps (`all` keeps every kind). */
export const historyFilterKinds:Readonly<Record<Exclude<HistoryFilter,'all'>,readonly string[]>>={contact:['activity','message','response','communication'],management:['stage'],change:['change']};
/** Narrows an untrusted query value to a filter; anything unknown means "all". */
export const historyFilter=(value:string|null|undefined):HistoryFilter=>(historyFilters as readonly string[]).includes(value??'')?value as HistoryFilter:'all';

/** Plain-words titles for the communication journal actions (never show the internal key to a seller). */
const communicationTitles:Readonly<Record<string,string>>={
 contact_completed:'Contacto realizado',contact_started:'Contacto iniciado',contact_logged:'Contacto anotado',contact_resolved:'Contacto resuelto',draft_prepared:'Mensaje preparado',draft_cancelled:'Mensaje descartado',
 email_submission_started:'Envío de email en curso',email_result_uncertain:'Resultado del email incierto',whatsapp_opened_unconfirmed:'WhatsApp abierto, envío sin confirmar',interaction_corrected:'Contacto corregido',
 brevo_accepted:'Email aceptado por el proveedor',brevo_rejected:'Email rechazado por el proveedor',response_registered:'Respuesta anotada',response_corrected:'Respuesta corregida',response_reminder_created:'Recordatorio agendado desde una respuesta',
 do_not_contact_activated:'Se marcó No contactar',do_not_contact_lifted:'Se levantó No contactar',business_archived_by_do_not_contact:'Negocio archivado por No contactar',client_marked_by_care_contact:'Marcado como cliente',
 technical_restriction_added:'Se bloqueó un canal de contacto',technical_restriction_lifted:'Se habilitó un canal de contacto'
};
/** Plain-words titles for business data changes. */
const changeTitles:Readonly<Record<string,string>>={
 account_created:'Negocio creado',account_updated:'Datos del negocio editados',account_deleted:'Negocio enviado a Papelera',account_restored:'Negocio restaurado',account_archived:'Negocio archivado',account_unarchived:'Negocio recuperado',account_merged:'Negocios fusionados',
 contact_policy:'Preferencias de contacto actualizadas',leandro_referral_changed:'Derivación a Leandro actualizada',import_updated:'Actualizado desde un lote',business_assignment_rebalanced:'Responsable actualizado por redistribución',converted_to_client:'Pasó a ser cliente',
 business_status_changed:'Estado del negocio actualizado',business_state_changed:'Estado del negocio actualizado',client_marked:'Marcado como cliente',client_unmarked:'Se quitó la marca de cliente',
 contact_created:'Persona agregada',contact_updated:'Persona editada',contact_deleted:'Persona quitada',contact_primary_changed:'Persona principal reemplazada'
};
const has=(map:Readonly<Record<string,string>>,key:string)=>Object.hasOwn(map,key);

/** Title of a timeline entry that comes from a journal: known actions get plain words, unknown ones a generic title (never the raw key). `brevo_event_*` are provider notices. */
export const journalTitle=({kind,action}:{kind:'communication'|'change';action:string}):string=>{
 const map=kind==='communication'?communicationTitles:changeTitles;
 if(has(map,action))return map[action];
 if(kind==='communication'&&action.startsWith('brevo_event_'))return 'Novedad del envío de email';
 return kind==='communication'?'Novedad en la comunicación':'Cambio en los datos del negocio';
};
/** Title of a stage change: "Contactado → Interesado"; unknown keys pass through `stageLabel`. */
export const stageChangeTitle=({oldStage,newStage}:{oldStage:string|null;newStage:string|null}):string=>`${stageLabel(oldStage)} → ${stageLabel(newStage)}`;
