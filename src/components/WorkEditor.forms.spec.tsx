import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {WorkData,WorkTask} from '../endpoints/work.schema';

const getWork=vi.hoisted(()=>vi.fn());
vi.mock('../endpoints/work.schema',async importOriginal=>({...(await importOriginal<typeof import('../endpoints/work.schema')>()),getWork,getWorkDuplicates:vi.fn(async()=>({tasks:[],total:0}))}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{email:'a@example.test',role:'user'}}})}));
import {WorkEditor,type WorkTarget} from './WorkEditor';

beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));
 window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}} as unknown as typeof ResizeObserver;
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

type Account=WorkData['accounts'][number];
const types=[{id:'call',name:'Llamada',agenda:false,active:true},{id:'message',name:'Mensaje',agenda:false,active:true},{id:'meeting',name:'Reunión',agenda:true,active:true},{id:'visit',name:'Visita',agenda:true,active:true}];
const data=({accounts=[],contacts=[]}:{accounts?:Account[];contacts?:WorkData['contacts']}={})=>({tasks:[],activities:[],types,accounts,opportunities:[],contacts,users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:0,totalTasks:0,totalActivities:0,page:1} as unknown as WorkData);
const hotel=(id:string,nombre:string,ciudad:string|null='Colón'):Account=>({id,nombre,ciudad,assignedUserEmail:'a@example.test'});
const open=(target:WorkTarget,initial=data())=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WorkEditor target={target} data={initial} onClose={()=>{}}/></QueryClientProvider></MantineProvider>);
const typeSelect=()=>screen.getByRole('combobox',{name:'Tipo'}) as HTMLSelectElement;

describe('«Agendar encuentro» opens with a meeting type (spec 104, 31)',()=>{
 it('with agenda the initial type is the first active agenda type, listed first',()=>{
  getWork.mockResolvedValue(data());
  open({kind:'task',agenda:true});
  expect(typeSelect().value).toBe('meeting');
  expect(Array.from(typeSelect().options).map(o=>o.value)).toEqual(['meeting','visit','call','message']);
 });
 it('without agenda a task still opens with «Llamada»',()=>{
  getWork.mockResolvedValue(data());
  open({kind:'task'});
  expect(typeSelect().value).toBe('call');
  expect(typeSelect().options[0].value).toBe('call');
 });
 it('«Anotar encuentro realizado» does the same for the activity',()=>{
  getWork.mockResolvedValue(data());
  open({kind:'activity',agenda:true});
  expect(typeSelect().value).toBe('meeting');
 });
});

describe('a business search with a single result offers it in one click (spec 104, 32; review M2: never picked by itself)',()=>{
 const lookup=(accounts:Account[])=>getWork.mockImplementation(async(params:{mode?:string;q?:string})=>params.mode==='lookup'&&params.q?{accounts,opportunities:[],contacts:[]}:data());
 const search=()=>screen.getByLabelText('Buscar negocio') as HTMLInputElement;
 const business=()=>screen.getByRole('combobox',{name:'Negocio'}) as HTMLSelectElement;
 it('one result shows «Elegir H9 · Hotel Sol · Colón» under the search, keeps the search mounted and picks nothing until clicked',async()=>{
  lookup([hotel('9','Hotel Sol')]);
  open({kind:'task'});
  const input=search();fireEvent.change(input,{target:{value:'sol'}});
  await screen.findByRole('button',{name:'Elegir H9 · Hotel Sol · Colón'});
  expect(business().value).toBe('');
  expect(input.isConnected).toBe(true);
  fireEvent.change(input,{target:{value:'sol y'}});
  expect(search()).toBe(input);expect(input.value).toBe('sol y');
  expect(screen.queryByRole('button',{name:'Elegir H9 · Hotel Sol · Colón'})).toBeNull();
  fireEvent.change(search(),{target:{value:'sol'}});
  fireEvent.click(await screen.findByRole('button',{name:'Elegir H9 · Hotel Sol · Colón'}));
  expect(business().value).toBe('9');
  expect(screen.getByRole('option',{name:'H9 · Hotel Sol · Colón'})).toBeTruthy();
 });
 it('Enter in the search picks the single result and never submits the form',async()=>{
  lookup([hotel('9','Hotel Sol')]);
  open({kind:'task'});
  fireEvent.change(search(),{target:{value:'sol'}});
  await screen.findByRole('button',{name:'Elegir H9 · Hotel Sol · Colón'});
  const enter=fireEvent.keyDown(search(),{key:'Enter'});
  expect(enter).toBe(false);
  expect(business().value).toBe('9');
 });
 it('a single «No contactar» result shows the No contactar mark next to the action',async()=>{
  lookup([{...hotel('9','Hotel Sol'),doNotContact:true}]);
  open({kind:'task'});
  fireEvent.change(search(),{target:{value:'sol'}});
  await screen.findByRole('button',{name:'Elegir H9 · Hotel Sol · Colón'});
  expect(screen.getByText('No contactar')).toBeTruthy();
 });
 it('two results keep the selector, with code and city to tell homonyms apart, and no single action',async()=>{
  lookup([hotel('9','Hotel Sol'),hotel('10','Hotel Sol','Federación')]);
  open({kind:'task'});
  fireEvent.change(search(),{target:{value:'sol'}});
  await screen.findByRole('option',{name:'H10 · Hotel Sol · Federación'});
  expect(business().value).toBe('');
  expect(screen.getByRole('option',{name:'H9 · Hotel Sol · Colón'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:/^Elegir H/})).toBeNull();
 });
 it('a search of one character offers nothing',async()=>{
  lookup([hotel('9','Hotel Sol')]);
  open({kind:'task'});
  fireEvent.change(search(),{target:{value:'s'}});
  await screen.findByRole('option',{name:'H9 · Hotel Sol · Colón'});
  expect(business().value).toBe('');
  expect(screen.queryByRole('button',{name:/^Elegir H/})).toBeNull();
 });
});

