import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {within,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import type {SalesMaterial} from '../endpoints/salesMaterials.schema';
import {SalesMaterialCard,categoryInitials} from './SalesMaterialCard';

const version={id:'v-2',version:2,url:null,fileName:'folleto.pdf',mimeType:'application/pdf',byteSize:2048,actorEmail:'admin@example.com',createdAt:new Date('2026-10-20T12:00:00Z')};
const material=(over:Partial<SalesMaterial>={}):SalesMaterial=>({id:'m-1',title:'Folleto',description:'',kind:'deliverable',source:'file',status:'active',openDirect:false,archivedAt:null,archivedByEmail:null,revision:3,createdByEmail:'admin@example.com',createdAt:new Date(),updatedAt:new Date(),hasCover:false,coverSource:null,categories:[{id:'7',name:'Precios 2027',active:true}],currentVersion:version,...over});
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const handlers={onEdit:vi.fn(),onArchive:vi.fn(),onPreview:vi.fn()};
const setup=(m:SalesMaterial,{admin=true,busy=false,storageConfigured=true}={})=>render(<MantineProvider><SalesMaterialCard material={m} admin={admin} selected={false} anchor busy={busy} storageConfigured={storageConfigured} {...handlers}/></MantineProvider>);
// Mantine starts closing the dropdown right after jsdom renders it: keep the items the first query found.
const openMenu=async(title='Folleto')=>{fireEvent.click(screen.getByRole('button',{name:`Más acciones de «${title}»`}));return screen.findAllByRole('menuitem');};
const item=(items:HTMLElement[],name:string)=>items.find(i=>i.textContent===name) as HTMLButtonElement;
describe('SalesMaterialCard',()=>{
 it('opens the preview from the cover and the title and keeps one visible «Abrir»',()=>{
  const {container}=setup(material());
  fireEvent.click(screen.getByRole('button',{name:'Vista previa de «Folleto»'}));fireEvent.click(container.querySelector('button[aria-hidden="true"]')!);
  expect(handlers.onPreview).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('link',{name:'Abrir'}).getAttribute('href')).toBe('/_api/sales_materials/file?versionId=v-2&disposition=inline');
  for(const name of ['Descargar','Editar','Nueva versión','Portada','Archivar'])expect(screen.queryByRole('button',{name})).toBeNull();
 });
 it('puts Descargar, Editar, Nueva versión, Portada and Archivar in the «⋯» menu for admins',async()=>{
  setup(material());const menu=await openMenu();
  expect(menu.map(i=>i.textContent)).toEqual(['Descargar','Editar','Nueva versión','Portada','Archivar']);
  expect(item(menu,'Descargar').getAttribute('href')).toBe('/_api/sales_materials/file?versionId=v-2&disposition=attachment');
  const divider=document.querySelector('.mantine-Menu-divider')!;expect(divider.previousElementSibling?.textContent).toBe('Portada');expect(divider.nextElementSibling?.textContent).toBe('Archivar');
  fireEvent.click(item(menu,'Nueva versión'));expect(handlers.onEdit).toHaveBeenCalledWith({type:'version',material:expect.objectContaining({id:'m-1'})});
  cleanup();setup(material());fireEvent.click(item(await openMenu(),'Archivar'));expect(handlers.onArchive).toHaveBeenCalledTimes(1);
 });
 it('archived material: only Editar and Restaurar for admins; links have Portada (spec 102 block 2) but no Descargar',async()=>{
  setup(material({status:'archived',archivedAt:new Date()}));let menu=await openMenu();
  expect(menu.map(i=>i.textContent)).toEqual(['Descargar','Editar','Restaurar']);cleanup();
  setup(material({source:'url',currentVersion:{...version,url:'https://example.com/x',fileName:null,mimeType:null,byteSize:null}}));
  expect(screen.getByRole('link',{name:'Abrir enlace'})).toBeTruthy();menu=await openMenu();
  expect(menu.map(i=>i.textContent)).toEqual(['Editar','Nueva versión','Portada','Archivar']);
  fireEvent.click(item(menu,'Portada'));expect(handlers.onEdit).toHaveBeenCalledWith({type:'cover',material:expect.objectContaining({source:'url'})});
 });
 it('sellers get only Descargar, and no menu at all on a link',async()=>{
  setup(material(),{admin:false});const menu=await openMenu();expect(menu.map(i=>i.textContent)).toEqual(['Descargar']);cleanup();
  setup(material({source:'url',currentVersion:{...version,url:'https://example.com/x',fileName:null,mimeType:null,byteSize:null}}),{admin:false});
  expect(screen.queryByRole('button',{name:'Más acciones de «Folleto»'})).toBeNull();
 });
 it('keeps the disabled reasons: busy blocks the admin actions, storage off blocks Abrir, Descargar and the preview',async()=>{
  setup(material(),{busy:true});let menu=await openMenu();
  for(const name of ['Editar','Nueva versión','Portada','Archivar'])expect(item(menu,name).disabled).toBe(true);
  // The reason is visible text in the menu, not only a title attribute.
  expect(within(menu[0].closest('[role="menu"]') as HTMLElement).getByRole('note',{hidden:true}).textContent).toBe('La operación está en curso. Esperá a que termine para continuar.');
  expect(item(menu,'Descargar').getAttribute('href')).toContain('disposition=attachment');cleanup();
  setup(material(),{storageConfigured:false});
  expect((screen.getByRole('button',{name:'Abrir'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.queryByRole('button',{name:/Vista previa/})).toBeNull();
  menu=await openMenu();const download=menu.find(i=>i.textContent?.startsWith('Descargar')) as HTMLButtonElement;
  expect(download.disabled).toBe(true);expect(download.textContent).toContain('Almacenamiento no configurado: el archivo no se puede abrir por ahora.');
 });
 it('shows the stored cover, or a drawn placeholder with format and category initials',()=>{
  const {container}=setup(material({hasCover:true,coverSource:'auto'}));expect(container.querySelector('img')?.getAttribute('src')).toBe('/_api/sales_materials/cover?materialId=m-1&r=3');cleanup();
  setup(material());const placeholder=screen.getByTestId('cover-placeholder');
  expect(placeholder.textContent).toBe('PDFP2');expect(placeholder.getAttribute('data-category')).toBe('true');expect(placeholder.style.getPropertyValue('--cover-hue')).toMatch(/^\d+$/);cleanup();
  setup(material({hasCover:true,categories:[]}),{storageConfigured:false});expect(screen.getByTestId('cover-placeholder').getAttribute('data-category')).toBeNull();
 });
 it('takes up to two initials from the category name',()=>{expect(categoryInitials('Folletos')).toBe('F');expect(categoryInitials('precios  de 2027')).toBe('PD');});
});
