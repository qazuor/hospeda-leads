import {describe,expect,it} from 'vitest';
import {catalogCityNotice,cityKey,cityToSave,filterCityOptions,findCityRow,matchCatalogCity} from './catalogCity';

const cities=['San José','Chajarí','Peña','Colón','Concepción del Uruguay'];

describe('matchCatalogCity (spec 104 §3.12)',()=>{
 it('matches the catalog city ignoring accents and case',()=>{
  expect(matchCatalogCity({name:'San Jose',cities})).toBe('San José');
  expect(matchCatalogCity({name:'CHAJARI',cities})).toBe('Chajarí');
  expect(matchCatalogCity({name:'colon',cities})).toBe('Colón');
 });
 it('keeps ñ distinct from n',()=>{
  expect(matchCatalogCity({name:'Pena',cities})).toBeNull();
  expect(matchCatalogCity({name:'PEÑA',cities})).toBe('Peña');
 });
 it('ignores extra spaces',()=>{
  expect(matchCatalogCity({name:'  concepcion   del  uruguay ',cities})).toBe('Concepción del Uruguay');
 });
 it('returns null for an unknown or empty city and never matches by similarity',()=>{
  expect(matchCatalogCity({name:'Federacion',cities})).toBeNull();
  expect(matchCatalogCity({name:'San Jos',cities})).toBeNull();
  expect(matchCatalogCity({name:'  ',cities})).toBeNull();
 });
 it('cityKey is the comparison form',()=>{
  expect(cityKey('  San   JOSÉ ')).toBe('san jose');
 });
});

describe('filterCityOptions',()=>{
 it('suggests catalog cities containing the typed text, accent-insensitive',()=>{
  expect(filterCityOptions({search:'jose',cities})).toEqual(['San José']);
  expect(filterCityOptions({search:'co',cities})).toEqual(['Colón','Concepción del Uruguay']);
  expect(filterCityOptions({search:'pena',cities})).toEqual([]);
  expect(filterCityOptions({search:'',cities})).toEqual(cities);
 });
});

describe('cityToSave',()=>{
 it('uses the catalog spelling only when it differs from what was typed',()=>{
  expect(cityToSave({name:' San Jose ',cities})).toEqual({city:'San José',adjusted:true});
  expect(cityToSave({name:'San José',cities})).toEqual({city:'San José',adjusted:false});
  expect(cityToSave({name:'Pena',cities})).toEqual({city:'Pena',adjusted:false});
  expect(cityToSave({name:'  ',cities})).toEqual({city:null,adjusted:false});
  expect(catalogCityNotice('San José')).toBe('Se guardó como «San José», la ciudad de la lista.');
 });
});

describe('existing duplicates in the catalog (spec 104 §3.12, review B2)',()=>{
 const dupes=['San Jose','San José'];
 it('a correctly typed name keeps its exact spelling even when a variant exists',()=>{
  expect(matchCatalogCity({name:'San José',cities:dupes})).toBe('San José');
  expect(matchCatalogCity({name:' San Jose ',cities:dupes})).toBe('San Jose');
  expect(cityToSave({name:'San José',cities:dupes})).toEqual({city:'San José',adjusted:false});
  expect(cityToSave({name:'San Jose',cities:[...dupes].reverse()})).toEqual({city:'San Jose',adjusted:false});
 });
 it('findCityRow prefers an active row, and the exact spelling among rows of the same state',()=>{
  const rows=[{id:1,name:'San Jose',active:true},{id:2,name:'San José',active:false}];
  expect(findCityRow({name:'San José',rows})?.id).toBe(1);
  expect(findCityRow({name:'SAN JOSE',rows})?.id).toBe(1);
  const inactive=[{id:1,name:'Ubajay',active:false},{id:2,name:'Ubajáy',active:false}];
  expect(findCityRow({name:'Ubajáy',rows:inactive})?.id).toBe(2);
  const active=[{id:1,name:'Ubajay',active:true},{id:2,name:'Ubajáy',active:true}];
  expect(findCityRow({name:'Ubajáy',rows:active})?.id).toBe(2);
  expect(findCityRow({name:'Pena',rows:[{id:3,name:'Peña',active:true}]})).toBeNull();
  expect(findCityRow({name:'  ',rows:active})).toBeNull();
 });
});
