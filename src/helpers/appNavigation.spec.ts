// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {adminNavigation,breadcrumbTrail,documentTitle,mainNavigation,parseTodayView,recordNavigation,sectionTitle,todayViews,workNavigation} from './appNavigation';

describe('app navigation',()=>{
 it('keeps the work and record groups and admin-only destinations as typed data',()=>{
  expect(workNavigation.map(({label,url})=>[label,url])).toEqual([['Hoy','/my-day'],['Bandeja','/inbox']]);
  expect(recordNavigation.map(({label,url})=>[label,url])).toEqual([['Negocios','/accounts'],['Gestiones','/opportunities']]);
  expect(mainNavigation.map(({label,url})=>[label,url])).toEqual([['Hoy','/my-day'],['Bandeja','/inbox'],['Negocios','/accounts'],['Gestiones','/opportunities'],['Ayuda','/guide']]);
  expect(adminNavigation.map(({label,url})=>[label,url])).toEqual([['Negocios archivados','/archived'],['Importar CSV','/accounts?adminTool=import'],['Buscar duplicados','/accounts?adminTool=duplicates'],['Estadísticas','/analytics'],['Configuración','/settings'],['Historial del equipo','/history'],['Papelera','/trash'],['Emails sin asociar','/inbound']]);
  expect(adminNavigation.find(item=>item.url==='/inbound')?.icon).toBeDefined();
 });
 it('preserves Hoy views and legacy search aliases',()=>{
  expect(todayViews.map(({label,url})=>[label,url])).toEqual([['Lista','/my-day'],['Calendario','/my-day?view=calendar'],['Para retomar','/my-day?view=retomar']]);
  expect(todayViews.find(item=>item.view==='calendar')?.keywords).toContain('agenda');expect(todayViews.find(item=>item.view==='retomar')?.keywords).toContain('reactivación');
 });
 it('parses Hoy view with a safe fallback',()=>{expect(parseTodayView({value:'calendar'})).toBe('calendar');expect(parseTodayView({value:'retomar'})).toBe('retomar');expect(parseTodayView({value:null})).toBe('list');expect(parseTodayView({value:'agenda'})).toBe('list');});
 it('creates section, record, admin, and user-script breadcrumb trails',()=>{
  expect(breadcrumbTrail({pathname:'/my-day',search:'',isAdmin:false})).toEqual([{label:'Hoy'}]);
  expect(breadcrumbTrail({pathname:'/accounts',search:'',isAdmin:false})).toEqual([{label:'Negocios'}]);
  expect(breadcrumbTrail({pathname:'/accounts/42',search:'',isAdmin:false,pageLabel:'Casa del Río'})).toEqual([{label:'Negocios',url:'/accounts'},{label:'Casa del Río'}]);
  expect(breadcrumbTrail({pathname:'/accounts/42',search:'',isAdmin:false})).toEqual([{label:'Negocios',url:'/accounts'},{label:'Ficha'}]);
  expect(breadcrumbTrail({pathname:'/sales/7',search:'',isAdmin:false,pageLabel:'Temporada 2027'})).toEqual([{label:'Gestiones',url:'/opportunities'},{label:'Temporada 2027'}]);
  expect(breadcrumbTrail({pathname:'/sales/7',search:'',isAdmin:false})).toEqual([{label:'Gestiones',url:'/opportunities'},{label:'Gestión'}]);
  expect(breadcrumbTrail({pathname:'/accounts',search:'?adminTool=import',isAdmin:true})).toEqual([{label:'Administración'},{label:'Importar CSV'}]);
  expect(breadcrumbTrail({pathname:'/userscript',search:'',isAdmin:false})).toEqual([{label:'User script de WhatsApp'}]);
 });
 it('names main sections for mobile and document titles',()=>{
  expect(sectionTitle({pathname:'/my-day'})).toBe('Hoy');expect(sectionTitle({pathname:'/accounts/12'})).toBe('Negocios');expect(sectionTitle({pathname:'/sales/7'})).toBe('Gestiones');expect(sectionTitle({pathname:'/guide'})).toBe('Ayuda');expect(sectionTitle({pathname:'/settings'})).toBeNull();
  expect(documentTitle({section:'Hoy'})).toBe('Hoy · Hospeda CRM');expect(documentTitle({section:null})).toBe('Hospeda CRM');
 });
});
