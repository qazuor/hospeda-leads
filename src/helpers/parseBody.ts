import superjson from 'superjson';
/** Parses a SuperJSON request body; malformed input becomes a plain business Error (mapped to 400) instead of a SyntaxError (500). */
export async function parseBody(request:Request):Promise<unknown>{
 try{return superjson.parse(await request.text())}catch{throw new Error('Solicitud inválida.')}
}
