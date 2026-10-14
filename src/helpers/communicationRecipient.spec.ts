import {describe,expect,it} from 'vitest';
import {initialCommunicationRecipient} from './communicationRecipient';

describe('initialCommunicationRecipient',()=>{
 it('preserves a destination explicitly chosen earlier in the flow',()=>{
  expect(initialCommunicationRecipient(['1','2'],'2')).toBe('2');
 });
 it('preselects the only available person',()=>{
  expect(initialCommunicationRecipient(['1'])).toBe('1');
 });
 it('requires an explicit choice when multiple people are available',()=>{
  expect(initialCommunicationRecipient(['1','2'])).toBe('');
 });
 it('uses the business destination for legacy contacts when automatic selection is disabled',()=>{
  expect(initialCommunicationRecipient(['1'],null,false)).toBe('');
 });
 it('ignores a stale requested contact and applies the single-person rule',()=>{
  expect(initialCommunicationRecipient(['1'],'deleted')).toBe('1');
 });
});
