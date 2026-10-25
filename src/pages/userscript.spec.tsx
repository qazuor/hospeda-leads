import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {MemoryRouter} from 'react-router-dom';
import UserscriptPage,{USERSCRIPT_URL} from './userscript';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe('UserscriptPage',()=>{
 it('offers an install button that points to the script served by this CRM',async()=>{
  window.matchMedia=vi.fn().mockImplementation((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({tokens:[]}),{status:200})));
  render(<MantineProvider><MemoryRouter><UserscriptPage/></MemoryRouter></MantineProvider>);
  const install=screen.getByRole('link',{name:'Instalar user script'});
  expect(install.getAttribute('href')).toBe(USERSCRIPT_URL);
  expect(USERSCRIPT_URL).toBe('/userscripts/hospeda-crm.user.js');
  expect(await screen.findByLabelText('Nombre del dispositivo')).toBeTruthy();
 });
});
