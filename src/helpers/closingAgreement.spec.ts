import {describe,expect,it} from 'vitest';
import {closeMarksClient,validClosingAgreement} from './closingAgreement';

describe('commercial close requirements',()=>{
 it('requires agreement only when the close marks the business as a client',()=>{
  expect(closeMarksClient({managementType:'main',stage:'main:won',outcomeKey:'won',convertClient:false})).toBe(true);
  expect(closeMarksClient({managementType:'partner',stage:'partner:won',outcomeKey:'won',convertClient:false})).toBe(true);
  expect(closeMarksClient({managementType:'editor',stage:'editor:proposal_won',outcomeKey:'proposal_won',convertClient:false})).toBe(false);
  expect(closeMarksClient({managementType:'editor',stage:'editor:proposal_won',outcomeKey:'proposal_won',convertClient:true})).toBe(true);
  expect(closeMarksClient({managementType:null,stage:'Won',outcomeKey:null,convertClient:true})).toBe(true);
  expect(closeMarksClient({managementType:'provider',stage:'provider:participates',outcomeKey:'participates',convertClient:false})).toBe(false);
 });
 it('counts trimmed agreement and accepted-person values and requires three useful characters',()=>{
  expect(validClosingAgreement({agreement:'  Plan anual  ',person:'  Ana  '})).toBe(true);
  expect(validClosingAgreement({agreement:'  No ',person:'Ana'})).toBe(false);
 });
});
