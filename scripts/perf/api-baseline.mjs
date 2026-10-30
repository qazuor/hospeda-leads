/** Local-only sequential and five-way API timing baseline; credentials come from PERF_EMAIL/PERF_PASSWORD. */
import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.PERF_BASE_URL || 'http://127.0.0.1:3001';
function localhostOnly(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} debe ser una URL válida.`); }
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase())) throw new Error(`${label} solo permite localhost, 127.0.0.1 o ::1.`);
  return url;
}
let origin;
try { origin = localhostOnly(base, 'PERF_BASE_URL').origin; }
catch (error) { console.error(error.message); process.exit(1); }
const email = process.env.PERF_EMAIL, password = process.env.PERF_PASSWORD;
if (!email || !password) { console.error('Uso: PERF_EMAIL=... PERF_PASSWORD=... [PERF_BASE_URL=http://127.0.0.1:3001] npm run perf:api'); process.exit(1); }
const runs = Number(process.env.PERF_RUNS || 30), warmup = Number(process.env.PERF_WARMUP || 3);
if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(warmup) || warmup < 0) { console.error('PERF_RUNS debe ser > 0 y PERF_WARMUP >= 0.'); process.exit(1); }

const results = [];
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultFile = `perf-results/${timestamp}.json`;
let cookie;
async function measure(path) {
  const start = performance.now();
  const response = await fetch(`${origin}/_api/${path}`, {
    headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(30000)
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  let payload;
  try { payload = JSON.parse(bytes.toString('utf8')); } catch { payload = undefined; }
  return { ms: performance.now() - start, bytes: bytes.length, gzip: gzipSync(bytes).length, payload };
}
function firstBusinessRow(payload) {
  if (!payload || typeof payload !== 'object') return undefined;
  if (Array.isArray(payload)) return payload.map(firstBusinessRow).find(Boolean);
  if (payload.accountId != null || payload.id != null) return payload;
  for (const value of Object.values(payload)) {
    const row = firstBusinessRow(value);
    if (row) return row;
  }
  return undefined;
}
async function saveResults() {
  await mkdir('perf-results', { recursive: true });
  await writeFile(resultFile, JSON.stringify({ base: origin, runs, warmup, results }, null, 2));
}

try {
  const login = await fetch(`${origin}/_api/auth/login_with_password`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: { email, password } }), redirect: 'manual', signal: AbortSignal.timeout(30000)
  });
  if (!login.ok) throw new Error(`Login falló: HTTP ${login.status}`);
  cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Login no devolvió cookie de sesión.');

  const basic = 'entity=business&page=1&pageSize=50&sortBy=nombre&sortDir=asc';
  const scenarios = [
    ['negocios base', `leads?${basic}`],
    ['negocios filtrados', `leads?${basic}&filterGroups=${encodeURIComponent(JSON.stringify([{ rules: [{ field: 'assignedUserEmail', operator: 'eq', value: '__CURRENT_USER__' }] }]))}&q=hotel&page=3`],
    ['oportunidades', 'leads?entity=opportunity&page=1&pageSize=50'],
    ['estadísticas', 'leads_stats?entity=business'], ['mi día', 'work?mode=day'], ['versión', 'live_version'],
    ['sesión', 'auth/session'], ['búsqueda', 'search?q=hot'], ['configuración', 'settings']
  ];
  for (const [name, path] of scenarios) {
    try {
      let businessPayload;
      for (let i = 0; i < warmup; i++) {
        const measured = await measure(path);
        if (name === 'negocios base' && i === warmup - 1) businessPayload = measured.payload;
      }
      const samples = [];
      for (let i = 0; i < runs; i++) {
        const measured = await measure(path);
        if (name === 'negocios base' && !businessPayload) businessPayload = measured.payload;
        samples.push(measured);
      }
      const burst = await Promise.all(Array.from({ length: 5 }, () => measure(path)));
      const times = samples.map(x => x.ms).sort((a,b)=>a-b); const percentile = p => times[Math.ceil(p * times.length) - 1];
      results.push({ name, path, p50: percentile(.5), p95: percentile(.95), max: times.at(-1), bytes: samples.at(-1).bytes, gzipBytes: samples.at(-1).gzip, burstMax: Math.max(...burst.map(x=>x.ms)) });
      if (name === 'negocios base') {
        const row = firstBusinessRow(businessPayload);
        if (row) {
          const accountId = row.accountId ?? row.id;
          const detailPath = `commercial?accountId=${encodeURIComponent(accountId)}`;
          try {
            const detailSamples = [];
            for (let i = 0; i < warmup; i++) await measure(detailPath);
            for (let i = 0; i < runs; i++) detailSamples.push(await measure(detailPath));
            const detailBurst = await Promise.all(Array.from({ length: 5 }, () => measure(detailPath)));
            const detailTimes = detailSamples.map(x => x.ms).sort((a,b)=>a-b); const detailPercentile = p => detailTimes[Math.ceil(p * detailTimes.length) - 1];
            results.push({ name: 'detalle comercial', path: detailPath, p50: detailPercentile(.5), p95: detailPercentile(.95), max: detailTimes.at(-1), bytes: detailSamples.at(-1).bytes, gzipBytes: detailSamples.at(-1).gzip, burstMax: Math.max(...detailBurst.map(x=>x.ms)) });
          } catch (error) { results.push({ name: 'detalle comercial', path: detailPath, error: error.message }); }
        } else {
          console.log('Se omite detalle comercial: el escenario de negocios base no devolvió filas.');
          results.push({ name: 'detalle comercial', skipped: 'negocios base no devolvió filas' });
        }
      }
    } catch (error) {
      results.push({ name, path, error: error.message });
    }
  }
} finally {
  await saveResults();
}
console.log('Escenario                 p50 ms  p95 ms  max ms  bytes  gzip est.  burst max');
for (const x of results) {
  if (x.error || x.skipped) { console.log(`${x.name.padEnd(25)} ${x.error || x.skipped}`); continue; }
  console.log(`${x.name.padEnd(25)} ${x.p50.toFixed(1)}  ${x.p95.toFixed(1)}  ${x.max.toFixed(1)}  ${x.bytes}  ${x.gzipBytes}  ${x.burstMax.toFixed(1)}`);
}
console.log(`Guardado en ${resultFile}`);
