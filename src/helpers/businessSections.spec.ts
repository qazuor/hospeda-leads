import {describe,expect,it} from 'vitest';
import {businessSection,businessSections} from './businessSections';

describe('businessSection',()=>{
 it('keeps the four current tabs',()=>{
  for(const section of businessSections)expect(businessSection(section)).toBe(section);
  expect(businessSections).toEqual(['historial','tareas','comunicacion','ficha']);
 });
 it('maps every legacy ?section= value to its new tab',()=>{
  for(const section of ['que-paso','history'])expect(businessSection(section)).toBe('historial');
  expect(businessSection('work')).toBe('tareas');
  expect(businessSection('communication')).toBe('comunicacion');
  for(const section of ['gestiones','opportunities','personas','contacts','datos','documents','summary'])expect(businessSection(section)).toBe('ficha');
 });
 it('opens Historial for missing, unknown or prototype values',()=>{
  for(const value of [null,undefined,'','nada','constructor','__proto__','toString'])expect(businessSection(value)).toBe('historial');
 });
});
