/**
 * Test-only helpers that protect the local `crm_integration_secrets` row 'instagram' (spec 92 review M2). Integration
 * scripts and the browser test overwrite it with a mock token; the snapshot and the restore must survive any cleanup failure
 * and must never touch the row when no snapshot was taken.
 */

/** Runs one parameterized statement ($1, $2…) and returns its rows. Kysely and postgres.js callers adapt to this. */
export type SecretQuery=(text:string,params?:readonly unknown[])=>Promise<readonly Record<string,unknown>[]>;
/** `taken` is false until the snapshot SELECT succeeded; `row` is null when there was no row to keep. */
export type SecretSnapshot={readonly taken:boolean;readonly row:Readonly<Record<string,string|null>>|null};

/** Nothing captured yet: {@link restoreInstagramSecret} leaves the row alone. */
export const NO_SECRET_SNAPSHOT:SecretSnapshot={taken:false,row:null};
const COLUMNS=['ciphertext','iv','tag','expires_at','refreshed_at','last_error','updated_at'] as const;

/**
 * Refuses to run unless the test opted in with `CRM_TEST_DATABASE=1` and `DATABASE_URL` points to localhost or the default
 * Docker bridge (same rule as `scripts/test-instagram-opened-migration.mjs`). Call it before the first write.
 */
export function assertLocalTestDatabase({url,optIn}:{url:string|undefined;optIn:string|undefined}):void{
 if(optIn!=='1')throw new Error('Set CRM_TEST_DATABASE=1: these tests write to the database.');
 let hostname='';try{hostname=new URL(url??'').hostname;}catch{/* reported below */}
 if(!['localhost','127.0.0.1','::1','[::1]'].includes(hostname)&&!/^172\.17\.\d{1,3}\.\d{1,3}$/.test(hostname))throw new Error('DATABASE_URL must point to local PostgreSQL or its default Docker bridge.');
}

/**
 * Reads the row exactly as stored: timestamps as text, so the restore keeps their microseconds. Aliases have no underscore,
 * so a camelCase result plugin cannot rename them.
 */
export async function snapshotInstagramSecret({query}:{query:SecretQuery}):Promise<SecretSnapshot>{
 const rows=await query(`SELECT ${COLUMNS.map((c,i)=>`${c}::text AS c${i}`).join(',')} FROM crm_integration_secrets WHERE name='instagram'`);
 const row=rows[0];
 return {taken:true,row:row?Object.fromEntries(COLUMNS.map((c,i)=>[c,row['c'+i]==null?null:String(row['c'+i])])):null};
}

/** One comparable string for the stored row (or null), to assert that a test left it exactly as it was. */
export async function instagramSecretFingerprint({query}:{query:SecretQuery}):Promise<string|null>{
 const rows=await query(`SELECT row(name,${COLUMNS.join(',')})::text AS fp FROM crm_integration_secrets WHERE name='instagram'`);
 return rows[0]?String(rows[0].fp):null;
}

/**
 * Puts the row back as snapshotted (or removes a row the test created). Does nothing without a snapshot. Parameters are
 * typed text and cast in SQL: a `timestamptz` parameter would go through the driver's Date serializer and lose microseconds.
 */
export async function restoreInstagramSecret({query,snapshot}:{query:SecretQuery;snapshot:SecretSnapshot}):Promise<void>{
 if(!snapshot.taken)return;
 if(!snapshot.row){await query(`DELETE FROM crm_integration_secrets WHERE name='instagram'`);return;}
 const r=snapshot.row;
 await query(`INSERT INTO crm_integration_secrets(name,ciphertext,iv,tag,expires_at,refreshed_at,last_error,updated_at) VALUES('instagram',$1::text,$2::text,$3::text,$4::text::timestamptz,$5::text::timestamptz,$6::text,$7::text::timestamptz) ON CONFLICT(name) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,tag=excluded.tag,expires_at=excluded.expires_at,refreshed_at=excluded.refreshed_at,last_error=excluded.last_error,updated_at=excluded.updated_at`,COLUMNS.map(c=>r[c]));
}

/**
 * Runs the fixture cleanup and then, whatever happened, the restore. A cleanup error is reported through `onCleanupError`
 * (it never skips the restore); a restore error propagates.
 */
export async function cleanupThenRestore({cleanup,restore,onCleanupError}:{cleanup:()=>Promise<void>;restore:()=>Promise<void>;onCleanupError:(error:unknown)=>void}):Promise<void>{
 try{await cleanup();}catch(error){onCleanupError(error);}finally{await restore();}
}
