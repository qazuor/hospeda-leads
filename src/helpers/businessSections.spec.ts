import {describe,expect,it} from 'vitest';
import {businessSection,businessSections} from './businessSections';

describe('businessSection',()=>{
 it('keeps the four current tabs',()=>{
  for(const section of businessSections)expect(businessSection(section)).toBe(section);
  expect(businessSections).toEqual(['que-paso','gestiones','personas','datos']);
 });
 it('maps every legacy ?section= value to its new tab',()=>{
  expect(businessSection('history')).toBe('que-paso');
  expect(businessSection('work')).toBe('que-paso');
  expect(businessSection('opportunities')).toBe('gestiones');
  expect(businessSection('contacts')).toBe('personas');
  expect(businessSection('documents')).toBe('datos');
  expect(businessSection('communication')).toBe('que-paso');
  expect(businessSection('summary')).toBe('datos');
 });
 it('opens Qué pasó for missing, unknown or prototype values',()=>{
  for(const value of [null,undefined,'','nada','constructor','__proto__','toString'])expect(businessSection(value)).toBe('que-paso');
 });
});
