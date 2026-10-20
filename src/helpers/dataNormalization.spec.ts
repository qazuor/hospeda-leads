import {describe,it,expect} from 'vitest';
import {normalizeField,comparisonName,matchAccounts,phoneSignificantKeys,strictComparisonName} from './dataNormalization';
describe('conservative normalization',()=>{
 it('compares names without changing originals',()=>{expect(comparisonName('  Cabañas   Lihuén ')).toBe('cabanas lihuen');expect(normalizeField('nombre',' Lihuén ').original).toBe(' Lihuén ');});
 it('handles international and Argentine national phones without inventing mobile markers',()=>{expect(normalizeField('telefono','+54 9 3442 12-3456').normalized).toBe('+5493442123456');expect(normalizeField('telefono','03442 123456').normalized).toBe('+543442123456');expect(normalizeField('telefono','3442 15 123456').validity).toBe('ambiguous');expect(normalizeField('telefono','123456').normalized).toBeNull();expect(normalizeField('telefono','123456 / 987654').validity).toBe('ambiguous');});
 it('preserves email local case and ambiguous URL originals',()=>{expect(normalizeField('email','User@EXAMPLE.COM').normalized).toBe('User@example.com');expect(normalizeField('email','a@x.com;b@x.com').validity).toBe('invalid');expect(normalizeField('sitioWeb','example.com').validity).toBe('ambiguous');expect(normalizeField('sitioWeb','javascript:alert(1)').validity).toBe('invalid');});
 it('shared channels never establish duplicate identity',()=>{const a={id:'1',nombre:'Hotel A',ciudad:'Colón',telefono:'+543442123456',email:null,sitioWeb:null,updatedAt:new Date()};expect(matchAccounts({nombre:'Hotel B',ciudad:'Colón',telefono:'03442123456'},[a])[0].kind).toBe('shared_person_or_related');expect(matchAccounts({nombre:'Hotel A',ciudad:'Colon'},[a])[0].kind).toBe('duplicate_candidate');expect(matchAccounts({nombre:'Hotel A'},[{...a,ciudad:null}])).toEqual([]);});
 it('similar phones only appear with the similarPhone option and by significant digits',()=>{
  const row={id:'1',nombre:'Hotel A',ciudad:'Colón',telefono:'+54 9 3447 15-412345',email:null,sitioWeb:null,updatedAt:new Date()};
  for(const phone of ['3447412345','03447 412345','+54 3447 412345','(03447) 15-412345'])expect(matchAccounts({nombre:'Otro',telefono:phone},[row],{similarPhone:true})[0]?.reasons,phone).toContain('Teléfono parecido');
  expect(matchAccounts({nombre:'Otro',telefono:'3447412345'},[row])).toEqual([]);
  expect(matchAccounts({nombre:'Otro',telefono:'3447412399'},[row],{similarPhone:true})).toEqual([]);
 });
 it('phoneSignificantKeys rejects raw suffixes, service, foreign and short numbers',()=>{
  expect(phoneSignificantKeys('412345')).toEqual([]);
  expect(phoneSignificantKeys('llamar mañana')).toEqual([]);
  expect(phoneSignificantKeys('0800 123 4567')).toEqual([]);
  expect(phoneSignificantKeys('0810 123 4567')).toEqual([]);
  expect(phoneSignificantKeys('+598 2 123 4567')).toEqual([]);
  expect(phoneSignificantKeys('00598 2 123 4567')).toEqual([]);
  expect(phoneSignificantKeys('341 541-2345')).not.toEqual(phoneSignificantKeys('+54 9 3447 15-412345'));
  expect(phoneSignificantKeys('+54 9 3447 15-412345')).toEqual(['47412345']);
  expect(phoneSignificantKeys('3447412345')).toEqual(['47412345']);
 });
 it('strictComparisonName keeps ñ distinct',()=>{expect(strictComparisonName('Cabañas  X')).toBe('cabañas x');expect(strictComparisonName('Cabanas X')).not.toBe(strictComparisonName('Cabañas X'));expect(strictComparisonName('Café')).toBe('cafe');});
});
