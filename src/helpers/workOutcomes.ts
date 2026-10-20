export const workOutcomes = {no_answer:'No respondió', interested:'Mostró interés', replied:'Respondió', not_interested:'No quiere avanzar', do_not_contact:'Pidió no ser contactado', other:'Otro resultado', delivered:'Entrega confirmada', needs_help:'Necesita ayuda', awaiting_confirmation:'Falta confirmar', care_completed:'Revisión realizada'} as const;
export type WorkOutcome=keyof typeof workOutcomes;

export const purposeOutcomes={commercial:["no_answer","interested","replied","not_interested","other"],reactivation:["no_answer","interested","replied","not_interested","other"],delivery:["delivered","awaiting_confirmation","needs_help","no_answer","other"],care:["care_completed","needs_help","awaiting_confirmation","no_answer","other"]} as const;

/** The single canonical list of contact outcomes (owner decision 3A). Additive: `workOutcomes`/`purposeOutcomes` stay until U-07 switches the server. */
export const contactOutcomes={no_answer:'No respondió',interested:'Respondió, le interesa',later:'Pidió que lo contacte más adelante',not_interested:'No le interesa',do_not_contact:'Pidió no ser contactado',other:'Otro (contame)'} as const;
export type ContactOutcome=keyof typeof contactOutcomes;
/** Display labels for stored values that are not canonical outcomes. History is never rewritten; it is only shown with these words. */
export const legacyOutcomeDisplay={replied:'Respondió',delivered:'Entrega confirmada',awaiting_confirmation:'Falta confirmar',needs_help:'Necesita ayuda',care_completed:'Revisión realizada'} as const;
export type LegacyOutcome=keyof typeof legacyOutcomeDisplay;
const purposeExtras={commercial:[],reactivation:[],delivery:['delivered','awaiting_confirmation','needs_help'],care:['care_completed','needs_help','awaiting_confirmation']} as const satisfies Record<string,readonly LegacyOutcome[]>;
/** Outcomes to offer for a task purpose: the 6 canonical ones plus only that purpose's specific extras (Q1 default). Unknown or empty purpose → the 6. */
export const outcomeOptions=(purpose?:string|null):readonly (ContactOutcome|LegacyOutcome)[]=>[...Object.keys(contactOutcomes) as ContactOutcome[],...(purpose&&Object.hasOwn(purposeExtras,purpose)?purposeExtras[purpose as keyof typeof purposeExtras]:[])];
