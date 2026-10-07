import superjson from 'superjson';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {teamDefaultsSchema} from '../helpers/businessListPreferences';
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
const key='business_list_team_defaults_v1';
export async function handle(request:Request){try{
 const {user}=await getServerUserSession(request);
 if(request.method==='POST'){
  if(user.role!=='admin')return new Response(superjson.stringify({error:'Solo un administrador puede definir los valores del equipo.'}),{status:403});
  const defaults=teamDefaultsSchema.parse(superjson.parse(await request.text()));
  await db.insertInto('appSettings').values({key,value:JSON.stringify(defaults)}).onConflict(oc=>oc.column('key').doUpdateSet({value:JSON.stringify(defaults),updatedAt:new Date()})).execute();
  return new Response(superjson.stringify({ok:true}));
 }
 const row=await db.selectFrom('appSettings').select('value').where('key','=',key).executeTakeFirst();
 const parsed=row?teamDefaultsSchema.safeParse(JSON.parse(row.value)):null;
 return new Response(superjson.stringify({defaults:parsed?.success?parsed.data:null}));
 }catch(error){return new Response(superjson.stringify({error:error instanceof Error?error.message:'No pude guardar los valores del equipo.'}),{status:error instanceof NotAuthenticatedError?401:400});}}
