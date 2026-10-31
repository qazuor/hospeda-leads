import {channelLabel,channelLabels,responseCategoryLabel,stageLabel} from './crmLabels';
import {messageLabels} from './messageLabels';
import {ECHO_SENDER,ECHO_STATUS,INSTAGRAM_ECHO_OWNER} from './instagramChannel';

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
 contact_completed:'Contacto realizado',contact_started:'Contacto iniciado',contact_logged:'Contacto anotado',contact_resolved:'Contacto resuelto',contact_linked:'Envío vinculado al mensaje del canal',interaction_voided:'Registro anulado',draft_prepared:'Mensaje preparado',draft_cancelled:'Mensaje descartado',auto_registration_voided:'Registro automático anulado',
 email_submission_started:'Envío de email en curso',email_result_uncertain:'Resultado del email incierto',whatsapp_opened_unconfirmed:'WhatsApp abierto, envío sin confirmar',instagram_opened_unconfirmed:'Instagram abierto, envío sin confirmar',interaction_corrected:'Contacto corregido',
 email_uncertain_resolved:'Resultado incierto resuelto por un administrador',
 brevo_accepted:'Email aceptado por el proveedor',brevo_rejected:'Email rechazado por el proveedor',response_registered:'Respuesta anotada',response_corrected:'Respuesta corregida',response_reminder_created:'Recordatorio agendado desde una respuesta',
 do_not_contact_activated:'Se marcó No contactar',do_not_contact_lifted:'Se levantó No contactar',business_archived_by_do_not_contact:'Negocio archivado por No contactar',client_marked_by_care_contact:'Marcado como cliente',
 technical_restriction_added:'Se bloqueó un canal de contacto',technical_restriction_lifted:'Se habilitó un canal de contacto'
};
/** Plain-words titles for business data changes. */
const changeTitles:Readonly<Record<string,string>>={
 account_created:'Negocio creado',account_updated:'Datos del negocio editados',account_contact_data_updated:'Datos de contacto corregidos',account_deleted:'Negocio enviado a Papelera',account_restored:'Negocio restaurado',account_archived:'Negocio archivado',account_unarchived:'Negocio recuperado',account_merged:'Negocios fusionados',
 contact_policy:'Preferencias de contacto actualizadas',leandro_referral_changed:'Derivación a Leandro actualizada',import_updated:'Actualizado desde un lote',business_assignment_rebalanced:'Responsable actualizado por redistribución',converted_to_client:'Pasó a ser cliente',
 business_status_changed:'Estado del negocio actualizado',business_state_changed:'Estado del negocio actualizado',client_marked:'Marcado como cliente',client_unmarked:'Se quitó la marca de cliente',
 contact_created:'Persona agregada',contact_updated:'Persona editada',contact_deleted:'Persona quitada',contact_primary_changed:'Persona principal reemplazada'
};
const has=(map:Readonly<Record<string,string>>,key:string)=>Object.hasOwn(map,key);

/** The received message an `inbound_*` journal entry points at (channel, `channel_detail` and sender), read on the server. */
export type InboundJournalRef={channel?:string|null;detail?:string|null;from?:string|null};
/**
 * Channel name shown in Historial (spec 90): `social` is «Instagram» when the row comes from Instagram and «Red social»
 * otherwise, `call` is «Llamada»; other keys use `channelLabel`. Empty → null (no channel shown).
 */
export const historyChannelLabel=({channel,instagram=false}:{channel:string|null|undefined;instagram?:boolean|null}):string|null=>!channel?null:channel==='social'?(instagram?'Instagram':'Red social'):channel==='instagram'?'Instagram':channelLabel(channel);
/** Actor of a history entry: the Instagram webhook's own account reads «Instagram de Hospeda», never its technical email. */
export const historyActorLabel=({email,users}:{email:string|null|undefined;users:readonly {email:string;displayName?:string|null}[]}):string=>email===INSTAGRAM_ECHO_OWNER?ECHO_SENDER:users.find(u=>u.email===email)?.displayName||email||'Sin responsable registrado';
/** Status line of a message entry; an Instagram echo says it was sent from the Instagram app and recorded automatically (as in «Comunicación»). */
export const historyMessageStatus=({status,channel,actorEmail}:{status:string;channel:string|null|undefined;actorEmail:string|null|undefined}):string=>status==='userscript_sent'?'Enviado · confirmado por el script de WhatsApp':status==='instagram_sent'?'Enviado · confirmado por Instagram':channel==='social'&&actorEmail===INSTAGRAM_ECHO_OWNER&&status==='manual_sent'?ECHO_STATUS:messageLabels[status]||'Estado histórico: '+status;
/** Titles of the received-message journal actions; `inbound_received` names the channel and the sender when known. */
const inboundTitle=(action:string,inbound?:InboundJournalRef|null):string=>{
 if(action==='inbound_received'){
  const channel=inbound?.channel==='social'||inbound?.channel==='instagram'?(inbound.detail&&inbound.detail!=='instagram'?'Red social':'Instagram'):inbound?.channel?channelLabel(inbound.channel):'';
  const from=inbound?.from?.trim();
  return channel?`Mensaje recibido por ${channel}${from?' de '+from:''}`:'Mensaje recibido';
 }
 return ({inbound_matched:'Mensaje asociado',inbound_registered:'Respuesta registrada',inbound_dismissed:'Mensaje descartado'} as Readonly<Record<string,string>>)[action]??'Novedad del mensaje recibido';
};

/** Title of a timeline entry that comes from a journal: known actions get plain words, unknown ones a generic title (never the raw key). `brevo_event_*` are provider notices. */
export const journalTitle=({kind,action,inbound}:{kind:'communication'|'change';action:string;inbound?:InboundJournalRef|null}):string=>{
 if(kind==='communication'&&action.startsWith('inbound_'))return inboundTitle(action,inbound);
 const map=kind==='communication'?communicationTitles:changeTitles;
 if(has(map,action))return map[action];
 if(kind==='communication'&&action.startsWith('brevo_event_'))return 'Novedad del envío de email';
 return kind==='communication'?'Novedad en la comunicación':'Cambio en los datos del negocio';
};
/** Title of a stage change: "Contactado → Interesado"; unknown keys pass through `stageLabel`. */
export const stageChangeTitle=({oldStage,newStage}:{oldStage:string|null;newStage:string|null}):string=>oldStage?`${stageLabel(oldStage)} → ${stageLabel(newStage)}`:`Gestión iniciada → ${stageLabel(newStage)}`;

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown):string=>typeof value==='string'?value.trim():'';
/**
 * Readable summary of a communication journal entry built from a whitelist (message status, response category, channel, recipient name, summary).
 * Never echoes raw JSON, ids, emails, destinations or message content; returns null when nothing readable is left.
 */
export const journalDetail=({before,after,automatic=false}:{before?:unknown;after?:unknown;automatic?:boolean}):string|null=>{
 const a=record(after),b=record(before),parts:string[]=[];
 const status=text(a.status);if(status&&Object.hasOwn(messageLabels,status))parts.push(messageLabels[status]);
 const category=text(a.category);if(category)parts.push(responseCategoryLabel(category));
 const channel=text(a.channel);if(channel&&Object.hasOwn(channelLabels,channel))parts.push(channelLabel(channel));
 const name=text(a.recipientName);if(name)parts.push(name);
 const summary=text(a.summary);if(summary)parts.push(summary);
 const was=text(b.status);if(!status&&was&&Object.hasOwn(messageLabels,was))parts.push('Antes: '+messageLabels[was]);
 if(automatic)parts.push('Registrado automáticamente');
 return parts.length?parts.join(' · '):null;
};
