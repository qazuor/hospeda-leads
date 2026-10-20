import {describe,expect,it} from 'vitest';
import {contactOutcomes,legacyOutcomeDisplay,outcomeOptions,purposeOutcomes,workOutcomes} from './workOutcomes';

const canonical=['no_answer','interested','later','not_interested','do_not_contact','other'];

describe('work outcomes',()=>{
 it('defines the single canonical list of six outcomes (decision 3A)',()=>{
  expect(Object.keys(contactOutcomes)).toEqual(canonical);
  expect(Object.values(contactOutcomes)).toEqual(['No respondió','Respondió, le interesa','Pidió que lo contacte más adelante','No le interesa','Pidió no ser contactado','Otro (contame)']);
 });

 it('offers the six plus only the purpose specific extras',()=>{
  expect(outcomeOptions('commercial')).toEqual(canonical);
  expect(outcomeOptions('reactivation')).toEqual(canonical);
  expect(outcomeOptions(null)).toEqual(canonical);
  expect(outcomeOptions('toString')).toEqual(canonical);
  expect(outcomeOptions('delivery')).toEqual([...canonical,'delivered','awaiting_confirmation','needs_help']);
  expect(outcomeOptions('care')).toEqual([...canonical,'care_completed','needs_help','awaiting_confirmation']);
 });

 it('keeps a display label for every stored legacy value',()=>{
  const stored=new Set([...Object.keys(workOutcomes),...Object.values(purposeOutcomes).flat()]);
  for(const value of stored)expect(value in contactOutcomes||value in legacyOutcomeDisplay,value).toBe(true);
  expect(legacyOutcomeDisplay.replied).toBe('Respondió');
 });
});
