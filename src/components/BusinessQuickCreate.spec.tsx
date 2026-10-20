import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import type {DuplicateCandidate} from '../endpoints/business_duplicate_check.schema';

const mocks=vi.hoisted(()=>({check:vi.fn(),save:vi.fn()}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:7,email:'marta@example.com',displayName:'Marta',role:'user'}}})}));
vi.mock('../endpoints/settings_GET.schema',()=>({getSettings:async()=>({types:[],subtypes:[],users:[],contactPositions:[],contactChannels:[]})}));
vi.mock('../endpoints/business_duplicate_check.schema',()=>({checkBusinessDuplicates:mocks.check,DNC_DUPLICATE_MESSAGE:'Ese negocio pidió no ser contactado. Consultá con un administrador.'}));
vi.mock('../endpoints/commercial.schema',()=>({saveCommercial:mocks.save}));
import {BusinessQuickCreate} from './BusinessQuickCreate';
import {CommercialEditor} from './CommercialEditor';

beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
});
beforeEach(()=>{mocks.check.mockReset();mocks.save.mockReset();});
afterEach(cleanup);

const candidate=(id:string,extra:Partial<DuplicateCandidate>={}):DuplicateCandidate=>({id,nombre:'Cabañas del Río '+id,ciudad:'Colón',doNotContact:false,archived:false,deleted:false,reasons:['Nombre y localidad normalizados coinciden'],canOpen:true,blocking:false,responsibleName:'Lucía',...extra});
const wrap=(node:React.ReactNode)=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider></MantineProvider>);
const create=()=>screen.getByRole('button',{name:/Crear negocio/}) as HTMLButtonElement;
const type=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});

