import assert from 'node:assert/strict';
import {renderMessageTemplate,renderMessageTemplateHtml} from '../src/helpers/renderMessageTemplate.tsx';
import {baseline,catalog,resolveVertical} from './message-models/catalog.mjs';
import {planReview,readReview,applyReview} from './message-models/review.mjs';
const original=baseline.map(m=>({...m,active:true}));
const active=['Alojamientos','Gastronomía','Experiencias','Partners','Proveedores de servicios','Editor'];
const desired=catalog(active);
assert.equal(desired.length,36);
assert.equal(new Set(desired.map(m=>m.name)).size,36);
assert.equal(desired.filter(m=>m.channel==='whatsapp'&&m.commercial_profile==='Referente').length,6);
assert.throws(()=>resolveVertical('Alojamiento',['Alojamiento','Alojamientos']),/única/);
assert.throws(()=>resolveVertical('Alojamiento',[]),/única/);
const plan=planReview(original,active);
assert.equal(plan.changes.filter(c=>c.kind==='update').length,30);
assert.equal(plan.changes.filter(c=>c.kind==='insert').length,6);
assert.equal(plan.changes.filter(c=>c.kind==='deactivate').length,1);
const changed=structuredClone(original);changed[0].body+=' Cambio humano';
assert.throws(()=>planReview(changed,active),/cambió/);
assert.throws(()=>planReview(original.slice(1),active),/Falta/);
const collision=[...original,{...desired[0],id:'999',active:true}];
assert.throws(()=>planReview(collision,active),/duplicado/);
const insertedConflict=[...original,{...desired.find(m=>!m.id),id:'999',body:'Otro texto',active:true}];
assert.throws(()=>planReview(insertedConflict,active),/Conflicto/);
// Final state is idempotent; unrelated models survive.
const unrelated={id:'999',name:'Otro modelo',channel:'email',subject:null,body:'Conservar',vertical:null,commercial_profile:null,active:true};
const final=[...desired.map((m,i)=>({...m,id:m.id??String(100+i),active:true})),{...original.find(m=>m.id==='1'),active:false},unrelated];
assert.equal(planReview(final,active).changes.length,0);
assert.ok(desired.every(m=>!/(Conocimos|trayectoria|posicionamiento|Estamos desarrollando)/.test(m.body)));
for(const m of desired){
 for(const context of [{name:'Negocio',sender:'Nombre completo',sender_short:'Nombre visible'}, {name:'<Negocio>',sender:'Nombre completo',sender_short:'Nombre visible',contact:'Ana & Luis',city:'Colón'}]){
  const text=renderMessageTemplate(m.body,context);
  assert.ok(!text.includes('{{'));
  assert.ok(text.includes(m.channel==='whatsapp'&&m.commercial_profile==='Independiente'?'Nombre visible':'Nombre completo'));
  if(m.channel==='email'){
   const html=renderMessageTemplateHtml(m.body,context);assert.ok(!html.includes('{{'));
   if(context.contact)assert.ok(html.includes('Ana &amp; Luis')&&html.includes('&lt;Negocio&gt;'));
  }
 }
}
console.log('Message model plan: scopes, conflicts and idempotency passed');
if(process.env.CRM_TEST_DATABASE!=='1')process.exit(0);
const {default:postgres}=await import('postgres');
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
const rollback=new Error('verified rollback');let schema;
try{
 await sql.begin(async tx=>{
  schema='model_review_'+Date.now();
  await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
  await tx.unsafe(`CREATE TABLE crm_verticals(name text PRIMARY KEY,active boolean NOT NULL DEFAULT true);
   CREATE TABLE message_templates(id bigserial PRIMARY KEY,name text NOT NULL,channel text NOT NULL,vertical text,commercial_profile text,subject text,body text NOT NULL,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(channel,name));
   CREATE TABLE crm_test_live_version(n int NOT NULL); INSERT INTO crm_test_live_version VALUES(0);
   CREATE FUNCTION bump_test_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE crm_test_live_version SET n=n+1; RETURN NULL; END $$;
   CREATE TRIGGER bump AFTER INSERT OR UPDATE OR DELETE ON message_templates FOR EACH STATEMENT EXECUTE FUNCTION bump_test_version();`);
  for(const name of active)await tx`INSERT INTO crm_verticals(name) VALUES(${name})`;
  for(const m of baseline)await tx`INSERT INTO message_templates ${tx(m,'id','name','channel','vertical','commercial_profile','subject','body')}`;
  await tx.unsafe("SELECT setval(pg_get_serial_sequence('message_templates','id'),31,true)");
  await tx`INSERT INTO message_templates ${tx(unrelated,'id','name','channel','vertical','commercial_profile','subject','body','active')}`;
  const before=await readReview(tx);
  assert.equal(before.plan.changes.length,37);
  const sentinel=(await tx`SELECT * FROM message_templates WHERE id=999`)[0];
  const result=await applyReview(tx,before.plan);
  assert.equal(result.filter(r=>r.active).length,37); // catalog + unrelated
  assert.equal(result.find(r=>r.id==='1').active,false);
  assert.equal(result.filter(r=>r.commercial_profile==='Referente'&&r.channel==='whatsapp').length,6);
  assert.deepEqual((await tx`SELECT * FROM message_templates WHERE id=999`)[0],sentinel);
  const version=(await tx`SELECT n FROM crm_test_live_version`)[0].n;
  await applyReview(tx,(await readReview(tx)).plan);
  assert.equal((await tx`SELECT n FROM crm_test_live_version`)[0].n,version);
  // Guard failures cause no writes.
  await tx`UPDATE message_templates SET body='Edición humana' WHERE id=3`;
  const guarded=await tx`SELECT * FROM message_templates ORDER BY id`;
  await assert.rejects(()=>readReview(tx),/cambió/);
  assert.deepEqual(await tx`SELECT * FROM message_templates ORDER BY id`,guarded);
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}
try{
 assert.equal((await sql`SELECT count(*)::int n FROM pg_namespace WHERE nspname=${schema}`)[0].n,0);
 console.log('Message model PostgreSQL update, preservation, triggers and rollback passed');
}finally{await sql.end();}
