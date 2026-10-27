import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {InstagramIntegration} from './InstagramIntegration';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);});
describe('Instagram integration settings',()=>{it('shows connection status and renewal warning without exposing the access token',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({configured:true,enabled:true,expiresAt:'2026-11-01T00:00:00Z',lastError:null,renewSoon:true})));render(<MantineProvider><QueryClientProvider client={new QueryClient()}><InstagramIntegration/></QueryClientProvider></MantineProvider>);expect(await screen.findByText('Conectado')).toBeTruthy();expect(await screen.findByText(/Instagram: renová la conexión/)).toBeTruthy();expect(screen.getByLabelText('Token de larga duración')).toBeTruthy();});});
