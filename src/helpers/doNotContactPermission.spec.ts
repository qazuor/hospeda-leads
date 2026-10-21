import {describe,expect,it} from 'vitest';
import {canRecordDoNotContact} from './doNotContactPermission';

const base={businessOwnerEmail:'owner@example.com',managementOwnerEmails:['mgr@example.com',null]};
describe('canRecordDoNotContact',()=>{
  it('lets an admin record it',()=>expect(canRecordDoNotContact({...base,admin:true,userEmail:'admin@example.com'})).toBe(true));
  it('lets the business responsible record it',()=>expect(canRecordDoNotContact({...base,admin:false,userEmail:'owner@example.com'})).toBe(true));
  it('lets the responsible of one of its managements record it',()=>expect(canRecordDoNotContact({...base,admin:false,userEmail:'mgr@example.com'})).toBe(true));
  it('rejects an unrelated seller',()=>expect(canRecordDoNotContact({...base,admin:false,userEmail:'other@example.com'})).toBe(false));
  it('rejects a user without email even when the business has no owner',()=>{
    expect(canRecordDoNotContact({admin:false,userEmail:null,businessOwnerEmail:null,managementOwnerEmails:[null]})).toBe(false);
    expect(canRecordDoNotContact({admin:false,userEmail:undefined,businessOwnerEmail:undefined})).toBe(false);
  });
  it('does not match an unassigned business with an unassigned user',()=>expect(canRecordDoNotContact({admin:false,userEmail:'',businessOwnerEmail:'',managementOwnerEmails:['']})).toBe(false));
});
