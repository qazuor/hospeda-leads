export const managementTypes=['main','partner','provider','editor','accompaniment'] as const;
export type ManagementType=typeof managementTypes[number];
export const managementTypeLabels:Record<ManagementType,string>={main:'Verticales principales',partner:'Partners',provider:'Proveedores',editor:'Editores',accompaniment:'Acompañamiento de ficha'};
export type ManagementOutcome='won'|'lost'|'participates'|'not_participating'|'collaborates'|'not_collaborating'|'proposal_won'|'proposal_lost'|'completed'|'not_completed';
export type ManagementStageDefinition={key:string;label:string;order:number;classification:'open'|'won'|'lost';outcome:ManagementOutcome|null};

const stages:Record<ManagementType,ManagementStageDefinition[]>={
 main:[
  {key:'main:contact',label:'Por contactar',order:10,classification:'open',outcome:null},
  {key:'main:contacted',label:'Contactado',order:20,classification:'open',outcome:null},
  {key:'main:interested',label:'Interesado',order:30,classification:'open',outcome:null},
  {key:'main:evaluating_plan',label:'Evaluando un plan',order:40,classification:'open',outcome:null},
  {key:'main:won',label:'Cerrada ganada',order:90,classification:'won',outcome:'won'},
  {key:'main:lost',label:'Cerrada perdida',order:100,classification:'lost',outcome:'lost'},
  {key:'main:leandro',label:'Derivada a Leandro',order:110,classification:'open',outcome:null}
 ],
 partner:[
  {key:'partner:contact',label:'Por contactar',order:10,classification:'open',outcome:null},
  {key:'partner:contacted',label:'Contactado',order:20,classification:'open',outcome:null},
  {key:'partner:conversation',label:'En conversación',order:30,classification:'open',outcome:null},
  {key:'partner:interest',label:'Interés confirmado',order:40,classification:'open',outcome:null},
  {key:'partner:proposal_preparing',label:'Propuesta en preparación',order:50,classification:'open',outcome:null},
  {key:'partner:proposal_sent',label:'Propuesta enviada',order:60,classification:'open',outcome:null},
  {key:'partner:negotiation',label:'En negociación',order:70,classification:'open',outcome:null},
  {key:'partner:won',label:'Cerrada ganada',order:90,classification:'won',outcome:'won'},
  {key:'partner:lost',label:'Cerrada perdida',order:100,classification:'lost',outcome:'lost'},
  {key:'partner:leandro',label:'Derivada a Leandro',order:110,classification:'open',outcome:null}
 ],
 provider:[
  {key:'provider:contact',label:'Por contactar',order:10,classification:'open',outcome:null},
  {key:'provider:contacted',label:'Contactado',order:20,classification:'open',outcome:null},
  {key:'provider:information_sent',label:'Información enviada',order:30,classification:'open',outcome:null},
  {key:'provider:interested',label:'Interesado en participar',order:40,classification:'open',outcome:null},
  {key:'provider:coordinating',label:'Participación coordinándose',order:50,classification:'open',outcome:null},
  {key:'provider:participates',label:'Participa',order:90,classification:'won',outcome:'participates'},
  {key:'provider:not_participating',label:'No participa',order:100,classification:'lost',outcome:'not_participating'},
  {key:'provider:leandro',label:'Derivada a Leandro',order:110,classification:'open',outcome:null}
 ],
 editor:[
  {key:'editor:contact',label:'Por contactar',order:10,classification:'open',outcome:null},
  {key:'editor:contacted',label:'Contactado',order:20,classification:'open',outcome:null},
  {key:'editor:information_sent',label:'Información enviada',order:30,classification:'open',outcome:null},
  {key:'editor:interested',label:'Interesado en colaborar',order:40,classification:'open',outcome:null},
  {key:'editor:coordinating',label:'Colaboración coordinándose',order:50,classification:'open',outcome:null},
  {key:'editor:collaborates',label:'Colabora',order:90,classification:'won',outcome:'collaborates'},
  {key:'editor:not_collaborating',label:'No colabora',order:100,classification:'lost',outcome:'not_collaborating'},
  {key:'editor:proposal_preparing',label:'Propuesta comercial en preparación',order:110,classification:'open',outcome:null},
  {key:'editor:proposal_sent',label:'Propuesta comercial enviada',order:120,classification:'open',outcome:null},
  {key:'editor:negotiation',label:'En negociación',order:130,classification:'open',outcome:null},
  {key:'editor:proposal_won',label:'Cerrada ganada',order:140,classification:'won',outcome:'proposal_won'},
  {key:'editor:proposal_lost',label:'Cerrada perdida',order:150,classification:'lost',outcome:'proposal_lost'},
  {key:'editor:leandro',label:'Derivada a Leandro',order:160,classification:'open',outcome:null}
 ],
 accompaniment:[
  {key:'accompaniment:pending',label:'Pendiente de iniciar',order:10,classification:'open',outcome:null},
  {key:'accompaniment:contacted',label:'Contactado',order:20,classification:'open',outcome:null},
  {key:'accompaniment:working',label:'Trabajando en la ficha',order:30,classification:'open',outcome:null},
  {key:'accompaniment:completed',label:'Cerrada completada',order:90,classification:'won',outcome:'completed'},
  {key:'accompaniment:not_completed',label:'Cerrada no completada',order:100,classification:'lost',outcome:'not_completed'},
  {key:'accompaniment:leandro',label:'Derivada a Leandro',order:110,classification:'open',outcome:null}
 ]
};

