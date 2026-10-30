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
 it('warns about a person phone shared with a No contactar business and saves only after the seller acknowledges it',async()=>{
  mocks.check.mockResolvedValue({candidates:[candidate('8',{nombre:'Hostería Muda',doNotContact:true,reasons:['Teléfono de la persona compartido']})]});
  mocks.save.mockResolvedValue({id:'56'});
  const onSaved=vi.fn();
  wrap(<BusinessQuickCreate onClose={()=>{}} onSaved={onSaved}/>);
  type('Nombre','Otro nombre');type('Nombre de la persona','Ana');type('Teléfono de la persona','3447 412345');
  const note=await screen.findByRole('note',{name:'Teléfono de un negocio No contactar'});
  expect(note.textContent).toContain('Este teléfono es de un negocio que pidió no ser contactado: Hostería Muda (Colón)');
  expect(screen.queryByRole('alert')).toBeNull();// it warns, it does not block
  expect(screen.queryByText('Puede que ya exista:')).toBeNull();
  await waitFor(()=>expect(create().disabled).toBe(true));
  fireEvent.click(screen.getByLabelText('Entendido, no voy a contactar a ese negocio'));
  await waitFor(()=>expect(create().disabled).toBe(false));
  fireEvent.click(create());
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith('56'));
  expect(mocks.save.mock.calls[0][0]).toMatchObject({primaryContact:{name:'Ana',phone:'3447 412345'},personPhoneDncAcknowledged:true});
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
 it('warns about a person phone of a No contactar business (never the own one) and enables saving once acknowledged',async()=>{
  mocks.check.mockResolvedValue({candidates:[candidate('5',{doNotContact:true,reasons:['Teléfono de la persona compartido']}),candidate('9',{nombre:'Posada Muda',doNotContact:true,reasons:['Teléfono de la persona compartido']})]});
  wrap(<CommercialEditor target={{kind:'contact'}} detail={detail([])} onClose={()=>{}}/>);
  type('Nombre de la persona','Luis');type('Teléfono','3447 412345');
  const note=await screen.findByRole('note',{name:'Teléfono de un negocio No contactar'});
  expect(note.textContent).toContain('Posada Muda (Colón)');expect(note.textContent).not.toContain('Cabañas del Río 5');
  const save=screen.getByRole('button',{name:/Guardar/}) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('Entendido, no voy a contactar a ese negocio'));
  expect(save.disabled).toBe(false);
 });
 it('does not save a person before the typed phone was checked, and warns only when the phone changed',async()=>{
  mocks.check.mockReturnValue(new Promise(()=>{}));
  wrap(<CommercialEditor target={{kind:'contact'}} detail={detail([])} onClose={()=>{}}/>);
  type('Nombre de la persona','Luis');type('Teléfono','3447 412345');
  const save=screen.getByRole('button',{name:/Guardar/}) as HTMLButtonElement;
  expect(save.disabled).toBe(true);// debounce has not caught up yet
  fireEvent.submit(save.closest('form')!);
  await waitFor(()=>expect(mocks.check).toHaveBeenCalled());
  expect(save.disabled).toBe(true);// request in flight
  fireEvent.submit(save.closest('form')!);
  expect(mocks.save).not.toHaveBeenCalled();
  cleanup();mocks.check.mockReset();
  wrap(<CommercialEditor target={{kind:'contact',item:{id:'3',name:'Ana',phone:'3447 400222',isPrimary:false} as never}} detail={detail([])} onClose={()=>{}}/>);
  type('Nombre de la persona','Ana Maria');
  await new Promise(r=>setTimeout(r,600));
  expect(mocks.check).not.toHaveBeenCalled();expect(screen.queryByRole('note')).toBeNull();
  expect((screen.getByRole('button',{name:/Guardar/}) as HTMLButtonElement).disabled).toBe(false);
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

describe('BusinessQuickCreate prefill and Instagram (spec 98 §17)',()=>{
 it('opens with the prefilled phone and checks it for duplicates; closing without changes asks nothing',async()=>{
  // Arrange
  mocks.check.mockResolvedValue({candidates:[]});const onClose=vi.fn();
  // Act
  wrap(<BusinessQuickCreate onClose={onClose} prefill={{telefono:'+5493442453797'}}/>);
  // Assert
  expect((screen.getByLabelText('Teléfono / WhatsApp') as HTMLInputElement).value).toBe('+5493442453797');
  await waitFor(()=>expect(mocks.check).toHaveBeenLastCalledWith({telefono:'+5493442453797'},{signal:expect.any(AbortSignal)}));
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  expect(onClose).toHaveBeenCalled();
 });
 it('prefills the Instagram, checks it for duplicates and saves it as the profile URL',async()=>{
  mocks.check.mockResolvedValue({candidates:[]});mocks.save.mockResolvedValue({id:'56'});
  wrap(<BusinessQuickCreate onClose={()=>{}} prefill={{instagram:'@cabanas_del_rio'}}/>);
  expect((screen.getByLabelText('Instagram') as HTMLInputElement).value).toBe('@cabanas_del_rio');
  await waitFor(()=>expect(mocks.check).toHaveBeenLastCalledWith({instagram:'cabanas_del_rio'},{signal:expect.any(AbortSignal)}));
  type('Nombre','Cabañas del Río');
  await waitFor(()=>expect(create().disabled).toBe(false));
  fireEvent.click(create());
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(1));
  expect(mocks.save.mock.calls[0][0]).toMatchObject({action:'account_save',nombre:'Cabañas del Río',perfilInstagram:'https://www.instagram.com/cabanas_del_rio/'});
 });
 it('refuses an Instagram that is not a profile, with the reason, and never sends it',async()=>{
  mocks.check.mockResolvedValue({candidates:[]});
  wrap(<BusinessQuickCreate onClose={()=>{}}/>);
  type('Nombre','Cabañas del Río');type('Instagram','no es un usuario!');
  expect(screen.getByRole('alert').textContent).toContain('Escribí el usuario de Instagram');
  expect(create().disabled).toBe(true);
  type('Instagram','');await waitFor(()=>expect(create().disabled).toBe(false));
 });
 it('a No contactar business with the same Instagram blocks saving like a shared phone',async()=>{
  mocks.check.mockResolvedValue({candidates:[candidate('9',{doNotContact:true,blocking:true,reasons:['Instagram compartido']})]});
  wrap(<BusinessQuickCreate onClose={()=>{}} prefill={{instagram:'cabanas_del_rio'}}/>);
  type('Nombre','Otro nombre');
  expect(await screen.findByText('Mismo Instagram',{exact:false})).toBeTruthy();
  expect(create().disabled).toBe(true);
 });
});

