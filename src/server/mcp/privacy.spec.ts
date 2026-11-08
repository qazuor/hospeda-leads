import {describe,it,expect} from 'vitest';
import {redactStaffEmails} from './privacy';

describe('staff text privacy',()=>{
 it('redacts staff email case-insensitively including quoted address forms',()=>{
  expect(redactStaffEmails('Signed by STAFF@Example.com; reply quote <staff@example.com>. client@outside.test',['staff@example.com']))
   .toBe('Signed by [equipo]; reply quote <[equipo]>. client@outside.test');
 });
 it('leaves unrelated email addresses visible',()=>expect(redactStaffEmails('client@example.net',['staff@example.com'])).toBe('client@example.net'));
});
