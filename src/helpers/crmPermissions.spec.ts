import {describe,it,expect} from 'vitest';
import {assertAccountReadable,assertAccountWritable,canModifyBusiness,canModifyManagement,CrmForbidden} from './crmPermissions';
const owner={email:'owner@example.com',role:'user' as const};
const colleague={email:'colleague@example.com',role:'user' as const};
const admin={email:'admin@example.com',role:'admin' as const};
const business={assignedUserEmail:owner.email,archivedAt:null,mergedIntoId:null};
describe('CRM shared reading and owner-only modifications',()=>{
 it('allows colleagues to read, but never to modify',()=>{
  expect(()=>assertAccountReadable(colleague,business)).not.toThrow();
  expect(()=>assertAccountWritable(colleague,business)).toThrow(CrmForbidden);
  expect(canModifyBusiness(colleague,business)).toBe(false);
 });
 it('allows owner and admin to modify active businesses',()=>{
  for(const actor of [owner,admin])expect(()=>assertAccountWritable(actor,business)).not.toThrow();
 });
 it('keeps unassigned businesses read-only for sellers',()=>{
  expect(()=>assertAccountReadable(owner,{assignedUserEmail:null})).not.toThrow();
  expect(canModifyBusiness(owner,{assignedUserEmail:null})).toBe(false);
 });
 it('reserves archived business access for admins, including its previous owner',()=>{
  const archived={...business,archivedAt:new Date()};
  for(const actor of [owner,colleague]){
   expect(()=>assertAccountReadable(actor,archived)).toThrow(CrmForbidden);
   expect(canModifyBusiness(actor,archived)).toBe(false);
  }
  expect(()=>assertAccountWritable(admin,archived)).not.toThrow();
 });
 it('preserves independent management ownership under a shared business',()=>{
  const management={assignedUserEmail:colleague.email,deletedAt:null};
  expect(canModifyManagement(colleague,management,business)).toBe(true);
  expect(canModifyManagement(owner,management,business)).toBe(false);
  expect(canModifyBusiness(colleague,business)).toBe(false);
 });
 it('blocks deleted businesses and their managements even for administrators',()=>{
  const deleted={...business,deletedAt:new Date()};
  for(const actor of [owner,colleague,admin]){
   expect(()=>assertAccountReadable(actor,deleted)).toThrow(CrmForbidden);
   expect(canModifyBusiness(actor,deleted)).toBe(false);
   expect(canModifyManagement(actor,{assignedUserEmail:actor.email},deleted)).toBe(false);
  }
 });
 it('prevents editing merged source businesses',()=>{
  expect(canModifyBusiness(admin,{...business,mergedIntoId:'42'})).toBe(false);
 });
});
