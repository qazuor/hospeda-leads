import {describe,it,expect} from 'vitest';
import {oauthPageHeaders} from './oauthPage';

describe('OAuth consent page headers',()=>{
 it('lets the browser send the real Origin on the same-origin consent POST',()=>{
  // Fetch spec: a POST from a document with Referrer-Policy no-referrer carries `Origin: null`,
  // which the same-origin check on POST /mcp/oauth/authorize rejects (origin_not_allowed).
  expect(oauthPageHeaders['Referrer-Policy']).toBe('same-origin');
 });
 it('keeps the page locked down',()=>{
  expect(oauthPageHeaders['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  expect(oauthPageHeaders['Content-Security-Policy']).toContain("form-action 'self'");
  expect(oauthPageHeaders['Cache-Control']).toBe('no-store');
 });
});
