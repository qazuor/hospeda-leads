import {afterEach, describe, expect, it, vi} from 'vitest';
import {z} from 'zod';
import {crmError, isUnexpectedError} from './crmErrors';
const generic='No se pudo completar la acción. Intentá de nuevo.';
const pgError=(code:string,message:string,extra:Record<string,unknown>={})=>Object.assign(new Error(message),{name:'PostgresError',severity:'ERROR',code,...extra});
afterEach(()=>vi.restoreAllMocks());
describe('crmError',()=>{
 it('keeps ZodError mapping',()=>{const r=z.object({nombre:z.string().min(3)}).safeParse({nombre:'a'});expect(r.success).toBe(false);if(!r.success)expect(crmError(r.error)).toBe('Completá el nombre del negocio con al menos 3 caracteres.')});
 it('preserves deliberate plain Error messages',()=>{expect(crmError(new Error('Elegí el motivo de cierre'))).toBe('Elegí el motivo de cierre')});
 it('preserves trigger RAISE EXCEPTION messages (P0001)',()=>{expect(crmError(pgError('P0001','Revisá el negocio antes de iniciar una gestión'))).toBe('Revisá el negocio antes de iniciar una gestión')});
 it('preserves the 23502 trigger guard without table info but not a real NOT NULL violation',()=>{expect(crmError(pgError('23502','Creá primero el negocio'))).toBe('Creá primero el negocio');vi.spyOn(console,'error').mockImplementation(()=>{});expect(crmError(pgError('23502','null value in column "x" violates not-null constraint',{table_name:'leads',column_name:'x'}))).toBe(generic)});
 it('maps unexpected SQL errors to a generic message and logs once',()=>{const spy=vi.spyOn(console,'error').mockImplementation(()=>{});const e=pgError('42P01','relation "leads" does not exist');expect(crmError(e)).toBe(generic);expect(crmError(e)).toBe(generic);expect(spy).toHaveBeenCalledTimes(1)});
 it('maps well-known SQLSTATEs to friendly messages',()=>{expect(crmError(pgError('23505','duplicate key value violates unique constraint "x"'))).toBe('Ya existe un registro con esos datos.');expect(crmError(pgError('40001','could not serialize'))).toBe('Hubo un conflicto con otro cambio. Intentá de nuevo.');expect(crmError(pgError('40P01','deadlock detected'))).toBe('Hubo un conflicto con otro cambio. Intentá de nuevo.');expect(crmError(pgError('55P03','lock not available'))).toBe('La operación tardó demasiado. Intentá de nuevo.');expect(crmError(pgError('57014','canceling statement due to statement timeout'))).toBe('La operación tardó demasiado. Intentá de nuevo.')});
 it('maps TypeError to a generic message',()=>{vi.spyOn(console,'error').mockImplementation(()=>{});expect(crmError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(generic)});
 it('returns the generic message for non-Error values',()=>{expect(crmError('boom')).toBe(generic)});
});
describe('isUnexpectedError',()=>{
 it('classifies errors',()=>{expect(isUnexpectedError(pgError('42703','column'))).toBe(true);expect(isUnexpectedError(new RangeError('x'))).toBe(true);expect(isUnexpectedError(new SyntaxError('x'))).toBe(true);expect(isUnexpectedError(pgError('P0001','msg'))).toBe(false);expect(isUnexpectedError(new Error('Negocio no encontrado'))).toBe(false);expect(isUnexpectedError(new z.ZodError([]))).toBe(false)});
});
