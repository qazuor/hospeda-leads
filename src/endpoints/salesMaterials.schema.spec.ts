import {describe,expect,it} from 'vitest';
import {salesMaterialCoverUrl,salesMaterialFileUrl,salesMaterialListQuery,salesMaterialMutation,salesMaterialUploadInput} from './salesMaterials.schema';

const id='0b4fd1c8-0a5e-4f2b-9d1e-7d4b8c6a1f20',uploadId='5c0c1f86-2b1b-4b55-8d55-2a8f7f6b9e11';
describe('salesMaterialMutation',()=>{
 it('accepts each admin action and normalizes text and categories',()=>{
  const create=salesMaterialMutation.parse({action:'create',id,title:'  Folleto  ',description:' Tarifas ',kind:'deliverable',source:'file',categoryIds:['3','3','4'],version:{uploadId}});
  expect(create).toMatchObject({title:'Folleto',description:'Tarifas',categoryIds:['3','4']});
  for(const input of [{action:'update',id,revision:2,title:'Folleto',description:'',kind:'internal',categoryIds:[]},{action:'version',id,revision:2,version:{url:'https://example.com/v2'}},{action:'cover',id,revision:2,uploadId:null},{action:'archive',id,revision:2},{action:'restore',id,revision:3},{action:'category_create',name:'Folletos'},{action:'category_update',id:'5',name:'Videos',active:false}])
   expect(salesMaterialMutation.safeParse(input).success,input.action).toBe(true);
 });
 it('rejects short titles, unknown kinds, http URLs, mixed version sources and missing revisions',()=>{
  const bad=[
   {action:'create',id,title:'ab',description:'',kind:'deliverable',source:'url',categoryIds:[],version:{url:'https://example.com'}},
   {action:'create',id,title:'Folleto',description:'',kind:'public',source:'url',categoryIds:[],version:{url:'https://example.com'}},
   {action:'version',id,revision:1,version:{url:'http://example.com'}},
   {action:'version',id,revision:1,version:{url:'https://example.com',uploadId}},
   {action:'archive',id},
   {action:'category_create',name:'x'},
   {action:'delete',id,revision:1}
  ];
  for(const input of bad)expect(salesMaterialMutation.safeParse(input).success,JSON.stringify(input)).toBe(false);
  const error=salesMaterialMutation.safeParse({action:'version',id,revision:1,version:{url:'http://example.com'}});
  expect(error.success?'':JSON.stringify(error.error.issues)).toContain('Solo se aceptan enlaces https://.');
 });
});
describe('salesMaterialUploadInput',()=>{
 it('checks the whitelist, extension and size before asking for a URL',()=>{
  expect(salesMaterialUploadInput.safeParse({purpose:'file',fileName:'a.pdf',mimeType:'application/pdf',byteSize:10,materialId:id}).success).toBe(true);
  expect(salesMaterialUploadInput.safeParse({purpose:'file',fileName:'a.html',mimeType:'text/html',byteSize:10,materialId:id}).success).toBe(false);
  const mismatch=salesMaterialUploadInput.safeParse({purpose:'file',fileName:'a.png',mimeType:'application/pdf',byteSize:10,materialId:id});
  expect(mismatch.success?'':mismatch.error.issues[0].message).toBe('La extensión del archivo no coincide con su tipo.');
  expect(salesMaterialUploadInput.safeParse({purpose:'cover',fileName:'a.mp4',mimeType:'video/mp4',byteSize:10,materialId:id}).success).toBe(false);
  expect(salesMaterialUploadInput.safeParse({purpose:'file',fileName:'a.mp4',mimeType:'video/mp4',byteSize:524288001,materialId:id}).success).toBe(false);
  expect(salesMaterialUploadInput.safeParse({purpose:'file',fileName:'a.pdf',mimeType:'application/pdf',byteSize:10}).success).toBe(false);
 });
});
describe('list query and URLs',()=>{
 it('defaults filters and keeps includeArchived explicit',()=>{
  expect(salesMaterialListQuery.parse({})).toEqual({search:'',includeArchived:'0'});
  expect(salesMaterialListQuery.safeParse({categoryId:'abc'}).success).toBe(false);
  expect(salesMaterialListQuery.safeParse({kind:'internal',includeArchived:'1'}).success).toBe(true);
 });
 it('builds same-origin file and cover URLs',()=>{
  expect(salesMaterialFileUrl({versionId:id})).toBe(`/_api/sales_materials/file?versionId=${id}&disposition=inline`);
  expect(salesMaterialFileUrl({versionId:id,disposition:'attachment'})).toContain('disposition=attachment');
  expect(salesMaterialCoverUrl({materialId:id,revision:4})).toBe(`/_api/sales_materials/cover?materialId=${id}&r=4`);
 });
});
