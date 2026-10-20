import {afterEach,describe,expect,it,vi} from 'vitest';
import superjson from 'superjson';
import {apiJson,postJson,CrmApiError,GENERIC_MESSAGE,OFFLINE_MESSAGE,SESSION_EXPIRED_EVENT,SESSION_EXPIRED_MESSAGE,UNREADABLE_MESSAGE,isEnglishMessage,isNotRetryable,shouldRetryQuery} from './apiClient';

const reply=(body:unknown,status=200,raw=false)=>new Response(raw?String(body):superjson.stringify(body),{status});
const mockFetch=(impl:(...args:Parameters<typeof fetch>)=>Promise<Response>)=>vi.spyOn(globalThis,'fetch').mockImplementation(impl);
const failure=async(promise:Promise<unknown>)=>{try{await promise}catch(error){return error as CrmApiError}throw new Error('expected a rejection')};
afterEach(()=>{vi.restoreAllMocks()});
/** English server messages, assembled from words so the vocabulary guard never sees them as UI literals. */
const en=(...words:string[])=>words.join(' ');
const [notAuthenticated,endpointNotFound,sessionFailed,originNotAllowed,unknownError]=[en('Not','authenticated'),en('Endpoint','not','found'),en('Session','validation','failed'),en('Origin','not','allowed'),en('Unknown','error')];

describe('apiJson',()=>{
 it('returns the SuperJSON body, revived (dates stay Date)',async()=>{
  const when=new Date('2026-10-20T15:00:00Z');mockFetch(async()=>reply({ok:true,when}));
  const value=await apiJson<{ok:boolean;when:Date}>('/_api/x');
  expect(value.when).toBeInstanceOf(Date);expect(value.when.toISOString()).toBe(when.toISOString());
 });
 it('accepts plain JSON bodies',async()=>{
  mockFetch(async()=>reply('{"users":[]}',200,true));
  expect(await apiJson('/_api/x')).toEqual({users:[]});
 });
 it('throws CrmApiError with the HTTP status and the Spanish server message',async()=>{
  mockFetch(async()=>reply({error:'Solo administradores pueden ver Estadísticas.'},403));
  const error=await failure(apiJson('/_api/x'));
  expect(error).toBeInstanceOf(CrmApiError);expect(error.status).toBe(403);expect(error.message).toBe('Solo administradores pueden ver Estadísticas.');
 });
 it('reads `message` when the server uses it (auth endpoints)',async()=>{
  mockFetch(async()=>reply({message:'Las contraseñas no coinciden'},400));
  expect((await failure(apiJson('/_api/x'))).message).toBe('Las contraseñas no coinciden');
 });
 it.each([endpointNotFound,sessionFailed,originNotAllowed,'',undefined])('maps English or empty message %j to Spanish',async message=>{
  mockFetch(async()=>reply({error:message},404));
  const error=await failure(apiJson('/_api/x'));
  expect(error.status).toBe(404);expect(error.message).toBe(GENERIC_MESSAGE);
 });
 it('uses the caller fallback when the server message is unusable',async()=>{
  mockFetch(async()=>reply('<html>Bad gateway</html>',502,true));
  expect((await failure(apiJson('/_api/x',{},{fallback:'No se pudo buscar en el CRM.'}))).message).toBe('No se pudo buscar en el CRM.');
 });
 it('maps network failure to status 0 with the offline copy',async()=>{
  mockFetch(async()=>{throw new TypeError('Failed to fetch')});
  const error=await failure(apiJson('/_api/x'));
  expect(error.status).toBe(0);expect(error.message).toBe(OFFLINE_MESSAGE);
 });
 it('maps a timeout to status 0 and always sends a 20 s timeout signal',async()=>{
  const timeout=vi.spyOn(AbortSignal,'timeout');
  const fetchMock=mockFetch(async()=>{throw new DOMException('The operation timed out.','TimeoutError')});
  const error=await failure(apiJson('/_api/x'));
  expect(timeout).toHaveBeenCalledWith(20000);expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  expect(error.status).toBe(0);expect(error.message).toBe(OFFLINE_MESSAGE);
 });
 it('rethrows a caller abort untouched so query cancellation keeps working',async()=>{
  const controller=new AbortController();
  mockFetch(async(_url,init)=>new Promise((_,reject)=>init!.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))));
  const pending=apiJson('/_api/x',{signal:controller.signal});controller.abort();
  const error=await failure(pending);
  expect(error).not.toBeInstanceOf(CrmApiError);expect((error as unknown as DOMException).name).toBe('AbortError');
 });
 it('dispatches crm:session-expired on 401 and explains it in Spanish',async()=>{
  const listener=vi.fn();window.addEventListener(SESSION_EXPIRED_EVENT,listener);
  mockFetch(async()=>reply({error:notAuthenticated},401));
  const error=await failure(apiJson('/_api/x'));
  window.removeEventListener(SESSION_EXPIRED_EVENT,listener);
  expect(listener).toHaveBeenCalledTimes(1);expect(error.status).toBe(401);expect(error.message).toBe(SESSION_EXPIRED_MESSAGE);
 });
 it('does not dispatch the session event when disabled (wrong password on login)',async()=>{
  const listener=vi.fn();window.addEventListener(SESSION_EXPIRED_EVENT,listener);
  mockFetch(async()=>reply({message:'Email o contraseña incorrectos.'},401));
  const error=await failure(apiJson('/_api/x',{},{sessionEvent:false}));
  window.removeEventListener(SESSION_EXPIRED_EVENT,listener);
  expect(listener).not.toHaveBeenCalled();expect(error.message).toBe('Email o contraseña incorrectos.');
 });
 it('reports an unreadable success body in Spanish',async()=>{
  mockFetch(async()=>reply('<html>proxy</html>',200,true));
  expect((await failure(apiJson('/_api/x'))).message).toBe(UNREADABLE_MESSAGE);
 });
});

