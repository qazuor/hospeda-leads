import superjson from 'superjson';
import {getServerUserSession} from '../helpers/getServerUserSession';
export async function handle(request:Request){try{await getServerUserSession(request);return new Response(superjson.stringify({error:'Prepará, guardá y confirmá el mensaje desde Comunicación.'}),{status:409});}catch{return new Response(superjson.stringify({error:'No autenticado'}),{status:401});}}
