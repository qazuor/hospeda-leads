import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BusinessStatusControl,businessStatusHelp} from './BusinessStatusControl';
import {businessStatuses} from '../helpers/businessStatus';
import type {Account} from '../endpoints/commercial.schema';

const render=(account:Partial<Account>,readOnly=false)=>renderToStaticMarkup(<MantineProvider><QueryClientProvider client={new QueryClient()}><BusinessStatusControl account={{id:'1',status:'reviewed',recontactAt:null,...account} as Account} readOnly={readOnly}/></QueryClientProvider></MantineProvider>);
const text=(html:string)=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

describe('BusinessStatusControl',()=>{
 it('is a single "Estado: X ▾ Cambiar" badge-button with a one-line helper and no select',()=>{
  const html=render({status:'new'});
  expect(html).toContain('aria-label="Cambiar estado del negocio. Ahora: Nuevo"');
  expect(text(html)).toContain('Estado: Nuevo Cambiar');
  expect(text(html)).toContain(businessStatusHelp.new);
  expect(html).not.toContain('<select');
 });
 it('shows the recontact date only as a reference',()=>{
  const html=render({status:'recontact',recontactAt:'2026-11-15'});
  expect(text(html)).toContain('Fecha de referencia: 15 de nov de 2026');
 });
 it('offers no change button when the status is automatic, archived or read-only',()=>{
  for(const [status,readOnly] of [['in_management',false],['archived',false],['reviewed',true]] as const){
   const html=render({status},readOnly);
   expect(html).not.toContain('Cambiar');
   expect(text(html)).toContain(businessStatusHelp[status]);
  }
 });
 it('explains every business status in plain words',()=>{
  for(const status of businessStatuses)expect(businessStatusHelp[status].length).toBeGreaterThan(10);
 });
});