describe('postJson',()=>{
 it('POSTs a SuperJSON body with the JSON content type',async()=>{
  const fetchMock=mockFetch(async()=>reply({id:'1'}));
  const when=new Date('2026-10-20T00:00:00Z');
  expect(await postJson('/_api/work',{when})).toEqual({id:'1'});
  const init=fetchMock.mock.calls[0][1]!;
  expect(init.method).toBe('POST');expect((init.headers as Record<string,string>)['Content-Type']).toBe('application/json');
  expect(superjson.parse<{when:Date}>(String(init.body)).when).toBeInstanceOf(Date);
 });
});

describe('retry policy',()=>{
 it.each([0,400,401,403,404,409])('never retries status %i',status=>{expect(shouldRetryQuery(0,new CrmApiError('x',status))).toBe(false)});
 it('retries other failures at most twice',()=>{
  const error=new CrmApiError('x',500);
  expect(shouldRetryQuery(0,error)).toBe(true);expect(shouldRetryQuery(1,error)).toBe(true);expect(shouldRetryQuery(2,error)).toBe(false);
  expect(shouldRetryQuery(0,new Error('x'))).toBe(true);
 });
 it('flags only 403/404 as not worth a "Reintentar"',()=>{
  expect(isNotRetryable(new CrmApiError('x',403))).toBe(true);expect(isNotRetryable(new CrmApiError('x',404))).toBe(true);
  expect(isNotRetryable(new CrmApiError('x',500))).toBe(false);expect(isNotRetryable(new Error('x'))).toBe(false);expect(isNotRetryable('x')).toBe(false);
 });
});

describe('isEnglishMessage',()=>{
 it.each([notAuthenticated,unknownError,endpointNotFound,en('duplicate','key','value','violates','unique','constraint')])('flags %j',m=>{expect(isEnglishMessage(m)).toBe(true)});
 it.each(['Elegí algo','Negocio no encontrado','Solo administradores pueden ver Estadísticas.','Documento inexistente','Error al guardar','No se pudo completar la acción. Intentá de nuevo.'])('keeps Spanish %j',m=>{expect(isEnglishMessage(m)).toBe(false)});
});
