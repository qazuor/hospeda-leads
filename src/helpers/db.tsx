import {type GeneratedAlways, Kysely, CamelCasePlugin} from 'kysely'
import {PostgresJSDialect} from 'kysely-postgres-js'
import {DB, kyselyIdentifierOverrides} from './schema'
import postgres from 'postgres'

// kysely's CamelCasePlugin can't recover a snake_case name that has an
// underscore directly before a digit (reminder_48h_sent -> reminder48hSent ->
// reminder48h_sent). The generated schema exports the exact spelling for such
// identifiers; everything else falls through to the default mapping.
class FlootCamelCasePlugin extends CamelCasePlugin {
  protected override snakeCase(str: string): string {
    return kyselyIdentifierOverrides[str] ?? super.snakeCase(str)
  }
}

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw new Error("DATABASE_URL is required");

// Empty, zero or non-numeric values fall back to the default: postgres.js
// silently drops falsy startup parameters and a NaN pool size throws.
const positiveIntEnv=(name:string,fallback:number)=>{const n=Number.parseInt(process.env[name]??"",10);return Number.isFinite(n)&&n>0?n:fallback;};

export const db = new Kysely<DB>({
plugins: [new FlootCamelCasePlugin()],
dialect: new PostgresJSDialect({
postgres: postgres(databaseUrl, {
prepare: false,
idle_timeout: 10,
max: process.env.CRM_TEST_DATABASE==="1" ? 1 : positiveIntEnv("DB_POOL_MAX",10),
connection: {
statement_timeout: positiveIntEnv("DB_STATEMENT_TIMEOUT_MS",30000),
lock_timeout: positiveIntEnv("DB_LOCK_TIMEOUT_MS",10000),
idle_in_transaction_session_timeout: 60000,
application_name: "hospeda-crm",
},
path: process.env.CRM_TEST_DATABASE==="1" ? process.env.CRM_TEST_DATABASE_SOCKET : undefined,
}),
}),
})
