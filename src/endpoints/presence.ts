import superjson from 'superjson';
import {sql} from 'kysely';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {errorResponse} from '../helpers/errorResponse';
import {parseBody} from '../helpers/parseBody';
import {heartbeatSchema,onlineSchema,type OnlineOutput} from './presence.schema';

const json=(body:unknown,status=200)=>new Response(superjson.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const input= (request:Request)=>Object.fromEntries(new URL(request.url).searchParams);

export async function heartbeat(request:Request){
  try{
    const {user}=await getServerUserSession(request,{touchSession:false});
    heartbeatSchema.parse(await parseBody(request));
    await sql`INSERT INTO user_presence(user_id,source,last_seen_at) VALUES (${user.id},'crm',now()) ON CONFLICT (user_id,source) DO UPDATE SET last_seen_at=now() WHERE user_presence.last_seen_at < now() - interval '20 seconds'`.execute(db);
    return json({ok:true});
  }catch(error){return errorResponse(error);}
}

export async function online(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    onlineSchema.parse(input(request));
    if(user.role!=='admin')return json({error:'Solo administradores pueden ver quién está en línea.'},403);
    const rows=await sql<{id:number;displayName:string;email:string;role:'admin'|'user';lastSeenAt:Date;sources:('crm'|'whatsapp'|'instagram')[]}>`SELECT u.id,u.display_name AS "displayName",u.email,u.role,max(p.last_seen_at) AS "lastSeenAt",array_agg(p.source ORDER BY p.source) AS sources FROM users u JOIN user_presence p ON p.user_id=u.id WHERE u.deactivated_at IS NULL AND p.last_seen_at > now() - interval '2 minutes' GROUP BY u.id ORDER BY u.display_name`.execute(db);
    const output={users:rows.rows,windowSeconds:120} satisfies OnlineOutput;
    return json(output);
  }catch(error){return errorResponse(error);}
}
