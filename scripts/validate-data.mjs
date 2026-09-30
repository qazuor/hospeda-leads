import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw new Error("DATABASE_URL is required");
const file=process.argv[2]||"migration-data.json";
const dump=JSON.parse(await readFile(file,"utf8"));
const expected=dump.counts??Object.fromEntries(
  Object.entries(dump.tables??{}).map(([table,rows])=>[table,Array.isArray(rows)?rows.length:0])
);
const sql=postgres(databaseUrl,{max:1});

let failed=false;
for(const [table,count] of Object.entries(expected)){
  const rows=await sql.unsafe(`SELECT count(*)::int AS n FROM ${table}`);
  const actual=Number(rows[0]?.n??0);
  const ok=actual===Number(count);
  console.log(`${ok?"OK":"MISMATCH"} ${table}: expected=${count} actual=${actual}`);
  if(!ok)failed=true;
}
await sql.end();
if(failed)process.exit(1);
