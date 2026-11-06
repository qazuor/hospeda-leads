import {describe,expect,it} from 'vitest';
import {classificationListErrors,displayClassification,normalizeClassifications} from './accountClassification';

describe('normalizeClassifications',()=>{
 it('trims values, removes exact duplicates and absorbs a vertical without subtype',()=>{
  expect(normalizeClassifications({pairs:[{tipo:' Alojamiento ',subtipo:null},{tipo:'Alojamiento',subtipo:' Hotel '},{tipo:'Alojamiento',subtipo:'Hotel'},{tipo:'Gastronomía',subtipo:null}]})).toEqual([{tipo:'Alojamiento',subtipo:'Hotel'},{tipo:'Gastronomía',subtipo:null}]);
 });
 it('keeps different subtypes under the same vertical',()=>{
  expect(normalizeClassifications({pairs:[{tipo:'Alojamiento',subtipo:'Camping'},{tipo:'Alojamiento',subtipo:'Cabaña'}]})).toHaveLength(2);
 });
});

describe('displayClassification',()=>{
 it('uses catalog order and then puts a subtype after the empty subtype',()=>{
  expect(displayClassification({pairs:[{tipo:'Gastronomía',subtipo:'Restaurante'},{tipo:'Alojamiento',subtipo:'Hotel'}],verticalOrder:['Alojamiento','Gastronomía']})).toEqual({tipo:'Alojamiento',subtipo:'Hotel'});
  expect(displayClassification({pairs:[{tipo:'Alojamiento',subtipo:'Hotel'},{tipo:'Alojamiento',subtipo:null}],verticalOrder:['Alojamiento']})).toEqual({tipo:'Alojamiento',subtipo:null});
 });
 it('sorts historical values after catalog values and returns null for no pairs',()=>{
  expect(displayClassification({pairs:[{tipo:'Histórico',subtipo:null},{tipo:'Alojamiento',subtipo:null}],verticalOrder:['Alojamiento']})).toEqual({tipo:'Alojamiento',subtipo:null});
  expect(displayClassification({pairs:[],verticalOrder:[]})).toBeNull();
 });
});

describe('classificationListErrors',()=>{
 const activeCatalog={selectFrom:()=>({select(){return this;},where(){return this;},executeTakeFirst:async()=>({id:'1'})})} as unknown as Parameters<typeof classificationListErrors>[0]['db'];
 it('rejects more than eight classifications',async()=>{
  const pairs=Array.from({length:9},(_,i)=>({tipo:`Vertical ${i}`,subtipo:null}));
  expect(await classificationListErrors({db:activeCatalog,pairs})).toContain('Un negocio puede tener como máximo 8 verticales.');
 });
 it('preserves an existing inactive historical pair without querying its catalog',async()=>{
  const historicalDb={selectFrom:()=>{throw new Error('unchanged historical values bypass catalog validation');}} as unknown as Parameters<typeof classificationListErrors>[0]['db'];
  const pair={tipo:'Vertical histórica',subtipo:'Subtipo anterior'};
  expect(await classificationListErrors({db:historicalDb,pairs:[pair],previous:[pair]})).toEqual([]);
 });
});
