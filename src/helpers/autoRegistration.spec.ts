import {describe,expect,it} from 'vitest';
import {autoEffectsMatch,autoRegisterReason,globalAutoRegisterEnabled,isUserscriptConfirmedResult} from './autoRegistration';

describe('automatic registration helpers',()=>{
 it('turns the global switch on by default and respects a value an admin saved (owner, 28/10/2026)',()=>{
  expect(globalAutoRegisterEnabled({value:undefined})).toBe(true);
  expect(globalAutoRegisterEnabled({value:null})).toBe(true);
  expect(globalAutoRegisterEnabled({value:'{"enabled":false}'})).toBe(false);
  expect(globalAutoRegisterEnabled({value:'{"enabled":true}'})).toBe(true);
  expect(globalAutoRegisterEnabled({value:'roto'})).toBe(false);
 });
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
 it('recognizes both historical and current userscript confirmation results when voiding',()=>{
  expect(isUserscriptConfirmedResult('Envío confirmado manualmente')).toBe(true);
  expect(isUserscriptConfirmedResult('Envío confirmado por el script de WhatsApp')).toBe(true);
  expect(isUserscriptConfirmedResult('Resultado editado por la persona')).toBe(false);
 });
});
