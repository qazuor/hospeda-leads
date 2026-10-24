import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import type {CommercialHistoryData,CommercialHistoryEvent} from '../endpoints/businessHistory.schema';

const event=(id:string,title:string,kind:CommercialHistoryEvent['kind']):CommercialHistoryEvent=>({id,occurredAt:new Date('2026-10-20T15:00:00Z'),kind,title,result:null,notes:null,channel:null,outcome:null,continuation:null,actorEmail:null,leadId:null,opportunityName:null,recipientName:null,messageStatus:null,messageSubject:null,messageText:null});
// The newest event is a data change; the summary must still show the latest contact.
const page:CommercialHistoryData={events:[event('change:1','Datos del negocio editados','change'),event('activity:2','Llamada a la dueña','activity')],total:2,page:1,pending:[],totalPending:0,lastContact:event('activity:2','Llamada a la dueña','activity')};
const getBusinessHistory=vi.fn(async(..._args:unknown[])=>page);
vi.mock('../endpoints/businessHistory.schema',()=>({getBusinessHistory:(...args:unknown[])=>getBusinessHistory(...args)}));
vi.mock('../endpoints/pipeline.schema',()=>({getPipeline:async()=>({stages:[]})}));
vi.mock('./NextWork',()=>({NextWork:()=>null}));
const {BusinessSummary}=await import('./BusinessSummary');
const {BusinessHistory}=await import('./BusinessHistory');

window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
afterEach(()=>{cleanup();getBusinessHistory.mockClear();});

describe('BusinessSummary with BusinessHistory',()=>{
 it('loads the latest contact once for the summary and the timeline',async()=>{
  const detail={account:{id:'7',commercialStatus:'prospect'},contacts:[],opportunities:[]} as unknown as CommercialDetail;
  render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter>
   <BusinessSummary detail={detail} onContact={()=>{}} onSale={()=>{}}/>
   <BusinessHistory accountId="7"/>
  </MemoryRouter></QueryClientProvider></MantineProvider>);
  expect(await screen.findByText('Datos del negocio editados')).toBeTruthy();
  const summary=screen.getByText('Última conversación o acción').parentElement!;
  expect(summary.textContent).toContain('Llamada a la dueña');
  expect(summary.textContent).not.toContain('Datos del negocio editados');
  expect(getBusinessHistory).toHaveBeenCalledTimes(1);
  expect(getBusinessHistory).toHaveBeenCalledWith('7',1);
 });
});
