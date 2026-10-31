import {describe,expect,it} from 'vitest';
import {salesMaterialRelevance,salesMaterialVerticalMatch} from './salesMaterialRelevance';

const m=(id:string,verticals:string[])=>({id,verticals});

describe('salesMaterialVerticalMatch',()=>{
 it('tells specific, all and other apart',()=>{
  expect(salesMaterialVerticalMatch({verticals:['Alojamiento'],vertical:'Alojamiento'})).toBe('specific');
  expect(salesMaterialVerticalMatch({verticals:[],vertical:'Alojamiento'})).toBe('all');
  expect(salesMaterialVerticalMatch({verticals:['Gastronomía'],vertical:'Alojamiento'})).toBe('other');
 });
 it('uses the same aliases as message models (singular/plural, accents)',()=>{
  expect(salesMaterialVerticalMatch({verticals:['Alojamientos'],vertical:'Alojamiento'})).toBe('specific');
  expect(salesMaterialVerticalMatch({verticals:['Gastronomia'],vertical:'Gastronomía'})).toBe('specific');
 });
 it('has no match without a context vertical',()=>{
  expect(salesMaterialVerticalMatch({verticals:['Alojamiento'],vertical:null})).toBeNull();
  expect(salesMaterialVerticalMatch({verticals:['Alojamiento'],vertical:'  '})).toBeNull();
 });
});

describe('salesMaterialRelevance',()=>{
 it('orders specific, then all, then other, keeping the original order inside each group',()=>{
  const list=[m('o1',['Gastronomía']),m('a1',[]),m('s1',['Alojamiento']),m('o2',['Editor']),m('s2',['Gastronomía','Alojamiento']),m('a2',[])];
  const result=salesMaterialRelevance({materials:list,vertical:'Alojamiento'});
  expect(result.map(r=>r.id)).toEqual(['s1','s2','a1','a2','o1','o2']);
  expect(result.map(r=>r.verticalMatch)).toEqual(['specific','specific','all','all','other','other']);
 });
 it('keeps the original order and null matches without a vertical',()=>{
  const list=[m('o1',['Gastronomía']),m('a1',[])];
  expect(salesMaterialRelevance({materials:list,vertical:null})).toEqual([{...list[0],verticalMatch:null},{...list[1],verticalMatch:null}]);
 });
 it('returns everything (as other) when nothing applies: the picker shows it all',()=>{
  const result=salesMaterialRelevance({materials:[m('o1',['Gastronomía'])],vertical:'Alojamiento'});
  expect(result).toEqual([{id:'o1',verticals:['Gastronomía'],verticalMatch:'other'}]);
 });
});
