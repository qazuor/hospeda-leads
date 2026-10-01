import superjson from 'superjson';
import {getServerUserSession} from '../helpers/getServerUserSession';
export async function handle(request:Request){try{await getServerUserSession(request);return new Response(superjson.stringify({error:'La importación directa fue reemplazada por revisión previa. Usá Importar CSV para revisar y confirmar el lote.'}),{status:409});}catch{return new Response(superjson.stringify({error:'No autenticado'}),{status:401});}}
