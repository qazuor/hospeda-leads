/** Local-only EXPLAIN ANALYZE runner; queries are reviewed static SQL in hot-queries.sql. */
import postgres from 'postgres';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const connectionString = process.env.DATABASE_URL;
const socket = process.env.CRM_TEST_DATABASE_SOCKET;
function localDatabase(value) {
 let url; try { url = new URL(value); } catch { throw new Error('DATABASE_URL debe ser una URL válida.'); }
 if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname.toLowerCase())) throw new Error('DATABASE_URL solo permite localhost, 127.0.0.1 o ::1.');
}
if (!connectionString && !socket) { console.error('Uso: DATABASE_URL=postgres://... npm run perf:explain (solo base local).'); process.exit(1); }
try { if (connectionString) localDatabase(connectionString); } catch (error) { console.error(error.message); process.exit(1); }
const sql = postgres(connectionString || '', socket ? { host: socket } : {});
try {
 const output = [];
 const source = await readFile(new URL('./hot-queries.sql', import.meta.url), 'utf8');
 const queries = source.split(/^-- query: /m).slice(1).map(section => { const [name, ...lines] = section.split('\n'); return { name: name.trim(), query: lines.join('\n').trim() }; });
 if (!queries.length) throw new Error('hot-queries.sql no contiene consultas etiquetadas.');
 await sql.begin('read only', async tx => {
  for (const item of queries) {
   const rows = await tx.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${item.query}`);
   output.push(`## ${item.name}\n${rows.map(row => row['QUERY PLAN']).join('\n')}`);
  }
 });
 await mkdir('perf-results', { recursive: true });
 const file = `perf-results/explain-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;
 await writeFile(file, output.join('\n\n'));
 console.log(output.join('\n\n')); console.log(`Guardado en ${file}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await sql.end(); }
