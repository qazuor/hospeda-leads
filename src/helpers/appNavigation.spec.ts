// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {mainNavigation,parseTodayView,sectionTitle,todayViews} from './appNavigation';

describe('app navigation (owner decision 5A)',()=>{
 it('offers exactly Hoy · Negocios · Gestiones · Ayuda as main sections',()=>{
  expect(mainNavigation.map(({label,url})=>[label,url])).toEqual([['Hoy','/my-day'],['Negocios','/accounts'],['Gestiones','/opportunities'],['Ayuda','/guide']]);
 });

 it('absorbs Agenda and Reactivación as views of Hoy, findable by their old names',()=>{
  expect(todayViews.map(({label,url})=>[label,url])).toEqual([['Lista','/my-day'],['Calendario','/my-day?view=calendar'],['Para retomar','/my-day?view=retomar']]);
  expect(todayViews.find(item=>item.view==='calendar')?.keywords).toContain('agenda');
  expect(todayViews.find(item=>item.view==='retomar')?.keywords).toContain('reactivación');
 });

 it('reads the view param and falls back to the list',()=>{
  expect(parseTodayView({value:'calendar'})).toBe('calendar');
  expect(parseTodayView({value:'retomar'})).toBe('retomar');
  expect(parseTodayView({value:null})).toBe('list');
  expect(parseTodayView({value:'agenda'})).toBe('list');
 });

 it('names the current section for the phone header',()=>{
  expect(sectionTitle({pathname:'/my-day'})).toBe('Hoy');
  expect(sectionTitle({pathname:'/accounts/12'})).toBe('Negocios');
  expect(sectionTitle({pathname:'/sales/7'})).toBe('Gestiones');
  expect(sectionTitle({pathname:'/guide'})).toBe('Ayuda');
  expect(sectionTitle({pathname:'/settings'})).toBeNull();
 });
});
