/** Preselect an explicitly supplied destination or the sole available person. */
export function initialCommunicationRecipient(ids:string[],requestedId?:string|null,allowSingleAutomatic=true):string{
 if(requestedId&&ids.includes(String(requestedId)))return String(requestedId);
 return allowSingleAutomatic&&ids.length===1?String(ids[0]):'';
}

/** Minimal person shape used to decide who can receive a WhatsApp or an email. */
export type RecipientCandidate={id:string|number;phone?:string|null;email?:string|null};

/** People with usable data for the channel (a phone for WhatsApp, an email for email), in the given order. */
export function reachableRecipientIds(contacts:readonly RecipientCandidate[],channel:'email'|'whatsapp'):string[]{
 return contacts.filter(c=>String((channel==='email'?c.email:c.phone)??'').trim()).map(c=>String(c.id));
}

/**
 * Initial destination for a WhatsApp or email (report item 1.4).
 * An explicit request is respected: `''` is the business general channel, an existing person is kept even without data
 * for the channel (the dialog then offers to add it). Without a request (`undefined`/`null`, or a person no longer listed),
 * only people with data for the channel count: the only one is preselected and several require a choice. The general
 * channel applies only when no person has the data, or for a legacy contact copied from the business while the business still has it.
 */
export function channelRecipientChoice({contacts,channel,requestedId,legacy=false,generalValue}:{contacts:readonly RecipientCandidate[];channel:'email'|'whatsapp';requestedId?:string|null;legacy?:boolean;generalValue?:string|null}):{recipientId:string;mustChoose:boolean}{
 if(requestedId==='')return {recipientId:'',mustChoose:false};
 if(requestedId!=null&&contacts.some(c=>String(c.id)===String(requestedId)))return {recipientId:String(requestedId),mustChoose:false};
 const reachable=reachableRecipientIds(contacts,channel);
 if(reachable.length>1)return {recipientId:'',mustChoose:true};
 const keepGeneral=legacy&&!!generalValue?.trim();
 return {recipientId:reachable.length===1&&!keepGeneral?reachable[0]:'',mustChoose:false};
}

/** Context needed to know whether a WhatsApp may still be confirmed as sent. */
export type ConfirmSendContext={
 /** `undefined`/`null` while the business is still loading: confirming stays blocked. */
 account:{doNotContact?:boolean|null;archivedAt?:unknown;deletedAt?:unknown;status?:string|null}|null|undefined;
 message:{channel:string;leadId:string|number|null;contactId:string|number|null};
 restrictions:readonly {channel:string;contactId?:string|number|null;leadId?:string|number|null;liftedAt?:unknown}[];
 /** Open managements of the business; `undefined` when unknown. */
 openManagementIds?:readonly (string|number)[];
};
/**
 * Why "Sí, se envió" cannot be recorded, mirroring the server check (report item 1.17): business still loading or in the trash, No contactar, archived business,
 * closed management, or an active restriction for the channel on the person, the management or the whole business. Empty when allowed.
 */
export function confirmSendBlockReason({account,message,restrictions,openManagementIds}:ConfirmSendContext):string{
 if(!account)return 'Cargando los datos del negocio…';
 if(account.deletedAt)return 'El negocio está en la papelera.';
 if(account.doNotContact)return 'El negocio está marcado No contactar; un administrador debe levantar ese bloqueo antes de confirmar un envío.';
 if(account.archivedAt||account.status==='archived')return 'El negocio está archivado; un administrador debe desarchivarlo antes de confirmar un envío.';
 if(message.leadId!=null&&openManagementIds&&!openManagementIds.some(id=>String(id)===String(message.leadId)))return 'La gestión está cerrada: solo admite registrar respuestas recibidas.';
 const same=(a:unknown,b:unknown)=>String(a??'')===String(b??'');
 const restricted=restrictions.some(r=>!r.liftedAt&&(r.channel==='all'||r.channel===message.channel)&&((r.contactId!=null&&message.contactId!=null&&same(r.contactId,message.contactId))||(r.contactId==null&&(r.leadId==null||same(r.leadId,message.leadId)))));
 return restricted?'Hay una restricción de contacto activa para este canal; un administrador debe levantarla antes de confirmar un envío.':'';
}
