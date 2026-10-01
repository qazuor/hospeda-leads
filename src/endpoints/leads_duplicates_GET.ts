import superjson from 'superjson';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {duplicateAccountPairs} from '../helpers/dataNormalization';
import type {DuplicateGroup} from './leads_duplicates_GET.schema';
export async function handle(request:Request){try{
 await getServerUserSession(request);
 const accounts=await db.selectFrom('crmAccounts').selectAll().where('mergedIntoId','is',null).orderBy('id').execute();
 const groups:DuplicateGroup[]=[];
 for(const {a,b,match:m} of duplicateAccountPairs(accounts)){
  groups.push({reason:(m.kind==='duplicate_candidate'?'Posible duplicado: ':'Persona compartida / negocio relacionado: ')+m.reasons.join('; '),key:String(a.id)+'-'+b.id,leads:[a,b].map(x=>({id:String(x.id),accountId:String(x.id),nombre:x.nombre,ciudad:x.ciudad,telefono:x.telefono,email:x.email}))});
 }
 return new Response(superjson.stringify({groups}));
}catch(e){return new Response(superjson.stringify({error:e instanceof Error?e.message:'Error'}),{status:400});}}
