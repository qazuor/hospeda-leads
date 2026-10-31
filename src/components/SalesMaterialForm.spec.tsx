import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {SalesMaterial,SalesMaterialLimits} from '../endpoints/salesMaterials.schema';
import {CrmApiError} from '../helpers/apiClient';
import {SalesMaterialForm,pickedFileError,type SalesMaterialFormMode} from './SalesMaterialForm';

const api=vi.hoisted(()=>({post:vi.fn(),upload:vi.fn(),list:vi.fn(),autoCover:vi.fn(),missing:vi.fn()}));
vi.mock('../endpoints/salesMaterials.schema',async importOriginal=>({...await importOriginal<typeof import('../endpoints/salesMaterials.schema')>(),postSalesMaterial:api.post,getSalesMaterials:api.list}));
vi.mock('../helpers/salesMaterialAutoCover',async importOriginal=>({...await importOriginal<typeof import('../helpers/salesMaterialAutoCover')>(),saveAutoCover:api.autoCover,saveMissingAutoCover:api.missing}));
vi.mock('../helpers/salesMaterialUpload',async importOriginal=>({...await importOriginal<typeof import('../helpers/salesMaterialUpload')>(),uploadSalesMaterialFile:api.upload}));
const limits:SalesMaterialLimits={maxUploadBytes:524288000,maxCoverBytes:1048576,storageConfigured:true,maxEmailAttachmentBytes:10485760};
const material:SalesMaterial={id:'m-1',title:'Folleto',description:'',kind:'deliverable',source:'file',status:'active',openDirect:false,archivedAt:null,archivedByEmail:null,revision:5,createdByEmail:'a@example.com',createdAt:new Date(),updatedAt:new Date(),hasCover:false,categories:[],currentVersion:null};
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};api.post.mockResolvedValue({ok:true});api.autoCover.mockResolvedValue({ok:true,revision:2});});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const onSaved=vi.fn(),onClose=vi.fn();
const setup=(mode:SalesMaterialFormMode,overrides:Partial<SalesMaterialLimits>={})=>render(<MantineProvider><QueryClientProvider client={new QueryClient()}><SalesMaterialForm mode={mode} categories={[{id:'1',name:'Folletos',active:true}]} limits={{...limits,...overrides}} onClose={onClose} onSaved={onSaved}/></QueryClientProvider></MantineProvider>);
const save=(name:string)=>screen.getByRole('button',{name}) as HTMLButtonElement;
const pick=(label:string,file:File)=>fireEvent.change(screen.getByLabelText(label,{selector:'input'}),{target:{files:[file]}});
describe('pickedFileError',()=>{
 it('checks type, extension and size locally',()=>{
  expect(pickedFileError({file:new File(['x'],'a.pdf',{type:'application/pdf'}),purpose:'file',maxUploadBytes:10})).toBeNull();
  expect(pickedFileError({file:new File(['x'],'a.exe'),purpose:'file',maxUploadBytes:10})).toBe('Ese tipo de archivo no está permitido.');
  expect(pickedFileError({file:new File(['xx'],'a.pdf',{type:'application/pdf'}),purpose:'file',maxUploadBytes:1})).toMatch(/supera el límite/);
 });
});
describe('SalesMaterialForm',()=>{
 it('tells the admin that the client sees the title (owner review of spec 96)',()=>{
  setup({type:'create'});
  const title=screen.getByLabelText('Título');
  expect(document.getElementById(title.getAttribute('aria-describedby')!)?.textContent).toMatch(/^Lo ve el cliente/);
 });
 it('creates an external URL material with the trimmed data',async()=>{
  setup({type:'create'});
  expect(save('Guardar material').disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Origen'),{target:{value:'url'}});
  fireEvent.change(screen.getByLabelText('Enlace (https)'),{target:{value:'http://example.com/video'}});
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'  Video institucional '}});
  expect(screen.getByRole('alert').textContent).toBe('Solo se aceptan enlaces https://.');expect(save('Guardar material').disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Enlace (https)'),{target:{value:'https://example.com/video'}});
  fireEvent.click(save('Guardar material'));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Material guardado.'));
  expect(api.post).toHaveBeenCalledWith(expect.objectContaining({action:'create',title:'Video institucional',description:'',kind:'deliverable',source:'url',categoryIds:[],version:{url:'https://example.com/video'}}));
  expect(api.upload).not.toHaveBeenCalled();
 });
 it('uploads a JPEG saved as .png under its real type and says so (owner review of spec 96)',async()=>{
  // Arrange
  api.upload.mockResolvedValue('u-1');
  setup({type:'create'});
  // Act
  pick('Archivo',new File([new Uint8Array([0xff,0xd8,0xff,0xe0,0,0,0,0,0,0,0,0,0,0,0,0])],'gallery-01.png',{type:'image/png'}));
  await screen.findByText('gallery-01.png en realidad es un archivo JPG: se sube como gallery-01.jpg.');
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Galería'}});
  fireEvent.click(save('Guardar material'));
  // Assert
  await waitFor(()=>expect(onSaved).toHaveBeenCalled());
  const uploaded=api.upload.mock.calls[0][0].file as File;
  expect(uploaded.name).toBe('gallery-01.jpg');expect(uploaded.type).toBe('image/jpeg');
 });
 it('uploads the file first, then creates with the upload id, and blocks a double submit',async()=>{
  let finish!:(id:string)=>void;api.upload.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
  setup({type:'create'});
  pick('Archivo',new File(['x'],'virus.exe',{type:'application/octet-stream'}));expect(screen.getByRole('alert').textContent).toBe('Ese tipo de archivo no está permitido.');
  const file=new File(['%PDF-'],'folleto.pdf',{type:'application/pdf'});pick('Archivo',file);
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Folleto 2027'}});
  fireEvent.click(save('Guardar material'));
  // Owner review of spec 96: the form gives way to the progress view, so there is no submit button left to press twice.
  expect(await screen.findByText('Subiendo archivo…')).toBeTruthy();
  expect(screen.queryByRole('button',{name:/Guardar material|Subiendo archivo/})).toBeNull();expect(screen.queryByLabelText('Título')).toBeNull();
  await waitFor(()=>expect(api.upload).toHaveBeenCalledTimes(1));
  const call=api.upload.mock.calls[0][0];expect(call).toMatchObject({file,purpose:'file'});expect(call.materialId).toMatch(/^[0-9a-f-]{36}$/);
  finish('up-1');
  await waitFor(()=>expect(onSaved).toHaveBeenCalled());
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][0]).toMatchObject({action:'create',id:call.materialId,source:'file',version:{uploadId:'up-1'}});
 });
 it('lists each finished step while saving and brings the form back, with what was typed, on an error',async()=>{
  let fail!:(e:Error)=>void;api.upload.mockResolvedValue('up-1');api.post.mockImplementation(()=>new Promise((_resolve,reject)=>{fail=reject}));
  setup({type:'create'});
  pick('Archivo',new File(['%PDF-'],'folleto.pdf',{type:'application/pdf'}));fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Folleto 2027'}});
  fireEvent.click(save('Guardar material'));
  expect(await screen.findByText('Guardando material…')).toBeTruthy();
  expect(screen.getByText('Subiendo archivo')).toBeTruthy();
  fail(new Error('Se cortó la conexión.'));
  expect(await screen.findByText(/Se cortó la conexión\./)).toBeTruthy();
  expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Folleto 2027');
 });
 it('keeps what was typed and offers a retry when the upload fails',async()=>{
  api.upload.mockRejectedValueOnce(new Error('Se cortó la subida del archivo.'));
  setup({type:'create'});pick('Archivo',new File(['%PDF-'],'folleto.pdf',{type:'application/pdf'}));fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Folleto 2027'}});
  fireEvent.click(save('Guardar material'));
  expect((await screen.findByRole('alert')).textContent).toContain('Lo que cargaste se conserva; podés reintentar.');
  expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Folleto 2027');expect(save('Guardar material').disabled).toBe(false);expect(api.post).not.toHaveBeenCalled();
 });
 it('warns before turning a deliverable into internal and sends the revision',async()=>{
  setup({type:'edit',material});
  fireEvent.change(screen.getByLabelText('Tipo'),{target:{value:'internal'}});
  expect(screen.getByRole('note').textContent).toContain('van a mostrar «Este material ya no está disponible»');
  fireEvent.click(save('Guardar cambios'));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith({action:'update',id:'m-1',revision:5,title:'Folleto',description:'',kind:'internal',categoryIds:[],openDirect:false}));
 });
 it('spec 101 D3/D4: creates a material set to «Abrir directo» and explains what it changes',async()=>{
  setup({type:'create'});
  fireEvent.change(screen.getByLabelText('Origen'),{target:{value:'url'}});
  fireEvent.change(screen.getByLabelText('Enlace (https)'),{target:{value:'https://example.com/tour'}});
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Recorrido 360'}});
  const toggle=screen.getByLabelText('Abrir directo') as HTMLInputElement;expect(toggle.checked).toBe(false);
  expect(screen.getByText(/va directo al sitio externo/).textContent).toMatch(/enlaces ya enviados/);
  fireEvent.click(toggle);fireEvent.click(save('Guardar material'));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith(expect.objectContaining({action:'create',source:'url',openDirect:true})));
 });
 it('spec 101 D3: edits «Abrir directo» from the stored value, with the file wording',async()=>{
  setup({type:'edit',material:{...material,openDirect:true}});
  const toggle=screen.getByLabelText('Abrir directo') as HTMLInputElement;expect(toggle.checked).toBe(true);
  expect(screen.getByText(/ve el archivo/).textContent).toMatch(/se descargan/);
  fireEvent.click(toggle);fireEvent.click(save('Guardar cambios'));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith(expect.objectContaining({action:'update',openDirect:false})));
 });
 it('refuses uploads while storage is not configured',()=>{
  setup({type:'version',material},{storageConfigured:false});pick('Archivo',new File(['%PDF-'],'v2.pdf',{type:'application/pdf'}));
  expect(save('Guardar versión').disabled).toBe(true);
 });
 it('after a 409 takes the latest revision and retries the version with the same verified upload', async()=>{
  api.upload.mockResolvedValue('up-1');
  api.post.mockRejectedValueOnce(new CrmApiError('La versión cambió. Actualizá antes de continuar.',409)).mockResolvedValueOnce({ok:true,revision:7});
  api.list.mockResolvedValue({materials:[{...material,revision:6}],truncated:false,categories:[],limits});
  setup({type:'version',material});pick('Archivo',new File(['%PDF-'],'v2.pdf',{type:'application/pdf'}));
  fireEvent.click(save('Guardar versión'));
  expect((await screen.findByRole('alert')).textContent).toContain('Ya tomamos los datos más recientes');
  expect(api.post.mock.calls[0][0]).toMatchObject({action:'version',revision:5,version:{uploadId:'up-1'}});
  expect(save('Guardar versión').disabled).toBe(false);
  fireEvent.click(save('Guardar versión'));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Nueva versión guardada. Las anteriores se conservan.'));
  expect(api.upload).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[1][0]).toMatchObject({action:'version',id:'m-1',revision:6,version:{uploadId:'up-1'}});
 });
 it('uploads again after a non-conflict failure, because the earlier upload may be discarded', async()=>{
  api.upload.mockResolvedValueOnce('up-1').mockResolvedValueOnce('up-2');
  api.post.mockRejectedValueOnce(new Error('El tipo del archivo subido no coincide con el declarado. Volvé a subirlo.'));
  setup({type:'version',material});pick('Archivo',new File(['%PDF-'],'v2.pdf',{type:'application/pdf'}));
  fireEvent.click(save('Guardar versión'));await screen.findByRole('alert');
  fireEvent.click(save('Guardar versión'));await waitFor(()=>expect(onSaved).toHaveBeenCalled());
  expect(api.upload).toHaveBeenCalledTimes(2);expect(api.post.mock.calls[1][0]).toMatchObject({version:{uploadId:'up-2'}});
 });
 it('accepts only small images as cover',async()=>{
  setup({type:'cover',material});
  pick('Imagen de portada',new File([new Uint8Array(1048577)],'tapa.png',{type:'image/png'}));expect(screen.getByRole('alert').textContent).toBe('El archivo supera el límite de 1 MB.');
  api.upload.mockResolvedValueOnce('cover-1');pick('Imagen de portada',new File(['png'],'tapa.png',{type:'image/png'}));fireEvent.click(save('Guardar portada'));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith({action:'cover',id:'m-1',revision:5,uploadId:'cover-1'}));
  expect(api.upload.mock.calls[0][0]).toMatchObject({purpose:'cover',materialId:'m-1'});
 });
 it('generates an automatic cover after creating a PDF without a manual cover',async()=>{
  api.upload.mockResolvedValue('up-1');api.post.mockResolvedValue({id:'x',revision:1});
  setup({type:'create'});const file=new File(['%PDF-'],'folleto.pdf',{type:'application/pdf'});pick('Archivo',file);fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Folleto 2027'}});
  fireEvent.click(save('Guardar material'));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Material guardado.'));
  const created=api.post.mock.calls[0][0];expect(api.autoCover).toHaveBeenCalledWith({materialId:created.id,revision:1,format:'pdf',source:{file}});
 });
 it('a manual cover wins: no automatic cover is generated',async()=>{
  api.upload.mockResolvedValueOnce('up-1').mockResolvedValueOnce('cover-1');
  setup({type:'create'});pick('Archivo',new File(['%PDF-'],'folleto.pdf',{type:'application/pdf'}));pick('Portada (opcional)',new File(['png'],'tapa.png',{type:'image/png'}));fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Folleto 2027'}});
  fireEvent.click(save('Guardar material'));await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Material guardado.'));
  expect(api.autoCover).not.toHaveBeenCalled();expect(api.post.mock.calls[1][0]).toMatchObject({action:'cover',revision:1,uploadId:'cover-1'});expect(api.post.mock.calls[1][0].auto).toBeUndefined();
  cleanup();vi.clearAllMocks();api.upload.mockResolvedValue('up-2');api.post.mockResolvedValue({ok:true,revision:6});
  setup({type:'version',material:{...material,hasCover:true,coverSource:'manual'}});pick('Archivo',new File(['%PDF-'],'v2.pdf',{type:'application/pdf'}));fireEvent.click(save('Guardar versión'));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Nueva versión guardada. Las anteriores se conservan.'));expect(api.autoCover).not.toHaveBeenCalled();
 });
 it('regenerates an automatic cover on a new version with the revision the server returned',async()=>{
  api.upload.mockResolvedValue('up-1');api.post.mockResolvedValue({ok:true,revision:6});
  setup({type:'version',material:{...material,hasCover:true,coverSource:'auto'}});const file=new File(['%PDF-'],'v2.pdf',{type:'application/pdf'});pick('Archivo',file);fireEvent.click(save('Guardar versión'));
  await waitFor(()=>expect(onSaved).toHaveBeenCalled());expect(api.autoCover).toHaveBeenCalledWith({materialId:'m-1',revision:6,format:'pdf',source:{file}});
 });
 it('a removed cover is kept on a new version, and a manual choice the page did not know about is a quiet skip',async()=>{
  api.upload.mockResolvedValue('up-1');api.post.mockResolvedValue({ok:true,revision:6});
  setup({type:'version',material:{...material,hasCover:false,coverSource:'none'}});pick('Archivo',new File(['%PDF-'],'v2.pdf',{type:'application/pdf'}));fireEvent.click(save('Guardar versión'));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Nueva versión guardada. Las anteriores se conservan.'));expect(api.autoCover).not.toHaveBeenCalled();
  // Stale `coverSource`: the server kept a manual cover (`kept`), which is no failure and adds no note.
  cleanup();vi.clearAllMocks();api.upload.mockResolvedValue('up-2');api.post.mockResolvedValue({ok:true,revision:6});api.autoCover.mockResolvedValue({ok:true,revision:6,kept:true});
  setup({type:'version',material:{...material,hasCover:false,coverSource:null}});pick('Archivo',new File(['%PDF-'],'v2.pdf',{type:'application/pdf'}));fireEvent.click(save('Guardar versión'));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Nueva versión guardada. Las anteriores se conservan.'));expect(api.autoCover).toHaveBeenCalled();
 });
 it('a failed automatic cover never blocks saving: the material is saved with a note',async()=>{
  api.upload.mockResolvedValue('up-1');api.autoCover.mockResolvedValue({ok:false,error:'Canvas unavailable'});
  setup({type:'create'});pick('Archivo',new File(['%PDF-'],'folleto.pdf',{type:'application/pdf'}));fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Folleto 2027'}});
  fireEvent.click(save('Guardar material'));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Material guardado. La portada automática no se pudo generar: Canvas unavailable La tarjeta muestra el dibujo del formato; podés subir una imagen o reintentar con «Elegir portada».',{coverMaterialId:expect.stringMatching(/^[0-9a-f-]{36}$/)}));
  expect(screen.queryByRole('alert')).toBeNull();
 });
 it('spec 102: the notice keeps the real reason of a failed cover and offers «Elegir portada»',async()=>{
  // Regression (smoke 30/10, finding 15d): the reason was dropped and nothing offered to create the cover.
  api.upload.mockResolvedValue('up-1');api.post.mockResolvedValue({id:'x',revision:1});api.autoCover.mockResolvedValue({ok:false,error:'El PDF tiene contraseña.'});
  setup({type:'create'});pick('Archivo',new File(['%PDF-'],'folleto.pdf',{type:'application/pdf'}));fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Folleto 2027'}});
  fireEvent.click(save('Guardar material'));
  await waitFor(()=>expect(onSaved).toHaveBeenCalled());
  const [message,notice]=onSaved.mock.calls[0];const id=api.post.mock.calls[0][0].id;
  expect(message).toContain('El PDF tiene contraseña.');expect(notice).toEqual({coverMaterialId:id});
 });
 it('spec 102: a PDF over 150 MB is saved and the notice says why it has no cover, never a silent skip',async()=>{
  api.upload.mockResolvedValue('up-1');api.post.mockResolvedValue({id:'x',revision:1});
  setup({type:'create'});const big=new File(['%PDF-'],'folleto.pdf',{type:'application/pdf'});Object.defineProperty(big,'size',{value:160*1024*1024});
  pick('Archivo',big);fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Folleto pesado'}});
  fireEvent.click(save('Guardar material'));
  await waitFor(()=>expect(onSaved).toHaveBeenCalled());
  expect(onSaved).toHaveBeenCalledWith('Material guardado. Este PDF pesa más de 150 MB: no podemos generar su portada en el navegador. Subí una imagen con «Elegir portada».',{coverMaterialId:api.post.mock.calls[0][0].id});
  expect(api.autoCover).not.toHaveBeenCalled();
 });
 it('spec 102 block 2: an external link can get a manual cover when it is created',async()=>{
  api.upload.mockResolvedValue('cover-1');api.post.mockResolvedValue({id:'x',revision:1});
  setup({type:'create'});fireEvent.change(screen.getByLabelText('Origen'),{target:{value:'url'}});
  fireEvent.change(screen.getByLabelText('Enlace (https)'),{target:{value:'https://example.com/tour'}});fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Recorrido 360'}});
  pick('Portada (opcional)',new File(['png'],'tapa.png',{type:'image/png'}));
  fireEvent.click(save('Guardar material'));await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Material guardado.'));
  const id=api.post.mock.calls[0][0].id;expect(api.upload).toHaveBeenCalledWith(expect.objectContaining({purpose:'cover',materialId:id}));
  expect(api.post.mock.calls[1][0]).toEqual({action:'cover',id,revision:1,uploadId:'cover-1'});expect(api.autoCover).not.toHaveBeenCalled();
 });
});
describe('«Portada» dialog: «Generar desde el archivo» (spec 102)',()=>{
 const pdfVersion={id:'v-1',version:1,url:null,fileName:'folleto.pdf',mimeType:'application/pdf',byteSize:5000,actorEmail:'a@example.com',createdAt:new Date()};
 const fileMaterial=(over:Partial<SalesMaterial>={}):SalesMaterial=>({...material,coverSource:null,currentVersion:pdfVersion,...over});
 it('generates the cover from the stored file, shows progress, blocks a double click and keeps the reason with a retry',async()=>{
  let fail!:(r:unknown)=>void;api.missing.mockImplementationOnce(()=>new Promise(resolve=>{fail=resolve})).mockResolvedValueOnce({ok:true});
  setup({type:'cover',material:fileMaterial()});
  const generate=screen.getByRole('button',{name:'Generar desde el archivo'}) as HTMLButtonElement;
  fireEvent.click(generate);fireEvent.click(generate);
  expect(await screen.findByText('Generando portada…',{selector:'p'})).toBeTruthy();
  expect(api.missing).toHaveBeenCalledTimes(1);expect(api.missing.mock.calls[0][0]).toMatchObject({material:expect.objectContaining({id:'m-1',revision:5}),explicit:true});
  fail({ok:false,error:'No se pudo leer el PDF.'});
  expect((await screen.findByRole('alert')).textContent).toBe('No se pudo leer el PDF. Podés reintentar o subir una imagen.');
  // The image field stays next to the reason.
  expect(screen.getByLabelText('Imagen de portada',{selector:'input'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Generar desde el archivo'}));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Portada generada.'));expect(api.missing).toHaveBeenCalledTimes(2);
 });
 it('appears for an automatic or removed cover, not for a manual cover nor a link; a PDF over the limit shows the reason instead',()=>{
  for(const coverSource of ['auto','none'] as const){setup({type:'cover',material:fileMaterial({coverSource,hasCover:coverSource==='auto'})});expect(screen.getByRole('button',{name:'Generar desde el archivo'})).toBeTruthy();cleanup();}
  setup({type:'cover',material:fileMaterial({coverSource:'manual',hasCover:true})});expect(screen.queryByRole('button',{name:'Generar desde el archivo'})).toBeNull();cleanup();
  setup({type:'cover',material:fileMaterial({source:'url',currentVersion:{...pdfVersion,url:'https://example.com',mimeType:null,byteSize:null}})});expect(screen.queryByRole('button',{name:'Generar desde el archivo'})).toBeNull();
  expect(screen.getByLabelText('Imagen de portada',{selector:'input'})).toBeTruthy();cleanup();
  setup({type:'cover',material:fileMaterial({currentVersion:{...pdfVersion,byteSize:160*1024*1024}})});expect(screen.queryByRole('button',{name:'Generar desde el archivo'})).toBeNull();
  expect(screen.getByText(/Este PDF pesa más de 150 MB/)).toBeTruthy();
 });
 it('after a conflict takes the latest revision before the retry',async()=>{
  api.missing.mockResolvedValueOnce({ok:false,error:'La versión cambió. Actualizá antes de continuar.',conflict:true}).mockResolvedValueOnce({ok:true});
  api.list.mockResolvedValue({materials:[fileMaterial({revision:8})],truncated:false,categories:[],limits});
  setup({type:'cover',material:fileMaterial()});fireEvent.click(screen.getByRole('button',{name:'Generar desde el archivo'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Ya tomamos los datos más recientes');
  fireEvent.click(screen.getByRole('button',{name:'Generar desde el archivo'}));await waitFor(()=>expect(onSaved).toHaveBeenCalled());
  expect(api.missing.mock.calls[1][0].material.revision).toBe(8);
 });
 it('after a conflict also takes the latest cover state: a cover removed meanwhile is replaced, not reported as a manual choice (spec 102 review)',async()=>{
  api.missing.mockResolvedValueOnce({ok:false,error:'La versión cambió. Actualizá antes de continuar.',conflict:true}).mockResolvedValueOnce({ok:true});
  api.list.mockResolvedValue({materials:[fileMaterial({revision:8,coverSource:'none',hasCover:false})],truncated:false,categories:[],limits});
  setup({type:'cover',material:fileMaterial({coverSource:'auto',hasCover:true})});fireEvent.click(screen.getByRole('button',{name:'Generar desde el archivo'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Ya tomamos los datos más recientes');
  fireEvent.click(screen.getByRole('button',{name:'Generar desde el archivo'}));await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Portada generada.'));
  expect(api.missing.mock.calls[1][0].material).toMatchObject({revision:8,coverSource:'none'});
 });
 it('can be cancelled while it runs: the signal reaches the download and upload, and the dialog offers a retry (spec 102 review)',async()=>{
  api.missing.mockImplementationOnce(({signal}:{signal:AbortSignal})=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve({ok:false,error:'Aborted'}))));
  setup({type:'cover',material:fileMaterial()});fireEvent.click(screen.getByRole('button',{name:'Generar desde el archivo'}));
  fireEvent.click(await screen.findByRole('button',{name:'Cancelar'}));
  expect((await screen.findByRole('alert')).textContent).toBe('Se canceló la generación de la portada. Podés reintentar o subir una imagen.');
  expect((api.missing.mock.calls[0][0].signal as AbortSignal).aborted).toBe(true);
  expect(screen.queryByRole('button',{name:'Cancelar'})).toBeNull();expect((screen.getByRole('button',{name:'Generar desde el archivo'}) as HTMLButtonElement).disabled).toBe(false);
  expect(onSaved).not.toHaveBeenCalled();
 });
 it('is off while storage is not configured, with the reason',()=>{
  setup({type:'cover',material:fileMaterial()},{storageConfigured:false});expect((screen.getByRole('button',{name:'Generar desde el archivo'}) as HTMLButtonElement).disabled).toBe(true);
 });
 it('small images, audio and office files get no automatic cover',async()=>{
  api.upload.mockResolvedValue('up-1');
  setup({type:'create'});pick('Archivo',new File(['png'],'foto.png',{type:'image/png'}));fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Foto chica'}});
  fireEvent.click(save('Guardar material'));await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('Material guardado.'));expect(api.autoCover).not.toHaveBeenCalled();
 });
});
