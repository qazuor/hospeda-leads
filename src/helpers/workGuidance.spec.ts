import {describe,expect,it} from 'vitest';
import {canLogNewActivity} from './workGuidance';

describe('canLogNewActivity',()=>{
 it('allows an admin and the responsible of the context',()=>{
  expect(canLogNewActivity({admin:true,ownerEmail:'x@example.com',userEmail:'a@example.com'})).toBe(true);
  expect(canLogNewActivity({admin:false,ownerEmail:'a@example.com',userEmail:'a@example.com'})).toBe(true);
 });
 it('refuses a delegated assignee, a reader or an unknown owner',()=>{
  expect(canLogNewActivity({admin:false,ownerEmail:'owner@example.com',userEmail:'delegate@example.com'})).toBe(false);
  expect(canLogNewActivity({admin:false,ownerEmail:undefined,userEmail:'a@example.com'})).toBe(false);
  expect(canLogNewActivity({admin:false,ownerEmail:null,userEmail:null})).toBe(false);
 });
});
