import superjson from 'superjson';
import {randomUUID} from 'node:crypto';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {basePreferences,preferencesFromSavedView,teamDefaultsSchema,type TeamDefaults} from '../helpers/businessListPreferences';
import {defaultSystemViews,type BusinessSystemView} from '../helpers/businessSystemViews';
import {identifySavedViews} from '../helpers/savedViewIdentity';
import type {SavedLeadView} from './saved_views_GET.schema';
import {z} from 'zod';

const inputSchema=z.object({id:z.string().min(1).max(100)});
const defaultsKey='business_list_team_defaults_v1';
export async function handle(request:Request){
 try{
  const {user}=await getServerUserSession(request);
  if(user.role!=='admin')return new Response(superjson.stringify({error:'Solo un administrador puede convertir vistas de sistema.'}),{status:403});
  const {id}=inputSchema.parse(superjson.parse(await request.text()));
  const viewsKey='lead_saved_views:'+user.id;
  const initial:TeamDefaults={systemViews:defaultSystemViews(),preferences:basePreferences(),presets:[],initialPresetId:null};
  const systemView=await db.transaction().execute(async trx=>{
   await trx.insertInto('appSettings').values({key:defaultsKey,value:JSON.stringify(initial)}).onConflict(oc=>oc.column('key').doNothing()).execute();
   await trx.insertInto('appSettings').values({key:viewsKey,value:'[]'}).onConflict(oc=>oc.column('key').doNothing()).execute();
   const defaultsRow=await trx.selectFrom('appSettings').select('value').where('key','=',defaultsKey).forUpdate().executeTakeFirstOrThrow();
   const viewsRow=await trx.selectFrom('appSettings').select('value').where('key','=',viewsKey).forUpdate().executeTakeFirstOrThrow();
   let savedViews:SavedLeadView[];
   try{const parsed=JSON.parse(viewsRow.value);if(!Array.isArray(parsed))throw new Error();savedViews=identifySavedViews(parsed.filter(item=>item&&typeof item.name==='string'&&item.config&&typeof item.config==='object'),user.id);}catch{throw new Error('No pude leer tus vistas guardadas. No se modificó ninguna.');}
   const personal=savedViews.find(view=>view.id===id);
   if(!personal)throw new Error('Esta vista ya no existe. Actualizá la lista y volvé a intentarlo.');
   if(personal.config.entity&&personal.config.entity!=='business')throw new Error('Solo se pueden convertir vistas de negocios.');
   const preferences=preferencesFromSavedView(basePreferences(),personal.config);
   if(!preferences)throw new Error('No pude leer los filtros de esta vista. No se convirtió.');
   let defaults:TeamDefaults;
   try{
    const parsed=JSON.parse(defaultsRow.value);
    const existing=teamDefaultsSchema.parse(parsed);
    defaults={...existing,systemViews:existing.systemViews??defaultSystemViews()};
   }catch{throw new Error('No pude leer las configuraciones compartidas. No se convirtió.');}
   const nextSystemView:BusinessSystemView={id:'custom:'+randomUUID(),name:personal.name,enabled:true,preferences};
   const nextDefaults=teamDefaultsSchema.parse({...defaults,systemViews:[...defaults.systemViews!,nextSystemView]});
   const nextViews=savedViews.filter(view=>view.id!==id);
   await trx.updateTable('appSettings').set({value:JSON.stringify(nextDefaults),updatedAt:new Date()}).where('key','=',defaultsKey).execute();
   await trx.updateTable('appSettings').set({value:JSON.stringify(nextViews),updatedAt:new Date()}).where('key','=',viewsKey).execute();
   return nextSystemView;
  });
  return new Response(superjson.stringify({ok:true,systemView}),{headers:{'Content-Type':'application/json'}});
 }catch(error){
  const status=error instanceof NotAuthenticatedError?401:400;
  return new Response(superjson.stringify({error:error instanceof Error?error.message:'No se pudo convertir la vista.'}),{status});
 }
}
