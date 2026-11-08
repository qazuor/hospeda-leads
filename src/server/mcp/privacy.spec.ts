import {describe,it,expect} from 'vitest';
import {decodeAddressEntities,redactStaffEmails,staffDomainsFromHost} from './privacy';

const staff={emails:['staff@example.com'],domains:['hospeda.com.ar']};

describe('staff text privacy',()=>{
 it('redacts staff email case-insensitively including quoted address forms',()=>{
  expect(redactStaffEmails('Signed by STAFF@Example.com; reply quote <staff@example.com>. client@outside.test',staff))
   .toBe('Signed by [equipo]; reply quote <[equipo]>. client@outside.test');
 });
 it('leaves unrelated email addresses visible',()=>expect(redactStaffEmails('client@example.net',staff)).toBe('client@example.net'));
 it('redacts any address on a staff domain even when it is not a user email',()=>{
  expect(redactStaffEmails('Enviado desde ventas@hospeda.com.ar y info@mail.hospeda.com.ar',staff)).toBe('Enviado desde [equipo] y [equipo]');
 });
 it('does not treat look-alike domains as staff',()=>expect(redactStaffEmails('x@nothospeda.com.ar',staff)).toBe('x@nothospeda.com.ar'));
 it('decodes entity and percent-encoded addresses before matching',()=>{
  expect(redactStaffEmails('El equipo &lt;staff&#64;example.com&gt; escribió; staff%40example.com',staff)).toBe('El equipo <[equipo]> escribió; [equipo]');
 });
 it('keeps trailing sentence punctuation outside the replacement',()=>expect(redactStaffEmails('Escribí a staff@example.com.',staff)).toBe('Escribí a [equipo].'));
 it('keeps null values null',()=>expect(redactStaffEmails(null,staff)).toBeNull());
 it('derives the CRM email domain from its public host',()=>{
  expect(staffDomainsFromHost('crm.hospeda.com.ar')).toEqual(['hospeda.com.ar']);
  expect(staffDomainsFromHost('127.0.0.1:3001')).toEqual([]);
  expect(decodeAddressEntities('a&amp;b')).toBe('a&b');
 });
});
