import {describe,it,expect} from 'vitest';
import {assertAccountReadable,assertAccountViewable,assertAccountWritable,canModifyBusiness,canModifyManagement,CrmForbidden} from './crmPermissions';
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
 it('lets the responsible seller view her archived business read-only (decision 1C)',()=>{
  const archived={...business,archivedAt:new Date(),doNotContact:true};
  expect(()=>assertAccountViewable(owner,archived)).not.toThrow();
  expect(()=>assertAccountViewable(admin,archived)).not.toThrow();
  expect(()=>assertAccountViewable(colleague,archived)).toThrow('Solo su responsable o un administrador puede consultarlo');
  expect(()=>assertAccountViewable(owner,{...archived,assignedUserEmail:null})).toThrow(CrmForbidden);
  // Write guards stay closed for the owner: viewing never grants modifying.
  expect(()=>assertAccountReadable(owner,archived)).toThrow(CrmForbidden);
  expect(()=>assertAccountWritable(owner,archived)).toThrow(CrmForbidden);
  expect(canModifyBusiness(owner,archived)).toBe(false);
  expect(canModifyManagement(owner,{assignedUserEmail:owner.email},archived)).toBe(false);
 });
 it('keeps active and deleted businesses on the shared reading rules',()=>{
  expect(()=>assertAccountViewable(colleague,business)).not.toThrow();
  for(const actor of [owner,admin])expect(()=>assertAccountViewable(actor,{...business,archivedAt:new Date(),deletedAt:new Date()})).toThrow('papelera');
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
