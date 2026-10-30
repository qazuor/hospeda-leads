// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {clientIp,clientIpMode,createShareRateLimiter,generateShareToken,hashShareToken,isPreviewBot,isShareTokenFormat,mangledShareTokenFromPath,shareTokenMatches} from './salesMaterialShare';

describe('share tokens',()=>{
 it('generates 256-bit base64url tokens and stores only their sha256',()=>{
  const a=generateShareToken(),b=generateShareToken();
  expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(Buffer.from(a.token,'base64url')).toHaveLength(32);
  expect(a.token).not.toBe(b.token);expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);expect(a.tokenHash).not.toContain(a.token);
  expect(hashShareToken({token:a.token})).toBe(a.tokenHash);
 });
 it('always ends in an alphanumeric character, so linkifiers cannot swallow or extend it',()=>{
  for(let i=0;i<2000;i++)expect(generateShareToken().token).toMatch(/[A-Za-z0-9]$/);
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
  'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1)','SomeCrawler/1.0','my-spider','LinkPreview/2','curl/8.4.0','python-requests/2.31','Go-http-client/1.1','node-fetch','AhrefsBot/7.0 (+http://ahrefs.com/robot/)','Mozilla/5.0 (compatible; bot; +http://example.com)',''
 ])('treats %j as a bot',ua=>expect(isPreviewBot({userAgent:ua})).toBe(true));
 it.each([
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (Linux; Android 11; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; CUBOT_KINGKONG_9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 10; Redmi Note 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0'
 ])('treats %j as a person',ua=>expect(isPreviewBot({userAgent:ua})).toBe(false));
 it('treats a missing user agent as a bot',()=>{expect(isPreviewBot({userAgent:null})).toBe(true);expect(isPreviewBot({userAgent:undefined})).toBe(true);});
});
describe('clientIp',()=>{
 const h=(init:Record<string,string>)=>new Headers(init);
 const all=h({'x-real-ip':'203.0.113.7','cf-connecting-ip':'203.0.113.8','x-forwarded-for':'1.2.3.4, 198.51.100.9'});
 it('x-real-ip (default) trusts only X-Real-IP, set by Traefik',()=>{
  expect(clientIp({headers:all,remoteAddress:'10.0.0.2',mode:'x-real-ip'})).toBe('203.0.113.7');
  expect(clientIp({headers:h({'cf-connecting-ip':'1.1.1.1','x-forwarded-for':'1.2.3.4'}),remoteAddress:'10.0.0.2',mode:'x-real-ip'})).toBe('10.0.0.2');
 });
 it('cf-connecting-ip trusts only that header',()=>{
  expect(clientIp({headers:all,remoteAddress:'10.0.0.2',mode:'cf-connecting-ip'})).toBe('203.0.113.8');
  expect(clientIp({headers:h({'x-real-ip':'1.1.1.1','x-forwarded-for':'1.2.3.4'}),remoteAddress:'10.0.0.2',mode:'cf-connecting-ip'})).toBe('10.0.0.2');
 });
 it('x-forwarded-for uses the last hop (the one the proxy appended), never the client-controlled first one',()=>{
  expect(clientIp({headers:all,remoteAddress:'10.0.0.2',mode:'x-forwarded-for'})).toBe('198.51.100.9');
  expect(clientIp({headers:h({'x-forwarded-for':'1.2.3.4, evil'}),remoteAddress:'10.0.0.2',mode:'x-forwarded-for'})).toBe('10.0.0.2');
  expect(clientIp({headers:h({'x-real-ip':'1.1.1.1'}),remoteAddress:'10.0.0.2',mode:'x-forwarded-for'})).toBe('10.0.0.2');
 });
 it('none ignores every header and uses the socket address',()=>{
  expect(clientIp({headers:all,remoteAddress:'10.0.0.2',mode:'none'})).toBe('10.0.0.2');
  expect(clientIp({headers:all,mode:'none'})).toBe('unknown');
 });
 it('falls back to the socket address and ignores garbage headers',()=>{
  expect(clientIp({headers:h({'x-real-ip':'not-an-ip'}),remoteAddress:'::ffff:127.0.0.1',mode:'x-real-ip'})).toBe('127.0.0.1');
  expect(clientIp({headers:h({}),remoteAddress:'2001:db8::1',mode:'x-real-ip'})).toBe('2001:db8::1');
  expect(clientIp({headers:h({}),mode:'x-real-ip'})).toBe('unknown');
 });
 it('reads the mode from the value given, defaulting to x-real-ip for empty or unknown values',()=>{
  expect(clientIpMode({value:'cf-connecting-ip'})).toBe('cf-connecting-ip');expect(clientIpMode({value:' X-Forwarded-For '})).toBe('x-forwarded-for');expect(clientIpMode({value:'none'})).toBe('none');
  for(const bad of [undefined,null,'','x-evil','true'])expect(clientIpMode({value:bad})).toBe('x-real-ip');
 });
 it('uses CRM_CLIENT_IP_HEADER when no mode is passed',()=>{
  const previous=process.env.CRM_CLIENT_IP_HEADER;
  try{
   process.env.CRM_CLIENT_IP_HEADER='cf-connecting-ip';expect(clientIp({headers:all,remoteAddress:'10.0.0.2'})).toBe('203.0.113.8');
   delete process.env.CRM_CLIENT_IP_HEADER;expect(clientIp({headers:all,remoteAddress:'10.0.0.2'})).toBe('203.0.113.7');
  }finally{if(previous===undefined)delete process.env.CRM_CLIENT_IP_HEADER;else process.env.CRM_CLIENT_IP_HEADER=previous;}
 });
});
describe('mangledShareTokenFromPath',()=>{
 const {token}=generateShareToken();
 it.each(['/','.',',',')','%29','%2c'])('returns the clean token for a trailing %j',tail=>expect(mangledShareTokenFromPath({pathname:`/m/${token}${tail}`})).toBe(token));
 it('returns null for the clean path, double punctuation, other suffixes and malformed tokens',()=>{
  for(const path of [`/m/${token}`,`/m/${token}..`,`/m/${token}/file`,`/m/${token}/file/`,`/m/${token.slice(1)}/`,`/m/${token}x.`,'/m/','/x/'+token+'/'])expect(mangledShareTokenFromPath({pathname:path}),path).toBeNull();
 });
});
describe('createShareRateLimiter',()=>{
 it('allows the configured requests per IP per minute, then refuses until the window resets',()=>{
  let t=0;const l=createShareRateLimiter({now:()=>t,requestsPerMinute:60});
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
 it('allows 300 requests per minute per IP by default, so shared IPs are not locked out',()=>{
  const l=createShareRateLimiter({now:()=>0});
  for(let i=0;i<300;i++)expect(l.allowRequest('office')).toBe(true);
  expect(l.allowRequest('office')).toBe(false);
 });
 it('drops expired entries from the front instead of growing without bound',()=>{
  let t=0;const l=createShareRateLimiter({now:()=>t,maxEntries:100});
  for(let i=0;i<50;i++)l.allowRequest('old'+i);
  t=60000;l.allowRequest('new');expect(l.size()).toBe(1);
 });
 it('caps memory at maxEntries per map, evicting the oldest entries first',()=>{
  let t=0;const l=createShareRateLimiter({now:()=>t,maxEntries:5,requestsPerMinute:1});
  for(let i=0;i<20;i++){t=i;l.allowRequest('ip'+i);}
  expect(l.size()).toBe(5);
  // The newest five survive (their counter is already used); an evicted IP starts again from zero.
  for(let i=15;i<20;i++)expect(l.allowRequest('ip'+i),'ip'+i).toBe(false);
  expect(l.allowRequest('ip0')).toBe(true);
  for(let i=0;i<50;i++){t=100+i;l.recordUnknown('u'+i);}
  expect(l.size()).toBeLessThanOrEqual(10);
 });
 it('re-inserting an expired IP moves it to the back, keeping the insertion order sorted by window start',()=>{
  let t=0;const l=createShareRateLimiter({now:()=>t,maxEntries:3,requestsPerMinute:1});
  l.allowRequest('a');t=1;l.allowRequest('b');t=2;l.allowRequest('c');
  t=60000;l.allowRequest('a');
  t=60001;l.allowRequest('d');
  expect(l.allowRequest('a')).toBe(false);expect(l.size()).toBeLessThanOrEqual(3);
 });
 it('resets the counters',()=>{const l=createShareRateLimiter({now:()=>0,requestsPerMinute:1});l.allowRequest('g');expect(l.allowRequest('g')).toBe(false);l.reset();expect(l.allowRequest('g')).toBe(true);});
});
