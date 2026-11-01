import {afterEach,describe,expect,it} from 'vitest';
import {beginMaterialDownload,resetMaterialDownloadLimits} from './userscriptMaterialRate';
afterEach(()=>resetMaterialDownloadLimits());
describe('userscript material download limits',()=>{
 it('allows six in ten minutes then returns retry time',()=>{for(let i=0;i<6;i++){const x=beginMaterialDownload('t',1000);expect(x.allowed).toBe(true);x.finish();}expect(beginMaterialDownload('t',1001)).toMatchObject({allowed:false,retryAfter:600});});
 it('allows only one active stream per token',()=>{const a=beginMaterialDownload('t');expect(beginMaterialDownload('t').allowed).toBe(false);a.finish();expect(beginMaterialDownload('t').allowed).toBe(true);});
});