export const managementStageCatalog=(type:ManagementType)=>stages[type];
export const managementStageByKey=(key:string)=>Object.values(stages).flat().find(stage=>stage.key===key);
export const managementLabel=(type:string|null|undefined,key:string|null|undefined)=>{
 if(!type||!key)return key||'Sin etapa';
 return managementStageByKey(key)?.label??key;
};

export type ManagementReasonDefinition={key:string;label:string;doNotContact?:boolean;requiresNote?:boolean};
const reasons:Record<string,ManagementReasonDefinition[]>={
 'main:won':[{key:'accepted',label:'Aceptó sumarse'},{key:'existing_profile',label:'Ya tenía ficha y aceptó el plan'},{key:'other',label:'Otro',requiresNote:true}],
 'main:lost':[{key:'not_interested',label:'No le interesa'},{key:'no_response',label:'No respondió'},{key:'other_alternative',label:'Eligió otra alternativa'},{key:'not_now',label:'No puede participar ahora'},{key:'do_not_contact',label:'Pidió no ser contactado',doNotContact:true},{key:'other',label:'Otro',requiresNote:true}],
 'partner:won':[{key:'accepted_proposal',label:'Aceptó la propuesta'},{key:'accepted_plan',label:'Aceptó un plan preestablecido'},{key:'other',label:'Otro',requiresNote:true}],
 'partner:lost':[{key:'not_interested',label:'No le interesa'},{key:'no_response',label:'No respondió'},{key:'budget',label:'Presupuesto insuficiente'},{key:'conditions',label:'Condiciones no acordadas'},{key:'do_not_contact',label:'Pidió no ser contactado',doNotContact:true},{key:'other',label:'Otro',requiresNote:true}],
 'provider:participates':[{key:'accepted',label:'Aceptó participar'},{key:'other',label:'Otro',requiresNote:true}],
 'provider:not_participating':[{key:'not_interested',label:'No le interesa'},{key:'no_response',label:'No respondió'},{key:'no_service',label:'No ofrece el servicio requerido'},{key:'not_now',label:'No puede participar ahora'},{key:'do_not_contact',label:'Pidió no ser contactado',doNotContact:true},{key:'other',label:'Otro',requiresNote:true}],
 'editor:collaborates':[{key:'accepted',label:'Aceptó colaborar'},{key:'other',label:'Otro',requiresNote:true}],
 'editor:not_collaborating':[{key:'not_interested',label:'No le interesa'},{key:'no_response',label:'No respondió'},{key:'not_now',label:'No puede colaborar ahora'},{key:'do_not_contact',label:'Pidió no ser contactado',doNotContact:true},{key:'other',label:'Otro',requiresNote:true}],
 'editor:proposal_won':[{key:'accepted',label:'Aceptó la propuesta'},{key:'other',label:'Otro',requiresNote:true}],
 'editor:proposal_lost':[{key:'not_interested',label:'No le interesa'},{key:'no_response',label:'No respondió'},{key:'conditions',label:'Condiciones no acordadas'},{key:'do_not_contact',label:'Pidió no ser contactado',doNotContact:true},{key:'other',label:'Otro',requiresNote:true}],
 'accompaniment:not_completed':[{key:'no_response',label:'El comercio no respondió'},{key:'missing_information',label:'No envió la información'},{key:'stopped',label:'Decidió no continuar'},{key:'do_not_contact',label:'Pidió no ser contactado',doNotContact:true},{key:'other',label:'Otro',requiresNote:true}]
};
export const managementReasonCatalog=(type:ManagementType,outcome:ManagementOutcome)=>reasons[`${type}:${outcome}`]??[];
