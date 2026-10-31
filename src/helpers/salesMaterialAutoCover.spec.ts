import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {SalesMaterial} from '../endpoints/salesMaterials.schema';
import {AUTO_COVER_FILE_NAME,AUTO_COVER_MAX_PDF_BYTES,AUTO_COVER_RELOAD_REASON,autoCoverFailure,autoCoverFormat,autoCoverPlan,encodeAutoCover,failedAutoCoverIds,generateAutoCover,loadImage,needsAutoCover,saveAutoCover,saveMissingAutoCover,videoFrame,type AutoCoverRenderer} from './salesMaterialAutoCover';

const pdf=vi.hoisted(()=>({render:vi.fn()}));
// pdf.js is mocked: the helper only reaches it through the lazily imported pdfThumbnail module.
vi.mock('./pdfThumbnail',()=>({renderPdfCover:pdf.render}));
const version={id:'v-1',version:1,url:null,fileName:'a.pdf',mimeType:'application/pdf',byteSize:5000,actorEmail:'a@example.com',createdAt:new Date()};
const material=(over:Partial<SalesMaterial>={}):SalesMaterial=>({id:'m-1',title:'Folleto',description:'',kind:'deliverable',source:'file',status:'active',archivedAt:null,archivedByEmail:null,revision:4,createdByEmail:'a@example.com',createdAt:new Date(),updatedAt:new Date(),hasCover:false,coverSource:null,categories:[],currentVersion:version,...over});
const yes=()=>true;
let sizes:number[]=[];const qualities:number[]=[];const drawn:number[][]=[];
let created:string[]=[],revoked:string[]=[];
beforeEach(()=>{
 sizes=[];qualities.length=0;drawn.length=0;created=[];revoked=[];
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(this:HTMLCanvasElement){const canvas=this;return {fillRect:vi.fn(),drawImage:vi.fn(()=>drawn.push([canvas.width,canvas.height])),fillStyle:''} as unknown as CanvasRenderingContext2D;} as never);
 vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(function(callback:BlobCallback,_type?:string,quality?:number){qualities.push(quality!);callback(new Blob([new Uint8Array(sizes.shift()??1000)],{type:'image/jpeg'}));});
 URL.createObjectURL=vi.fn(()=>{const url='blob:test/'+created.length;created.push(url);return url;});
 URL.revokeObjectURL=vi.fn((url:string)=>{revoked.push(url);});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();pdf.render.mockReset();failedAutoCoverIds.clear();});
