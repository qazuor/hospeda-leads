import {describe,it,expect} from 'vitest';
import {assertAccountReadable,assertAccountViewable,assertAccountWritable,assertLeadAccess,canEditBusinessContactData,canModifyBusiness,canModifyManagement,CrmForbidden} from './crmPermissions';
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
 it('tells the owner of an archived business that only an admin can modify it',async()=>{
  const archived={id:'7',...business,archivedAt:new Date(),deletedAt:null};
  const lead={id:'9',accountId:'7',assignedUserEmail:owner.email,deletedAt:null};
  // Minimal stand-in for the Kysely chain used by assertLeadAccess/assertBusinessAccess.
  const executor={selectFrom:(table:string)=>{const q={selectAll:()=>q,where:()=>q,forUpdate:()=>q,executeTakeFirstOrThrow:async()=>table==='leads'?lead:archived};return q;}} as unknown as Parameters<typeof assertLeadAccess>[0];
  const message='Este negocio está archivado. Solo un administrador puede modificarlo.';
  expect(()=>assertAccountWritable(owner,archived)).toThrow(message);
  await expect(assertLeadAccess(executor,'9',owner,true)).rejects.toThrow(message);
  await expect(assertLeadAccess(executor,'9',owner)).resolves.toBe(lead);
  await expect(assertLeadAccess(executor,'9',colleague)).rejects.toThrow('Solo su responsable o un administrador puede consultarlo');
  await expect(assertLeadAccess(executor,'9',admin,true)).resolves.toBe(lead);
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
describe('contact data editing with an open management (decision 8A)',()=>{
 it('lets owner and admin edit regardless of managements',()=>{
  for(const actor of [owner,admin])expect(canEditBusinessContactData(actor,business,false)).toBe(true);
 });
 it('lets a colleague edit only with an open management',()=>{
  expect(canEditBusinessContactData(colleague,business,true)).toBe(true);
  expect(canEditBusinessContactData(colleague,business,false)).toBe(false);
  expect(canModifyBusiness(colleague,business)).toBe(false);
 });
 it('never widens archived, trashed, merged or missing businesses for sellers',()=>{
  for(const closed of [{...business,archivedAt:new Date()},{...business,deletedAt:new Date()},{...business,mergedIntoId:'42'}])expect(canEditBusinessContactData(colleague,closed,true)).toBe(false);
  expect(canEditBusinessContactData(colleague,undefined,true)).toBe(false);
  expect(canEditBusinessContactData(undefined,business,true)).toBe(false);
 });
 it('never applies to a No contactar business: only an admin edits it (decision 1C)',()=>{
  const dnc={...business,doNotContact:true};
  expect(canEditBusinessContactData(colleague,dnc,true)).toBe(false);
  expect(canEditBusinessContactData(owner,dnc,false)).toBe(false);
  expect(canEditBusinessContactData(owner,dnc,true)).toBe(false);
  expect(canEditBusinessContactData(admin,dnc,false)).toBe(true);
 });
 it('makes a No contactar business read-only for its responsible seller, with the admin lifting it (decision 1C)',async()=>{
  const dnc={id:'7',...business,doNotContact:true,deletedAt:null};
  const lead={id:'9',accountId:'7',assignedUserEmail:owner.email,deletedAt:null};
  const executor={selectFrom:(table:string)=>{const q={selectAll:()=>q,where:()=>q,forUpdate:()=>q,executeTakeFirstOrThrow:async()=>table==='leads'?lead:dnc};return q;}} as unknown as Parameters<typeof assertLeadAccess>[0];
  expect(canModifyBusiness(owner,dnc)).toBe(false);
  expect(canModifyManagement(owner,lead,dnc)).toBe(false);
  expect(canModifyBusiness(admin,dnc)).toBe(true);
  expect(canModifyManagement(admin,lead,dnc)).toBe(true);
  expect(()=>assertAccountWritable(owner,dnc)).toThrow('pidió no ser contactado');
  expect(()=>assertAccountWritable(colleague,dnc)).toThrow(CrmForbidden);
  expect(()=>assertAccountWritable(admin,dnc)).not.toThrow();
  await expect(assertLeadAccess(executor,'9',owner,true)).rejects.toThrow('pidió no ser contactado');
  await expect(assertLeadAccess(executor,'9',admin,true)).resolves.toBe(lead);
  // Reading is untouched.
  expect(()=>assertAccountViewable(owner,dnc)).not.toThrow();
  await expect(assertLeadAccess(executor,'9',owner)).resolves.toBe(lead);
  // A business without the flag stays editable by its owner.
  expect(canModifyBusiness(owner,{...dnc,doNotContact:false})).toBe(true);
 });
 it('keeps the strict read and view guards untouched',()=>{
  const archived={...business,archivedAt:new Date()};
  expect(()=>assertAccountReadable(colleague,archived)).toThrow(CrmForbidden);
  expect(()=>assertAccountViewable(colleague,archived)).toThrow(CrmForbidden);
  expect(()=>assertAccountWritable(colleague,business)).toThrow(CrmForbidden);
 });
});
