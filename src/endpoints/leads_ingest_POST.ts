import superjson from 'superjson';
import {db} from '../helpers/db';
export async function handle(request:Request){
 const token=await db.selectFrom('appSettings').select('value').where('key','=','ingest_token').executeTakeFirst();
 if(!token||request.headers.get('Authorization')!=='Bearer '+token.value)return new Response(superjson.stringify({error:'Ingest source not allowed'}),{status:403});
 return new Response(superjson.stringify({error:'Ingest directo deshabilitado: exportá CSV y revisá el lote desde el CRM antes de confirmar.'}),{status:409});
}