describe('autoCoverFormat and needsAutoCover',()=>{
 it('covers PDF, video and images over 1 MB; small images, audio, office and links get none',()=>{
  expect(autoCoverFormat({mimeType:'application/pdf',byteSize:10,canDecode:yes})).toBe('pdf');expect(autoCoverFormat({mimeType:'video/mp4',byteSize:10,canDecode:yes})).toBe('video');
  expect(autoCoverFormat({mimeType:'image/png',byteSize:1048577,canDecode:yes})).toBe('image');expect(autoCoverFormat({mimeType:'image/png',byteSize:1048576,canDecode:yes})).toBeNull();
  for(const mimeType of ['audio/mpeg','application/msword',null])expect(autoCoverFormat({mimeType,byteSize:10,canDecode:yes})).toBeNull();
 });
 it('spec 102: reads PDFs up to 150 MB, and says why when a PDF is larger or the browser cannot read the format',()=>{
  // Regression (smoke 30/10, finding 15d): a 60 MB PDF was skipped without a word.
  expect(AUTO_COVER_MAX_PDF_BYTES).toBe(150*1024*1024);
  expect(autoCoverPlan({mimeType:'application/pdf',byteSize:60*1024*1024,canDecode:yes})).toEqual({format:'pdf',reason:null});
  expect(autoCoverPlan({mimeType:'application/pdf',byteSize:160*1024*1024,canDecode:yes})).toEqual({format:null,reason:'Este PDF pesa más de 150 MB: no podemos generar su portada en el navegador. Subí una imagen con «Elegir portada».'});
  expect(autoCoverPlan({mimeType:'video/quicktime',byteSize:10,canDecode:()=>false})).toEqual({format:null,reason:'El navegador no puede leer este video. Subí una imagen con «Elegir portada».'});
  // Formats that never get an automatic cover are not a failure: no reason, no notice.
  for(const mimeType of ['audio/mpeg','application/msword',null])expect(autoCoverPlan({mimeType,byteSize:10,canDecode:yes})).toEqual({format:null,reason:null});
  expect(autoCoverPlan({mimeType:'image/png',byteSize:10,canDecode:yes})).toEqual({format:null,reason:null});
 });
 it('skips PDFs over the limit and formats this browser cannot decode',()=>{
  expect(autoCoverFormat({mimeType:'application/pdf',byteSize:AUTO_COVER_MAX_PDF_BYTES,canDecode:yes})).toBe('pdf');
  expect(autoCoverFormat({mimeType:'application/pdf',byteSize:AUTO_COVER_MAX_PDF_BYTES+1,canDecode:yes})).toBeNull();
  expect(autoCoverFormat({mimeType:'video/quicktime',byteSize:10,canDecode:()=>false})).toBeNull();
  // The default check asks the browser: jsdom decodes no video, and HEIC/TIFF are never treated as decodable images.
  expect(autoCoverFormat({mimeType:'video/mp4',byteSize:10})).toBeNull();
  expect(autoCoverFormat({mimeType:'image/heic',byteSize:5000000})).toBeNull();expect(autoCoverFormat({mimeType:'image/jpeg',byteSize:5000000})).toBe('image');
 });
 it('only for active file material without a stored cover and not removed by an admin',()=>{
  expect(needsAutoCover({material:material()})).toBe(true);
  for(const coverSource of ['manual','auto','none'] as const)expect(needsAutoCover({material:material({coverSource})})).toBe(false);
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
 it('renders the first PDF page through the lazily loaded pdf.js module, passing the abort signal',async()=>{
  pdf.render.mockResolvedValue({width:600,height:800});const source=new Blob(['%PDF-']);
  const file=await generateAutoCover({format:'pdf',source:{file:source}});
  expect(pdf.render).toHaveBeenCalledWith({source,maxSize:1200,signal:expect.any(AbortSignal)});expect(file.type).toBe('image/jpeg');
 });
 it('rejects when pdf.js cannot read the file',async()=>{pdf.render.mockRejectedValue(new Error('Invalid PDF structure'));await expect(generateAutoCover({format:'pdf',source:{url:'/x'}})).rejects.toThrow('Invalid PDF structure');});
 it('aborts the renderer on timeout and when the caller aborts',async()=>{
  vi.useFakeTimers();const signals:AbortSignal[]=[];
  const stuck:AutoCoverRenderer=(_source,signal)=>{signals.push(signal);return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)));};
  const render={image:stuck,video:stuck,pdf:stuck};
  const timedOut=generateAutoCover({format:'video',source:{url:'/v'},timeoutMs:1000,render});const check=expect(timedOut).rejects.toThrow('tardó demasiado');
  await vi.advanceTimersByTimeAsync(1000);await check;expect(signals[0].aborted).toBe(true);
  const caller=new AbortController();const stopped=generateAutoCover({format:'pdf',source:{url:'/p'},signal:caller.signal,render});
  caller.abort();await expect(stopped).rejects.toBeDefined();expect(signals[1].aborted).toBe(true);
 });
});
describe('image renderer',()=>{
 type FakeImage={src:string;crossOrigin:string|null;onload:(()=>void)|null;onerror:(()=>void)|null;width:number;height:number};
 let images:FakeImage[]=[];
 beforeEach(()=>{images=[];vi.stubGlobal('Image',class{src='';crossOrigin=null;decoding='';onload=null;onerror=null;width=2000;height=1000;constructor(){images.push(this as unknown as FakeImage);}});});
 it('loads a picked file through an object URL and revokes it',async()=>{
  const result=loadImage(new Blob(['x']),new AbortController().signal);await Promise.resolve();
  expect(images[0].src).toBe('blob:test/0');expect(images[0].crossOrigin).toBeNull();images[0].onload!();
  expect(await result).toBe(images[0]);expect(revoked).toEqual(['blob:test/0']);
 });
 it('reads a stored URL with CORS, and on abort clears the source and revokes the object URL',async()=>{
  void loadImage('/_api/file',new AbortController().signal);await Promise.resolve();expect(images[0].crossOrigin).toBe('anonymous');expect(images[0].src).toBe('/_api/file');
  const controller=new AbortController();const result=loadImage(new Blob(['x']),controller.signal);await Promise.resolve();
  controller.abort();await expect(result).rejects.toBeDefined();expect(images[1].src).toBe('');expect(revoked).toEqual(['blob:test/0']);
 });
});
describe('video renderer',()=>{
 type FakeVideo={src:string;preload:string;muted:boolean;crossOrigin:string|null;currentTime:number;duration:number;videoWidth:number;videoHeight:number;onloadedmetadata:(()=>void)|null;onseeked:(()=>void)|null;onerror:(()=>void)|null;removeAttribute:ReturnType<typeof vi.fn>;load:ReturnType<typeof vi.fn>};
 let video:FakeVideo;
 beforeEach(()=>{
  const create=document.createElement.bind(document);
  video={src:'',preload:'',muted:false,crossOrigin:null,currentTime:0,duration:12,videoWidth:640,videoHeight:360,onloadedmetadata:null,onseeked:null,onerror:null,removeAttribute:vi.fn(),load:vi.fn()};
  vi.spyOn(document,'createElement').mockImplementation(((tag:string)=>tag==='video'?video:create(tag)) as typeof document.createElement);
 });
 it('preloads only metadata, seeks to 1 s, draws the frame and empties the element',async()=>{
  const result=videoFrame(new Blob(['x']),new AbortController().signal);await Promise.resolve();
  expect(video.preload).toBe('metadata');expect(video.muted).toBe(true);expect(video.src).toBe('blob:test/0');
  video.onloadedmetadata!();expect(video.currentTime).toBe(1);video.onseeked!();
  const canvas=await result as HTMLCanvasElement;expect([canvas.width,canvas.height]).toEqual([640,360]);
  expect(video.removeAttribute).toHaveBeenCalledWith('src');expect(video.load).toHaveBeenCalled();expect(revoked).toEqual(['blob:test/0']);
 });
 it('a video that never fires an event is stopped on abort and its object URL revoked',async()=>{
  const controller=new AbortController();const result=videoFrame(new Blob(['x']),controller.signal);await Promise.resolve();
  controller.abort();await expect(result).rejects.toBeDefined();
  expect(video.removeAttribute).toHaveBeenCalledWith('src');expect(video.load).toHaveBeenCalled();expect(revoked).toEqual(['blob:test/0']);expect(video.onseeked).toBeNull();
 });
 it('rejects on a decoding error and still cleans up',async()=>{
  const result=videoFrame('/_api/file',new AbortController().signal);await Promise.resolve();expect(video.crossOrigin).toBe('anonymous');
  video.onerror!();await expect(result).rejects.toThrow('No se pudo leer el video.');expect(video.load).toHaveBeenCalled();expect(revoked).toEqual([]);
 });
});
describe('saveAutoCover',()=>{
 it('uploads the generated cover through the cover path and marks it automatic',async()=>{
  const file=new File(['x'],AUTO_COVER_FILE_NAME,{type:'image/jpeg'});const generate=vi.fn().mockResolvedValue(file),upload=vi.fn().mockResolvedValue('up-9'),post=vi.fn().mockResolvedValue({ok:true,revision:5});
  const signal=new AbortController().signal;
  const result=await saveAutoCover({materialId:'m-1',revision:4,format:'video',source:{url:'/v'},signal,generate,upload,post});
  expect(result).toEqual({ok:true,revision:5});expect(generate).toHaveBeenCalledWith({format:'video',source:{url:'/v'},signal});
  expect(upload).toHaveBeenCalledWith({file,purpose:'cover',materialId:'m-1',signal});expect(post).toHaveBeenCalledWith({action:'cover',id:'m-1',revision:4,uploadId:'up-9',auto:true});
 });
 it('a cover the server keeps out because of a manual choice is a quiet success',async()=>{
  const result=await saveAutoCover({materialId:'m-1',revision:4,format:'pdf',source:{url:'/x'},generate:vi.fn().mockResolvedValue(new File(['x'],'a.jpg')),upload:vi.fn().mockResolvedValue('u'),post:vi.fn().mockResolvedValue({ok:true,revision:4,coverKept:true})});
  expect(result).toEqual({ok:true,revision:4,kept:true});
 });
 it('never throws: a failed generation or a rejected cover falls back to the placeholder',async()=>{
  const upload=vi.fn(),post=vi.fn();
  expect(await saveAutoCover({materialId:'m-1',revision:4,format:'pdf',source:{url:'/x'},generate:vi.fn().mockRejectedValue(new Error('Canvas unavailable')),upload,post})).toEqual({ok:false,error:'Canvas unavailable'});
  expect(upload).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
  const rejected=await saveAutoCover({materialId:'m-1',revision:4,format:'pdf',source:{url:'/x'},generate:vi.fn().mockResolvedValue(new File(['x'],'a.jpg')),upload:vi.fn().mockResolvedValue('u'),post:vi.fn().mockRejectedValue(new Error('La versión cambió'))});
  expect(rejected.ok).toBe(false);
 });
});
describe('autoCoverFailure (spec 102)',()=>{
 const named=(name:string,message='x')=>Object.assign(new Error(message),{name});
 it('turns pdf.js, chunk, network and timeout errors into plain Spanish',()=>{
  expect(autoCoverFailure({error:named('PasswordException','No password given'),format:'pdf'})).toEqual({reason:'El PDF tiene contraseña.',reload:false});
  expect(autoCoverFailure({error:named('InvalidPDFException','Invalid PDF structure.'),format:'pdf'})).toEqual({reason:'No se pudo leer el PDF.',reload:false});
  expect(autoCoverFailure({error:named('UnknownErrorException','JpxError'),format:'pdf'})).toEqual({reason:'No se pudo leer el PDF.',reload:false});
  expect(autoCoverFailure({error:new TypeError('Failed to fetch dynamically imported module: https://crm.example/assets/pdfThumbnail-abc.js'),format:'pdf'})).toEqual({reason:AUTO_COVER_RELOAD_REASON,reload:true});
  expect(AUTO_COVER_RELOAD_REASON).toBe('Se actualizó el CRM: recargá la página y probá de nuevo.');
  expect(autoCoverFailure({error:new TypeError('Importing a module script failed.'),format:'pdf'}).reload).toBe(true);
  expect(autoCoverFailure({error:named('ResponseException','Unexpected server response (403)'),format:'pdf'})).toEqual({reason:'No se pudo descargar el archivo para generar la portada.',reload:false});
  expect(autoCoverFailure({error:new TypeError('Failed to fetch'),format:'video'}).reason).toBe('No se pudo descargar el archivo para generar la portada.');
  // Safari reports a network failure as «Load failed» (spec 102 review).
  expect(autoCoverFailure({error:new TypeError('Load failed'),format:'pdf'})).toEqual({reason:'No se pudo descargar el archivo para generar la portada.',reload:false});
  expect(autoCoverFailure({error:new Error('La portada tardó demasiado.'),format:'pdf'}).reason).toBe('La portada tardó demasiado.');
  // Our own (and the server's) messages are already plain Spanish.
  expect(autoCoverFailure({error:new Error('La versión cambió. Actualizá antes de continuar.'),format:'pdf'}).reason).toBe('La versión cambió. Actualizá antes de continuar.');
  expect(autoCoverFailure({error:'boom',format:'image'}).reason).toBe('No se pudo generar la portada.');
 });
 it('the timeout message is the plain one',async()=>{
  vi.useFakeTimers();const stuck:AutoCoverRenderer=(_s,signal)=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)));
  const run=generateAutoCover({format:'pdf',source:{url:'/p'},timeoutMs:10,render:{image:stuck,video:stuck,pdf:stuck}});const check=expect(run).rejects.toThrow('La portada tardó demasiado.');
  await vi.advanceTimersByTimeAsync(10);await check;
 });
 it('saveAutoCover keeps the readable reason, logs the raw error and flags reloads, conflicts and replaceRemoved',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined);const raw=Object.assign(new Error('No password given'),{name:'PasswordException'});
  expect(await saveAutoCover({materialId:'m-1',revision:4,format:'pdf',source:{url:'/x'},generate:vi.fn().mockRejectedValue(raw),upload:vi.fn(),post:vi.fn()})).toEqual({ok:false,error:'El PDF tiene contraseña.'});
  expect(warn).toHaveBeenCalledWith('[portada automática]','m-1',raw);
  expect(await saveAutoCover({materialId:'m-1',revision:4,format:'pdf',source:{url:'/x'},generate:vi.fn().mockRejectedValue(new TypeError('error loading dynamically imported module')),upload:vi.fn(),post:vi.fn()})).toEqual({ok:false,error:AUTO_COVER_RELOAD_REASON,reload:true});
  const {CrmApiError}=await import('./apiClient');
  expect(await saveAutoCover({materialId:'m-1',revision:4,format:'pdf',source:{url:'/x'},generate:vi.fn().mockResolvedValue(new File(['x'],'a.jpg')),upload:vi.fn().mockResolvedValue('u'),post:vi.fn().mockRejectedValue(new CrmApiError('La versión cambió.',409))})).toEqual({ok:false,error:'La versión cambió.',conflict:true});
  const post=vi.fn().mockResolvedValue({ok:true,revision:5});
  await saveAutoCover({materialId:'m-1',revision:4,format:'pdf',source:{url:'/x'},replaceRemoved:true,generate:vi.fn().mockResolvedValue(new File(['x'],'a.jpg')),upload:vi.fn().mockResolvedValue('u'),post});
  expect(post).toHaveBeenCalledWith({action:'cover',id:'m-1',revision:4,uploadId:'u',auto:true,replaceRemoved:true});
 });
});
describe('saveMissingAutoCover',()=>{
 it('spec 102: a stale chunk (CRM updated) is not remembered as a failure',async()=>{
  await saveMissingAutoCover({material:material(),save:vi.fn().mockResolvedValue({ok:false,error:AUTO_COVER_RELOAD_REASON,reload:true})});expect(failedAutoCoverIds.size).toBe(0);
 });
 it('spec 102: the backfill now includes PDFs up to 150 MB, read by ranges from the stored file',async()=>{
  const save=vi.fn().mockResolvedValue({ok:true,revision:5});
  expect(needsAutoCover({material:material({currentVersion:{...version,byteSize:120*1024*1024}})})).toBe(true);
  expect(needsAutoCover({material:material({currentVersion:{...version,byteSize:160*1024*1024}})})).toBe(false);
  expect(await saveMissingAutoCover({material:material({currentVersion:{...version,byteSize:120*1024*1024}}),save})).toEqual({ok:true});
 });
 it('spec 102: explicit «Generar desde el archivo» regenerates an automatic cover, replaces a removal on request and never a manual cover',async()=>{
  const save=vi.fn().mockResolvedValue({ok:true,revision:5});
  expect(await saveMissingAutoCover({material:material({coverSource:'auto',hasCover:true}),explicit:true,save})).toEqual({ok:true});
  expect(save.mock.calls[0][0]).toMatchObject({materialId:'m-1',revision:4,format:'pdf'});expect(save.mock.calls[0][0].replaceRemoved).toBeUndefined();
  expect(await saveMissingAutoCover({material:material({coverSource:'none'}),explicit:true,save})).toEqual({ok:true});expect(save.mock.calls[1][0].replaceRemoved).toBe(true);
  expect(await saveMissingAutoCover({material:material({coverSource:'manual',hasCover:true}),explicit:true,save})).toEqual({ok:false,error:'Este material ya tiene una portada elegida a mano.'});
  expect(await saveMissingAutoCover({material:material({currentVersion:{...version,byteSize:160*1024*1024}}),explicit:true,save})).toEqual({ok:false,error:'Este PDF pesa más de 150 MB: no podemos generar su portada en el navegador. Subí una imagen con «Elegir portada».'});
  expect(save).toHaveBeenCalledTimes(2);
  save.mockResolvedValueOnce({ok:false,error:'No se pudo leer el PDF.'});
  expect(await saveMissingAutoCover({material:material(),explicit:true,save})).toEqual({ok:false,error:'No se pudo leer el PDF.'});
  save.mockResolvedValueOnce({ok:true,revision:4,kept:true});
  expect(await saveMissingAutoCover({material:material(),explicit:true,save})).toEqual({ok:true,kept:true});
 });
 it('reads the stored version through the same-origin file URL and skips material that does not need a cover',async()=>{
  const save=vi.fn().mockResolvedValue({ok:true,revision:5});
  expect(await saveMissingAutoCover({material:material(),save})).toEqual({ok:true});
  expect(save).toHaveBeenCalledWith({materialId:'m-1',revision:4,format:'pdf',source:{url:'/_api/sales_materials/file?versionId=v-1&disposition=inline'},signal:undefined});
  expect(await saveMissingAutoCover({material:material({coverSource:'none'}),save})).toEqual({ok:false});expect(save).toHaveBeenCalledTimes(1);
 });
 it('remembers failures for the session, but not a run that was stopped',async()=>{
  await saveMissingAutoCover({material:material(),save:vi.fn().mockResolvedValue({ok:false,error:'x'})});expect(failedAutoCoverIds.has('m-1')).toBe(true);
  failedAutoCoverIds.clear();const controller=new AbortController();controller.abort();
  await saveMissingAutoCover({material:material(),signal:controller.signal,save:vi.fn().mockResolvedValue({ok:false,error:'Aborted'})});expect(failedAutoCoverIds.size).toBe(0);
 });
});
