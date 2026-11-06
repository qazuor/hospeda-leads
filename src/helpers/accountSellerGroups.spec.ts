import {describe,expect,it} from 'vitest';
import {expandSellerGroupIds,groupSellerState,type SellerGroupMember} from './accountSellerGroups';
const member=(values:Partial<SellerGroupMember>={}):SellerGroupMember=>({id:'1',nombre:'Fixture',ciudad:null,status:'new',deletedAt:null,archivedAt:null,mergedIntoId:null,referredToLeandro:false,referredOriginalOwnerEmail:null,assignedUserEmail:'ana@example.com',...values});
describe('groupSellerState',()=>{
 it('returns empty when there are no active members',()=>expect(groupSellerState({members:[member({archivedAt:new Date()})]})).toEqual({state:'empty'}));
 it('returns a consistent effective seller',()=>expect(groupSellerState({members:[member(),member()]})).toEqual({state:'consistent',sellerEmail:'ana@example.com'}));
 it('uses the original seller for referred members',()=>expect(groupSellerState({members:[member(),member({assignedUserEmail:'leandro@example.com',referredToLeandro:true,referredOriginalOwnerEmail:'ana@example.com'})]})).toEqual({state:'consistent',sellerEmail:'ana@example.com'}));
 it('returns inconsistent seller choices',()=>expect(groupSellerState({members:[member(),member({assignedUserEmail:'bruno@example.com'})]})).toEqual({state:'inconsistent',sellerEmails:['ana@example.com','bruno@example.com']}));
});
describe('expandSellerGroupIds',()=>{
 it('adds only active members once and sorts ids numerically',()=>{
  const groups=[{groupId:'1',members:[member({id:'10'}),member({id:'2'}),member({id:'3',archivedAt:new Date()})]}];
  expect(expandSellerGroupIds(['10','1'],groups)).toEqual(['1','2','10']);
 });
});
