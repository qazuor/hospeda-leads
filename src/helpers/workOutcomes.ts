export const workOutcomes = {no_answer:'No respondió', interested:'Mostró interés', replied:'Respondió', not_interested:'No quiere avanzar', do_not_contact:'Pidió no ser contactado', other:'Otro resultado'} as const;
export type WorkOutcome=keyof typeof workOutcomes;
