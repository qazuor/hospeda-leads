import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {CommercialDetail} from '../endpoints/commercial.schema';

vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:3,email:'owner@example.com',role:'user',displayName:'Ana'}}})}));
vi.mock('../endpoints/pipeline.schema',()=>({getPipeline:vi.fn().mockResolvedValue({stages:[{name:'open',classification:'open'}]})}));
vi.mock('../endpoints/settings_GET.schema',()=>({getSettings:vi.fn().mockResolvedValue({templates:[]})}));
vi.mock('../endpoints/communication.schema',()=>({getCommunication:vi.fn().mockResolvedValue({recentMessages:[],messages:[],restrictions:[]})}));
vi.mock('./GeneralMessageStep',()=>({GeneralMessageStep:({channel}:{channel:string})=><div>general composer · {channel}</div>}));
vi.mock('./ContactTemplateDialog',()=>({ContactTemplateDialog:({channel}:{channel:string})=><div>management composer · {channel}</div>}));
vi.mock('./ManualCommunicationForm',()=>({ManualCommunicationForm:()=><div>manual form</div>}));
vi.mock('./PhoneCallPanel',()=>({PhoneCallPanel:()=><div>call</div>,useCallSession:()=>({reset:()=>{}})}));
vi.mock('./CommercialEditor',()=>({CommercialEditor:()=><div>editor</div>}));
import {BusinessContactDialog,INSTAGRAM_MISSING_REASON} from './BusinessContactDialog';

beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}} as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const detail=(perfilInstagram:string|null)=>({account:{id:'7',nombre:'Hotel Sol',status:'contacted',tipo:'Hotel',ciudad:'Colón',assignedUserEmail:'owner@example.com',whatsapp:null,email:null,telefono:'+54 9 3447 111111',perfilInstagram,doNotContact:false,archivedAt:null,isClient:false},contacts:[],opportunities:[],users:[],journal:[],leadJournal:[]}) as unknown as CommercialDetail;
const show=(perfil:string|null)=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BusinessContactDialog detail={detail(perfil)} onClose={()=>{}}/></QueryClientProvider></MantineProvider>);

describe('BusinessContactDialog · Instagram (spec 92)',()=>{
 it('offers «Instagram» between «Email · Brevo» and «Llamada» and opens the Instagram composer',async()=>{
  show('https://instagram.com/hotel.sol');
  const select=await screen.findByLabelText('Canal') as HTMLSelectElement;
  expect([...select.options].map(o=>o.textContent)).toEqual(['WhatsApp','Email · Brevo','Instagram','Llamada','Red social','Otro canal']);
  fireEvent.change(select,{target:{value:'instagram'}});
  expect(screen.getByText('@hotel.sol')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continuar con el mensaje'}));
  expect(await screen.findByText('general composer · instagram')).toBeTruthy();
 });
 it('disables the option without a valid username and explains why',async()=>{
  show('no es un perfil');
  const select=await screen.findByLabelText('Canal') as HTMLSelectElement;
  expect([...select.options].find(o=>o.value==='instagram')?.disabled).toBe(true);
  fireEvent.change(select,{target:{value:'instagram'}});
  expect(screen.getByText(INSTAGRAM_MISSING_REASON)).toBeTruthy();
  expect((screen.getByRole('button',{name:'Continuar con el mensaje'}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('button',{name:'Agregar o editar datos de contacto'})).toBeTruthy();
 });
});
