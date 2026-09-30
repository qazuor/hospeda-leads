import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl) throw new Error("DATABASE_URL is required");

const sql=postgres(databaseUrl,{max:1});

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations(
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const dir=path.resolve("migrations");
const files=(await readdir(dir)).filter(file=>file.endsWith(".sql")).sort();

for(const file of files){
  const body=await readFile(path.join(dir,file),"utf8");
  const checksum=createHash("sha256").update(body).digest("hex");
  const applied=await sql`SELECT checksum FROM schema_migrations WHERE name=${file}`;

  if(applied.length){
    if(applied[0].checksum!==checksum){
      throw new Error(`Migration ${file} changed after being applied`);
    }
    continue;
  }

  await sql.begin(async tx=>{
    await tx.unsafe(body);
    await tx`INSERT INTO schema_migrations(name,checksum) VALUES(${file},${checksum})`;
  });
  console.log(`Applied ${file}`);
}

await sql.end();
