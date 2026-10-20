import {describe,it,expect} from 'vitest';
import {normalizeField,comparisonName,matchAccounts,phoneSignificantKeys} from './dataNormalization';
describe('conservative normalization',()=>{
 it('compares names without changing originals',()=>{expect(comparisonName('  Cabañas   Lihuén ')).toBe('cabanas lihuen');expect(normalizeField('nombre',' Lihuén ').original).toBe(' Lihuén ');});
 it('handles international and Argentine national phones without inventing mobile markers',()=>{expect(normalizeField('telefono','+54 9 3442 12-3456').normalized).toBe('+5493442123456');expect(normalizeField('telefono','03442 123456').normalized).toBe('+543442123456');expect(normalizeField('telefono','3442 15 123456').validity).toBe('ambiguous');expect(normalizeField('telefono','123456').normalized).toBeNull();expect(normalizeField('telefono','123456 / 987654').validity).toBe('ambiguous');});
 it('preserves email local case and ambiguous URL originals',()=>{expect(normalizeField('email','User@EXAMPLE.COM').normalized).toBe('User@example.com');expect(normalizeField('email','a@x.com;b@x.com').validity).toBe('invalid');expect(normalizeField('sitioWeb','example.com').validity).toBe('ambiguous');expect(normalizeField('sitioWeb','javascript:alert(1)').validity).toBe('invalid');});
 it('shared channels never establish duplicate identity',()=>{const a={id:'1',nombre:'Hotel A',ciudad:'Colón',telefono:'+543442123456',email:null,sitioWeb:null,updatedAt:new Date()};expect(matchAccounts({nombre:'Hotel B',ciudad:'Colón',telefono:'03442123456'},[a])[0].kind).toBe('shared_person_or_related');expect(matchAccounts({nombre:'Hotel A',ciudad:'Colon'},[a])[0].kind).toBe('duplicate_candidate');expect(matchAccounts({nombre:'Hotel A'},[{...a,ciudad:null}])).toEqual([]);});
 it('matches phones by significant digits ignoring 54, 9, 0 and local 15',()=>{
  const row={id:'1',nombre:'Hotel A',ciudad:'Colón',telefono:'+54 9 3447 15-412345',email:null,sitioWeb:null,updatedAt:new Date()};
  for(const phone of ['3447412345','03447 412345','+54 3447 412345','(03447) 15-412345'])expect(matchAccounts({nombre:'Otro',telefono:phone},[row])[0]?.reasons,phone).toContain('Teléfono parecido');
  expect(matchAccounts({nombre:'Otro',telefono:'3447412399'},[row])).toEqual([]);
  expect(phoneSignificantKeys('412345')).toEqual([]);
  expect(phoneSignificantKeys('15 41234567')).toContain('41234567');
  expect(phoneSignificantKeys('llamar mañana')).toEqual([]);
 });
});