describe('BusinessQuickCreate',()=>{
 it('warns about similar businesses while typing and only saves once the seller says it is another one',async()=>{
  mocks.check.mockResolvedValue({candidates:[candidate('1'),candidate('2',{canOpen:false,responsibleName:undefined,archived:true}),candidate('3'),candidate('4')]});
  mocks.save.mockResolvedValue({id:'55'});
  const onSaved=vi.fn();
  wrap(<BusinessQuickCreate onClose={()=>{}} onSaved={onSaved}/>);
  expect(screen.getByRole('heading',{name:'Nuevo negocio'})).toBeTruthy();
  type('Nombre','Cabañas del Río');type('Ciudad','Colón');
  await screen.findByText('Puede que ya exista:');
  expect(mocks.check).toHaveBeenLastCalledWith({nombre:'Cabañas del Río',ciudad:'Colón'},{signal:expect.any(AbortSignal)});
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  const open=screen.getByRole('link',{name:'Abrir Cabañas del Río 1 (en otra pestaña)'});
  expect([open.getAttribute('href'),open.getAttribute('target'),open.getAttribute('rel')]).toEqual(['/accounts/1','_blank','noopener']);
  expect(screen.queryByRole('link',{name:/Abrir Cabañas del Río 2/})).toBeNull();
  expect(screen.queryByText('Si es el mismo, no lo contactes.')).toBeNull();
  expect(screen.getByText('Archivado')).toBeTruthy();
  expect(screen.getAllByText(/Responsable del negocio: Lucía/)).toHaveLength(2);
  expect(screen.getByText('Y 1 más parecidos.')).toBeTruthy();
  expect(create().disabled).toBe(true);
  const ack=screen.getByLabelText('Ninguno de estos es mi negocio, crear igual');
  expect(ack.getAttribute('aria-describedby')).toBe('quick-create-duplicates');
  fireEvent.click(ack);
  expect(create().disabled).toBe(false);
  type('Nombre de la persona','Ana');type('Teléfono de la persona','3447 412345');
  expect(create().disabled).toBe(true);// the person phone is checked too
  expect(screen.getByText('Puede que ya exista:')).toBeTruthy();// the list stays while re-checking
  expect(screen.getByRole('status').textContent).toBe('Revisando si ya existe…');
  await waitFor(()=>expect(mocks.check).toHaveBeenLastCalledWith({nombre:'Cabañas del Río',ciudad:'Colón',personPhone:'3447 412345'},expect.anything()));
  await waitFor(()=>expect(create().disabled).toBe(false));
  fireEvent.click(create());
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('55'));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0][0]).toMatchObject({action:'account_save',nombre:'Cabañas del Río',ciudad:'Colón',telefono:null,primaryContact:{name:'Ana',phone:'3447 412345'}});
  expect(mocks.save.mock.calls[0][0]).not.toHaveProperty('assignedUserEmail');
 });
 it('blocks a duplicate of a No contactar business with the decision copy',async()=>{
  mocks.check.mockResolvedValue({candidates:[candidate('1'),candidate('8',{doNotContact:true,blocking:true,reasons:['Teléfono compartido']})]});
  wrap(<BusinessQuickCreate onClose={()=>{}}/>);
  type('Nombre','Otro nombre');type('Teléfono / WhatsApp','3447 412345');
  expect((await screen.findByRole('alert')).textContent).toBe('Ese negocio pidió no ser contactado. Consultá con un administrador.');
  expect(screen.getByText('No contactar')).toBeTruthy();
  expect(screen.queryByLabelText('Ninguno de estos es mi negocio, crear igual')).toBeNull();
  expect(create().disabled).toBe(true);
 });
 it('does not save while the duplicate check is still running',async()=>{
  mocks.check.mockReturnValue(new Promise(()=>{}));
  wrap(<BusinessQuickCreate onClose={()=>{}}/>);
  type('Nombre','Hostería Pendiente');
  expect(create().disabled).toBe(true);
  await waitFor(()=>expect(mocks.check).toHaveBeenCalled());
  expect(create().disabled).toBe(true);
  expect(screen.getByText('Revisando si ya existe…')).toBeTruthy();
  fireEvent.submit(create().closest('form')!);
  expect(mocks.save).not.toHaveBeenCalled();
 });
 it('warns without blocking on a non-blocking No contactar match',async()=>{
  mocks.check.mockResolvedValue({candidates:[candidate('7',{doNotContact:true,reasons:['Teléfono parecido']})]});
  wrap(<BusinessQuickCreate onClose={()=>{}}/>);
  type('Teléfono / WhatsApp','3447 412345');
  expect(await screen.findByText('Si es el mismo, no lo contactes.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByLabelText('Ninguno de estos es mi negocio, crear igual'));
  expect(create().disabled).toBe(false);
 });
 it('creates without a person and without asking when nothing similar exists',async()=>{
  mocks.check.mockResolvedValue({candidates:[]});mocks.save.mockResolvedValue({id:'56'});
  const onSaved=vi.fn();
  wrap(<BusinessQuickCreate onClose={()=>{}} onSaved={onSaved}/>);
  type('Nombre','Hostería Única');
  await waitFor(()=>expect(create().disabled).toBe(false));
  fireEvent.click(create());
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('56'));
  expect(mocks.save.mock.calls[0][0]).not.toHaveProperty('primaryContact');
 });
});

describe('CommercialEditor',()=>{
 const account={id:'5',nombre:'Hostería',contacts:[]} as never;
 const detail=(contacts:unknown[])=>({account:{id:'5',nombre:'Hostería'},contacts,opportunities:[],journal:[],leadJournal:[],stages:[]}) as never;
 it('opens the one-step dialog for a new business and keeps "Guardar cambios" when editing',()=>{
  wrap(<CommercialEditor target={{kind:'account'}} onClose={()=>{}}/>);
  expect(screen.getByRole('heading',{name:'Nuevo negocio'})).toBeTruthy();
  cleanup();
  wrap(<CommercialEditor target={{kind:'account',item:account}} onClose={()=>{}}/>);
  expect(screen.getByRole('button',{name:'Guardar cambios'})).toBeTruthy();
 });
 it('marks the first person as Principal and mentions the replacement only when a Principal exists',()=>{
  wrap(<CommercialEditor target={{kind:'contact'}} detail={detail([])} onClose={()=>{}}/>);
  const first=screen.getByLabelText('Principal del negocio') as HTMLInputElement;
  expect(first.checked).toBe(true);
  cleanup();
  wrap(<CommercialEditor target={{kind:'contact'}} detail={detail([{id:'1',name:'Ana',isPrimary:true,deletedAt:null}])} onClose={()=>{}}/>);
  const next=screen.getByLabelText('Principal del negocio (reemplaza al anterior)') as HTMLInputElement;
  expect(next.checked).toBe(false);
 });
});
