import {describe,expect,it} from 'vitest';
import {contactPurposeBlockReason,contactPurposeOptions,defaultContactPurpose} from './contactPurpose';

describe('contact purposes without a management',()=>{
 it('only verifies a new business and never verifies another one',()=>{
  expect(contactPurposeOptions('new').map(o=>o.value)).toEqual(['verification']);
  const others=contactPurposeOptions('in_management').map(o=>o.value);
  expect(others).not.toContain('verification');expect(others).toContain('first_contact');
  expect(defaultContactPurpose('new')).toBe('verification');expect(defaultContactPurpose('reviewed')).toBe('first_contact');
 });
 it('asks for the clarification of "Otro" and the client confirmation of "Acompañamiento"',()=>{
  const base={otherPurpose:'',isClient:false,confirmedClient:false};
  expect(contactPurposeBlockReason({...base,purpose:'other'})).toContain('aclaración');
  expect(contactPurposeBlockReason({...base,purpose:'other',otherPurpose:' x '})).toBe('');
  expect(contactPurposeBlockReason({...base,purpose:'care'})).toContain('Cliente');
  expect(contactPurposeBlockReason({...base,purpose:'care',confirmedClient:true})).toBe('');
  expect(contactPurposeBlockReason({...base,purpose:'care',isClient:true})).toBe('');
  expect(contactPurposeBlockReason({...base,purpose:'first_contact'})).toBe('');
 });
});
