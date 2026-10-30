// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Kysely} from 'kysely';
import type {DB} from './schema';
import {CrmForbidden} from './crmPermissions';
import {setR2StorageForTests} from './r2';
import {MEDIA_READ_URL_SECONDS,READ_URL_SECONDS,assertSalesMaterialAdmin,readUrlSeconds,scheduleSalesMaterialUploadSweep} from './salesMaterialService';

afterEach(()=>{setR2StorageForTests({storage:undefined});vi.useRealTimers();});
describe('assertSalesMaterialAdmin',()=>{
 it('lets admins through and refuses sellers with a Spanish 403 error',()=>{
  expect(()=>assertSalesMaterialAdmin({role:'admin'})).not.toThrow();
  expect(()=>assertSalesMaterialAdmin({role:'user'})).toThrow(CrmForbidden);
  expect(()=>assertSalesMaterialAdmin({role:'user'})).toThrow('Solo un administrador puede administrar el material de venta.');
 });
});
describe('scheduleSalesMaterialUploadSweep',()=>{
 it('runs after start and every interval, never touching the database without R2 configuration, and stops cleanly',async()=>{
  vi.useFakeTimers();setR2StorageForTests({storage:null});
  const transaction=vi.fn(()=>({execute:vi.fn(async()=>null)}));
  const db={transaction} as unknown as Kysely<DB>;const log=vi.fn();
  const stop=scheduleSalesMaterialUploadSweep({db,intervalMs:1000,firstRunMs:10,log});
  await vi.advanceTimersByTimeAsync(2500);expect(transaction).not.toHaveBeenCalled();
  setR2StorageForTests({storage:{origin:'http://stub'} as never});
  await vi.advanceTimersByTimeAsync(1000);expect(transaction).toHaveBeenCalledTimes(1);
  stop();await vi.advanceTimersByTimeAsync(5000);expect(transaction).toHaveBeenCalledTimes(1);expect(log).not.toHaveBeenCalled();
 });
 it('logs a failed run instead of crashing the server',async()=>{
  vi.useFakeTimers();setR2StorageForTests({storage:{origin:'http://stub'} as never});
  const db={transaction:()=>({execute:async()=>{throw new Error('db down')}})} as unknown as Kysely<DB>;const log=vi.fn();
  const stop=scheduleSalesMaterialUploadSweep({db,intervalMs:1000,firstRunMs:10,log});
  await vi.advanceTimersByTimeAsync(20);stop();
  expect(log).toHaveBeenCalledWith('Sales material sweep failed: db down');
 });
});
describe('readUrlSeconds',()=>{
 it('lasts 6 hours for audio and video so playback and seeking survive, and 5 minutes for everything else',()=>{
  for(const mimeType of ['video/mp4','video/webm','audio/mpeg','audio/mp4','VIDEO/MP4'])expect(readUrlSeconds({mimeType}),mimeType).toBe(MEDIA_READ_URL_SECONDS);
  for(const mimeType of ['application/pdf','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document',null,undefined])expect(readUrlSeconds({mimeType}),String(mimeType)).toBe(READ_URL_SECONDS);
  expect(MEDIA_READ_URL_SECONDS).toBe(21600);expect(READ_URL_SECONDS).toBe(300);
 });
});
