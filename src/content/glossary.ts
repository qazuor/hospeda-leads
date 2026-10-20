/**
 * One-sentence definitions shown by `HelpHint` ("ⓘ ¿Qué es esto?", report item 5.2).
 * Owner decision 6a keeps the word "Gestión" and explains it here instead of renaming it.
 */
export const GLOSSARY={
 status:{term:'Estado',definition:'Dice en qué situación está el negocio en general: Nuevo, Revisado, En gestión, Sin tarea agendada, Recontactar o Archivado.'},
 stage:{term:'Etapa',definition:'Dice en qué punto está una gestión, por ejemplo Por contactar, Interesado o Cerrada ganada. El negocio tiene Estado; cada gestión tiene su Etapa.'},
 management:{term:'Gestión',definition:'Es cada cosa que estás intentando lograr con un negocio, por ejemplo venderle un plan o sumarlo como proveedor. Un negocio puede tener varias gestiones a la vez.'},
 nextStep:{term:'Próximo paso',definition:'Es la próxima tarea agendada para ese negocio o gestión, con su fecha. Si no hay ninguna, nadie se va a acordar de volver a llamar.'},
 managementType:{term:'Tipo de gestión',definition:'Define qué estás intentando lograr y, con eso, qué etapas y motivos de cierre tiene la gestión.'},
 doNotContact:{term:'No contactar',definition:'El negocio pidió que no lo contactemos más: no se le pueden mandar mensajes ni llamar. Solo un administrador puede levantarlo.'}
} as const satisfies Record<string,{term:string;definition:string}>;
export type GlossaryKey=keyof typeof GLOSSARY;
