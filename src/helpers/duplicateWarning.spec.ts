import {describe,expect,it} from 'vitest';
import {duplicateQuery,duplicateReasonLabel,duplicateWarning} from './duplicateWarning';
import type {DuplicateCandidate} from '../endpoints/business_duplicate_check.schema';

const candidate=(id:string,extra:Partial<DuplicateCandidate>={}):DuplicateCandidate=>({id,nombre:'Negocio '+id,ciudad:'Colón',doNotContact:false,archived:false,deleted:false,reasons:['Teléfono parecido'],canOpen:true,blocking:false,...extra});

describe('duplicateQuery',()=>{
 it('waits until the name, phones or email are specific enough',()=>{
  expect(duplicateQuery({nombre:'Ca',ciudad:'Colón',telefono:'34471',email:'ana@',personPhone:'12345'})).toBeNull();
 });
 it('sends the city only with a searchable name, the person phone separately, and trims values',()=>{
  expect(duplicateQuery({nombre:' Cabañas ',ciudad:' Colón '})).toEqual({nombre:'Cabañas',ciudad:'Colón'});
  expect(duplicateQuery({nombre:'Ca',ciudad:'Colón',telefono:'(3447) 41-2345'})).toEqual({telefono:'(3447) 41-2345'});
  expect(duplicateQuery({email:'ana@example.com',personPhone:' 3447 400222 '})).toEqual({email:'ana@example.com',personPhone:'3447 400222'});
 });
});

describe('duplicateWarning',()=>{
 it('takes the block from the server flag, lists it first and shows at most three',()=>{
  const blocking=candidate('9',{doNotContact:true,blocking:true,reasons:['Teléfono compartido']});
  const result=duplicateWarning({candidates:[candidate('1'),candidate('2'),candidate('3'),blocking]});
  expect(result.blocker?.id).toBe('9');
  expect(result.shown.map(c=>c.id)).toEqual(['9','1','2']);
  expect(result.hidden).toBe(1);
  expect(result.dncWarning).toBe(false);
 });
 it('does not block a No contactar match the server marks as non-blocking, but flags it',()=>{
  const result=duplicateWarning({candidates:[candidate('1'),candidate('4',{doNotContact:true,reasons:['Nombre y localidad normalizados coinciden']})]});
  expect(result.blocker).toBeNull();
  expect(result.shown.map(c=>c.id)).toEqual(['4','1']);
  expect(result.dncWarning).toBe(true);
 });
 it('moves a No contactar business that only shares the person phone to its own warning, never a block',()=>{
  const person=candidate('7',{doNotContact:true,reasons:['Teléfono de la persona compartido']});
  const result=duplicateWarning({candidates:[candidate('1'),person]});
  expect(result.blocker).toBeNull();
  expect(result.personPhoneDnc.map(c=>c.id)).toEqual(['7']);
  expect(result.shown.map(c=>c.id)).toEqual(['1']);
  expect(duplicateWarning({candidates:[candidate('8',{doNotContact:true,reasons:['Teléfono de la persona parecido']})]}).personPhoneDnc).toEqual([]);
 });
 it('uses plain words for match reasons',()=>{
  expect(duplicateReasonLabel('Nombre y localidad normalizados coinciden')).toBe('Mismo nombre y ciudad');
  expect(duplicateReasonLabel('Teléfono de la persona compartido')).toBe('Mismo teléfono que la persona');
  expect(duplicateReasonLabel('Sitio web compartido')).toBe('Sitio web compartido');
 });
});
