import { readFile } from "node:fs/promises";
import postgres from "postgres";

type Dump={
  exportedAt:string;
  source?:string;
  tables:Record<string,Record<string,unknown>[]>;
};

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw new Error("DATABASE_URL is required");

const file=process.argv[2]||"migration-data.json";
const dump=JSON.parse(await readFile(file,"utf8")) as Dump;
const sql=postgres(databaseUrl,{max:1});

const order=[
  "authorized_emails",
  "crm_cities",
  "crm_subtypes",
  "crm_verticals",
  "users",
  "user_passwords",
  "leads",
  "lead_notes",
  "lead_journal",
  "message_templates",
  "email_outbox",
  "app_settings"
];

const allowed=new Set(order);

await sql.begin(async tx=>{
  for(const table of order){
    const rows=dump.tables[table]??[];
    if(!rows.length)continue;
    if(!allowed.has(table))throw new Error(`Unexpected table ${table}`);

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
    ["user_passwords","user_passwords_id_seq"],
    ["leads","leads_id_seq"],
    ["lead_notes","lead_notes_id_seq"],
    ["lead_journal","lead_journal_id_seq"],
    ["message_templates","message_templates_id_seq"],
    ["email_outbox","email_outbox_id_seq"]
  ] as const;

  for(const [table,sequence] of sequences){
    await tx.unsafe(
      `SELECT setval('${sequence}', GREATEST(COALESCE((SELECT MAX(id) FROM ${table}),1),1), true)`
    );
  }
});

await sql.end();
console.log("Migration data import completed");
