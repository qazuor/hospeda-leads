import {describe,expect,it,vi} from 'vitest';
import {UploadCancelled,putWithProgress,uploadSalesMaterialFile} from './salesMaterialUpload';

class FakeXhr{
 status=0;headers:Record<string,string>={};method='';url='';body:unknown=null;aborted=false;
 upload:{onprogress:((event:ProgressEvent)=>void)|null}={onprogress:null};
 onload:(()=>void)|null=null;onerror:(()=>void)|null=null;onabort:(()=>void)|null=null;ontimeout:(()=>void)|null=null;
 open(method:string,url:string){this.method=method;this.url=url;}
 setRequestHeader(name:string,value:string){this.headers[name]=value;}
 send(body:unknown){this.body=body;}
 abort(){this.aborted=true;this.onabort?.();}
}
const make=()=>{const xhr=new FakeXhr();return {xhr,createXhr:()=>xhr as unknown as XMLHttpRequest};};
describe('putWithProgress',()=>{
 it('PUTs the file with its signed Content-Type and reports progress',async()=>{
  const {xhr,createXhr}=make();const progress=vi.fn();const file=new Blob(['hola']);
  const done=putWithProgress({url:'https://r2/put',file,contentType:'application/pdf',onProgress:progress,createXhr});
  expect(xhr.method).toBe('PUT');expect(xhr.url).toBe('https://r2/put');expect(xhr.headers).toEqual({'Content-Type':'application/pdf'});expect(xhr.body).toBe(file);
  xhr.upload.onprogress?.({loaded:2,total:4,lengthComputable:true} as ProgressEvent);expect(progress).toHaveBeenCalledWith({loaded:2,total:4});
  xhr.status=200;xhr.onload?.();await expect(done).resolves.toBeUndefined();
 });
 it('rejects with a retryable message on HTTP errors and network failures',async()=>{
  let {xhr,createXhr}=make();let done=putWithProgress({url:'u',file:new Blob(['x']),contentType:'image/png',createXhr});xhr.status=403;xhr.onload?.();
  await expect(done).rejects.toThrow('El almacenamiento rechazó el archivo (403)');
  ({xhr,createXhr}=make());done=putWithProgress({url:'u',file:new Blob(['x']),contentType:'image/png',createXhr});xhr.onerror?.();
  await expect(done).rejects.toThrow('Se cortó la subida');
 });
 it('aborts on the signal and reports a cancellation, not an error',async()=>{
  const {xhr,createXhr}=make();const controller=new AbortController();
  const done=putWithProgress({url:'u',file:new Blob(['x']),contentType:'image/png',signal:controller.signal,createXhr});
  controller.abort();expect(xhr.aborted).toBe(true);await expect(done).rejects.toBeInstanceOf(UploadCancelled);
  await expect(putWithProgress({url:'u',file:new Blob(['x']),contentType:'image/png',signal:controller.signal,createXhr})).rejects.toBeInstanceOf(UploadCancelled);
 });
});
describe('uploadSalesMaterialFile',()=>{
 it('declares the inferred MIME type, uploads and returns the upload id',async()=>{
  const request=vi.fn(async()=>({uploadId:'up-1',putUrl:'https://r2/put',headers:{'Content-Type':'audio/mp4' as const},expiresAt:new Date()}));
  const put=vi.fn(async()=>undefined);
  const file=new File(['abc'],'nota.m4a',{type:'audio/x-m4a'});
  await expect(uploadSalesMaterialFile({file,purpose:'file',materialId:'m-1',request,put})).resolves.toBe('up-1');
  expect(request).toHaveBeenCalledWith({purpose:'file',fileName:'nota.m4a',mimeType:'audio/mp4',byteSize:3,materialId:'m-1'});
  expect(put).toHaveBeenCalledWith(expect.objectContaining({url:'https://r2/put',file,contentType:'audio/mp4'}));
 });
 it('refuses types outside the whitelist without calling the API',async()=>{
  const request=vi.fn();
  await expect(uploadSalesMaterialFile({file:new File(['x'],'a.exe',{type:'application/octet-stream'}),purpose:'file',materialId:'m',request,put:vi.fn()})).rejects.toThrow('Ese tipo de archivo no está permitido.');
  expect(request).not.toHaveBeenCalled();
 });
});
