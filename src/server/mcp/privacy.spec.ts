import {describe,it,expect} from 'vitest';
import {containsAddress,normalizeForPrivacy,redactStaffEmails,staffDomainsFromHost} from './privacy';

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
 it('decodes named, decimal, hex and percent encodings before matching',()=>{
  expect(redactStaffEmails('El equipo &lt;staff&#64;example.com&gt; escribió; staff%40example.com',staff)).toBe('El equipo <[equipo]> escribió; [equipo]');
  expect(redactStaffEmails('staff&#x40;example.com y staff&#0064;example.com',staff)).toBe('[equipo] y [equipo]');
 });
 it('decodes nested encodings and full-width characters',()=>{
  expect(redactStaffEmails('staff%2540example.com',staff)).toBe('[equipo]');
  expect(redactStaffEmails('staff＠example.com',staff)).toBe('[equipo]');
  expect(redactStaffEmails('ventas＠hospeda.com.ar',staff)).toBe('[equipo]');
 });
 it('redacts known staff emails embedded in surrounding characters',()=>{
  expect(redactStaffEmails('href=mailto:staff@example.com?subject=hola',staff)).toBe('href=mailto:[equipo]?subject=hola');
  expect(redactStaffEmails('=ventas@hospeda.com.ar=',staff)).toBe('[equipo]=');
 });
 it('anchors staff domains even when query strings or other characters follow',()=>{
  expect(redactStaffEmails('mailto:ventas@hospeda.com.ar?subject=hola',staff)).toBe('mailto:[equipo]?subject=hola');
  expect(redactStaffEmails('ventas@hospeda.com.ar/firma',staff)).toBe('[equipo]/firma');
  expect(redactStaffEmails('x@hospeda.com.ar.evil.example',staff)).toBe('x@hospeda.com.ar.evil.example');
  expect(redactStaffEmails("o'brien@hospeda.com.ar",staff)).toBe('[equipo]');
  expect(redactStaffEmails('a!b#c@ventas-ar.hospeda.com.ar',staff)).toBe('[equipo]');
  expect(redactStaffEmails('ñandú@hospeda.com.ar',staff)).toBe('[equipo]');
 });
 it('keeps trailing sentence punctuation outside the replacement',()=>expect(redactStaffEmails('Escribí a staff@example.com.',staff)).toBe('Escribí a [equipo].'));
 it('keeps null values null',()=>expect(redactStaffEmails(null,staff)).toBeNull());
 it('derives the CRM email domain from its public host',()=>{
  expect(staffDomainsFromHost('crm.hospeda.com.ar')).toEqual(['hospeda.com.ar']);
  expect(staffDomainsFromHost('127.0.0.1:3001')).toEqual([]);
 });
 it('normalizes repeatedly with a cap',()=>{
  expect(normalizeForPrivacy('a&amp;b')).toBe('a&b');
  expect(normalizeForPrivacy('a&amp;amp;amp;amp;amp;amp;amp;b').length).toBeGreaterThan(0);
 });
 it('detects addresses for fail-closed history only after normalization',()=>{
  expect(containsAddress('x&#64;y.com')).toBe(true);
  expect(containsAddress('x＠y.com')).toBe(true);
  expect(containsAddress('sin email')).toBe(false);
  expect(containsAddress(null)).toBe(false);
 });
});
