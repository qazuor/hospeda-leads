import {describe,it,expect} from 'vitest';
import {oauthPageHeaders} from './oauthPage';

const redirects=['https://chatgpt.com/connector_platform_oauth_redirect'] as const;

describe('OAuth consent page headers',()=>{
 it('lets the browser send the real Origin on the same-origin consent POST',()=>{
  // Fetch spec: a POST from a document with Referrer-Policy no-referrer carries `Origin: null`,
  // which the same-origin check on POST /mcp/oauth/authorize rejects (origin_not_allowed).
  expect(oauthPageHeaders({redirects})['Referrer-Policy']).toBe('same-origin');
 });
 it('lets the consent form follow the 303 redirect back to the configured client',()=>{
  // Browsers enforce form-action on redirects after a form submission: `form-action 'self'` alone
  // silently blocks the redirect to chatgpt.com, so "Autorizar lectura" seems to do nothing.
  const csp=oauthPageHeaders({redirects})['Content-Security-Policy'];
  expect(csp).toMatch(/form-action 'self' https:\/\/chatgpt\.com;/);
 });
 it('allows only the exact configured redirect origins, deduplicated',()=>{
  const csp=oauthPageHeaders({redirects:['https://a.example/cb','https://a.example/other','https://b.example/cb']})['Content-Security-Policy'];
  expect(csp).toContain("form-action 'self' https://a.example https://b.example;");
 });
 it('keeps the page locked down',()=>{
  const h=oauthPageHeaders({redirects});
  expect(h['Content-Security-Policy']).toContain("default-src 'none'");
  expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  expect(h['Cache-Control']).toBe('no-store');
 });
});
