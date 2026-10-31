import {describe,expect,it} from 'vitest';
import type {SalesMaterial} from '../endpoints/salesMaterials.schema';
import {EMPTY_SALES_MATERIAL_FILTERS,filterSalesMaterials,groupSalesMaterials,hasSalesMaterialFilters,salesMaterialQuery} from './salesMaterialGroups';

const cat=(id:string,name:string)=>({id,name,active:true});
const m=(id:string,categories:SalesMaterial['categories'],over:Partial<SalesMaterial>={}):SalesMaterial=>({id,title:id,description:'',kind:'deliverable',source:'file',status:'active',archivedAt:null,archivedByEmail:null,revision:1,createdByEmail:'a@example.com',createdAt:new Date(),updatedAt:new Date(),verticals:[],hasCover:false,coverSource:null,categories,currentVersion:{id:'v-'+id,version:1,url:null,fileName:'a.pdf',mimeType:'application/pdf',byteSize:10,actorEmail:'a@example.com',createdAt:new Date()},...over});
const folletos=cat('1','Folletos'),precios=cat('2','Precios'),videos=cat('3','Videos');
const summary=(groups:ReturnType<typeof groupSalesMaterials>)=>groups.map(g=>[g.name,g.materials.map(x=>x.id)]);
describe('groupSalesMaterials',()=>{
 it('keeps the category order, puts «Sin categoría» last and leaves empty categories out',()=>{
  expect(summary(groupSalesMaterials({materials:[m('a',[]),m('b',[videos]),m('c',[folletos])],categories:[folletos,precios,videos]}))).toEqual([['Folletos',['c']],['Videos',['b']],['Sin categoría',['a']]]);
 });
 it('lists a material with several categories under each of them',()=>{
  expect(summary(groupSalesMaterials({materials:[m('a',[folletos,precios]),m('b',[precios])],categories:[folletos,precios]}))).toEqual([['Folletos',['a']],['Precios',['a','b']]]);
 });
 it('with a category filter shows only the selected sections and no «Sin categoría»',()=>{
  expect(summary(groupSalesMaterials({materials:[m('a',[folletos,precios]),m('b',[precios])],categories:[folletos,precios],onlyCategoryIds:['2']}))).toEqual([['Precios',['a','b']]]);
 });
 it('places categories the list does not know (inactive for sellers) after the known ones, by name',()=>{
  expect(summary(groupSalesMaterials({materials:[m('a',[cat('9','Zeta')]),m('b',[cat('8','Alfa')]),m('c',[folletos])],categories:[folletos]}))).toEqual([['Folletos',['c']],['Alfa',['b']],['Zeta',['a']]]);
 });
 it('returns no sections for an empty result',()=>{expect(groupSalesMaterials({materials:[],categories:[folletos]})).toEqual([]);});
});
describe('filters',()=>{
 it('maps the status to the API query without changing its contract',()=>{
  const f=EMPTY_SALES_MATERIAL_FILTERS;
  expect(salesMaterialQuery({filters:f,search:'',admin:true})).toEqual({search:'',categoryIds:undefined,kind:undefined,includeArchived:false});
  expect(salesMaterialQuery({filters:{...f,status:'internal',categoryIds:['3','1']},search:'x',admin:false})).toEqual({search:'x',categoryIds:['1','3'],kind:'internal',includeArchived:false});
  // «Archivados» asks the server for archived material only, so the 500-row limit is not spent on active material.
  expect(salesMaterialQuery({filters:{...f,status:'archived'},search:'',admin:true})).toEqual({search:'',categoryIds:undefined,kind:undefined,includeArchived:false,status:'archived'});
  expect(salesMaterialQuery({filters:{...f,status:'archived'},search:'',admin:false})).not.toHaveProperty('status');
 });
 it('filters by format and archived only on the client',()=>{
  const list=[m('pdf',[]),m('link',[],{source:'url',currentVersion:{id:'v',version:1,url:'https://x.example',fileName:null,mimeType:null,byteSize:null,actorEmail:'a',createdAt:new Date()}}),m('old',[],{status:'archived',archivedAt:new Date()})];
  expect(filterSalesMaterials({materials:list,filters:{...EMPTY_SALES_MATERIAL_FILTERS,format:'link'}}).map(x=>x.id)).toEqual(['link']);
  expect(filterSalesMaterials({materials:list,filters:{...EMPTY_SALES_MATERIAL_FILTERS,status:'archived'}}).map(x=>x.id)).toEqual(['old']);
 });
 it('restates status, kind and categories, so a previous answer kept while loading never shows mismatched cards',()=>{
  const list=[m('deliv',[folletos]),m('intern',[precios],{kind:'internal'}),m('old',[folletos],{status:'archived',archivedAt:new Date()})];
  const ids=(over:Partial<typeof EMPTY_SALES_MATERIAL_FILTERS>)=>filterSalesMaterials({materials:list,filters:{...EMPTY_SALES_MATERIAL_FILTERS,...over}}).map(x=>x.id);
  expect(ids({})).toEqual(['deliv','intern']);
  expect(ids({status:'deliverable'})).toEqual(['deliv']);expect(ids({status:'internal'})).toEqual(['intern']);
  expect(ids({status:'archived'})).toEqual(['old']);expect(ids({categoryIds:['2']})).toEqual(['intern']);
 });
 it('spec 102: the vertical filter keeps material of that vertical (aliases included) and material for all verticals',()=>{
  const list=[m('own',[],{verticals:['Alojamientos']}),m('all',[]),m('other',[],{verticals:['Gastronomía']})];
  expect(filterSalesMaterials({materials:list,filters:{...EMPTY_SALES_MATERIAL_FILTERS,vertical:'Alojamiento'}}).map(x=>x.id)).toEqual(['own','all']);
 });
 it('knows when a filter is active',()=>{
  expect(hasSalesMaterialFilters(EMPTY_SALES_MATERIAL_FILTERS)).toBe(false);expect(hasSalesMaterialFilters({...EMPTY_SALES_MATERIAL_FILTERS,search:'  '})).toBe(false);
  for(const over of [{search:'a'},{categoryIds:['1']},{format:'pdf' as const},{status:'internal' as const},{vertical:'Alojamiento'}])expect(hasSalesMaterialFilters({...EMPTY_SALES_MATERIAL_FILTERS,...over})).toBe(true);
 });
});
