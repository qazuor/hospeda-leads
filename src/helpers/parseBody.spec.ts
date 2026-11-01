// @vitest-environment node
import {describe,expect,it} from 'vitest';
import superjson from 'superjson';
import {parseJsonOrSuperJson} from './parseBody';

const request=(body:string)=>new Request('http://localhost/x',{method:'POST',body});
describe('parseJsonOrSuperJson',()=>{
 it('unwraps the SuperJSON envelope the screen sends, Dates included',async()=>{const at=new Date('2026-10-31T12:00:00Z');expect(await parseJsonOrSuperJson(request(superjson.stringify({ids:['a'],at})))).toEqual({ids:['a'],at});});
 it('keeps plain JSON as is, even with a field named json next to others',async()=>{expect(await parseJsonOrSuperJson(request('{"ids":["a"]}'))).toEqual({ids:['a']});expect(await parseJsonOrSuperJson(request('{"json":1,"other":2}'))).toEqual({json:1,other:2});});
 it('turns malformed input into a readable error',async()=>{await expect(parseJsonOrSuperJson(request('{'))).rejects.toThrow('Solicitud inválida.');});
});
