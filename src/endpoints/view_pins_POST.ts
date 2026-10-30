import superjson from 'superjson';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {errorResponse} from '../helpers/errorResponse';
import {parseBody} from '../helpers/parseBody';
import {quickViewKey,systemViewKey} from '../helpers/viewPins';
import {schema,type OutputType} from './view_pins.schema';
function objectValue(value:unknown):OutputType{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as OutputType:{ };}
export async function handle(request:Request){try{const {user}=await getServerUserSession(request);const input=schema.parse(await parseBody(request));const key='view_pins:'+user.id;await db.transaction().execute(async trx=>{await trx.insertInto('appSettings').values({key,value:'{}'}).onConflict(oc=>oc.column('key').doNothing()).execute();const row=await trx.selectFrom('appSettings').select('value').where('key','=',key).forUpdate().executeTakeFirstOrThrow();let value:OutputType;try{value=objectValue(row.value?JSON.parse(row.value):{});}catch{value={};}if(input.config){const all=input.entity==='business'?systemViewKey('all'):quickViewKey('all');value[input.entity]={...input.config,hidden:input.config.hidden.filter(item=>item!==all)};}else delete value[input.entity];await trx.updateTable('appSettings').set({value:JSON.stringify(value),updatedAt:new Date()}).where('key','=',key).execute();});return new Response(superjson.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});}catch(error){return errorResponse(error);}}
