// @vitest-environment node
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';

/**
 * postgres.js infers a `${value}::jsonb` parameter as jsonb and serializes the JS string again, so a JSON.stringify'd value is stored
 * as a jsonb string instead of an object. The project casts through text (`${json}::text::jsonb`); this guard keeps the direct cast out.
 */
const root=fileURLToPath(new URL('..',import.meta.url));
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]);
const directCast=/\}::jsonb\b/;

describe('jsonb parameter casts',()=>{
 it('detects a direct cast and accepts the text cast',()=>{
  expect(directCast.test('sql`${JSON.stringify(v)}::jsonb`')).toBe(true);
  expect(directCast.test('sql`${JSON.stringify(v)}::text::jsonb`')).toBe(false);
 });
 it('never casts a template parameter straight to jsonb',()=>{
  const offenders=files(root).filter(file=>/\.(ts|tsx)$/.test(file)&&!/\.(spec|test)\.tsx?$/.test(file)).flatMap(file=>readFileSync(file,'utf8').split('\n').flatMap((line,index)=>directCast.test(line)?[relative(root,file)+':'+(index+1)]:[]));
  expect(offenders).toEqual([]);
 });
});
