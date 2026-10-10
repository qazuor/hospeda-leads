import {createHash} from 'node:crypto';
export const recoveryFields=['origin','source_reference','review_status','subscription_label','deleted_at','deleted_by_email','deletion_reason'];
export const recoveryDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateRecoveryManifest(manifest){
 if(manifest?.formatVersion!==1||!/^[a-f0-9]{64}$/.test(manifest.backupSha256??'')||!Array.isArray(manifest.accounts)||!manifest.accounts.length||manifest.accounts.length>10000)throw new Error('Manifiesto inválido.');
 const ids=new Set();
 for(const item of manifest.accounts){
  if(!/^[1-9]\d*$/.test(item.accountId)||!/^[1-9]\d*$/.test(item.sourceLeadId)||ids.has(item.accountId))throw new Error('Identidad histórica inválida o repetida.');ids.add(item.accountId);
  const keys=Object.keys(item.values??{});
  if(!keys.length||keys.some(k=>!recoveryFields.includes(k)))throw new Error('Campos de recuperación no autorizados.');
  for(const value of Object.values(item.values))if(typeof value!=='string'||!value.trim()||value.length>20000)throw new Error('Valor histórico inválido.');
  if(item.values.review_status&&item.values.review_status!=='filtered')throw new Error('Estado de revisión inválido.');
  if(item.values.deleted_at&&(Number.isNaN(Date.parse(item.values.deleted_at))||!item.values.deleted_by_email||!item.values.deletion_reason))throw new Error('Eliminación histórica incompleta.');
  if(!item.values.deleted_at&&(item.values.deleted_by_email||item.values.deletion_reason))throw new Error('Autor de eliminación sin fecha.');
 }
 return manifest;
}
export function planBusinessRecovery(manifest,current,activity){
 validateRecoveryManifest(manifest);
 const rows=new Map(current.map(a=>[String(a.id),a]));const changes=[],conflicts=[];
 for(const item of manifest.accounts){
  const account=rows.get(item.accountId);
  if(!account||String(account.source_lead_id)!==item.sourceLeadId||account.merged_into_id){conflicts.push({accountId:item.accountId,reason:'Identidad cambiada, negocio ausente o fusionado.'});continue;}
  const fields={};
  for(const [key,wanted]of Object.entries(item.values)){
   const old=account[key];
   const equal=key==='deleted_at'&&old?new Date(old).toISOString()===new Date(wanted).toISOString():old===wanted;
   if(equal)continue;
   if(old!=null&&String(old).trim()!==''){conflicts.push({accountId:item.accountId,field:key,reason:'El campo ya tiene otro valor; requiere revisión.'});continue;}
   fields[key]=wanted;
  }
  const protectedState=('deleted_at' in fields)||('review_status' in fields);
  if(protectedState&&activity[item.accountId]?.length){conflicts.push({accountId:item.accountId,reason:'Hay contactos, gestiones, tareas, actividades, mensajes o documentos activos; revisar antes de recuperar un estado.'});continue;}
  if(Object.keys(fields).length)changes.push({accountId:item.accountId,before:account,fields});
 }
 return {backupSha256:manifest.backupSha256,manifestSha256:recoveryDigest(manifest),currentStateSha256:recoveryDigest({current,activity}),changes,conflicts,counts:Object.fromEntries(recoveryFields.map(key=>[key,changes.filter(c=>key in c.fields).length]))};
}
