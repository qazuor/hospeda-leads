import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TechnicalRestrictions} from './TechnicalRestrictions';
const api=vi.hoisted(()=>({role:'user',owner:null as string|null,managementOwner:null as string|null,doNotContact:false,archivedAt:null as string|null,restrictions:[] as unknown[]}));
vi.mock('../endpoints/communication.schema',()=>({getCommunication:vi.fn(async()=>({restrictions:api.restrictions})),postCommunication:vi.fn()}));
vi.mock('../endpoints/commercial.schema',()=>({getCommercialDetail:vi.fn(async()=>({account:{id:'1',assignedUserEmail:api.owner,doNotContact:api.doNotContact,archivedAt:api.archivedAt},opportunities:api.managementOwner?[{id:'9',assignedUserEmail:api.managementOwner,deletedAt:null}]:[],contacts:[],users:[]}))}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{role:api.role,email:'u@example.com'}}})}));
beforeEach(()=>{Object.assign(api,{role:'user',owner:null,managementOwner:null,doNotContact:false,archivedAt:null,restrictions:[]});window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}))});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const setup=()=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TechnicalRestrictions accountId="1"/></QueryClientProvider></MantineProvider>);
const help=/Las restricciones por canal las registra el responsable del negocio, el de una de sus gestiones o un administrador\. Si el negocio pidió que no le escriban por un canal, avisale al responsable\. Si pidió no ser contactado por ningún medio, lo registra el responsable desde «Anotar lo que pasó» → «Pidió no ser contactado»; si no sos responsable, avisale a un administrador\./;
const responsibleHelp=/Solo un administrador puede levantar una restricción\. Si el negocio pidió no ser contactado por ningún medio, registralo desde «Anotar lo que pasó» → «Pidió no ser contactado»\./;
const active={id:'r1',channel:'whatsapp',contactId:null,reason:'Pidió que no le escribamos por WhatsApp',actorEmail:'u@example.com',createdAt:new Date('2026-10-30T12:00:00Z'),liftedAt:null,liftReason:null,liftedBy:null};

describe('TechnicalRestrictions copy for sellers (spec 104, 29)',()=>{
 it('a seller reads who registers channel restrictions and sees no form',async()=>{
  setup();
  expect(await screen.findByText(help)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Registrar restricción técnica'})).toBeNull();
 });
 it('the business responsible may add a restriction (D2) but not lift it',async()=>{
  api.owner='u@example.com';api.restrictions=[active];setup();
  expect(await screen.findByRole('button',{name:'Registrar restricción técnica'})).toBeTruthy();
  expect(screen.getByText(responsibleHelp)).toBeTruthy();expect(screen.queryByText(help)).toBeNull();
  expect(screen.queryByRole('button',{name:'Levantar restricción'})).toBeNull();
 });
 it('the responsible of one of its managements may add a restriction too',async()=>{
  api.owner='other@example.com';api.managementOwner='u@example.com';setup();
  expect(await screen.findByRole('button',{name:'Registrar restricción técnica'})).toBeTruthy();
 });
 it('on a No contactar business the responsible gets no form, only the read-only notice',async()=>{
  api.owner='u@example.com';api.doNotContact=true;setup();
  expect(await screen.findByText('Este negocio pidió no ser contactado. Solo un administrador puede modificarlo.')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Registrar restricción técnica'})).toBeNull();
 });
 it('on an archived business the responsible gets no form (the server rejects it), an admin keeps it',async()=>{
  api.owner='u@example.com';api.archivedAt='2026-10-01T00:00:00Z';setup();
  expect(await screen.findByText(help)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Registrar restricción técnica'})).toBeNull();
  cleanup();api.role='admin';setup();
  expect(await screen.findByRole('button',{name:'Registrar restricción técnica'})).toBeTruthy();
 });
 it('an admin keeps the form and the lift action, without the seller notes',async()=>{
  api.restrictions=[active];
  api.role='admin';setup();
  expect(await screen.findByRole('button',{name:'Registrar restricción técnica'})).toBeTruthy();
  expect(await screen.findByRole('button',{name:'Levantar restricción'})).toBeTruthy();
  expect(screen.queryByText(help)).toBeNull();expect(screen.queryByText(responsibleHelp)).toBeNull();
 });
});
