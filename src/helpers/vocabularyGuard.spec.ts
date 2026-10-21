// @vitest-environment node
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import guide from '../content/user-guide.json';

/**
 * Vocabulary guard (owner decision 6d): visible terms that the UX plan retires.
 * The final sweep (U-32) emptied BASELINE, so the guard is strict: any occurrence fails. BASELINE stays as an escape hatch (`path::term` → count, path relative to `src/`); only add to it with an owner-approved reason.
 */
const BANNED_TERMS=['Gestión comercial inicial','Gestiones comerciales','Registrar qué pasó','Registrar actividad','Planificar','Dar de baja','Relación del negocio','Seguimiento general','Contacto general','Agregar contacto','AHORA CORRESPONDE','Sin seguimiento programado','Completá los campos obligatorios','Not authenticated','negocios u gestiones','Editar / reprogramar','Más opciones',
 'alcance','Estado del pipeline','Pipeline, actividad','Cargando pipeline','"Pipeline"',"'Pipeline'",'||"Sistema"',"||'Sistema'",'uditoría','Journal de','del journal','Contactos participantes','Definí una acción con fecha','Negocio / contacto','Confirmar baja','dado de baja'] as const;

/** Extra terms retired from the in-app guide only: old navigation names that some UI strings may still use. */
const GUIDE_RETIRED_PATTERNS=[/\bMi día\b/,/\bAgenda\b/,/\bReactivación\b/,/Gestiones? comerciales?/,/\bPipeline\b/i,/\bSeguimiento programado\b/] as const;

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

 it('flags the second-round terms (jargon, raw actor placeholder, retired phrases) in UI strings',()=>{
  const samples=['Estado del pipeline','Revisá el alcance completo','{j.actorEmail||"Sistema"}','Auditoría de tareas','Contactos participantes','Definí una acción con fecha','Negocio / contacto','Historial del journal'];
  expect(samples.filter(sample=>!BANNED_TERMS.some(term=>sample.includes(term)))).toEqual([]);
  expect(BANNED_TERMS.some(term=>'Cargando el tablero…'.includes(term))).toBe(false);
 });

 it('keeps the in-app guide (user-guide.json) free of banned and retired terms',()=>{
  const strings=(value:unknown):string[]=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings):value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
  const text=strings(guide);
  expect(text.length).toBeGreaterThan(300);
  const hits=text.flatMap(line=>[...BANNED_TERMS.filter(term=>line.includes(term)),...GUIDE_RETIRED_PATTERNS.filter(pattern=>pattern.test(line)).map(String)].map(term=>`${term} in «${line.slice(0,60)}»`));
  expect(hits).toEqual([]);
  expect(GUIDE_RETIRED_PATTERNS.every(pattern=>pattern.test('Abrí Mi día, la Agenda, Reactivación, Gestiones comerciales, el pipeline y Seguimiento programado'))).toBe(true);
 });

 it('actually scans the source tree',()=>{
  expect(listFiles(srcRoot).filter(scanned).length).toBeGreaterThan(100);
  expect(Object.keys(BASELINE).every(entry=>BANNED_TERMS.some(term=>entry.endsWith('::'+term)))).toBe(true);
 });
});
