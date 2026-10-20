import {describe,expect,it} from 'vitest';
import {responseCategoryOptions} from './ResponseCorrectionForm';

describe('responseCategoryOptions',()=>{
 it('offers the canonical outcomes minus "No respondió", mapped to stored categories',()=>{
  expect(responseCategoryOptions()).toEqual([['interested','Respondió, le interesa'],['later','Pidió que lo contacte más adelante'],['rejected','No le interesa'],['do_not_contact','Pidió no ser contactado'],['other','Otro (contame)']]);
 });
 it('does not offer legacy categories for new responses',()=>{
  const keys=responseCategoryOptions('later').map(([key])=>key);
  expect(keys).not.toContain('information');expect(keys).not.toContain('no_answer');expect(keys).toHaveLength(5);
 });
 it('keeps a legacy current category visible with its label, never the raw key',()=>{
  const options=responseCategoryOptions('information');
  expect(options).toHaveLength(6);expect(options.at(-1)).toEqual(['information','Pidió información']);
 });
});
