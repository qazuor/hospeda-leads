import {formatDate} from '../helpers/crmDates';
import {localDay} from '../helpers/workDates';

/**
 * Single source of user-facing words for core CRM concepts (owner decision 6d).
 * One concept, one word: take UI copy from here instead of writing synonyms inline.
 * Values are plain Rioplatense Spanish for non-technical sellers.
 */
export const VOCAB={
 // Nouns
 business:'Negocio',businesses:'Negocios',person:'Persona',people:'Personas',management:'Gestión',managements:'Gestiones',
 /** Stage belongs to a management; status belongs to a business. */
 stage:'Etapa',status:'Estado',task:'Tarea',
 // Actions ("Contactar" is only a verb; a human is a "Persona")
 contact:'Contactar',addPerson:'Agregar persona',removePerson:'Quitar persona',scheduleTask:'Agendar tarea',logWhatHappened:'Anotar lo que pasó',logOutcome:'Anotar cómo salió',
 // Questions of the post-contact flow
 howDidItGo:'¿Cómo salió?',whatsNext:'¿Cómo sigue?',
 // Responsibles
 businessOwner:'Responsable del negocio',managementOwner:'Responsable de la gestión',assignedTo:'Asignada a',
 // Removal
 deleteMistake:'Borrar (cargada por error)',noLongerNeeded:'Ya no hace falta',
 // Business status label (owner decision 6c; the stored value stays `no_follow_up_scheduled`)
 noTaskScheduled:'Sin tarea agendada'
} as const;
export type VocabKey=keyof typeof VOCAB;

/** Free-text choice in preset lists: picking it asks the seller for her own words. */
export const OTHER_REASON='Otro (contame)';
/** Preset reasons for "No agendar nada" after a result (owner decision 2B). */
export const NO_FOLLOW_UP_REASONS=['Ya tengo otra tarea agendada','La gestión ya está cerrada','El negocio no quiere seguir por ahora',OTHER_REASON] as const;

/**
 * Returns `"{count} {word}"` with the singular form only for exactly 1.
 * @example plural(1,'gestión','gestiones') // "1 gestión"
 * @example plural(0,'gestión','gestiones') // "0 gestiones"
 */
export const plural=(count:number,singular:string,pluralForm:string):string=>`${count} ${pluralWord(count,singular,pluralForm)}`;

/**
 * The noun alone, singular only for exactly 1: for counts formatted elsewhere (thousands separators).
 * @example `${n.toLocaleString('es-AR')} ${pluralWord(n,'gestión','gestiones')}`
 */
export const pluralWord=(count:number,singular:string,pluralForm:string):string=>count===1?singular:pluralForm;

/** Minimal management shape needed to name it. */
export type NamedManagement={opportunityName?:string|null;createdAt?:Date|string|null};

/**
 * Display name for a management: its own name, or `Gestión sin nombre (iniciada el {fecha})`
 * using the Argentina calendar day of `createdAt`. Never returns an id or an internal key.
 */
export const managementDisplayName=(management:NamedManagement):string=>{
 const name=management.opportunityName?.trim();
 if(name)return name;
 const created=management.createdAt?new Date(management.createdAt):null;
 return created&&!Number.isNaN(created.getTime())?`Gestión sin nombre (iniciada el ${formatDate(localDay(created))})`:'Gestión sin nombre';
};
