import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {WorkTask} from '../endpoints/work.schema';

vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:2,email:'delegate@example.com',displayName:'Delegada',role:'user'}}})}));
vi.mock('../endpoints/commercial.schema',()=>({getCommercialDetail:async()=>({account:{id:'5',nombre:'Hotel Sol',assignedUserEmail:'owner@example.com',doNotContact:false,archivedAt:null,telefono:'+5493411234567',email:'hotel@example.com'},contacts:[],opportunities:[{id:'9',accountId:'5',assignedUserEmail:'owner@example.com',opportunityName:'Venta principal',managementType:'main',tipo:'Hospedaje',commercialProfile:null,deletedAt:null,primaryContactId:null,estado:'main:contact'}],users:[]})}));
vi.mock('../endpoints/communication.schema',()=>({getCommunication:async()=>({restrictions:[],activeRestrictions:[],recentMessages:[],recentContactHours:72,openManagements:[]})}));
vi.mock('./PhoneCallPanel',()=>({PhoneCallPanel:()=>null}));
vi.mock('../endpoints/settings_GET.schema',()=>({getSettings:async()=>({templates:[]})}));
import {TaskContactDialog} from './TaskContactDialog';
const task={id:'31',accountId:'5',leadId:'9',title:'Llamar al hotel',typeId:'call',status:'pending',assignedUserEmail:'delegate@example.com',accountName:'Hotel Sol',opportunityName:'Venta principal'} as WorkTask;
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(cleanup);
describe('delegated task contact action',()=>{
 it('offers message preparation to the assignee from their pending task',async()=>{
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}><TaskContactDialog task={task} onClose={()=>{}} onLog={()=>{}}/></QueryClientProvider></MantineProvider>);
  expect((await screen.findByRole('button',{name:/Preparar WhatsApp con un mensaje modelo/}) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByRole('button',{name:/Preparar email con un mensaje modelo/}) as HTMLButtonElement).disabled).toBe(false);
 });
});
