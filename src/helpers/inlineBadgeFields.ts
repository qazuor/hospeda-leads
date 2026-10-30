import type {BadgeCategory} from '../components/ValueBadge';
export const inlineBadgeFields = {
 ciudad:{title:'Ciudad',empty:'Sin ciudad',category:'city',scope:'business'},
 assignedUserEmail:{title:'Responsable',empty:'Sin responsable',category:'person',scope:'business'},
 tipo:{title:'Vertical',empty:'Sin vertical',category:'vertical',scope:'business'},
 subtipo:{title:'Subtipo',empty:'Sin subtipo',category:'subtype',scope:'business'},
 commercialProfile:{title:'Perfil comercial',empty:'Sin perfil comercial',category:'profile',scope:'management'},
 medioContactoPreferido:{title:'Medio preferido',empty:'Sin medio preferido',category:'contact',scope:'management'},
 origen:{title:'Origen histórico',empty:'Sin origen histórico',category:'generic',scope:'management'},
 quienCargo:{title:'Quién cargó (histórico)',empty:'Sin dato histórico de carga',category:'person',scope:'management'},
 creadoPor:{title:'Creado por (histórico)',empty:'Sin creador histórico',category:'person',scope:'management'},
} as const satisfies Record<string,{title:string;empty:string;category:BadgeCategory;scope:'business'|'management'}>;
export type InlineBadgeField=keyof typeof inlineBadgeFields;
export const isInlineBadgeField=(field:string):field is InlineBadgeField=>Object.hasOwn(inlineBadgeFields,field);
