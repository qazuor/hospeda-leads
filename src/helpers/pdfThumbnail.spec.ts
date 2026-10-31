import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const pdfjs=vi.hoisted(()=>({destroy:vi.fn(async()=>undefined),getDocument:vi.fn()}));
vi.mock('pdfjs-dist',()=>({getDocument:pdfjs.getDocument,GlobalWorkerOptions:{},version:'6.4.299'}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url',()=>({default:'/worker.js'}));
const {renderPdfCover,renderPdfThumbnail,PDFJS_ASSET_OPTIONS}=await import('./pdfThumbnail');
describe('pdf.js options (spec 102)',()=>{
 it('points pdf.js at its own wasm decoders, ICC profiles, CMaps and standard fonts, served by us under a versioned path',()=>{
  const base=location.origin+'/assets/pdfjs-6.4.299/';
  expect(PDFJS_ASSET_OPTIONS).toEqual({wasmUrl:base+'wasm/',iccUrl:base+'iccs/',cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/'});
 });
 it('reads a stored PDF by ranges (first page only) and a picked file from memory, both with the assets',async()=>{
  pdfjs.getDocument.mockReset();pdfjs.getDocument.mockReturnValue({promise:Promise.reject(new Error('stop')),destroy:pdfjs.destroy});
  await expect(renderPdfCover({source:'/_api/file',maxSize:1200})).rejects.toThrow('stop');
  expect(pdfjs.getDocument).toHaveBeenLastCalledWith({url:'/_api/file',disableStream:true,disableAutoFetch:true,...PDFJS_ASSET_OPTIONS});
  const blob=new Blob(['%PDF-']);(blob as Blob&{arrayBuffer:()=>Promise<ArrayBuffer>}).arrayBuffer=async()=>new TextEncoder().encode('%PDF-').buffer as ArrayBuffer;
  await expect(renderPdfCover({source:blob,maxSize:1200})).rejects.toThrow('stop');
  expect(pdfjs.getDocument).toHaveBeenLastCalledWith({data:expect.any(Uint8Array),...PDFJS_ASSET_OPTIONS});
 });
});
describe('renderPdfCover',()=>{
 it('destroys the loading task when the signal aborts while pdf.js is still reading',async()=>{
  pdfjs.getDocument.mockReturnValue({promise:new Promise(()=>undefined),destroy:pdfjs.destroy});
  const controller=new AbortController();void renderPdfCover({source:'/_api/file',maxSize:1200,signal:controller.signal});
  await vi.waitFor(()=>expect(pdfjs.getDocument).toHaveBeenCalledWith(expect.objectContaining({url:'/_api/file'})));
  controller.abort(new Error('La portada tardó demasiado en generarse.'));
  // pdf.js rejects its own promise once destroyed; this fake never settles, so the destroy call is what shows the cancellation.
  expect(pdfjs.destroy).toHaveBeenCalled();
 });
 it('never opens a document for an already aborted signal',async()=>{
  pdfjs.getDocument.mockClear();const controller=new AbortController();controller.abort();
  await expect(renderPdfCover({source:'/_api/file',maxSize:1200,signal:controller.signal})).rejects.toBeDefined();expect(pdfjs.getDocument).not.toHaveBeenCalled();
 });
});
describe('cancellation keeps the abort reason (spec 102 review)',()=>{
 // pdf.js rejects the pending render with its own RenderingCancelledException once `cancel()` runs, before our own aborted check.
 const cancelled=()=>Object.assign(new Error('Rendering cancelled, page 1'),{name:'RenderingCancelledException'});
 const stuckRender=()=>{
  let reject!:(e:unknown)=>void;const promise=new Promise<void>((_r,rj)=>{reject=rj});
  const page={getViewport:({scale}:{scale:number})=>({width:400*scale,height:500*scale}),render:vi.fn(()=>({promise,cancel:vi.fn(()=>reject(cancelled()))}))};
  pdfjs.getDocument.mockReturnValue({promise:Promise.resolve({getPage:async()=>page}),destroy:pdfjs.destroy});return page;
 };
 beforeEach(()=>{vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({fillRect:vi.fn(),fillStyle:''} as unknown as CanvasRenderingContext2D);});
 afterEach(()=>vi.restoreAllMocks());
 it('renderPdfCover rejects with the timeout reason, not with the pdf.js cancellation',async()=>{
  const page=stuckRender();const controller=new AbortController();
  const run=renderPdfCover({source:'/_api/file',maxSize:1200,signal:controller.signal});
  await vi.waitFor(()=>expect(page.render).toHaveBeenCalled());
  controller.abort(new Error('La portada tardó demasiado.'));
  await expect(run).rejects.toThrow('La portada tardó demasiado.');
 });
 it('renderPdfCover rejects with the reason when the destroyed loading task rejects first',async()=>{
  let reject!:(e:unknown)=>void;pdfjs.getDocument.mockReturnValue({promise:new Promise((_r,rj)=>{reject=rj}),destroy:vi.fn(async()=>{reject(Object.assign(new Error('Worker was destroyed'),{name:'AbortException'}))})});
  const controller=new AbortController();const run=renderPdfCover({source:'/_api/file',maxSize:1200,signal:controller.signal});
  await vi.waitFor(()=>expect(pdfjs.getDocument).toHaveBeenCalled());controller.abort(new Error('La portada tardó demasiado.'));
  await expect(run).rejects.toThrow('La portada tardó demasiado.');
 });
 it('renderPdfThumbnail rejects with an AbortError, not with the pdf.js cancellation',async()=>{
  const page=stuckRender();const controller=new AbortController();
  const blob=new Blob(['%PDF-']);(blob as Blob&{arrayBuffer:()=>Promise<ArrayBuffer>}).arrayBuffer=async()=>new TextEncoder().encode('%PDF-').buffer as ArrayBuffer;
  const run=renderPdfThumbnail(blob,controller.signal);
  await vi.waitFor(()=>expect(page.render).toHaveBeenCalled());controller.abort();
  await expect(run).rejects.toMatchObject({name:'AbortError'});
 });
});
