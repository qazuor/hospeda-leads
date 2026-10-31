import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {InstagramIntegration,instagramIntegrationView,KEY_NOTICES,type InstagramIntegrationStatus} from './InstagramIntegration';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);});
const soon=new Date(Date.now()+3*86400000).toISOString(),later=new Date(Date.now()+40*86400000).toISOString(),past=new Date(Date.now()-86400000).toISOString();
const base:InstagramIntegrationStatus={configured:true,enabled:true,keyStatus:'ok',keyHint:null,tokenReadable:true,expiresAt:later,lastError:null,renewSoon:false};
const show=(status:InstagramIntegrationStatus)=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(status)));return render(<MantineProvider><QueryClientProvider client={new QueryClient()}><InstagramIntegration/></QueryClientProvider></MantineProvider>);};
describe('Instagram integration settings',()=>{
 it('shows connection status and renewal warning without exposing the access token',async()=>{show({...base,expiresAt:soon,renewSoon:true});expect(await screen.findByText('Conectado')).toBeTruthy();expect(await screen.findByText(/Instagram: renová la conexión/)).toBeTruthy();expect(screen.getByLabelText('Token de larga duración')).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();});
 it('spec 103 B2: an invalid key in hex never shows «Conectado» and suggests base64',async()=>{show({...base,enabled:false,keyStatus:'invalid',keyHint:'hex',tokenReadable:null});expect(await screen.findByText('Con problemas')).toBeTruthy();expect(screen.queryByText('Conectado')).toBeNull();expect(screen.getByRole('alert').textContent).toBe(`${KEY_NOTICES.invalid} ${KEY_NOTICES.hex}`);expect(screen.queryByText(/Falta INTEGRATION_SECRETS_KEY/)).toBeNull();});
 it('spec 103 B2: a rotated key asks to paste the token again',async()=>{show({...base,tokenReadable:false});expect(await screen.findByText('Con problemas')).toBeTruthy();expect(screen.getByRole('alert').textContent).toBe(KEY_NOTICES.unreadable);});
 it('spec 103 B2: a missing key says so, without a token it is «Sin conexión»',async()=>{show({...base,configured:false,enabled:false,keyStatus:'missing',tokenReadable:null,expiresAt:null});expect((await screen.findByRole('alert')).textContent).toBe(KEY_NOTICES.missing);expect(screen.getByText('Sin conexión')).toBeTruthy();});
});
describe('instagramIntegrationView',()=>{
 const view=(status:Partial<InstagramIntegrationStatus>)=>instagramIntegrationView({status:{...base,...status}});
 it('says «Conectado» only with a valid key, a readable token and not expired',()=>{expect(view({}).badge).toEqual({label:'Conectado',variant:'success'});expect(view({}).notice).toBeNull();expect(view({expiresAt:past}).badge.label).toBe('Vencido');expect(view({tokenReadable:false}).badge.label).toBe('Con problemas');expect(view({keyStatus:'invalid',enabled:false,tokenReadable:null}).badge.label).toBe('Con problemas');expect(view({keyStatus:'missing',enabled:false,tokenReadable:null}).badge.label).toBe('Con problemas');expect(view({configured:false,tokenReadable:null}).badge.label).toBe('Sin conexión');});
 it('shows one notice, the first that applies',()=>{expect(view({keyStatus:'missing',enabled:false}).notice).toBe(KEY_NOTICES.missing);expect(view({keyStatus:'invalid',keyHint:null,enabled:false}).notice).toBe(KEY_NOTICES.invalid);expect(view({keyStatus:'invalid',keyHint:'hex',enabled:false,tokenReadable:false}).notice).toBe(`${KEY_NOTICES.invalid} ${KEY_NOTICES.hex}`);expect(view({tokenReadable:false}).notice).toBe(KEY_NOTICES.unreadable);});
 it('falls back to `enabled` when an older server sends no key status',()=>{expect(view({keyStatus:undefined,tokenReadable:undefined}).badge.label).toBe('Conectado');expect(view({keyStatus:undefined,tokenReadable:undefined,enabled:false}).notice).toBe(KEY_NOTICES.missing);});
});
