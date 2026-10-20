/** Report raw and gzip-estimated Vite assets after npm run build. */
import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const root = path.resolve('dist');
try {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const entryMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
  const entry = entryMatch?.[1]?.replace(/^\//, '');
  if (!entry) throw new Error('No se encontró el script de entrada en dist/index.html. Ejecutá npm run build.');
  const assetsRoot = path.join(root, 'assets');
  const names = await readdir(assetsRoot);
  const rows = await Promise.all(names.map(async name => {
    const file = path.join(assetsRoot, name);
    if (!(await stat(file)).isFile()) return null;
    const data = await readFile(file);
    return { name, data, raw: data.length, gzip: gzipSync(data).length, isEntry: `assets/${name}` === entry };
  }));
  console.log('Asset                                 Raw       Gzip');
  for (const row of rows.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)))
    console.log(`${row.name}${row.isEntry ? ' [entry]' : ''}  ${row.raw} B  ${row.gzip} B`);
  console.log(`Entrada: ${entry}`);
  console.log(`Chunks con TipTap: ${rows.filter(row => row && /tiptap/i.test(row.data.toString('utf8'))).map(row => row.name).join(', ') || 'ninguno'}`);
  const entryRow = rows.find(row => row?.isEntry);
  console.log(`Texto user-guide en entrada: ${entryRow?.data.toString('utf8').includes('user-guide') ? 'sí' : 'no'}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
