import {describe,expect,it} from 'vitest';
import {businessSection,businessSections} from './businessSections';

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
