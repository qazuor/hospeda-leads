import {createHash} from 'node:crypto';

const identifier=value=>'"'+value.replaceAll('"','""')+'"';
const deletionActions={a:'no action',r:'restrict',c:'cascade',n:'set null',d:'set default'};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// query runs inside a repeatable-read, read-only transaction. This module has
// no mutation or cleanup mode. Its output omits names, recipients and contents.
export async function auditManagementCleanup(query){
  const [transaction]=await query("SELECT current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation, now() AS captured_at");
  if(transaction.read_only!=='on'||transaction.isolation!=='repeatable read')throw new Error('La auditoría requiere una transacción REPEATABLE READ READ ONLY.');
  const leads=await query('SELECT * FROM public.leads ORDER BY id');
  const accounts=await query('SELECT * FROM public.crm_accounts ORDER BY id');
  const contacts=await query('SELECT id,account_id,source_lead_id FROM public.crm_contacts ORDER BY id');
  const results=new Map(leads.map(l=>[String(l.id),{leadId:String(l.id),accountId:String(l.account_id),deleted:!!l.deleted_at,blockers:[],review:[],references:{}}]));
  const foreignKeys=await query(`
    SELECT n.nspname AS schema_name, t.relname AS table_name, c.conname AS constraint_name,
      c.confdeltype AS delete_action, pg_get_constraintdef(c.oid) AS definition,
      array_agg(a.attname ORDER BY k.ordinality) AS columns,
      array_agg(b.attname ORDER BY k.ordinality) AS target_columns
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(source_num,target_num,ordinality)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.source_num
    JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=k.target_num
    WHERE c.contype='f' AND c.confrelid='public.leads'::regclass
    GROUP BY n.nspname,t.relname,c.oid,c.conname,c.confdeltype ORDER BY n.nspname,t.relname,c.conname
  `);
  const inspected=new Set();
  for(const fk of foreignKeys){
    const column=fk.columns[fk.target_columns.indexOf('id')];
    if(!column)throw new Error('FK a gestiones sin referencia a id: '+fk.constraint_name);
    const key=`${fk.schema_name}.${fk.table_name}.${column}`;
    fk.delete_action=deletionActions[fk.delete_action]??fk.delete_action;
    if(inspected.has(key))continue;
    inspected.add(key);
    const rows=await query(`SELECT ${identifier(column)}::text AS lead_id,count(*)::int AS count FROM ${identifier(fk.schema_name)}.${identifier(fk.table_name)} WHERE ${identifier(column)} IS NOT NULL GROUP BY ${identifier(column)}`);
    for(const row of rows){const entry=results.get(String(row.lead_id));if(entry){entry.references[key]=row.count;entry.blockers.push(`${key}: ${row.count}`);}}
  }
  // Source IDs and lead_journal deliberately have no FK in the legacy schema.
  for(const l of leads){
    const entry=results.get(String(l.id));
    for(const field of ['opportunity_name','service_interest','estimated_close_date','suscripcion','fecha_ultimo_contacto','resultado_ultimo_contacto','fecha_proxima_accion','notas','archivo_adjunto','closing_checklist','reactivated_from_id']){
      const value=l[field];
      if(value!=null&&String(value).trim()!==''&&JSON.stringify(value)!=='{}')entry.blockers.push('Dato comercial: '+field);
    }
    if(l.primary_contact_id||l.contact_name?.trim())entry.review.push('Persona vinculada: conservar y revisar su contexto.');
    if(l.estado?.trim())entry.review.push('Etapa histórica: revisar significado; no se interpreta como vacío ni cierre.');
    const sourceAccounts=accounts.filter(a=>String(a.source_lead_id)===String(l.id));
    if(sourceAccounts.length)entry.review.push('Origen técnico del negocio: conservar source_lead_id como referencia histórica.');
    const sourceContacts=contacts.filter(c=>String(c.source_lead_id)===String(l.id));
    if(sourceContacts.length)entry.review.push('Origen técnico de persona: conservarla y revisar source_lead_id.');
  }
  const journals=await query('SELECT id,lead_id,account_id,action,field_name,metadata FROM public.lead_journal WHERE lead_id IS NOT NULL ORDER BY id');
  // This narrow allowlist identifies technical audit, never conversation history.
  const technicalFields=new Set(['nombre','ciudad','telefono','email','sitioWeb','urlGmap','perfilInstagram','perfilFacebook','perfilAirbnb','perfilBooking','perfilTurismoEntreRios','assignedUserEmail','asignadoA','tipo','subtipo','origen','quienCargo','creadoPor','fechaCreacion']);
  for(const j of journals){
    const entry=results.get(String(j.lead_id));if(!entry)continue;
    entry.references['public.lead_journal']=(entry.references['public.lead_journal']??0)+1;
    const technical=(j.action==='created'&&!j.field_name&&(!j.metadata||Object.keys(j.metadata).length===0))||(['updated','inline_updated','bulk_updated'].includes(j.action)&&technicalFields.has(j.field_name)&&(!j.metadata||Object.keys(j.metadata).length===0));
    if(technical)entry.review.push(`Auditoría técnica #${j.id}: preservar su vínculo al negocio antes de cualquier limpieza.`);
    else entry.blockers.push(`Historial no comprobado como técnico: lead_journal #${j.id} (${j.action}).`);
    if(String(j.account_id)!==entry.accountId)entry.blockers.push(`Journal #${j.id} sin contexto de negocio coherente.`);
  }
  // Catalog-driven discovery also finds new relationships not known by this code.
  const unkeyedColumns=await query(`SELECT c.table_schema,c.table_name,c.column_name FROM information_schema.columns c JOIN pg_namespace n ON n.nspname=c.table_schema JOIN pg_class t ON t.relnamespace=n.oid AND t.relname=c.table_name WHERE t.relkind IN ('r','p') AND c.table_schema NOT IN ('pg_catalog','information_schema') AND c.column_name IN ('lead_id','related_lead_id','reactivated_from_id','source_lead_id') ORDER BY c.table_schema,c.table_name,c.column_name`);
  for(const col of unkeyedColumns){
    const key=`${col.table_schema}.${col.table_name}.${col.column_name}`;
    if(inspected.has(key)||['public.lead_journal.lead_id','public.crm_accounts.source_lead_id','public.crm_contacts.source_lead_id'].includes(key))continue;
    inspected.add(key);
    const rows=await query(`SELECT ${identifier(col.column_name)}::text AS lead_id,count(*)::int AS count FROM ${identifier(col.table_schema)}.${identifier(col.table_name)} WHERE ${identifier(col.column_name)} IS NOT NULL GROUP BY ${identifier(col.column_name)}`);
    for(const row of rows){const entry=results.get(String(row.lead_id));if(entry){entry.references[key]=row.count;entry.blockers.push(`Referencia sin FK conocida ${key}: ${row.count}`);}}
  }
  const jsonColumns=await query(`SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') AND data_type IN ('json','jsonb') ORDER BY table_schema,table_name,column_name`);
  for(const col of jsonColumns){
    const key=`${col.table_schema}.${col.table_name}.${col.column_name}`;
    const [count]=await query(`SELECT count(*)::int AS populated FROM ${identifier(col.table_schema)}.${identifier(col.table_name)} WHERE ${identifier(col.column_name)} IS NOT NULL`);
    col.populated=count.populated;
    const keys=['leadId','lead_id','relatedLeadId','related_lead_id','reactivatedFromId','reactivated_from_id'];
    const predicate=keys.map(k=>`v.value->>'${k}'=l.id::text`).join(' OR ');
    const rows=await query(`SELECT DISTINCT l.id::text AS lead_id FROM public.leads l JOIN ${identifier(col.table_schema)}.${identifier(col.table_name)} r ON EXISTS (SELECT 1 FROM jsonb_path_query(r.${identifier(col.column_name)}::jsonb,'strict $.** ? (@.type() == "object")') v(value) WHERE ${predicate})`);
    for(const row of rows)results.get(row.lead_id)?.blockers.push('Referencia JSON: '+key);

  }
  const jsonReferences=await query(`
    SELECT DISTINCT l.id::text AS lead_id,'crm_account_merges.snapshot' AS source FROM public.leads l JOIN public.crm_account_merges m ON EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(m.snapshot->'relations'->'leads','[]'::jsonb)) v WHERE v->>'id'=l.id::text)
    UNION SELECT DISTINCT l.id::text,'crm_import_batches.result' FROM public.leads l JOIN public.crm_import_batches b ON EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(b.result->'details','[]'::jsonb)) v WHERE v->>'entity'='opportunity' AND v->>'id'=l.id::text)
  `);
  for(const ref of jsonReferences)results.get(ref.lead_id)?.blockers.push('Referencia histórica JSON: '+ref.source);
  const triggers=await query(`SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(t.tgfoid) AS function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,c.relname,t.tgname`);
  const proposals=[...results.values()].map(r=>({...r,review:[...new Set(r.review)],status:r.blockers.length?'blocked':r.review.length?'review':'candidate'}));
  return {
    formatVersion:1,capturedAt:transaction.captured_at,readOnly:true,cleanupExecuted:false,
    manualReviewRequired:true,
    warning:'Este informe no autoriza eliminación. Revisar JSON, triggers y auditoría técnica; cualquier asociación comercial bloquea la limpieza.',
    counts:{businesses:accounts.length,assignedBusinesses:accounts.filter(a=>a.assigned_user_email).length,contacts:contacts.length,managements:leads.length,candidates:proposals.filter(r=>r.status==='candidate').length,review:proposals.filter(r=>r.status==='review').length,blocked:proposals.filter(r=>r.status==='blocked').length},
    preservation:{businessIds:accounts.map(a=>String(a.id)),businessDataSha256:digest(accounts),assignmentsSha256:digest(accounts.map(a=>({id:String(a.id),responsible:a.assigned_user_email})))},
    foreignKeys,unkeyedColumns,jsonColumns,triggers,proposals,
    snapshotSha256:digest({leads,accounts,contacts,journals,foreignKeys,triggers,proposals,jsonColumns}),
  };
}
