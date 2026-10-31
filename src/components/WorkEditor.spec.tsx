import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {WorkData,WorkTask} from '../endpoints/work.schema';

const getWork=vi.hoisted(()=>vi.fn());
vi.mock('../endpoints/work.schema',async importOriginal=>({...(await importOriginal<typeof import('../endpoints/work.schema')>()),getWork,getWorkDuplicates:vi.fn(async()=>({tasks:[],total:0}))}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{email:'a@example.test',role:'user'}}})}));
import {WorkEditor,nextPendingNotice,shouldShowNoPendingTaskWarning} from './WorkEditor';
import {formatDate} from '../helpers/crmDates';

beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));
 window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}} as unknown as typeof ResizeObserver;
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

const task=(id:string):WorkTask=>({id,accountId:'1',leadId:null,title:id,typeId:'call',description:null,assignedUserEmail:'a@example.test',dueDate:'2099-10-30',dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Hotel',city:null,opportunityName:null,deletedAt:null});
const data=(tasks:WorkTask[]=[])=>({tasks,activities:[],types:[{id:'call',name:'Llamada',active:true},{id:'followup',name:'Seguimiento',active:true}],accounts:[{id:'1',nombre:'Hotel'}],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:0,totalTasks:tasks.length,totalActivities:0,page:1} as unknown as WorkData);
const warning='No vemos otra tarea pendiente. ¿Querés agendar una?';
const chooseOtherTaskReason=async(pending:WorkTask[],target:Parameters<typeof WorkEditor>[0]['target'])=>{
 getWork.mockImplementation(async(params:{mode?:string})=>params.mode==='detail'?data(pending):data());
 render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WorkEditor target={target} data={data()} onClose={()=>{}}/></QueryClientProvider></MantineProvider>);
 fireEvent.change(await screen.findByLabelText(/¿Cómo sigue\?/),{target:{value:'done'}});
 fireEvent.change(await screen.findByLabelText(/¿Por qué no agendás nada\?/),{target:{value:'Ya tengo otra tarea agendada'}});
 await waitFor(()=>expect(getWork).toHaveBeenCalledWith({mode:'detail',accountId:'1'}));
};

describe('D5 warning for «Ya tengo otra tarea agendada»',()=>{
 it('warns without blocking when the business has no other visible pending task',async()=>{
  await chooseOtherTaskReason([],{kind:'activity',accountId:'1'});
  expect(await screen.findByText(warning)).toBeTruthy();
  expect(screen.getByText(warning).getAttribute('role')).toBe('status');
 });
 it('does not warn when another pending task of the business is visible',async()=>{
  await chooseOtherTaskReason([task('another')],{kind:'activity',accountId:'1'});
  await waitFor(()=>expect(getWork).toHaveBeenCalledTimes(2));
  await new Promise(resolve=>setTimeout(resolve,50));
  expect(screen.queryByText(warning)).toBeNull();
 });
 it('excludes the task being completed on the client, without sending excludeTaskId',async()=>{
  await chooseOtherTaskReason([task('completed')],{kind:'complete',item:task('completed')});
  expect(await screen.findByText(warning)).toBeTruthy();
  expect(getWork.mock.calls.every(([params])=>!('excludeTaskId' in (params as object)))).toBe(true);
 });
 it('helper: ignores the excluded task and finished or removed tasks',()=>{
  expect(shouldShowNoPendingTaskWarning([task('completed')],'completed')).toBe(true);
  expect(shouldShowNoPendingTaskWarning([task('completed'),task('another')],'completed')).toBe(false);
  expect(shouldShowNoPendingTaskWarning([{...task('done'),status:'completed'},{...task('gone'),deletedAt:new Date()}])).toBe(true);
 });
});

describe('toast after saving: next pending in the business (spec 99 §3.6)',()=>{
 const none={items:[],count:0,groupCount:0},followUps=(unconfirmed:number,outcomes:number)=>({unconfirmed:{items:[],count:unconfirmed,groupCount:unconfirmed},outcomes:{items:[],count:outcomes,groupCount:outcomes},expired:{unconfirmed:none,outcomes:none}});
 it('names the next task of the management or a general task of the business',()=>{
  const general=task('general'),other={...task('other'),leadId:'8',dueDate:'2099-10-01'},own={...task('own'),leadId:'7',dueDate:'2099-11-02'};
  expect(nextPendingNotice({tasks:[own,other,general],accountId:'1',leadId:'7',followUps:followUps(1,2)})).toEqual({description:'Próximo pendiente: general · '+formatDate('2099-10-30'),link:{label:'Ver pendiente',href:'/my-day?accountId=1&taskId=general'}});
 });
 it('without tasks and with 3 contacts says how many are left and links to «Comunicación»',()=>{
  expect(nextPendingNotice({tasks:[{...task('done'),status:'completed'}],accountId:'1',leadId:'7',followUps:followUps(1,2)})).toEqual({description:'Quedan 3 contactos por anotar en este negocio.',link:{label:'Ver en Comunicación',href:'/accounts/1?section=communication'}});
  expect(nextPendingNotice({tasks:[],accountId:'1',followUps:followUps(0,1)}).description).toBe('Queda 1 contacto por anotar en este negocio.');
 });
 it('with nothing left says so for the business, without «visible»',()=>{
  expect(nextPendingNotice({tasks:[],accountId:'1',leadId:'7',followUps:followUps(0,0)})).toEqual({description:'No hay otro pendiente en este negocio.',link:{label:'Abrir gestión',href:'/sales/7'}});
  expect(nextPendingNotice({tasks:[],accountId:'1'})).toEqual({description:'No hay otro pendiente en este negocio.',link:{label:'Ver historial',href:'/accounts/1?section=history'}});
 });
 it('when the follow-up read failed it does not claim there is nothing left',()=>{
  expect(nextPendingNotice({tasks:undefined,accountId:'1',leadId:'7'})).toEqual({description:'No pudimos revisar los otros pendientes de este negocio.',link:{label:'Abrir gestión',href:'/sales/7'}});
 });
});
