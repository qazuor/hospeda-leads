import {describe,expect,it} from 'vitest';
import {sellerGroupMembershipChanged,type SellerGroup} from './accountSellerGroups';
const group=(ids:string[]):SellerGroup=>({groupId:'7',members:ids.map(id=>({id,nombre:id,ciudad:null,status:'new',assignedUserEmail:null,referredToLeandro:false,referredOriginalOwnerEmail:null,deletedAt:null,archivedAt:null,mergedIntoId:null}))});
describe('sellerGroupMembershipChanged',()=>{
 it('detects membership removed after the pre-lock read',()=>expect(sellerGroupMembershipChanged([group(['1','2','4'])],[group(['2','4'])])).toBe(true));
 it('detects a group deleted after the pre-lock read',()=>expect(sellerGroupMembershipChanged([group(['1','2'])],[])).toBe(true));
 it('ignores member ordering',()=>expect(sellerGroupMembershipChanged([group(['1','2'])],[group(['2','1'])])).toBe(false));
});
