import {isDeepStrictEqual} from 'node:util';
import {baseline,catalog} from './catalog.mjs';
const fields=['id','name','channel','vertical','commercial_profile','subject','body'];
const project=row=>Object.fromEntries(fields.map(f=>[f,row[f]]));
export function planReview(rows,active){
 const desired=catalog(active),changes=[];
 for(const old of baseline){
  const current=rows.find(r=>String(r.id)===old.id);
  const target=desired.find(r=>r.id===old.id);
  const expected=target??old;
  if(!current)throw new Error(`Falta el modelo ${old.id}; no se aplicó ningún cambio.`);
  const original=isDeepStrictEqual(project(current),old)&&current.active===true;
  const already=isDeepStrictEqual(project(current),project(expected))&&current.active===!!target;
  if(!original&&!already)throw new Error(`El modelo ${old.id} cambió desde la exportación; revisar antes de continuar.`);
  if(!already)changes.push(target?{kind:'update',model:target}:{kind:'deactivate',id:old.id});
 }
 for(const target of desired.filter(m=>m.id===null)){
  const existing=rows.filter(r=>r.channel===target.channel&&r.name===target.name);
  if(existing.length){
   const {id,...expected}=target;
   const {id:existingId,...actual}=project(existing[0]);
   if(existing.length!==1||!existing[0].active||!isDeepStrictEqual(actual,expected))throw new Error(`Conflicto con ${target.name}.`);
  }else changes.push({kind:'insert',model:target});
 }
 // The approved historical IDs must not collide with unrelated names after renaming.
 for(const target of desired.filter(m=>m.id!==null)){
  if(rows.some(r=>String(r.id)!==target.id&&r.channel===target.channel&&r.name===target.name))throw new Error(`Nombre duplicado: ${target.name}.`);
 }
 return {changes,desired,verticals:[...new Set(desired.map(m=>m.vertical))]};
}
export async function readReview(tx){
 const rows=await tx`SELECT id::text,name,channel,vertical,commercial_profile,subject,body,active,created_at,updated_at FROM message_templates ORDER BY id`;
 const active=(await tx`SELECT name FROM crm_verticals WHERE active ORDER BY name`).map(r=>r.name);
 return {rows,active,plan:planReview(rows,active)};
}
export async function applyReview(tx,plan){
 for(const c of plan.changes){
  if(c.kind==='deactivate')await tx`UPDATE message_templates SET active=false,updated_at=now() WHERE id=${c.id}`;
  else if(c.kind==='update'){
   const m=c.model;
   await tx`UPDATE message_templates SET name=${m.name},subject=${m.subject},body=${m.body},vertical=${m.vertical},updated_at=now() WHERE id=${m.id}`;
  }else{
   const {id,...m}=c.model;
   await tx`INSERT INTO message_templates ${tx(m,'channel','name','subject','body','vertical','commercial_profile')}`;
  }
 }
 const checked=await readReview(tx);
 if(checked.plan.changes.length)throw new Error('La verificación final no coincide con el catálogo.');
 return checked.rows;
}
