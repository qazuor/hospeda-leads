import React from 'react';
import {readFileSync} from 'node:fs';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import type {CommercialDetail} from '../endpoints/commercial.schema';

vi.mock('./ContactPolicy',()=>({ContactPolicy:()=>null}));
vi.mock('./TechnicalRestrictions',()=>({TechnicalRestrictions:()=>null}));
import {BusinessLastContactLine,BusinessSidebar,type BusinessSidebarProps} from './BusinessSidebar';

afterEach(cleanup);
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));});

const detail={account:{id:7,nombre:'Cabañas del Río',ciudad:'Colón',status:'new',doNotContact:false,archivedAt:null,telefono:null,email:null},contacts:[],opportunities:[]} as unknown as CommercialDetail;
const props=(overrides:Partial<BusinessSidebarProps>={}):BusinessSidebarProps=>({detail,mainContact:undefined,contactCount:0,contactSection:null,
 facts:[{field:'email',label:'Email',value:'reservas.cabanasdelrio@example.com'}],emptyFactLabels:['Provincia'],links:[],readOnly:true,contactEditable:false,canDoWork:false,
 work:{ready:true,blockedReason:'',error:null,retry:()=>undefined,retrying:false},onWork:()=>undefined,onEditAccount:()=>undefined,...overrides});
const setup=(overrides:Partial<BusinessSidebarProps>={})=>render(<MantineProvider><BusinessSidebar {...props(overrides)}/></MantineProvider>);

describe('BusinessSidebar',()=>{
 it('lays the business data out in one column inside the narrow aside (spec 104, finding 22)',()=>{
  setup();
  const aside=screen.getByRole('complementary',{name:'Datos del negocio'});
  expect(within(aside).getByText('reservas.cabanasdelrio@example.com').closest('dl')).toBeTruthy();
  // The aside is 260–320px wide: three columns cut values letter by letter. The rule is scoped to the aside so full-width uses keep three columns.
  const css=readFileSync('src/components/Commercial.module.css','utf8');
  expect(css).toMatch(/\.businessAside \.businessFacts\{grid-template-columns:minmax\(0,1fr\)/);
  expect(css).toMatch(/\.businessAside \.businessFacts dd[^{]*\{[^}]*overflow-wrap:break-word/);
 });
 it('shows valid links as safe external links and keeps the rest as text',()=>{
  setup({links:[{field:'sitioWeb',label:'Sitio web',value:'cabanas.com.ar',href:'https://cabanas.com.ar/'},{field:'perfilFacebook',label:'Facebook',value:'ver en facebook',href:null}]});
  const site=screen.getByRole('link',{name:/cabanas\.com\.ar/});
  expect(site.getAttribute('href')).toBe('https://cabanas.com.ar/');
  expect(site.getAttribute('target')).toBe('_blank');
  expect(site.getAttribute('rel')).toBe('noopener noreferrer');
  expect(site.getAttribute('title')).toBe('cabanas.com.ar');
  expect(screen.getByText('Enlaces')).toBeTruthy();
  expect(screen.getByText(/ver en facebook/).closest('a')).toBeNull();
  expect(screen.getByText(/no es un enlace válido/)).toBeTruthy();
 });
 it('lists the empty fields under «Sin cargar»',()=>{
  setup({emptyFactLabels:['Provincia','Instagram','Google Maps']});
  expect(screen.getByText('Sin cargar: Provincia, Instagram, Google Maps')).toBeTruthy();
 });
});

describe('BusinessLastContactLine',()=>{
 it('says there is no last contact yet instead of «Sin contactos registrados», which read as «no people» (spec 104, finding 24)',()=>{
  const {container}=render(<BusinessLastContactLine lastContact={null} pending={false} failed={false}/>);
  expect(container.textContent).toBe('Último contacto: todavía no hay ninguno registrado');
  expect(container.textContent).not.toContain('Sin contactos registrados');
 });
 it('keeps the loading, error and last-contact texts',()=>{
  expect(render(<BusinessLastContactLine lastContact={null} pending failed={false}/>).container.textContent).toBe('Buscando último contacto…');cleanup();
  expect(render(<BusinessLastContactLine lastContact={null} pending={false} failed/>).container.textContent).toBe('No se pudo cargar el último contacto');cleanup();
  expect(render(<BusinessLastContactLine lastContact={{title:'Llamada',occurredAt:'2026-10-30T15:00:00Z'}} pending={false} failed={false}/>).container.textContent).toMatch(/^Último contacto: Llamada · /);
 });
});
