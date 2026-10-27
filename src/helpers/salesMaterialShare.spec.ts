// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {clientIp,createShareRateLimiter,generateShareToken,hashShareToken,isPreviewBot,isShareTokenFormat,shareTokenMatches} from './salesMaterialShare';

describe('share tokens',()=>{
 it('generates 256-bit base64url tokens and stores only their sha256',()=>{
  const a=generateShareToken(),b=generateShareToken();
  expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(Buffer.from(a.token,'base64url')).toHaveLength(32);
  expect(a.token).not.toBe(b.token);expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);expect(a.tokenHash).not.toContain(a.token);
  expect(hashShareToken({token:a.token})).toBe(a.tokenHash);
 });
 it('validates the exact token shape before any lookup',()=>{
  const {token}=generateShareToken();
  expect(isShareTokenFormat({token})).toBe(true);
  for(const bad of ['',token.slice(1),token+'A',token.slice(0,42)+'=',token.slice(0,42)+'/',"' OR 1=1 --",'../../etc/passwd'])expect(isShareTokenFormat({token:bad}),bad).toBe(false);
 });
 it('compares a token with a stored hash in constant time and rejects malformed hashes',()=>{
  const {token,tokenHash}=generateShareToken();
  expect(shareTokenMatches({token,tokenHash})).toBe(true);
  expect(shareTokenMatches({token:generateShareToken().token,tokenHash})).toBe(false);
  expect(shareTokenMatches({token,tokenHash:'abc'})).toBe(false);expect(shareTokenMatches({token,tokenHash:tokenHash.toUpperCase()})).toBe(false);
 });
});
describe('isPreviewBot',()=>{
 it.each([
  'WhatsApp/2.23.20.0','facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)','Facebot','Twitterbot/1.0','Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'TelegramBot (like TwitterBot)','LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)','Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)','Mozilla/5.0 (compatible; bingbot/2.0)','Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5',
  'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1)','SomeCrawler/1.0','my-spider','LinkPreview/2','curl/8.4.0','python-requests/2.31','Go-http-client/1.1','node-fetch',''
 ])('treats %j as a bot',ua=>expect(isPreviewBot({userAgent:ua})).toBe(true));
 it.each([
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0'
 ])('treats %j as a person',ua=>expect(isPreviewBot({userAgent:ua})).toBe(false));
 it('treats a missing user agent as a bot',()=>{expect(isPreviewBot({userAgent:null})).toBe(true);expect(isPreviewBot({userAgent:undefined})).toBe(true);});
});
describe('clientIp',()=>{
 const h=(init:Record<string,string>)=>new Headers(init);
 it('prefers X-Real-IP, set by Traefik',()=>expect(clientIp({headers:h({'x-real-ip':'203.0.113.7','x-forwarded-for':'198.51.100.1, 203.0.113.7'}),remoteAddress:'10.0.0.2'})).toBe('203.0.113.7'));
 it('uses the last X-Forwarded-For hop (the one the proxy appended), never the client-controlled first one',()=>expect(clientIp({headers:h({'x-forwarded-for':'1.2.3.4, 198.51.100.9'}),remoteAddress:'10.0.0.2'})).toBe('198.51.100.9'));
 it('falls back to the socket address and ignores garbage headers',()=>{
  expect(clientIp({headers:h({'x-real-ip':'not-an-ip','x-forwarded-for':'evil'}),remoteAddress:'::ffff:127.0.0.1'})).toBe('127.0.0.1');
  expect(clientIp({headers:h({}),remoteAddress:'2001:db8::1'})).toBe('2001:db8::1');
  expect(clientIp({headers:h({})})).toBe('unknown');
 });
});
describe('createShareRateLimiter',()=>{
 it('allows 60 requests per IP per minute, then refuses until the window resets',()=>{
  let t=0;const l=createShareRateLimiter({now:()=>t});
  for(let i=0;i<60;i++)expect(l.allowRequest('a')).toBe(true);
  expect(l.allowRequest('a')).toBe(false);expect(l.allowRequest('b')).toBe(true);
  t=60000;expect(l.allowRequest('a')).toBe(true);
 });
 it('blocks lookups after 20 unknown tokens in 10 minutes per IP',()=>{
  let t=0;const l=createShareRateLimiter({now:()=>t});
  for(let i=0;i<20;i++){expect(l.allowUnknownLookup('a')).toBe(true);l.recordUnknown('a');}
  expect(l.allowUnknownLookup('a')).toBe(false);expect(l.allowUnknownLookup('b')).toBe(true);
  t=599999;expect(l.allowUnknownLookup('a')).toBe(false);t=600000;expect(l.allowUnknownLookup('a')).toBe(true);
 });
 it('prunes expired entries instead of growing without bound',()=>{
  let t=0;const l=createShareRateLimiter({now:()=>t,maxEntries:3});
  for(const ip of ['a','b','c'])l.allowRequest(ip);
  t=60000;for(const ip of ['d','e','f'])l.allowRequest(ip);
  for(let i=0;i<60;i++)l.allowRequest('g');expect(l.allowRequest('g')).toBe(false);
  l.reset();expect(l.allowRequest('g')).toBe(true);
 });
});
