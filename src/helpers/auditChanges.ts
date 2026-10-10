const labels:Record<string,string>={nombre:'Nombre',ciudad:'Ciudad',tipo:'Vertical',subtipo:'Subtipo',assignedUserEmail:'Responsable',commercialStatus:'Condición comercial',clientSince:'Cliente desde',archivedAt:'Archivado',deletedAt:'Eliminado',deletionReason:'Motivo',reason:'Motivo',title:'Título',name:'Nombre',phone:'Teléfono',telefono:'Teléfono',email:'Email',whatsapp:'WhatsApp',position:'Cargo',preferredChannel:'Canal preferido',isPrimary:'Contacto principal',businessNotes:'Notas del negocio',discoverySource:'Fuente de descubrimiento',verificationUrls:'URLs de verificación',verifiedOn:'Verificado el',status:'Estado',result:'Resultado',outcome:'Respuesta',dueDate:'Fecha prevista',dueAt:'Horario previsto',notes:'Notas',description:'Descripción',body:'Contenido',subject:'Asunto',recipient:'Destinatario',channel:'Canal',fileName:'Archivo',reviewStatus:'Revisión',subscriptionLabel:'Suscripción histórica',origin:'Origen',sourceReference:'Fuente de referencia'};
const ignored=new Set(['id','accountId','originalAccountId','leadId','documentId','sourceLeadId','createdAt','updatedAt','revision','pipelineRevision','fileData','htmlBody','textBody','templateSnapshot','entity','entityId','paymentVerified']);
const camel=(key:string)=>key.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase());
const record=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const value=(x:unknown)=>x==null||x===''?'Vacío':typeof x==='boolean'?x?'Sí':'No':typeof x==='object'?JSON.stringify(x):String(x);
export function auditChanges(metadata:unknown):string[]{
 const m=record(metadata),before=record(m.before),after=record(m.after);
 const keys=[...new Set([...Object.keys(before),...Object.keys(after)])];
 const changes=keys.filter(key=>!ignored.has(camel(key))&&JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>`${labels[camel(key)]||camel(key)}: ${value(before[key])} → ${value(after[key])}`);
 if(!changes.length&&m.reason)changes.push('Motivo: '+value(m.reason));
 return changes;
}
