import postgres from 'postgres';
import {writeFile} from 'node:fs/promises';
import {auditManagementCleanup} from './lib/audit-management-cleanup.mjs';

const args=process.argv.slice(2);
if(args[0]!=='--output'||!args[1]||args.length!==2)throw new Error('Uso: npm run db:audit:managements -- --output /ruta/informe.json. Solo lectura; no existe modo de eliminación.');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL es requerida. Usá credenciales de solo lectura o una copia verificada.');
const database=postgres(process.env.DATABASE_URL,{max:1,prepare:false,connection:{application_name:'hospeda_management_cleanup_audit'}});
try{
  const report=await database.begin('isolation level repeatable read read only',async tx=>{
    await tx`SET LOCAL statement_timeout = '60s'`;
    return auditManagementCleanup(sql=>tx.unsafe(sql));
  });
  // Exclusive creation prevents overwriting a previous review manifest.
  await writeFile(args[1],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({readOnly:true,cleanupExecuted:false,counts:report.counts,snapshotSha256:report.snapshotSha256}));
}finally{await database.end();}