describe('people in «Revisá lo que se guardará» (spec 104, 24 editor)',()=>{
 it('says «Ninguna persona elegida» and «Elegir personas» opens the list',async()=>{
  getWork.mockResolvedValue(data());
  open({kind:'activity',accountId:'1',outcome:'no_answer'},data({accounts:[hotel('1','Hotel')],contacts:[{id:'5',accountId:'1',name:'Ana'},{id:'6',accountId:'1',name:'Bea'}]}));
  expect(screen.getByText('Ninguna persona elegida')).toBeTruthy();
  expect(screen.queryByText('Sin persona registrada')).toBeNull();
  const toggle=screen.getByRole('button',{name:'Participantes y notas (opcional)'});
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button',{name:'Elegir personas'}));
  await waitFor(()=>expect(toggle.getAttribute('aria-expanded')).toBe('true'));
  const ana=await screen.findByRole('checkbox',{name:'Ana'});
  await waitFor(()=>expect(document.activeElement).toBe(ana));
 });
 it('without people in the business it says so and offers nothing to open',()=>{
  getWork.mockResolvedValue(data());
  open({kind:'activity',accountId:'1',outcome:'no_answer'},data({accounts:[hotel('1','Hotel')]}));
  expect(screen.getByText('El negocio no tiene personas cargadas')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Elegir personas'})).toBeNull();
 });
});

describe('the only active person comes preselected (spec 104 D3)',()=>{
 const summary=()=>screen.getByRole('region',{name:'Revisión del resultado'});
 it('a business with one active person preselects her: visible in the summary and it can be unticked',async()=>{
  getWork.mockResolvedValue(data());
  open({kind:'activity',accountId:'1',outcome:'no_answer'},data({accounts:[hotel('1','Hotel')],contacts:[{id:'5',accountId:'1',name:'Ana'}]}));
  await waitFor(()=>expect(summary().textContent).toContain('PersonasAna'));
  fireEvent.click(screen.getByRole('button',{name:'Participantes y notas (opcional)'}));
  const ana=await screen.findByRole('checkbox',{name:'Ana'}) as HTMLInputElement;
  expect(ana.checked).toBe(true);
  fireEvent.click(ana);
  await waitFor(()=>expect(screen.getByText('Ninguna persona elegida')).toBeTruthy());
  expect(ana.checked).toBe(false);
 });
 it('with two or more people nobody is preselected',()=>{
  getWork.mockResolvedValue(data());
  open({kind:'activity',accountId:'1',outcome:'no_answer'},data({accounts:[hotel('1','Hotel')],contacts:[{id:'5',accountId:'1',name:'Ana'},{id:'6',accountId:'1',name:'Bea'}]}));
  expect(screen.getByText('Ninguna persona elegida')).toBeTruthy();
 });
 it('the person of the contact it comes from is kept as given',async()=>{
  getWork.mockResolvedValue(data());
  open({kind:'activity',accountId:'1',outcome:'no_answer',contactIds:['6']},data({accounts:[hotel('1','Hotel')],contacts:[{id:'5',accountId:'1',name:'Ana'},{id:'6',accountId:'1',name:'Bea'}]}));
  await waitFor(()=>expect(summary().textContent).toContain('PersonasBea'));
  expect(summary().textContent).not.toContain('Ana');
 });
 it('after a send without a person (the caller passes the send person) nobody is added',async()=>{
  getWork.mockResolvedValue(data());
  open({kind:'activity',accountId:'1',outcome:'no_answer',messageId:'m1'},data({accounts:[hotel('1','Hotel')],contacts:[{id:'5',accountId:'1',name:'Ana'}]}));
  fireEvent.click(screen.getByRole('button',{name:'Participantes y notas (opcional)'}));
  const ana=await screen.findByRole('checkbox',{name:'Ana'}) as HTMLInputElement;
  expect(ana.checked).toBe(false);
  expect(screen.getByText('Ninguna persona elegida')).toBeTruthy();
 });
 it('editing an existing activity never adds a person',async()=>{
  getWork.mockResolvedValue(data());
  const item={id:'7',accountId:'1',leadId:null,title:'Contacto',typeId:'message',occurredAt:new Date('2026-10-30T15:00:00Z'),outcome:'no_answer',result:'No respondió',participants:'',contactIds:[],purpose:'commercial',channel:'phone',notes:null} as never;
  open({kind:'activity',item},data({accounts:[hotel('1','Hotel')],contacts:[{id:'5',accountId:'1',name:'Ana'}]}));
  const ana=await screen.findByRole('checkbox',{name:'Ana'}) as HTMLInputElement;
  expect(ana.checked).toBe(false);
  expect(screen.getByText('Ninguna persona elegida')).toBeTruthy();
 });
 it('the preselected person is not an unsaved change: closing right away does not ask to discard, but unticking her does',async()=>{
  getWork.mockResolvedValue(data());
  const onClose=vi.fn();
  render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WorkEditor target={{kind:'activity',accountId:'1',outcome:'no_answer'}} data={data({accounts:[hotel('1','Hotel')],contacts:[{id:'5',accountId:'1',name:'Ana'}]})} onClose={onClose}/></QueryClientProvider></MantineProvider>);
  await waitFor(()=>expect(screen.getByRole('region',{name:'Revisión del resultado'}).textContent).toContain('PersonasAna'));
  fireEvent.click(screen.getByRole('button',{name:'Volver'}));
  expect(screen.queryByText('Tenés cambios sin guardar')).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Participantes y notas (opcional)'}));
  fireEvent.click(await screen.findByRole('checkbox',{name:'Ana'}));
  fireEvent.click(screen.getByRole('button',{name:'Volver'}));
  expect(await screen.findByText('Tenés cambios sin guardar')).toBeTruthy();
  expect(onClose).toHaveBeenCalledTimes(1);
 });
});

