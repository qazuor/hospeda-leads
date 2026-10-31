import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import type {Account,CommercialDetail,Contact} from '../endpoints/commercial.schema';

const mocks=vi.hoisted(()=>({save:vi.fn(),check:vi.fn(async()=>({candidates:[]})),success:vi.fn()}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}})}));
const catalog={types:['Alojamiento'],subtypes:[],users:[],contactPositions:['Propietario/a','Encargado/a'],contactChannels:['WhatsApp','Email'],cities:[{id:'1',name:'San José'},{id:'2',name:'Peña'}]};
const settings=vi.hoisted(()=>({load:vi.fn()}));
vi.mock('../endpoints/settings_GET.schema',()=>({getSettings:()=>settings.load()}));
vi.mock('../endpoints/business_duplicate_check.schema',()=>({checkBusinessDuplicates:mocks.check,DNC_DUPLICATE_MESSAGE:'No contactar'}));
vi.mock('../endpoints/commercial.schema',()=>({saveCommercial:mocks.save}));
vi.mock('../helpers/crmFeedback',()=>({crmSuccess:mocks.success}));
import {CommercialEditor} from './CommercialEditor';
import {BusinessQuickCreate} from './BusinessQuickCreate';

beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
});
beforeEach(()=>{settings.load.mockReset();settings.load.mockImplementation(async()=>catalog);mocks.save.mockReset();mocks.save.mockResolvedValue({id:'55'});mocks.success.mockReset();});
afterEach(cleanup);

const wrap=(node:React.ReactNode)=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider></MantineProvider>);
const account={id:'7',nombre:'Hotel Sol',ciudad:'San Jose',tipo:'Alojamiento',subtipo:null,assignedUserEmail:'admin@example.com'} as unknown as Account;
const detail={account,contacts:[],users:[],canEditContactData:true} as unknown as CommercialDetail;
const person=(position:string)=>({id:'3',accountId:'7',name:'Ana',position,phone:null,email:null,preferredChannel:'Whatsapp',notes:null,isPrimary:true,deletedAt:null}) as unknown as Contact;
const help='Este valor no está en la lista actual. Elegí uno de la lista para corregirlo.';

describe('values outside the catalog (spec 104, 25)',()=>{
 it('a stored «Duenio» reads «Duenio · no está en la lista» with the help, which goes away after choosing a catalog value',async()=>{
  wrap(<CommercialEditor target={{kind:'contact',item:person('Duenio')}} detail={detail} onClose={()=>{}}/>);
  const position=await screen.findByRole('combobox',{name:'Cargo'}) as HTMLSelectElement;
  await screen.findByRole('option',{name:'Propietario/a'});
  expect(screen.getByRole('option',{name:'Duenio · no está en la lista'})).toBeTruthy();
  expect(screen.queryByText(/histórico/)).toBeNull();
  expect(screen.getAllByText(help)).toHaveLength(2);
  expect(position.getAttribute('aria-describedby')).toBeTruthy();
  fireEvent.change(position,{target:{value:'Propietario/a'}});
  expect(screen.queryByRole('option',{name:'Duenio · no está en la lista'})).toBeNull();
  expect(screen.getAllByText(help)).toHaveLength(1);
 });
 it('a catalog value shows no help',async()=>{
  wrap(<CommercialEditor target={{kind:'contact',item:{...person('Propietario/a'),preferredChannel:'WhatsApp'} as Contact}} detail={detail} onClose={()=>{}}/>);
  await screen.findByRole('option',{name:'Encargado/a'});
  expect(screen.queryByText(help)).toBeNull();
 });
});

describe('while the catalog is still loading (spec 104, 25; review LOW)',()=>{
 it('the stored vertical and cargo stay selected and nothing is flagged as off the list',async()=>{
  settings.load.mockImplementation(()=>new Promise(()=>{}));
  wrap(<CommercialEditor target={{kind:'account',item:account}} detail={detail} onClose={()=>{}}/>);
  expect((screen.getByRole('combobox',{name:'Vertical'}) as HTMLSelectElement).value).toBe('Alojamiento');
  expect(screen.queryByText(/no está en la lista/)).toBeNull();
  cleanup();
  wrap(<CommercialEditor target={{kind:'contact',item:person('Propietario/a')}} detail={detail} onClose={()=>{}}/>);
  expect((screen.getByRole('combobox',{name:'Cargo'}) as HTMLSelectElement).value).toBe('Propietario/a');
  expect(screen.queryByText(/no está en la lista/)).toBeNull();
 });
});

describe('city from the catalog (spec 104, 37)',()=>{
 it('editing a business saves «San Jose» as the catalog «San José» and says so',async()=>{
  // Without a stored vertical, «Alojamiento» only appears once the catalog (and its cities) has loaded.
  wrap(<CommercialEditor target={{kind:'account',item:{...account,tipo:null} as Account}} detail={detail} onClose={()=>{}}/>);
  await screen.findByRole('option',{name:'Alojamiento'});
  fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalled());
  expect(mocks.save.mock.calls[0][0]).toMatchObject({action:'account_save',ciudad:'San José'});
  await waitFor(()=>expect(mocks.success).toHaveBeenCalledWith('Negocio guardado',expect.anything(),'Se guardó como «San José», la ciudad de la lista.'));
 });
 it('a new business typed «san jose» is created as «San José»; «Pena» stays as typed (ñ ≠ n)',async()=>{
  wrap(<BusinessQuickCreate onClose={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Nombre'),{target:{value:'Cabañas'}});
  fireEvent.change(screen.getByLabelText('Ciudad'),{target:{value:'san jose'}});
  await screen.findByRole('option',{name:'Alojamiento',hidden:true});
  const create=screen.getByRole('button',{name:'Crear negocio'}) as HTMLButtonElement;
  await waitFor(()=>expect(create.disabled).toBe(false));
  fireEvent.click(create);
  await waitFor(()=>expect(mocks.save).toHaveBeenCalled());
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ciudad:'San José'});
  expect(mocks.success.mock.calls[0][2]).toBe('Se guardó como «San José», la ciudad de la lista.');
  cleanup();mocks.save.mockClear();
  wrap(<BusinessQuickCreate onClose={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Nombre'),{target:{value:'Cabañas'}});
  fireEvent.change(screen.getByLabelText('Ciudad'),{target:{value:'Pena'}});
  const again=screen.getByRole('button',{name:'Crear negocio'}) as HTMLButtonElement;
  await waitFor(()=>expect(again.disabled).toBe(false));
  fireEvent.click(again);
  await waitFor(()=>expect(mocks.save).toHaveBeenCalled());
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ciudad:'Pena'});
 });
});
