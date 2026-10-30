import superjson from 'superjson';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {BUSINESS_COLUMN_GROUPS_KEY,businessColumnGroupsSchema,DEFAULT_BUSINESS_COLUMN_GROUPS,resolveBusinessColumnGroups} from '../helpers/businessColumnGroups';
import {errorResponse} from '../helpers/errorResponse';
import {parseBody} from '../helpers/parseBody';
export async function handle(request:Request){try{
 const {user}=await getServerUserSession(request);
 if(request.method==='POST'){
  if(user.role!=='admin')return new Response(superjson.stringify({error:'Solo un administrador puede editar las columnas agrupadas.'}),{status:403});
  const groups=businessColumnGroupsSchema.parse(await parseBody(request));
  await db.insertInto('appSettings').values({key:BUSINESS_COLUMN_GROUPS_KEY,value:JSON.stringify(groups)}).onConflict(oc=>oc.column('key').doUpdateSet({value:JSON.stringify(groups),updatedAt:new Date()})).execute();
  return new Response(superjson.stringify({ok:true}));
 }
 const row=await db.selectFrom('appSettings').select('value').where('key','=',BUSINESS_COLUMN_GROUPS_KEY).executeTakeFirst();
 let groups=DEFAULT_BUSINESS_COLUMN_GROUPS;
 if(row){try{groups=resolveBusinessColumnGroups(JSON.parse(row.value));}catch{groups=DEFAULT_BUSINESS_COLUMN_GROUPS;}}
 return new Response(superjson.stringify({groups}));
}catch(error){return errorResponse(error);}}
