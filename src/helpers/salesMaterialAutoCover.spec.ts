import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {SalesMaterial} from '../endpoints/salesMaterials.schema';
import {AUTO_COVER_FILE_NAME,autoCoverFormat,encodeAutoCover,generateAutoCover,needsAutoCover,saveAutoCover,saveMissingAutoCover} from './salesMaterialAutoCover';

const pdf=vi.hoisted(()=>({render:vi.fn()}));
// pdf.js is mocked: the helper only reaches it through the lazily imported pdfThumbnail module.
vi.mock('./pdfThumbnail',()=>({renderPdfCover:pdf.render}));
const version={id:'v-1',version:1,url:null,fileName:'a.pdf',mimeType:'application/pdf',byteSize:5000,actorEmail:'a@example.com',createdAt:new Date()};
const material=(over:Partial<SalesMaterial>={}):SalesMaterial=>({id:'m-1',title:'Folleto',description:'',kind:'deliverable',source:'file',status:'active',archivedAt:null,archivedByEmail:null,revision:4,createdByEmail:'a@example.com',createdAt:new Date(),updatedAt:new Date(),hasCover:false,coverSource:null,categories:[],currentVersion:version,...over});
let sizes:number[]=[];const qualities:number[]=[];const drawn:number[][]=[];
beforeEach(()=>{
 sizes=[];qualities.length=0;drawn.length=0;
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(this:HTMLCanvasElement){const canvas=this;return {fillRect:vi.fn(),drawImage:vi.fn(()=>drawn.push([canvas.width,canvas.height])),fillStyle:''} as unknown as CanvasRenderingContext2D;} as never);
 vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(function(callback:BlobCallback,_type?:string,quality?:number){qualities.push(quality!);callback(new Blob([new Uint8Array(sizes.shift()??1000)],{type:'image/jpeg'}));});
});
afterEach(()=>{vi.restoreAllMocks();pdf.render.mockReset();});
describe('autoCoverFormat and needsAutoCover',()=>{
 it('covers PDF, video and images over 1 MB; small images, audio, office and links get none',()=>{
  expect(autoCoverFormat({mimeType:'application/pdf',byteSize:10})).toBe('pdf');expect(autoCoverFormat({mimeType:'video/mp4',byteSize:10})).toBe('video');
  expect(autoCoverFormat({mimeType:'image/png',byteSize:1048577})).toBe('image');expect(autoCoverFormat({mimeType:'image/png',byteSize:1048576})).toBeNull();
  for(const mimeType of ['audio/mpeg','application/msword',null])expect(autoCoverFormat({mimeType,byteSize:10})).toBeNull();
 });
 it('only for active file material without a stored cover',()=>{
  expect(needsAutoCover({material:material()})).toBe(true);
  expect(needsAutoCover({material:material({coverSource:'manual',hasCover:true})})).toBe(false);expect(needsAutoCover({material:material({coverSource:'auto',hasCover:true})})).toBe(false);
  expect(needsAutoCover({material:material({status:'archived'})})).toBe(false);expect(needsAutoCover({material:material({currentVersion:null})})).toBe(false);
  expect(needsAutoCover({material:material({source:'url',currentVersion:{...version,url:'https://x.example',mimeType:null}})})).toBe(false);
 });
});
describe('encodeAutoCover',()=>{
 it('scales to 1200 px on the longest side and encodes a JPEG cover',async()=>{
  const file=await encodeAutoCover({width:2400,height:1200} as unknown as HTMLCanvasElement);
  expect(file.name).toBe(AUTO_COVER_FILE_NAME);expect(file.type).toBe('image/jpeg');expect(drawn[0]).toEqual([1200,600]);expect(qualities).toEqual([0.82]);
 });
 it('lowers the quality, then the size, until it fits in 1 MB, and fails when it never does',async()=>{
  sizes=[2000000,2000000,900000];const file=await encodeAutoCover({width:800,height:600} as unknown as HTMLCanvasElement);
  expect(file.size).toBe(900000);expect(qualities).toEqual([0.82,0.65,0.82]);expect(drawn).toEqual([[800,600],[400,300]]);
  sizes=Array(8).fill(2000000);await expect(encodeAutoCover({width:800,height:600} as unknown as HTMLCanvasElement)).rejects.toThrow('supera el límite');
 });
});
describe('generateAutoCover',()=>{
 it('renders the first PDF page through the lazily loaded pdf.js module',async()=>{
  pdf.render.mockResolvedValue({width:600,height:800});const source=new Blob(['%PDF-']);
  const file=await generateAutoCover({format:'pdf',source:{file:source}});
  expect(pdf.render).toHaveBeenCalledWith({source,maxSize:1200});expect(file.type).toBe('image/jpeg');
 });
 it('rejects when pdf.js cannot read the file',async()=>{pdf.render.mockRejectedValue(new Error('Invalid PDF structure'));await expect(generateAutoCover({format:'pdf',source:{url:'/x'}})).rejects.toThrow('Invalid PDF structure');});
});
describe('saveAutoCover',()=>{
 it('uploads the generated cover through the cover path and marks it automatic',async()=>{
  const file=new File(['x'],AUTO_COVER_FILE_NAME,{type:'image/jpeg'});const generate=vi.fn().mockResolvedValue(file),upload=vi.fn().mockResolvedValue('up-9'),post=vi.fn().mockResolvedValue({ok:true,revision:5});
  const result=await saveAutoCover({materialId:'m-1',revision:4,format:'video',source:{url:'/v'},generate,upload,post});
  expect(result).toEqual({ok:true,revision:5});expect(upload).toHaveBeenCalledWith({file,purpose:'cover',materialId:'m-1'});expect(post).toHaveBeenCalledWith({action:'cover',id:'m-1',revision:4,uploadId:'up-9',auto:true});
 });
 it('never throws: a failed generation or a rejected cover falls back to the placeholder',async()=>{
  const upload=vi.fn(),post=vi.fn();
  expect(await saveAutoCover({materialId:'m-1',revision:4,format:'pdf',source:{url:'/x'},generate:vi.fn().mockRejectedValue(new Error('Canvas unavailable')),upload,post})).toEqual({ok:false,error:'Canvas unavailable'});
  expect(upload).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
  const rejected=await saveAutoCover({materialId:'m-1',revision:4,format:'pdf',source:{url:'/x'},generate:vi.fn().mockResolvedValue(new File(['x'],'a.jpg')),upload:vi.fn().mockResolvedValue('u'),post:vi.fn().mockRejectedValue(new Error('El material ya tiene una portada cargada a mano'))});
  expect(rejected.ok).toBe(false);
 });
});
describe('saveMissingAutoCover',()=>{
 it('reads the stored version through the same-origin file URL and skips material that does not need a cover',async()=>{
  const save=vi.fn().mockResolvedValue({ok:true,revision:5});
  expect(await saveMissingAutoCover({material:material(),save})).toEqual({ok:true,revision:5});
  expect(save).toHaveBeenCalledWith({materialId:'m-1',revision:4,format:'pdf',source:{url:'/_api/sales_materials/file?versionId=v-1&disposition=inline'}});
  expect(await saveMissingAutoCover({material:material({coverSource:'manual',hasCover:true}),save})).toEqual({ok:false});expect(save).toHaveBeenCalledTimes(1);
 });
});
