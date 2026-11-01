import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {ContactChannel,ContactOptions} from './communication/types';

const getCommercialDetail=vi.hoisted(()=>vi.fn());
const getPipeline=vi.hoisted(()=>vi.fn());
vi.mock('../endpoints/pipeline.schema',async importOriginal=>({...(await importOriginal<typeof import('../endpoints/pipeline.schema')>()),getPipeline}));
vi.mock('../endpoints/commercial.schema',async importOriginal=>({...(await importOriginal<typeof import('../endpoints/commercial.schema')>()),getCommercialDetail}));
vi.mock('../endpoints/lead_notes_GET.schema',()=>({getLeadNotes:vi.fn().mockResolvedValue({notes:[]})}));
vi.mock('../endpoints/lead_journal_GET.schema',()=>({getLeadJournal:vi.fn().mockResolvedValue({rows:[]})}));
vi.mock('./Pipeline',()=>({PipelineDetail:()=>null,StageBadgeButton:()=>null}));
vi.mock('./WorkPanel',()=>({WorkPanel:()=>null}));
vi.mock('./CommercialPanel',()=>({CommercialPanel:()=>null}));
vi.mock('./ResourcesPanel',()=>({ResourcesPanel:()=>null}));
vi.mock('./HelpLink',()=>({HelpLink:()=>null}));
// The real action bar shows WhatsApp, Instagram and Email only when it receives onContact; the stub mirrors that contract.
vi.mock('./CommunicationPanel',()=>({CommunicationPanel:({onContact}:{onContact?:(channel?:ContactChannel,options?:ContactOptions)=>void})=>
 <div data-testid="communication">{onContact?(['whatsapp','instagram','email'] as const).map(channel=><button key={channel} onClick={()=>onContact(channel)}>{channel}</button>):'Sin botones de canal'}</div>}));
vi.mock('./BusinessContactDialog',()=>({BusinessContactDialog:({initialLeadId,initialChannel,onClose}:{initialLeadId?:string;initialChannel?:string;onClose:()=>void})=>
 <div role="dialog" aria-label="Contactar">Contactar · gestión {initialLeadId} · {initialChannel}<button onClick={onClose}>Cerrar contacto</button></div>}));
import {LeadDetailDialog} from './LeadDetailDialog';

afterEach(()=>{cleanup();vi.clearAllMocks();});
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));});

const lead={id:'41',accountId:'7',nombre:'Cabañas del Río',opportunityName:'Plan anual',estado:'Cargado',canModify:true};
const stages={stages:[{name:'Cargado',classification:'open'},{name:'Ganado',classification:'won'}]};
const setup=(props:{readOnly?:boolean;estado?:string}={})=>{
 getPipeline.mockResolvedValue(stages);
 getCommercialDetail.mockResolvedValue({account:{id:'7',nombre:'Cabañas del Río'},contacts:[],opportunities:[{id:'41',estado:props.estado??'Cargado'},{id:'42',estado:'Cargado'}]});
 return render(<MantineProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter><LeadDetailDialog page open lead={lead} onOpenChange={()=>undefined} {...props}/></MemoryRouter></QueryClientProvider></MantineProvider>);
};

describe('LeadDetailDialog communication (spec 104, finding 26)',()=>{
 it('offers the channel buttons and opens the contact with this management chosen',async()=>{
  setup();
  fireEvent.click(screen.getByRole('tab',{name:'Comunicación'}));
  fireEvent.click(await screen.findByRole('button',{name:'whatsapp'}));
  expect(screen.getByRole('dialog',{name:'Contactar'}).textContent).toContain('gestión 41 · whatsapp');
  expect(getCommercialDetail).toHaveBeenCalledWith(undefined,'41');
  fireEvent.click(screen.getByRole('button',{name:'Cerrar contacto'}));
  expect(screen.queryByRole('dialog',{name:'Contactar'})).toBeNull();
 });
 it('shows no channel buttons in read-only mode',async()=>{
  setup({readOnly:true});
  fireEvent.click(screen.getByRole('tab',{name:'Comunicación'}));
  expect((await screen.findByTestId('communication')).textContent).toBe('Sin botones de canal');
  expect(getCommercialDetail).not.toHaveBeenCalled();
 });
 it('offers no channel buttons for a closed management and explains why',async()=>{
  setup({estado:'Ganado'});
  fireEvent.click(screen.getByRole('tab',{name:'Comunicación'}));
  expect(await screen.findByText('La gestión está cerrada. Para contactar, abrí el negocio.')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'whatsapp'})).toBeNull();
 });
 it('shows an error with a retry when the business detail fails to load',async()=>{
  getPipeline.mockResolvedValue(stages);getCommercialDetail.mockRejectedValue(new Error('Sin conexión'));
  render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><LeadDetailDialog page open lead={lead} onOpenChange={()=>undefined}/></MemoryRouter></QueryClientProvider></MantineProvider>);
  fireEvent.click(screen.getByRole('tab',{name:'Comunicación'}));
  const retry=await screen.findByRole('button',{name:'Reintentar'});
  expect(screen.queryByRole('button',{name:'whatsapp'})).toBeNull();
  getCommercialDetail.mockResolvedValue({account:{id:'7',nombre:'Cabañas del Río'},contacts:[],opportunities:[{id:'41',estado:'Cargado'}]});
  fireEvent.click(retry);
  expect(await screen.findByRole('button',{name:'whatsapp'})).toBeTruthy();
 });
});
