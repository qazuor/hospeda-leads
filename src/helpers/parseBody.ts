import superjson from 'superjson';
/** Parses a SuperJSON request body; malformed input becomes a plain business Error (mapped to 400) instead of a SyntaxError (500). */
export async function parseBody(request:Request):Promise<unknown>{
 try{return superjson.parse(await request.text())}catch{throw new Error('Solicitud inválida.')}
}
/**
 * Accepts a SuperJSON body (what the screen's `postJson` sends) or plain JSON (scripts, older callers). Spec 103 regression: the unmatched
 * inbox read the SuperJSON envelope as plain JSON, so every association from the screen failed with «Required».
 */
export async function parseJsonOrSuperJson(request:Request):Promise<unknown>{
 let value:unknown;try{value=JSON.parse(await request.text())}catch{throw new Error('Solicitud inválida.')}
 if(value&&typeof value==='object'&&!Array.isArray(value)&&'json' in value&&Object.keys(value).every(k=>k==='json'||k==='meta'))return superjson.deserialize(value as Parameters<typeof superjson.deserialize>[0]);
 return value;
}
