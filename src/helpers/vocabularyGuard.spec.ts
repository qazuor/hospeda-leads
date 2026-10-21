// @vitest-environment node
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';

/**
 * Vocabulary guard (owner decision 6d): visible terms that the UX plan retires.
 * The final sweep (U-32) emptied BASELINE, so the guard is strict: any occurrence fails. BASELINE stays as an escape hatch (`path::term` → count, path relative to `src/`); only add to it with an owner-approved reason.
 */
const BANNED_TERMS=['Gestión comercial inicial','Gestiones comerciales','Registrar qué pasó','Registrar actividad','Planificar','Dar de baja','Relación del negocio','Seguimiento general','Contacto general','Agregar contacto','AHORA CORRESPONDE','Sin seguimiento programado','Completá los campos obligatorios','Not authenticated','negocios u gestiones','Editar / reprogramar','Más opciones'] as const;

const BASELINE:Readonly<Record<string,number>>={};

const srcRoot=fileURLToPath(new URL('..',import.meta.url));
const scanned=(file:string)=>/\.(ts|tsx)$/.test(file)&&!/\.(spec|test)\.tsx?$/.test(file)&&!file.endsWith('.schema.ts');
const listFiles=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?listFiles(join(dir,entry.name)):[join(dir,entry.name)]);
/** Returns every `path::term` pair with its occurrence count for banned terms in `src/`. */
const findOccurrences=()=>listFiles(srcRoot).filter(scanned).flatMap(file=>{
 const text=readFileSync(file,'utf8');
 const path=relative(srcRoot,file).split(sep).join('/');
 return BANNED_TERMS.map(term=>({key:`${path}::${term}`,count:text.split(term).length-1})).filter(entry=>entry.count>0);
});

describe('vocabulary guard',()=>{
 it('adds no banned visible term outside the frozen baseline',()=>{
  expect(findOccurrences().filter(({key,count})=>count>(BASELINE[key]??0)).map(({key,count})=>`${key} (${count}, frozen ${BASELINE[key]??0})`)).toEqual([]);
 });

 it('actually scans the source tree',()=>{
  expect(listFiles(srcRoot).filter(scanned).length).toBeGreaterThan(100);
  expect(Object.keys(BASELINE).every(entry=>BANNED_TERMS.some(term=>entry.endsWith('::'+term)))).toBe(true);
 });
});
