import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TechnicalRestrictions} from './TechnicalRestrictions';
const api=vi.hoisted(()=>({role:'user'}));
vi.mock('../endpoints/communication.schema',()=>({getCommunication:vi.fn(async()=>({restrictions:[]})),postCommunication:vi.fn()}));
vi.mock('../endpoints/commercial.schema',()=>({getCommercialDetail:vi.fn(async()=>({account:{id:'1'},contacts:[],users:[]}))}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{role:api.role,email:'u@example.com'}}})}));
beforeEach(()=>{api.role='user';window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}))});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const setup=()=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TechnicalRestrictions accountId="1"/></QueryClientProvider></MantineProvider>);
const help=/Las restricciones por canal las registra un administrador\. Si el negocio pidió que no le escriban por un canal, avisale a un administrador\. Si pidió no ser contactado por ningún medio, lo registra el responsable del negocio o el de una de sus gestiones desde «Anotar lo que pasó» → «Pidió no ser contactado»; si no sos responsable, avisale a un administrador\./;

describe('TechnicalRestrictions copy for sellers (spec 104, 29)',()=>{
 it('a seller reads who registers channel restrictions and sees no form',async()=>{
  setup();
  expect(await screen.findByText(help)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Registrar restricción técnica'})).toBeNull();
 });
 it('an admin keeps the form and does not get the seller note',async()=>{
  api.role='admin';setup();
  expect(await screen.findByRole('button',{name:'Registrar restricción técnica'})).toBeTruthy();
  expect(screen.queryByText(help)).toBeNull();
 });
});