describe('time in 24 h (spec 104, 33)',()=>{
 it('a task at 15:00 (Argentina) shows 15 and 00 in the time field, never PM',()=>{
  getWork.mockResolvedValue(data());
  const item={id:'1',accountId:'1',leadId:null,title:'Visita',typeId:'visit',description:null,assignedUserEmail:'a@example.test',dueDate:'2099-10-30',dueAt:new Date('2099-10-30T18:00:00Z'),priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Hotel',city:null,opportunityName:null,deletedAt:null} as unknown as WorkTask;
  open({kind:'task',item},data({accounts:[hotel('1','Hotel')]}));
  expect((screen.getByLabelText('Hora (opcional)') as HTMLInputElement).value).toBe('15');
  expect((screen.getByRole('spinbutton',{name:'Minutos'}) as HTMLInputElement).value).toBe('00');
 });
 it('«Fecha y hora real» uses separate date and 24 h time fields',()=>{
  getWork.mockResolvedValue(data());
  open({kind:'activity',accountId:'1'},data({accounts:[hotel('1','Hotel')]}));
  expect(screen.getByLabelText('Fecha real')).toBeTruthy();
  expect(screen.getByLabelText('Hora real')).toBeTruthy();
  expect(document.querySelector('input[type="datetime-local"],input[type="time"]')).toBeNull();
 });
});
