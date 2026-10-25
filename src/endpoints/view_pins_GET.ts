import superjson from 'superjson';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {errorResponse} from '../helpers/errorResponse';
import {configSchema,type OutputType} from './view_pins.schema';
export async function handle(request:Request){try{const {user}=await getServerUserSession(request);const row=await db.selectFrom('appSettings').select('value').where('key','=','view_pins:'+user.id).executeTakeFirst();let output:OutputType={};if(row?.value){try{const parsed=JSON.parse(row.value);for(const entity of ['business','opportunity'] as const){const result=configSchema.safeParse(parsed[entity]);if(result.success)output[entity]=result.data;}}catch{}}return new Response(superjson.stringify(output),{headers:{'Content-Type':'application/json'}});}catch(error){return errorResponse(error);}}
