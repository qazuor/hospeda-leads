import {describe,expect,it} from 'vitest';
import {getReactivationStages,isValidReactivationStage,mayReopenManagement} from './reactivation';
import type {PipelineStage} from '../endpoints/pipeline.schema';

const stage=(name:string,managementType:PipelineStage['managementType'],classification:PipelineStage['classification']='open',active=true):PipelineStage=>({name,managementType,classification,active,displayName:name,outcomeKey:null,sortOrder:0,historical:false});

describe('reactivation choices',()=>{
 it('limits open stages to the original management type and excludes the special Leandro referral stage',()=>{
  const options=getReactivationStages([
   stage('main:contact','main'),
   stage('partner:contact','partner'),
   stage('main:leandro','main'),
   stage('main:won','main','won'),
   stage('main:inactive','main','open',false),
   stage('legacy',null)
  ],'main');

  expect(options.map(item=>item.name)).toEqual(['main:contact']);
 });

 it('allows a legacy management to use only active open legacy stages',()=>{
  expect(getReactivationStages([stage('legacy',null),stage('main:contact','main')],null).map(item=>item.name)).toEqual(['legacy']);
 });

 it('rejects a stage from a different type or the Leandro referral stage on the server check',()=>{
  expect(isValidReactivationStage(stage('partner:contact','partner'),'main')).toBe(false);
  expect(isValidReactivationStage(stage('main:leandro','main'),'main')).toBe(false);
 });

 it('allows only administrators to reopen a closed management',()=>{
  expect(mayReopenManagement('admin')).toBe(true);
  expect(mayReopenManagement('user')).toBe(false);
  expect(mayReopenManagement(null)).toBe(false);
 });
});
