import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ManualCommunicationForm} from './ManualCommunicationForm';
import {getCommunication} from '../endpoints/communication.schema';
import {getSettings} from '../endpoints/settings_GET.schema';
import {toast} from 'sonner';
import {beforeAll} from 'vitest';

vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock('../endpoints/communication.schema',async original=>({...await original<typeof import('../endpoints/communication.schema')>(),getCommunication:vi.fn(),postCommunication:vi.fn()}));
vi.mock('../endpoints/settings_GET.schema',async original=>({...await original<typeof import('../endpoints/settings_GET.schema')>(),getSettings:vi.fn()}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);});

const details={account:{id:'5',nombre:'Hotel Sol',assignedUserEmail:'seller@example.com',email:'hola@example.com',telefono:null,tipo:'Alojamiento',ciudad:'Colón',subtipo:'Hotel',archivedAt:null,recontactAt:null,status:'active',doNotContact:false,isClient:false},contacts:[],opportunities:[],users:[{email:'seller@example.com',displayName:'Leo'}]};
const template={id:'t1',name:'Presentación',channel:'social',subject:null,body:'<p>Hola {{name}}</p>',vertical:null,managementType:null,commercialProfile:null,active:true};
const show=()=>render(<MantineProvider><QueryClientProvider client={new QueryClient()}><ManualCommunicationForm detail={details} currentLeadId={null} userEmail="seller@example.com" isAdmin={false} fixedContext/></QueryClientProvider></MantineProvider>);

describe('ManualCommunicationForm social template copy',()=>{
 it('copies the rendered template and reports success',async()=>{
  vi.mocked(getSettings).mockResolvedValue({templates:[template]} as never);
  vi.mocked(getCommunication).mockResolvedValue({recentMessages:[],restrictions:[],templatePicks:{},recentContactHours:72} as never);
  const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  show();
  fireEvent.click(screen.getByRole('button',{name:'Registrar contacto por red social u otro canal'}));
  await screen.findByRole('option',{name:'Presentación'});
  fireEvent.change(screen.getByLabelText('Modelo (opcional)'),{target:{value:'t1'}});
  fireEvent.click(screen.getByRole('button',{name:'Copiar texto'}));
  await waitFor(()=>expect(writeText).toHaveBeenCalledWith('Hola Hotel Sol'));
  expect(await screen.findByText('Texto del modelo copiado.')).toBeTruthy();
  expect(toast.success).toHaveBeenCalledWith('Texto del modelo copiado');
 });
 it('uses the clipboard fallback when the Clipboard API rejects',async()=>{
  vi.mocked(getSettings).mockResolvedValue({templates:[template]} as never);
  vi.mocked(getCommunication).mockResolvedValue({recentMessages:[],restrictions:[],templatePicks:{},recentContactHours:72} as never);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockRejectedValue(new Error('denied'))}});
  const exec=vi.fn().mockReturnValue(true);Object.defineProperty(document,'execCommand',{configurable:true,value:exec});
  show();
  fireEvent.click(screen.getByRole('button',{name:'Registrar contacto por red social u otro canal'}));
  await screen.findByRole('option',{name:'Presentación'});
  fireEvent.change(screen.getByLabelText('Modelo (opcional)'),{target:{value:'t1'}});
  fireEvent.click(screen.getByRole('button',{name:'Copiar texto'}));
  await waitFor(()=>expect(exec).toHaveBeenCalledWith('copy'));
  expect(await screen.findByText('Texto del modelo copiado.')).toBeTruthy();
  expect(toast.success).toHaveBeenCalledWith('Texto del modelo copiado');
 });
});
