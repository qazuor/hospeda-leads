import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {SalesMaterial,SalesMaterialLimits} from '../endpoints/salesMaterials.schema';
import {CrmApiError} from '../helpers/apiClient';
import {SalesMaterialForm,pickedFileError,type SalesMaterialFormMode} from './SalesMaterialForm';

const api=vi.hoisted(()=>({post:vi.fn(),upload:vi.fn(),list:vi.fn()}));
vi.mock('../endpoints/salesMaterials.schema',async importOriginal=>({...await importOriginal<typeof import('../endpoints/salesMaterials.schema')>(),postSalesMaterial:api.post,getSalesMaterials:api.list}));
vi.mock('../helpers/salesMaterialUpload',async importOriginal=>({...await importOriginal<typeof import('../helpers/salesMaterialUpload')>(),uploadSalesMaterialFile:api.upload}));
const limits:SalesMaterialLimits={maxUploadBytes:524288000,maxCoverBytes:1048576,storageConfigured:true};
const material:SalesMaterial={id:'m-1',title:'Folleto',description:'',kind:'deliverable',source:'file',status:'active',archivedAt:null,archivedByEmail:null,revision:5,createdByEmail:'a@example.com',createdAt:new Date(),updatedAt:new Date(),hasCover:false,categories:[],currentVersion:null};
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};api.post.mockResolvedValue({ok:true});});
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
 it('uploads the file first, then creates with the upload id, and blocks a double submit',async()=>{
  let finish!:(id:string)=>void;api.upload.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
  setup({type:'create'});
  pick('Archivo',new File(['x'],'virus.exe',{type:'application/octet-stream'}));expect(screen.getByRole('alert').textContent).toBe('Ese tipo de archivo no está permitido.');
  const file=new File(['%PDF-'],'folleto.pdf',{type:'application/pdf'});pick('Archivo',file);
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Folleto 2027'}});
  fireEvent.click(save('Guardar material'));fireEvent.click(screen.getByRole('button',{name:'Subiendo archivo…'}));
  await waitFor(()=>expect(api.upload).toHaveBeenCalledTimes(1));
  const call=api.upload.mock.calls[0][0];expect(call).toMatchObject({file,purpose:'file'});expect(call.materialId).toMatch(/^[0-9a-f-]{36}$/);
  finish('up-1');
  await waitFor(()=>expect(onSaved).toHaveBeenCalled());
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][0]).toMatchObject({action:'create',id:call.materialId,source:'file',version:{uploadId:'up-1'}});
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
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith({action:'update',id:'m-1',revision:5,title:'Folleto',description:'',kind:'internal',categoryIds:[]}));
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
});
