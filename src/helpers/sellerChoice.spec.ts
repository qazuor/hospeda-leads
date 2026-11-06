import {describe,expect,it} from 'vitest';
import {sellerChoiceState} from './sellerChoice';
describe('sellerChoiceState',()=>{
 it('does not count unassigned members as a competing seller',()=>expect(sellerChoiceState([{id:'1',effectiveSellerEmail:'owner@example.com',active:true},{id:'2',effectiveSellerEmail:null,active:true}])).toEqual({sellers:['owner@example.com'],requiresChoice:false}));
 it('requires a choice when every active member is unassigned',()=>expect(sellerChoiceState([{id:'1',effectiveSellerEmail:null,active:true},{id:'2',effectiveSellerEmail:null,active:true}])).toEqual({sellers:[],requiresChoice:true}));
 it('ignores inactive members',()=>expect(sellerChoiceState([{id:'1',effectiveSellerEmail:'owner@example.com',active:true},{id:'2',effectiveSellerEmail:'other@example.com',active:false}])).toEqual({sellers:['owner@example.com'],requiresChoice:false}));
});
