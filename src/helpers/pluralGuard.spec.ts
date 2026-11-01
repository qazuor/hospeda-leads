// @vitest-environment node
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {plural,pluralWord} from '../content/vocabulary';

/**
 * Spec 104 (27): «1 gestiones». A count rendered next to a plural noun must go through plural()/pluralWord().
 * ALLOWED lists `path::count` for occurrences that can never show 1, with the reason next to it.
 */
const NOUNS='gestiones|negocios|personas|tareas|mensajes';
const COUNT_BEFORE_NOUN=new RegExp(String.raw`(\$\{[^{}]*\}|\{[^{}<>]*\}) (${NOUNS})\b`,'g');
const ALLOWED:Readonly<Record<string,number>>={
 'components/communication/BulkConfirmSends.tsx':3,// confirmTitle handles n===1 before the plural sentence (two strings plus its doc comment)
 'components/PendingOutcomes.tsx':1,// «Se muestran las {shown} gestiones…» only when more than the page cap exist
 'components/communication/RequiresAction.tsx':1,// same cap as PendingOutcomes
};
const srcRoot=fileURLToPath(new URL('..',import.meta.url));
const listFiles=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?listFiles(join(dir,entry.name)):[join(dir,entry.name)]);
const occurrences=()=>listFiles(srcRoot).filter(file=>/\.tsx?$/.test(file)&&!/\.(spec|test)\.tsx?$/.test(file)).flatMap(file=>{
 const path=relative(srcRoot,file).split(sep).join('/'),count=[...readFileSync(file,'utf8').matchAll(COUNT_BEFORE_NOUN)].length;
 return count>(ALLOWED[path]??0)?[`${path} (${count})`]:[];
});

describe('plural guard (spec 104)',()=>{
 it('renders no count next to a plural noun without plural()',()=>{
  expect(occurrences()).toEqual([]);
 });
 it('uses the singular only for exactly one',()=>{
  expect(plural(1,'gestión','gestiones')).toBe('1 gestión');
  expect(plural(2,'gestión','gestiones')).toBe('2 gestiones');
  expect(pluralWord(1,'negocio','negocios')).toBe('negocio');
  expect(pluralWord(1234,'negocio','negocios')).toBe('negocios');
 });
});
