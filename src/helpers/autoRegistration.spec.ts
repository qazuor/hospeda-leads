import {describe,expect,it} from 'vitest';
import {autoEffectsMatch,autoRegisterReason} from './autoRegistration';

describe('automatic registration helpers',()=>{
 const eligible={global:true,preference:true,accountExists:true,status:'reviewed',doNotContact:false,restricted:false,archived:false,merged:false,writeAccess:true};
 it('returns the global disabled reason before business eligibility',()=>{
  expect(autoRegisterReason({...eligible,global:false,status:'new'})).toBe('global_disabled');
  expect(autoRegisterReason({...eligible,preference:false})).toBe('auto_disabled');
 });
 it('rejects unsafe business states and missing write access',()=>{
  for(const patch of [{status:'new'},{doNotContact:true},{restricted:true},{archived:true},{merged:true},{writeAccess:false},{accountExists:false}])expect(autoRegisterReason({...eligible,...patch})).toBe('not_eligible');
  expect(autoRegisterReason(eligible)).toBeNull();
 });
 it('matches a recorded effect only while its current value is unchanged',()=>{
  expect(autoEffectsMatch({status:'pending',result:'confirmed'},{status:'pending',result:'confirmed'})).toBe(true);
  expect(autoEffectsMatch({status:'completed'},{status:'pending'})).toBe(false);
 });
});
