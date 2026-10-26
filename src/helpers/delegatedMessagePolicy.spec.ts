import {describe,expect,it} from 'vitest';
import {canPrepareDelegatedMessage} from './delegatedMessagePolicy';
const delegate={taskPending:true,taskAssigneeEmail:'delegate@example.com',managementOwnerEmail:'owner@example.com',userEmail:'delegate@example.com',admin:false,doNotContact:false};
describe('delegated message action',()=>{
 it('is available only to the non-owner assignee of a pending task on an allowed business',()=>{
  expect(canPrepareDelegatedMessage(delegate)).toBe(true);
  expect(canPrepareDelegatedMessage({...delegate,taskPending:false})).toBe(false);
  expect(canPrepareDelegatedMessage({...delegate,taskAssigneeEmail:'other@example.com'})).toBe(false);
  expect(canPrepareDelegatedMessage({...delegate,managementOwnerEmail:'delegate@example.com'})).toBe(false);
  expect(canPrepareDelegatedMessage({...delegate,doNotContact:true})).toBe(false);
 });
});
