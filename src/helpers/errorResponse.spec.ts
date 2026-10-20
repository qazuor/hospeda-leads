import {afterEach, describe, expect, it, vi} from 'vitest';
import superjson from 'superjson';
import {z} from 'zod';
import {errorResponse} from './errorResponse';
import {NotAuthenticatedError} from './getSetServerSession';
const pgError=(code:string,message:string)=>Object.assign(new Error(message),{name:'PostgresError',severity:'ERROR',code});
const read=async(r:Response)=>({status:r.status,body:superjson.parse<{error:string}>(await r.text())});
afterEach(()=>vi.restoreAllMocks());
describe('errorResponse',()=>{
 it('answers 401 when unauthenticated',async()=>{expect((await read(errorResponse(new NotAuthenticatedError(),403))).status).toBe(401)});
 it('keeps business messages with the endpoint status',async()=>{expect(await read(errorResponse(new Error('Negocio no encontrado'),409))).toEqual({status:409,body:{error:'Negocio no encontrado'}});expect((await read(errorResponse(new Error('x')))).status).toBe(400)});
 it('keeps trigger RAISE messages visible',async()=>{expect(await read(errorResponse(pgError('P0001','No se puede cerrar sin motivo'))).then(r=>r.body.error)).toBe('No se puede cerrar sin motivo')});
 it('hides unexpected driver errors behind a generic 500',async()=>{vi.spyOn(console,'error').mockImplementation(()=>{});const r=await read(errorResponse(pgError('42703','column "x" does not exist')));expect(r.status).toBe(500);expect(r.body.error).not.toMatch(/column/)});
 it('keeps Zod validation as 400',async()=>{const z1=z.object({nombre:z.string().min(3)}).safeParse({nombre:'a'});if(z1.success)throw new Error('unreachable');expect((await read(errorResponse(z1.error))).status).toBe(400)});
});
