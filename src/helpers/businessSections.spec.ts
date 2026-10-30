import {describe,expect,it} from 'vitest';
import {businessSection,businessSections,businessTabParams,initialBusinessSection} from './businessSections';

describe('businessSection',()=>{
 it('keeps the six business tabs in display order',()=>{
  for(const section of businessSections)expect(businessSection(section)).toBe(section);
  expect(businessSections).toEqual(['resumen','historial','tareas','comunicacion','gestiones','documentos']);
 });
 it('maps legacy section values to the new destination',()=>{
  expect(businessSection('ficha')).toBe('gestiones');
  for(const value of ['gestiones','opportunities'])expect(businessSection(value)).toBe('gestiones');
  expect(businessSection('documents')).toBe('documentos');
  for(const value of ['summary','personas','contacts','datos'])expect(businessSection(value)).toBe('resumen');
  for(const value of ['que-paso','history'])expect(businessSection(value)).toBe('historial');
  expect(businessSection('communication')).toBe('comunicacion');
  expect(businessSection('work')).toBe('tareas');
 });
 it('opens Resumen for missing, unknown or prototype values',()=>{
  for(const value of [null,undefined,'','nada','constructor','__proto__','toString'])expect(businessSection(value)).toBe('resumen');
 });
});

describe('?tab= on the business page (spec 91 §13)',()=>{
 it('opens the tab named by ?tab=, then the legacy ?section=, then Resumen',()=>{
  expect(initialBusinessSection(new URLSearchParams('tab=comunicacion'))).toBe('comunicacion');
  expect(initialBusinessSection(new URLSearchParams('tab=documentos&section=history'))).toBe('documentos');
  expect(initialBusinessSection(new URLSearchParams('section=communication'))).toBe('comunicacion');
  expect(initialBusinessSection(new URLSearchParams(''))).toBe('resumen');
  expect(initialBusinessSection(new URLSearchParams('tab=nada'))).toBe('resumen');
 });
 it('writes the tab, keeps other params, drops the legacy section and omits the default',()=>{
  expect(businessTabParams(new URLSearchParams('contactId=7&section=contacts'),'comunicacion').toString()).toBe('contactId=7&tab=comunicacion');
  expect(businessTabParams(new URLSearchParams('tab=historial&x=1'),'gestiones').toString()).toBe('tab=gestiones&x=1');
  expect(businessTabParams(new URLSearchParams('tab=historial&x=1'),'resumen').toString()).toBe('x=1');
 });
});
