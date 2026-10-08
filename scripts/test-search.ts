import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import superjson from 'superjson';
import { db } from '../src/helpers/db';
import { setServerSession } from '../src/helpers/getSetServerSession';
import { normalizeSearchText } from '../src/helpers/searchText';
import { normalizeSearchSql } from '../src/helpers/searchSql';
import { handle as leads } from '../src/endpoints/leads_GET';
import { handle as trash } from '../src/endpoints/leads_trash_GET';
import { handle as journal } from '../src/endpoints/lead_journal_GET';
import { get as commercial } from '../src/endpoints/commercial';
import { get as work } from '../src/endpoints/work';

assert.equal(process.env.CRM_TEST_DATABASE, '1', 'Use a disposable database');
const marker = 'search-' + randomUUID();
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
  const deleted = await db.insertInto('leads').values({ accountId: account.id, nombre: `${marker} Eliminación`, deletedAt: new Date() }).returningAll().executeTakeFirstOrThrow();
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
  assert.equal((await get(leads, 'leads', { entity: 'business', q: `${marker} unicamente borrada` })).total, 0, 'Removed management notes do not expose a business');
  const plain = await db.insertInto('crmAccounts').values({ nombre: `${marker} cana`, assignedUserEmail: reader.user.email }).returningAll().executeTakeFirstOrThrow();
  const enye = await db.insertInto('crmAccounts').values({ nombre: `${marker} caña`, assignedUserEmail: reader.user.email }).returningAll().executeTakeFirstOrThrow();
  for (const [query, expected] of [['cana', plain.id], ['caña', enye.id], ['can\u0303a', enye.id]]) {
    const result = await get(leads, 'leads', { entity: 'business', q: `${marker} ${query}` });
    assert.deepEqual(result.rows.map((r: { accountId: string }) => r.accountId), [expected]);
  }
  assert.equal((await get(commercial, 'commercial', { q: `${marker} colon` })).total, 12);
  assert.equal((await get(work, 'work', { mode: 'lookup', q: `${marker} colon` })).accounts.length, 12);
  for (const query of ['lucia', 'evaluacion']) assert.equal((await get(journal, 'lead_journal', { leadId: proposal.id, q: `${marker} ${query}` })).total, 1);
  await get(journal, 'lead_journal', { q: marker }, reader.cookie, 403);
  await get(trash, 'leads_trash', { q: `${marker} eliminacion` }, reader.cookie, 403);
  assert.equal((await get(trash, 'leads_trash', { q: `${marker} eliminacion` }, admin.cookie)).total, 1);
  await db.updateTable('crmAccounts').set({ archivedAt: new Date() }).where('id', '=', account.id).execute();
  assert.equal((await get(leads, 'leads', { entity: 'opportunity', q: `${marker} gastronomia` })).total, 0);
  assert.equal((await get(commercial, 'commercial', { q: `${marker} colon` })).total, 11);
  assert.equal((await get(work, 'work', { mode: 'lookup', q: `${marker} colon` })).accounts.length, 11);
  await get(commercial, 'commercial', { q: marker, archived: 'true' }, reader.cookie, 403);
  assert.equal((await get(commercial, 'commercial', { q: `${marker} colon`, archived: 'true' }, admin.cookie)).total, 1);
  assert.equal((await db.selectFrom('leads').select('opportunityName').where('id', '=', proposal.id).executeTakeFirstOrThrow()).opportunityName, `${marker} Gastronomía`, 'Search never rewrites stored values');
  console.log('Accent-insensitive search: Latin Unicode, ñ, all free-search endpoints, pagination, AND/OR filters, deleted/archived visibility and permissions passed');
} finally {
  await db.destroy();
}
