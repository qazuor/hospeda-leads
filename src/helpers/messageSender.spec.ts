import {describe,expect,it} from 'vitest';
import {messageSender} from './messageSender';

const current={email:'admin@example.com',displayName:'Admin',fullName:'Admin Completo'};
const profiles=[{email:'seller@example.com',displayName:'Leo',fullName:'Leandro Pérez'}];

describe('messageSender',()=>{
 it('signs as the responsible even when someone else prepares the message',()=>{
  expect(messageSender({responsibleEmail:'seller@example.com',profiles,currentUser:current})).toEqual({sender:'Leandro Pérez',senderShort:'Leo',senderEmail:'seller@example.com'});
 });
 it('falls back to the display name when the responsible has no full name',()=>{
  expect(messageSender({responsibleEmail:'seller@example.com',profiles:[{email:'seller@example.com',displayName:'Leo',fullName:'  '}],currentUser:current}).sender).toBe('Leo');
 });
 it('uses the current user when the business has no responsible',()=>{
  expect(messageSender({responsibleEmail:null,profiles,currentUser:current})).toEqual({sender:'Admin Completo',senderShort:'Admin',senderEmail:'admin@example.com'});
 });
});
