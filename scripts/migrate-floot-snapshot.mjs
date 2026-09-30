import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import postgres from "postgres";

const databaseUrl=process.env.DATABASE_URL;
const snapshotUrl=process.env.MIGRATION_DATA_URL;
const keyB64=process.env.MIGRATION_DATA_KEY;

if(!databaseUrl)throw new Error("DATABASE_URL is required");
if(!snapshotUrl)throw new Error("MIGRATION_DATA_URL is required");
if(!keyB64)throw new Error("MIGRATION_DATA_KEY is required");

console.log("Downloading encrypted Floot snapshot...");
const response=await fetch(snapshotUrl);
if(!response.ok)throw new Error(`Snapshot download failed: ${response.status}`);
const envelope=JSON.parse(await response.text());

if(envelope.version!==1||envelope.algorithm!=="aes-256-gcm"||envelope.compression!=="gzip"){
  throw new Error("Unsupported migration snapshot format");
}

const key=Buffer.from(keyB64,"base64");
if(key.length!==32)throw new Error("MIGRATION_DATA_KEY must decode to 32 bytes");

const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(envelope.iv,"base64"));
decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
const gzip=Buffer.concat([
  decipher.update(Buffer.from(envelope.data,"base64")),
  decipher.final()
]);
const plain=gunzipSync(gzip);
const sha=createHash("sha256").update(plain).digest("hex");

if(envelope.plaintextSha256&&sha!==envelope.plaintextSha256){
  throw new Error("Snapshot checksum mismatch");
}

const dump=JSON.parse(plain.toString("utf8"));
const expected=dump.counts??envelope.counts??{};
const sql=postgres(databaseUrl,{max:1});

const order=[
  "authorized_emails",
  "crm_cities",
  "crm_subtypes",
  "crm_verticals",
  "users",
  "leads",
  "lead_notes",
  "lead_journal",
  "message_templates",
  "email_outbox",
  "app_settings"
];

console.log("Importing snapshot...");
await sql.begin(async tx=>{
  for(const table of order){
    const rows=dump.tables?.[table]??[];
    if(!rows.length){
      console.log(`Skipping ${table}: 0 rows`);
      continue;
    }

    for(let i=0;i<rows.length;i+=200){
      const batch=rows.slice(i,i+200);
      const columns=Object.keys(batch[0]);
      await tx`INSERT INTO ${tx(table)} ${tx(batch,...columns)} ON CONFLICT DO NOTHING`;
    }
    console.log(`Imported ${rows.length} rows into ${table}`);
  }

  const sequences=[
    ["authorized_emails","authorized_emails_id_seq"],
    ["crm_cities","crm_cities_id_seq"],
    ["crm_subtypes","crm_subtypes_id_seq"],
    ["crm_verticals","crm_verticals_id_seq"],
    ["users","users_id_seq"],
    ["leads","leads_id_seq"],
    ["lead_notes","lead_notes_id_seq"],
    ["lead_journal","lead_journal_id_seq"],
    ["message_templates","message_templates_id_seq"],
    ["email_outbox","email_outbox_id_seq"]
  ];

  for(const [table,sequence] of sequences){
    await tx.unsafe(
      `SELECT setval('${sequence}', GREATEST(COALESCE((SELECT MAX(id) FROM ${table}),1),1), true)`
    );
  }
});

console.log("Validating destination counts...");
let failed=false;
for(const [table,count] of Object.entries(expected)){
  const rows=await sql.unsafe(`SELECT count(*)::int AS n FROM ${table}`);
  const actual=Number(rows[0]?.n??0);
  const ok=actual===Number(count);
  console.log(`${ok?"OK":"MISMATCH"} ${table}: expected=${count} actual=${actual}`);
  if(!ok)failed=true;
}

await sql.end();

if(failed)throw new Error("Migration finished with count mismatches");

console.log(JSON.stringify({
  ok:true,
  sha256:sha,
  exportedAt:dump.exportedAt,
  counts:expected,
  note:"Passwords and sessions were intentionally not migrated"
},null,2));
