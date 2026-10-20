export const workOutcomes = {no_answer:'No respondió', interested:'Mostró interés', replied:'Respondió', not_interested:'No quiere avanzar', do_not_contact:'Pidió no ser contactado', other:'Otro resultado', delivered:'Entrega confirmada', needs_help:'Necesita ayuda', awaiting_confirmation:'Falta confirmar', care_completed:'Revisión realizada'} as const;
export type WorkOutcome=keyof typeof workOutcomes;

export const purposeOutcomes={commercial:["no_answer","interested","replied","not_interested","other"],reactivation:["no_answer","interested","replied","not_interested","other"],delivery:["delivered","awaiting_confirmation","needs_help","no_answer","other"],care:["care_completed","needs_help","awaiting_confirmation","no_answer","other"]} as const;

/** The single canonical list of contact outcomes (owner decision 3A). Additive: `workOutcomes`/`purposeOutcomes` stay until U-07 switches the server. */
export const contactOutcomes={no_answer:'No respondió',interested:'Respondió, le interesa',later:'Pidió que lo contacte más adelante',not_interested:'No le interesa',do_not_contact:'Pidió no ser contactado',other:'Otro (contame)'} as const;
export type ContactOutcome=keyof typeof contactOutcomes;
/** Labels for outcomes outside the canonical 6: purpose-specific outcomes still offered on delivery/care tasks, plus the old `replied` (display only; history is never rewritten). */
export const purposeOutcomeLabels={replied:'Respondió',delivered:'Entrega confirmada',awaiting_confirmation:'Falta confirmar',needs_help:'Necesita ayuda',care_completed:'Revisión realizada'} as const;
export type PurposeOutcome=keyof typeof purposeOutcomeLabels;
const purposeExtras={commercial:[],reactivation:[],delivery:['delivered','awaiting_confirmation','needs_help'],care:['care_completed','needs_help','awaiting_confirmation']} as const satisfies Record<string,readonly PurposeOutcome[]>;
/** Outcomes to offer for a task purpose: that purpose's specific extras first (e.g. "Entrega confirmada" on delivery), then the 6 canonical ones (Q1 default). Unknown or empty purpose → the 6. */
export const outcomeOptions=(purpose?:string|null):readonly (ContactOutcome|PurposeOutcome)[]=>[...(purpose&&Object.hasOwn(purposeExtras,purpose)?purposeExtras[purpose as keyof typeof purposeExtras]:[]),...Object.keys(contactOutcomes) as ContactOutcome[]];
