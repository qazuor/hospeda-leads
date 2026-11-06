import {describe,expect,it} from 'vitest';
import {createBusinessReassignmentPlan,type ReassignmentAccount,type ReassignmentUser} from './businessReassignment';

const users:ReassignmentUser[]=[{email:'ana@example.com',displayName:'Ana'},{email:'bruno@example.com',displayName:'Bruno'}];
const account=(id:string,values:Partial<ReassignmentAccount>={}):ReassignmentAccount=>({id,status:'new',assignedUserEmail:null,deletedAt:null,archivedAt:null,mergedIntoId:null,...values});

describe('createBusinessReassignmentPlan current behavior',()=>{
 it('moves only active new accounts; deleted, archived and merged accounts stay fixed',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1'),account('2',{deletedAt:new Date()}),account('3',{archivedAt:new Date()}),account('4',{mergedIntoId:'9'}),account('5',{status:'reviewed'})]);
  expect(plan.eligibleCount).toBe(1);expect(plan.moves.map(move=>move.accountId)).toEqual(['1']);
 });
 it('balances by lowest total and breaks ties by display name then email',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1'),account('2'),account('3')]);
  expect(plan.moves.map(move=>move.toEmail)).toEqual(['ana@example.com','bruno@example.com','ana@example.com']);
 });
 it('does not create a move when an account already belongs to its selected recipient',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1',{assignedUserEmail:'ana@example.com'})]);
  expect(plan.moves).toEqual([]);
 });
 it('has no moves without recipients',()=>{
  expect(createBusinessReassignmentPlan([],[account('1')]).moves).toEqual([]);
  expect(createBusinessReassignmentPlan([],[account('2',{groupId:'7'}),account('1',{groupId:'7',status:'reviewed',assignedUserEmail:'inactive@example.com'})]).moves).toEqual([]);
 });
 it('counts fixed accounts without a responsible as unassigned',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1',{status:'reviewed'})]);
  expect(plan.unassignedLocked).toBe(1);
 });
 it('creates a stable fingerprint and changes it when any account field changes',()=>{
  const original=account('1');
  const fingerprint=createBusinessReassignmentPlan(users,[original]).fingerprint;
  expect(createBusinessReassignmentPlan(users,[original]).fingerprint).toBe(fingerprint);
  for(const changed of [account('1',{status:'reviewed'}),account('1',{assignedUserEmail:'ana@example.com'}),account('1',{deletedAt:new Date(0)}),account('1',{archivedAt:new Date(0)}),account('1',{mergedIntoId:'2'})])expect(createBusinessReassignmentPlan(users,[changed]).fingerprint).not.toBe(fingerprint);
 });
 it('moves new linked accounts together and gives a three member group weight three',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1',{groupId:'7'}),account('2',{groupId:'7'}),account('3',{groupId:'7'}),account('4')]);
  expect(plan.moves.filter(move=>move.groupId==='7').map(move=>move.toEmail)).toEqual(['ana@example.com','ana@example.com','ana@example.com']);
  expect(plan.groups.find(group=>group.groupId==='7')).toMatchObject({kind:'together',accountIds:['1','2','3']});
  expect(plan.users[0]?.newAfter).toBe(3);
 });
 it('moves a together group from an admin who is not a recipient',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1',{groupId:'7',assignedUserEmail:'admin@example.com'}),account('2',{groupId:'7',assignedUserEmail:'admin@example.com'})]);
  expect(plan.groups).toEqual([{groupId:'7',accountIds:['1','2'],toEmail:'ana@example.com',kind:'together'}]);
  expect(plan.moves).toEqual([
   {accountId:'1',fromEmail:'admin@example.com',toEmail:'ana@example.com',groupId:'7'},
   {accountId:'2',fromEmail:'admin@example.com',toEmail:'ana@example.com',groupId:'7'}
  ]);
 });
 it('anchors new group members to the effective seller of a locked member',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1',{groupId:'7'}),account('2',{groupId:'7',status:'in_management',assignedUserEmail:'manager@example.com'})],new Set(['ana@example.com','bruno@example.com','manager@example.com']));
  expect(plan.moves).toEqual([{accountId:'1',fromEmail:null,toEmail:'manager@example.com',groupId:'7'}]);
  expect(plan.groups[0]).toMatchObject({kind:'anchored',toEmail:'manager@example.com'});
 });
 it('does not move conflicted anchored groups',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1',{groupId:'7'}),account('2',{groupId:'7',status:'reviewed',assignedUserEmail:'one@example.com'}),account('3',{groupId:'7',status:'in_management',assignedUserEmail:'two@example.com'})]);
  expect(plan.moves).toEqual([]);expect(plan.groups[0]?.kind).toBe('conflict');
 });
 it('does not anchor to an inactive or non-assignable seller and credits conflicted eligible accounts to their current sellers',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1',{groupId:'7',assignedUserEmail:'ana@example.com'}),account('2',{groupId:'7',status:'reviewed',assignedUserEmail:'inactive@example.com'})],new Set(['ana@example.com','bruno@example.com']));
  expect(plan.groups[0]).toMatchObject({kind:'conflict',toEmail:null});expect(plan.moves).toEqual([]);expect(plan.users[0]?.newAfter).toBe(1);expect(plan.users.reduce((sum,user)=>sum+user.before,0)).toBe(plan.users.reduce((sum,user)=>sum+user.after,0));
 });
 it('keeps referred new businesses fixed and uses them as anchors in groups',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1',{assignedUserEmail:'ana@example.com',referredToLeandro:true,referredOriginalOwnerEmail:'ana@example.com'}),account('2',{groupId:'7',assignedUserEmail:'bruno@example.com'}),account('3',{groupId:'7',referredToLeandro:true,referredOriginalOwnerEmail:'ana@example.com',assignedUserEmail:'leandro@example.com'})]);
  expect(plan.moves.map(move=>move.accountId)).toEqual(['2']);expect(plan.moves[0]?.toEmail).toBe('ana@example.com');expect(plan.eligibleCount).toBe(1);
 });
 it('conserves before and after totals for recipient-owned accounts when groups conflict or anchor outside recipients',()=>{
  const plan=createBusinessReassignmentPlan(users,[account('1',{assignedUserEmail:'ana@example.com'}),account('2',{assignedUserEmail:'bruno@example.com'}),account('3',{groupId:'7',assignedUserEmail:'ana@example.com'}),account('4',{groupId:'7',status:'reviewed',assignedUserEmail:'ana@example.com'})],new Set(['ana@example.com','bruno@example.com']));
  expect(plan.users.reduce((sum,user)=>sum+user.before,0)).toBe(plan.users.reduce((sum,user)=>sum+user.after,0));expect(plan.groups[0]?.toEmail).toBe('ana@example.com');
 });
 it('uses original owner for referred anchors and ignores archived members as anchors',()=>{
  const referred=createBusinessReassignmentPlan(users,[account('1',{groupId:'7'}),account('2',{groupId:'7',status:'in_management',assignedUserEmail:'leandro@example.com',referredToLeandro:true,referredOriginalOwnerEmail:'ana@example.com'})]);
  expect(referred.moves[0]?.toEmail).toBe('ana@example.com');
  const archived=createBusinessReassignmentPlan(users,[account('1',{groupId:'8'}),account('2',{groupId:'8',status:'in_management',assignedUserEmail:'bruno@example.com',archivedAt:new Date()})]);
  expect(archived.groups).toEqual([{groupId:'8',accountIds:['1'],toEmail:'ana@example.com',kind:'together'}]);
 });
 it('fingerprints group and effective seller changes and keeps deterministic group order',()=>{
  const initial=[account('10',{groupId:'2'}),account('2',{groupId:'1'})];
  const first=createBusinessReassignmentPlan(users,initial);
  expect(first.groups.map(group=>group.groupId)).toEqual(['1','2']);
  expect(createBusinessReassignmentPlan(users,[account('10',{groupId:'3'}),initial[1]!]).fingerprint).not.toBe(first.fingerprint);
  expect(createBusinessReassignmentPlan(users,[account('10',{groupId:'2',effectiveSellerEmail:'ana@example.com'}),initial[1]!]).fingerprint).not.toBe(first.fingerprint);
 });
});
