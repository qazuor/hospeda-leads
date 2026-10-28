import {describe,expect,it,vi} from 'vitest';
const pdfjs=vi.hoisted(()=>({destroy:vi.fn(async()=>undefined),getDocument:vi.fn()}));
vi.mock('pdfjs-dist',()=>({getDocument:pdfjs.getDocument,GlobalWorkerOptions:{}}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url',()=>({default:'/worker.js'}));
const {renderPdfCover}=await import('./pdfThumbnail');
describe('renderPdfCover',()=>{
 it('destroys the loading task when the signal aborts while pdf.js is still reading',async()=>{
  pdfjs.getDocument.mockReturnValue({promise:new Promise(()=>undefined),destroy:pdfjs.destroy});
  const controller=new AbortController();void renderPdfCover({source:'/_api/file',maxSize:1200,signal:controller.signal});
  await vi.waitFor(()=>expect(pdfjs.getDocument).toHaveBeenCalledWith({url:'/_api/file'}));
  controller.abort(new Error('La portada tardó demasiado en generarse.'));
  // pdf.js rejects its own promise once destroyed; this fake never settles, so the destroy call is what shows the cancellation.
  expect(pdfjs.destroy).toHaveBeenCalled();
 });
 it('never opens a document for an already aborted signal',async()=>{
  pdfjs.getDocument.mockClear();const controller=new AbortController();controller.abort();
  await expect(renderPdfCover({source:'/_api/file',maxSize:1200,signal:controller.signal})).rejects.toBeDefined();expect(pdfjs.getDocument).not.toHaveBeenCalled();
 });
});
