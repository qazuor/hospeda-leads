import {describe,expect,it} from 'vitest';
import {DNC_DUPLICATE_BLOCK,duplicateQuery,duplicateReasonLabel,duplicateWarning,isDncBlock} from './duplicateWarning';
import type {DuplicateCandidate} from '../endpoints/business_duplicate_check.schema';

const candidate=(id:string,extra:Partial<DuplicateCandidate>={}):DuplicateCandidate=>({id,nombre:'Negocio '+id,ciudad:'Colón',doNotContact:false,archived:false,deleted:false,reasons:['Teléfono parecido'],canOpen:true,...extra});

describe('duplicateQuery',()=>{
 it('waits until the name, phone or email is specific enough',()=>{
  expect(duplicateQuery({nombre:'Ca',ciudad:'Colón',telefono:'34471',email:'ana@'})).toBeNull();
 });
 it('sends the city only with a searchable name, and trims values',()=>{
  expect(duplicateQuery({nombre:' Cabañas ',ciudad:' Colón '})).toEqual({nombre:'Cabañas',ciudad:'Colón'});
  expect(duplicateQuery({nombre:'Ca',ciudad:'Colón',telefono:'(3447) 41-2345'})).toEqual({telefono:'(3447) 41-2345'});
  expect(duplicateQuery({email:'ana@example.com'})).toEqual({email:'ana@example.com'});
 });
});

describe('duplicateWarning',()=>{
 it('blocks only a No contactar match with the same name and city or an exactly shared phone',()=>{
  expect(isDncBlock(candidate('1',{doNotContact:true,reasons:['Nombre y localidad normalizados coinciden']}))).toBe(true);
  expect(isDncBlock(candidate('1',{doNotContact:true,reasons:['WhatsApp compartido']}))).toBe(true);
  expect(isDncBlock(candidate('1',{doNotContact:true,reasons:['Teléfono parecido','Email compartido']}))).toBe(false);
  expect(isDncBlock(candidate('1',{reasons:['Teléfono compartido']}))).toBe(false);
 });
 it('lists the blocker first and at most three matches',()=>{
  const dnc=candidate('9',{doNotContact:true,reasons:['Teléfono compartido']});
  const result=duplicateWarning({candidates:[candidate('1'),candidate('2'),candidate('3'),dnc]});
  expect(result.blocker?.id).toBe('9');
  expect(result.shown.map(c=>c.id)).toEqual(['9','1','2']);
  expect(result.hidden).toBe(1);
  expect(duplicateWarning({candidates:[candidate('1')]}).blocker).toBeNull();
 });
 it('uses plain words for match reasons and the decision copy for the block',()=>{
  expect(duplicateReasonLabel('Nombre y localidad normalizados coinciden')).toBe('Mismo nombre y ciudad');
  expect(duplicateReasonLabel('Sitio web compartido')).toBe('Sitio web compartido');
  expect(DNC_DUPLICATE_BLOCK).toBe('Ese negocio pidió no ser contactado. Consultá con un administrador.');
 });
});
