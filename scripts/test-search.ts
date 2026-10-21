import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import superjson from 'superjson';
import { db } from '../src/helpers/db';
import { setServerSession } from '../src/helpers/getSetServerSession';
import { normalizeSearchText } from '../src/helpers/searchText';
import { multiFieldSearchSql, normalizeSearchSql, searchSql } from '../src/helpers/searchSql';
import { handle as leads, managementSearchSql } from '../src/endpoints/leads_GET';
import { businessTableSource, businessSearchSql } from '../src/helpers/businessTable';
import { handle as trash } from '../src/endpoints/leads_trash_GET';
import { handle as journal } from '../src/endpoints/lead_journal_GET';
import { get as commercial } from '../src/endpoints/commercial';
import {get as search, managementPaletteSearchSql} from '../src/endpoints/search';
import {post as changeBusiness} from '../src/endpoints/commercial';
import {get as resources} from '../src/endpoints/resources';
import { get as work } from '../src/endpoints/work';

assert.equal(process.env.CRM_TEST_DATABASE, '1', 'Use a disposable database');
const marker = 'search-' + randomUUID().replace(/[0-9]/g, (digit) => 'abcdefghij'[Number(digit)]);
async function session(role: 'user' | 'admin') {
  const user = await db.insertInto('users').values({ email: `${marker}-${role}@example.com`, displayName: 'Prueba búsqueda', role }).returningAll().executeTakeFirstOrThrow();
  const id = `${marker}-${role}`;
  await db.insertInto('sessions').values({ id, userId: user.id, expiresAt: new Date(Date.now() + 3600000) }).execute();
  const response = new Response();
  await setServerSession(response, { id, createdAt: Date.now(), lastAccessed: Date.now() });
  return { user, cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
try {
  const admin = await session('admin'), reader = await session('user');
  async function get(handler: (request: Request) => Promise<Response>, endpoint: string, params: Record<string, string> = {}, cookie = reader.cookie, status = 200) {
    const response = await handler(new Request(`http://localhost/_api/${endpoint}?${new URLSearchParams(params)}`, { headers: { cookie } }));
    const data = superjson.parse<any>(await response.text());
    assert.equal(response.status, status, data.error);
    return data;
  }
  // SQL and the command palette agree for composed/decomposed Latin text.
  const latin = Array.from({ length: 0x250 - 0x21 }, (_, i) => String.fromCodePoint(i + 0x21)).join('');
  for (const text of [latin, latin.normalize('NFD'), 'ÁÉÍÓÚÜ Ñ caña cana', "O'Hara %_\\"]) {
    const row = await db.selectNoFrom(normalizeSearchSql(sql<string>`${text}`).as('value')).executeTakeFirstOrThrow();
    assert.equal(row.value, normalizeSearchText(text));
  }
  const accounts = await db.insertInto('crmAccounts').values(Array.from({ length: 12 }, (_, i) => ({
    nombre: `${marker} Colón ${String(i).padStart(2, '0')}`, ciudad: i < 11 ? 'Concepción del Uruguay' : 'Paraná', assignedUserEmail: reader.user.email,
  }))).returningAll().execute();
  const account = accounts[0];
  const proposal = await db.insertInto('leads').values({ accountId: account.id, nombre: account.nombre, opportunityName: `${marker} Gastronomía`, contactName: `${marker} José`, ciudad: account.ciudad, estado: 'Cargado', assignedUserEmail: reader.user.email }).returningAll().executeTakeFirstOrThrow();
  await db.insertInto('leadNotes').values({ leadId: proposal.id, note: `${marker} reunión pingüino`, author: reader.user.email }).execute();
  const deleted = await db.insertInto('leads').values({ accountId: account.id, nombre: account.nombre, deletedAt: new Date() }).returningAll().executeTakeFirstOrThrow();
  await db.insertInto('leadNotes').values({ leadId: deleted.id, note: `${marker} únicamente borrada` }).execute();
  await db.insertInto('leadJournal').values({ leadId: proposal.id, leadName: account.nombre, actorName: `${marker} Lucía`, action: 'search_test', newValue: `${marker} evaluación` }).execute();

  for (const query of [`${marker} colon`, `${marker} COLÓN`, `${marker} Colo\u0301n`]) {
    const params = { entity: 'business', q: query, pageSize: '10', sortBy: 'nombre', sortDir: 'asc' };
    const first = await get(leads, 'leads', params), second = await get(leads, 'leads', { ...params, page: '2' });
    assert.equal(first.total, 12); assert.equal(first.rows.length, 10); assert.equal(second.rows.length, 2);
    assert.deepEqual([...first.rows, ...second.rows].map(r => r.nombre), accounts.map(a => a.nombre));
    assert.equal((await get(leads, 'leads', { ...params, ciudad: 'Concepción del Uruguay' })).total, 11, 'Exact city remains an AND filter');
    assert.equal((await get(leads, 'leads', { ...params, ciudad: 'Concepcion del Uruguay' })).total, 0, 'Catalog values remain exact');
    const groups = JSON.stringify([{ rules: [{ field: 'ciudad', operator: 'eq', value: 'Paraná' }, { field: 'id', operator: 'eq', value: String(proposal.id) }] }]);
    assert.equal((await get(leads, 'leads', { ...params, filterGroups: groups })).total, 2, 'OR group still combines with free search using AND');
  }
  for (const query of ['gastronomia', 'jose', 'reunion pinguino']) {
    for (const entity of ['business', 'opportunity']) {
      const result = await get(leads, 'leads', { entity, q: `${marker} ${query}` });
      assert.equal(result.total, 1, `${entity} searches management, contact and notes`);
    }
  }
  // Positive/negative filters must normalize both sides and preserve AND/OR and note existence.
  for(const entity of ['business','opportunity']) {
    const base={entity,q:marker};
    for(const [mode,expected] of [['contains',12],['not_contains',0],['equals',1],['not_equals',11]] as const) {
      const value=mode.includes('contains')?'COLON':`${marker} Colo\u0301n 00`;
      const result=await get(leads,'leads',{...base,textFilters:JSON.stringify([{field:'nombre',mode,value}])});
      assert.equal(result.total,entity==='business'?expected:(expected===0||mode==='not_equals'?0:1),`${entity} ${mode}`);
    }
    for(const [mode,expected] of [['contains',1],['not_contains',0],['equals',1],['not_equals',0]] as const) {
      const value=mode.includes('contains')?'REUNION PINGUINO':`${marker} reunion pinguino`;
      assert.equal((await get(leads,'leads',{entity,q:account.nombre,notesMode:mode,notesText:value})).total,expected);
    }
    const groups=[{rules:[{field:'nombre',operator:'eq',value:`${marker} colon 00`},{field:'nombre',operator:'eq',value:'imposible'}]},
      {rules:[{field:'notes',operator:'contains',value:'REUNION PINGUINO'}]}];
    assert.equal((await get(leads,'leads',{...base,filterGroups:JSON.stringify(groups)})).total,1);
    for(const operator of ['not_contains','neq'])assert.equal((await get(leads,'leads',{entity,q:account.nombre,filterGroups:JSON.stringify([{rules:[{field:'notes',operator,value:`${marker} reunion pinguino`}]}])})).total,0);
  }
  const resourceId=randomUUID();
  await sql`INSERT INTO crm_documents(id,title,type,owner_email,library,status) VALUES(${resourceId}::uuid,${marker+' Proposición pingüino'},'propuesta',${admin.user.email},true,'draft')`.execute(db);
  for(const search of [marker+' proposicion pinguino',marker+' PROPOSICIÓN PINGÜINO',marker+' Proposicio\u0301n pinguino']) {
    assert.equal((await get(resources,'resources',{search},admin.cookie)).documents[0].id,resourceId);
    assert.equal((await get(resources,'resources',{search},reader.cookie)).documents.length,0,'Draft search does not bypass visibility');
  }
  assert.equal((await get(leads, 'leads', { entity: 'business', q: `${marker} unicamente borrada` })).total, 0, 'Removed management notes do not expose a business');
  const plain = await db.insertInto('crmAccounts').values({ nombre: `${marker} cana`, assignedUserEmail: reader.user.email }).returningAll().executeTakeFirstOrThrow();
  const enye = await db.insertInto('crmAccounts').values({ nombre: `${marker} caña`, assignedUserEmail: reader.user.email }).returningAll().executeTakeFirstOrThrow();
  for (const [query, expected] of [['cana', plain.id], ['caña', enye.id], ['can\u0303a', enye.id]]) {
    const result = await get(leads, 'leads', { entity: 'business', q: `${marker} ${query}` });
    assert.deepEqual(result.rows.map((r: { accountId: string }) => r.accountId), [expected]);
  }
  // U-16: phone digits in any format, multi-word across name + city, ñ≠n kept.
  const phoneRows = await db.insertInto('crmAccounts').values([
    { nombre: `${marker} fono local`, telefono: '(0351) 555-1234', ciudad: 'Córdoba', assignedUserEmail: reader.user.email },
    { nombre: `${marker} fono quince`, telefono: '351 15 555 1234', ciudad: 'Córdoba', assignedUserEmail: reader.user.email },
    { nombre: `${marker} fono otro`, telefono: '011 4444-9876', ciudad: 'Rosario', assignedUserEmail: reader.user.email },
  ]).returningAll().execute();
  for (const query of ['3515551234', '+54 9 351 555-1234', '0351 15 555 1234', '351-5551234', '5551234']) {
    const result = await get(leads, 'leads', { entity: 'business', q: query });
    const names = result.rows.filter((r: { nombre: string }) => r.nombre.startsWith(marker)).map((r: { nombre: string }) => r.nombre).sort();
    assert.deepEqual(names, [`${marker} fono local`, `${marker} fono quince`], `phone search "${query}"`);
    const palette = await get(search, 'search', { q: query });
    assert(phoneRows.slice(0, 2).every(a => palette.results.some((r: { id: string }) => r.id === 'business:' + a.id)), `Ctrl+K phone search "${query}"`);
    assert(!palette.results.some((r: { id: string }) => r.id === 'business:' + phoneRows[2].id));
  }
  assert((await get(leads, 'leads', { entity: 'business', q: '4444' })).rows.some((r: { accountId: string }) => r.accountId === phoneRows[2].id), 'Short phone fragments still match as text');
  const noteLead = await db.insertInto('leads').values({ accountId: phoneRows[2].id, nombre: phoneRows[2].nombre, estado: 'Cargado', assignedUserEmail: reader.user.email }).returningAll().executeTakeFirstOrThrow();
  await db.insertInto('leadNotes').values({ leadId: noteLead.id, note: `${marker} llamar al 0299 15 444-7788 mañana`, author: reader.user.email }).execute();
  assert((await get(leads, 'leads', { entity: 'business', q: '2994447788' })).rows.some((r: { accountId: string }) => r.accountId === phoneRows[2].id), 'Phone written in a note is found by a phone query');
  assert.equal((await get(leads, 'leads', { entity: 'business', q: `${marker} 12` })).rows.filter((r: { nombre: string }) => r.nombre.includes('fono')).length, 2, 'Short digit fragments match as plain text only');
  assert.deepEqual((await get(leads, 'leads', { entity: 'business', q: `${marker} fono rosario` })).rows.map((r: { nombre: string }) => r.nombre), [`${marker} fono otro`], 'name + city across fields');
  assert((await get(search, 'search', { q: `${marker} fono rosario` })).results.some((r: { id: string }) => r.id === 'business:' + phoneRows[2].id), 'Ctrl+K name + city');
  assert.equal((await get(search, 'search', { q: `${marker} fono quince rosario` })).results.filter((r: { kind: string }) => r.kind === 'Negocios').length, 0, 'Every word must match somewhere');
  assert.deepEqual((await get(leads, 'leads', { entity: 'business', q: `${marker} caña concepcion` })).rows.length, 0, 'Words stay ANDed with ñ distinct from n');
  assert.deepEqual((await get(leads, 'leads', { entity: 'business', q: `${marker} cana` })).rows.map((r: { accountId: string }) => r.accountId), [plain.id]);
  assert.equal((await get(commercial, 'commercial', { q: `${marker} colon` })).total, 12);
  assert.equal((await get(work, 'work', { mode: 'lookup', q: `${marker} colon` })).accounts.length, 12);
  for (const query of ['lucia', 'evaluacion']) assert.equal((await get(journal, 'lead_journal', { leadId: proposal.id, q: `${marker} ${query}` })).total, 1);
  await get(journal, 'lead_journal', { q: marker }, reader.cookie, 403);
  await get(trash, 'leads_trash', { q: `${marker} colon` }, reader.cookie, 403);
  const trashed = await get(trash, 'leads_trash', { q: `${marker} colon` }, admin.cookie);
  assert.equal(trashed.total, 1);
  assert.equal(trashed.rows[0].id, deleted.id);
  const result=await get(search,'search',{q:marker+' gastronomia'});
  assert(result.results.some((r:any)=>r.kind==='Gestiones'&&r.url==='/sales/'+proposal.id));
  assert((await get(search,'search',{q:marker+' reunion pinguino'})).results.some((r:any)=>r.kind==='Notas'));
  assert.equal((await get(search,'search',{q:marker+' proposicion pinguino'})).results.length,0,'Library draft remains private');
  assert((await get(search,'search',{q:marker+' proposicion pinguino'},admin.cookie)).results.some((r:any)=>r.id==='file:'+resourceId));
  await get(search,'search',{q:'a'},reader.cookie,400);
  const unauthenticated=await search(new Request('http://localhost/_api/search?q=test'));
  assert.equal(unauthenticated.status,401);
  async function trashBusiness(accountIds:string[],deleted:boolean,cookie=reader.cookie,status=200){
    const r=await changeBusiness(new Request('http://localhost/_api/commercial',{method:'POST',headers:{cookie},body:superjson.stringify({action:'account_trash',accountIds,deleted,reason:'Registro de prueba mal cargado'})}));
    const data=superjson.parse<any>(await r.text());assert.equal(r.status,status,data.error);
  }
  const colleague=await db.insertInto('crmAccounts').values({nombre:marker+' protegido',assignedUserEmail:admin.user.email}).returningAll().executeTakeFirstOrThrow();
  await trashBusiness([String(account.id),String(colleague.id)],true,reader.cookie,403);
  assert.equal((await db.selectFrom('crmAccounts').select('deletedAt').where('id','=',account.id).executeTakeFirstOrThrow()).deletedAt,null,'Mixed authorization batch is atomic');
  await trashBusiness([String(account.id)],true);
  assert.equal((await get(commercial,'commercial',{q:account.nombre})).total,0);
  assert.equal((await get(leads,'leads',{entity:'opportunity',q:marker+' gastronomia'},admin.cookie)).total,0);
  assert.equal((await get(search,'search',{q:marker+' gastronomia'},admin.cookie)).results.length,0);
  await get(commercial,'commercial',{accountId:String(account.id)},admin.cookie,403);
  await get(commercial,'commercial',{deleted:'true'},reader.cookie,403);
  assert.equal((await get(commercial,'commercial',{deleted:'true',q:account.nombre},admin.cookie)).rows[0].id,account.id);
  assert.equal((await db.selectFrom('leads').select('deletedAt').where('id','=',proposal.id).executeTakeFirstOrThrow()).deletedAt,null,'Child opportunity state is preserved');
  await trashBusiness([String(account.id)],false,reader.cookie,403);
  await trashBusiness([String(account.id)],false,admin.cookie);
  assert.equal((await get(commercial,'commercial',{q:account.nombre})).total,1);
  assert((await get(search,'search',{q:marker+' gastronomia'})).results.some((r:any)=>r.id==='lead:'+proposal.id));
  await db.updateTable('crmAccounts').set({ archivedAt: new Date() }).where('id', '=', account.id).execute();
  assert.equal((await get(leads, 'leads', { entity: 'opportunity', q: `${marker} gastronomia` })).total, 0);
  assert.equal((await get(commercial, 'commercial', { q: `${marker} colon` })).total, 11);
  assert.equal((await get(work, 'work', { mode: 'lookup', q: `${marker} colon` })).accounts.length, 11);
  await get(commercial, 'commercial', { q: marker, archived: 'true' }, reader.cookie, 403);
  const archivedHit=(await get(search,'search',{q:account.nombre})).results.find((r:any)=>r.id==='business:'+account.id);
  assert(archivedHit,'Ctrl+K keeps the seller\'s own archived business'); assert.match(archivedHit.description,/Archivado/);
  assert.match((await get(search,'search',{q:account.nombre},admin.cookie)).results.find((r:any)=>r.id==='business:'+account.id)?.description??'',/Archivado/,'Admin finds any archived business with · Archivado');
  const archivedColleague=await db.insertInto('crmAccounts').values({nombre:marker+' archivado ajeno',assignedUserEmail:admin.user.email,archivedAt:new Date()}).returningAll().executeTakeFirstOrThrow();
  assert.equal((await get(search,'search',{q:archivedColleague.nombre})).results.some((r:any)=>r.id==='business:'+archivedColleague.id),false,'A seller never finds a colleague\'s archived business');
  assert.match((await get(search,'search',{q:archivedColleague.nombre},admin.cookie)).results.find((r:any)=>r.id==='business:'+archivedColleague.id)?.description??'',/Archivado/);
  assert.doesNotMatch((await get(search,'search',{q:accounts[1].nombre})).results.find((r:any)=>r.id==='business:'+accounts[1].id).description,/Archivado/);
  assert.equal((await get(commercial, 'commercial', { q: `${marker} colon`, archived: 'true' }, admin.cookie)).total, 1);
  await trashBusiness([String(account.id)],true,admin.cookie);
  assert.equal((await get(commercial,'commercial',{q:account.nombre,archived:'true'},admin.cookie)).total,0,'Deleted archived businesses only appear in Trash');
  assert.equal((await get(search,'search',{q:account.nombre})).results.some((r:any)=>r.id==='business:'+account.id),false,'Trashed businesses never appear in Ctrl+K');
  await trashBusiness([String(account.id)],false,admin.cookie);
  assert.equal((await get(commercial,'commercial',{q:account.nombre},admin.cookie)).total,0);
  assert.equal((await get(commercial,'commercial',{q:account.nombre,archived:'true'},admin.cookie)).total,1,'Restore preserves previous archive state');
  assert.equal((await db.selectFrom('leads').select('opportunityName').where('id', '=', proposal.id).executeTakeFirstOrThrow()).opportunityName, `${marker} Gastronomía`, 'Search never rewrites stored values');
  // Ctrl+K Gestiones and the business list match per-table id sets (idSetSearchSql). They must select exactly the rows of
  // the joined predicate they replaced (still the opportunity-list predicate), over every row, not only the first page.
  const eq = await db.insertInto('crmAccounts').values([
    { nombre: `${marker} origen cuenta`, origin: `${marker} Feria Ñandú`, assignedUserEmail: reader.user.email },
    { nombre: `${marker} orden contactos`, assignedUserEmail: reader.user.email },
    { nombre: `${marker} sin contactos`, assignedUserEmail: reader.user.email },
    { nombre: `${marker} con contactos`, telefono: '0343 15 466-1122', assignedUserEmail: reader.user.email },
  ]).returningAll().execute();
  // A business origin wins the coalesce over the management's origen; a management contact_name applies only without an active contact.
  await db.insertInto('leads').values([
    { accountId: eq[0].id, nombre: eq[0].nombre, origen: `${marker} referido Peña`, serviceInterest: `${marker} pauta anual`, estado: 'Cargado' },
    { accountId: eq[1].id, nombre: eq[1].nombre, origen: `${marker} referido Peña`, contactName: `${marker} Muñoz propio`, estado: 'Cargado' },
    { accountId: eq[2].id, nombre: eq[2].nombre, contactName: `${marker} Muñoz propio`, estado: 'Cargado' },
    { accountId: eq[3].id, nombre: eq[3].nombre, contactName: `${marker} Muñoz propio`, estado: 'Cargado' },
  ]).execute();
  // Saving a management contact_name creates the business's primary contact; remove those so each case below is explicit.
  await db.updateTable('crmContacts').set({ deletedAt: new Date() }).where('accountId', 'in', eq.map(a => a.id)).execute();
  // Only the primary active contact (is_primary first, then lowest id) supplies contact_name: not a secondary or a deleted one.
  await db.insertInto('crmContacts').values([
    { accountId: eq[1].id, name: `${marker} Primera Albañil` }, { accountId: eq[1].id, name: `${marker} Segunda Quiñones` },
    { accountId: eq[2].id, name: `${marker} Borrado Núñez`, isPrimary: true, deletedAt: new Date() },
    { accountId: eq[3].id, name: `${marker} Secundaria Zúñiga` }, { accountId: eq[3].id, name: `${marker} Titular Ibáñez`, isPrimary: true },
  ]).execute();
  const terms = [marker, `${marker} colon`, `${marker} COLÓN`, `${marker} Colo\u0301n`, 'colon', 'concepcion del', 'caña', 'cana', 'can\u0303a', 'gastronomia', 'jose',
    'reunion pinguino', `${marker} peña`, `${marker} pena`, 'feria ñandu', 'nandu', 'pauta anual', 'muñoz', 'munoz', 'ibañez', 'zuñiga', 'quiñones', 'albañil', 'nuñez',
    '3515551234', '+54 9 351 555-1234', '0351 15 555 1234', '5551234', '4444', '2994447788', '0343 466 1122', `${marker} 12`, '12', 'ñ', 'a', 'ña', '%', '_', '   ',
    'ribera', 'gomez', 'plan anual 12', 'a b c d e f'];
  const ids = (rows: { key: unknown }[]) => rows.map(row => String(row.key)).sort();
  let matchedTerms = 0;
  for (const term of terms) {
    for (const includeDeleted of [false, true]) {
      const business = (predicate: typeof managementSearchSql) => db.selectFrom(businessTableSource(includeDeleted).as('leads')).select(sql<string>`account_id || ':' || id`.as('key')).where(predicate(term)).execute();
      const [before, after] = [ids(await business(managementSearchSql)), ids(await business(businessSearchSql))];
      assert.deepEqual(after, before, `business list "${term}" (includeDeleted=${includeDeleted})`);
      if (before.length && !includeDeleted) matchedTerms++;
    }
    const palette = (predicate: typeof managementSearchSql) => sql<{ key: string }>`SELECT l.id AS key FROM leads l JOIN crm_accounts a ON a.id=l.account_id WHERE ${predicate(term)}`.execute(db);
    const before = ids((await palette(q => multiFieldSearchSql(['l.opportunity_name', 'l.service_interest', 'l.nombre', 'a.nombre', 'a.ciudad'], q))).rows);
    assert.deepEqual(ids((await palette(managementPaletteSearchSql)).rows), before, `Ctrl+K Gestiones "${term}"`);
  }
  assert(matchedTerms >= 25, `equivalence terms must hit rows (${matchedTerms})`);
  const businessMatch = async (term: string) => (await get(leads, 'leads', { entity: 'business', q: term, pageSize: '100' })).rows.map((r: { accountId: string }) => String(r.accountId)).sort();
  assert.deepEqual(await businessMatch(`${marker} muñoz`), [String(eq[2].id)], 'management contact_name only without an active contact');
  assert.deepEqual(await businessMatch(`${marker} peña`), [String(eq[1].id)], 'management origen only without a business origin');
  assert.deepEqual(await businessMatch(`${marker} ibañez`), [String(eq[3].id)]);
  assert.deepEqual(await businessMatch(`${marker} zuñiga`), [], 'secondary contacts are not the projected contact');
  assert.deepEqual(await businessMatch(`${marker} albañil`), [String(eq[1].id)], 'without is_primary the lowest id is the primary contact');
  assert.deepEqual(await businessMatch(`${marker} feria nandu`), [], 'ñ stays distinct from n through the id sets');
  assert((await get(search, 'search', { q: `${marker} pauta anual` })).results.some((r: { id: string }) => r.id.startsWith('lead:')), 'Ctrl+K Gestiones matches service_interest');
  // Migrations 032 and 034 index the exact normalizeSearchSql() expression; if the helper drifts, the planner can no longer use them.
  const indexed: Record<string, [string, string[]]> = { crm_accounts_search_trgm: ['crm_accounts', ['nombre', 'email', 'telefono', 'ciudad', 'business_notes']], crm_contacts_search_trgm: ['crm_contacts', ['name', 'email', 'phone']], crm_activities_search_trgm: ['crm_activities', ['title', 'notes', 'result']], lead_notes_search_trgm: ['lead_notes', ['note']], leads_search_trgm: ['leads', ['nombre', 'opportunity_name', 'service_interest', 'contact_name', 'origen']], crm_accounts_origin_search_trgm: ['crm_accounts', ['origin']] };
  for (const [index, [table, columns]] of Object.entries(indexed)) for (const column of columns) await db.transaction().execute(async tx => {
    await sql`SET LOCAL enable_seqscan = off`.execute(tx);
    const plan = (await sql<{ 'QUERY PLAN': string }>`EXPLAIN SELECT 1 FROM ${sql.table(table)} AS t WHERE ${searchSql(`t.${column}`, 'Colón ñandú')}`.execute(tx)).rows.map(row => row['QUERY PLAN']).join('\n');
    assert.match(plan, new RegExp(`Bitmap Index Scan on ${index}\\b`), `${table}.${column} search must use ${index}`);
  });
  console.log('Accent-insensitive search: Latin Unicode, ñ, all free-search endpoints, pagination, AND/OR filters, deleted/archived visibility and permissions passed');
} finally {
  await db.destroy();
}
