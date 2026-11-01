// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {randomBytes} from 'node:crypto';
import {SHORT_TOKEN_ALPHABET,clientIp,clientIpMode,createShareRateLimiter,generateShortShareToken,hashShareToken,isPreviewBot,isShareTokenFormat,mangledShareTokenFromPath,normalizeShareSlug,parseShareSegment,shareClientKey,shareSlug,shareTokenMatches} from './salesMaterialShare';

/** A token in the format sent before spec 101 (32 random bytes, base64url). */
const legacyToken=()=>{let t='';do{t=randomBytes(32).toString('base64url')}while(!/[A-Za-z0-9]$/.test(t));return t;};
describe('legacy share tokens (before spec 101)',()=>{
 it('validates the exact legacy shape before any lookup',()=>{
  const token=legacyToken();
  expect(isShareTokenFormat({token})).toBe(true);
  for(const bad of ['',token.slice(1),token+'A',token.slice(0,42)+'=',token.slice(0,42)+'/',"' OR 1=1 --",'../../etc/passwd'])expect(isShareTokenFormat({token:bad}),bad).toBe(false);
 });
 it('compares a token with a stored hash in constant time and rejects malformed hashes',()=>{
  const token=legacyToken(),tokenHash=hashShareToken({token});
  expect(shareTokenMatches({token,tokenHash})).toBe(true);
  expect(shareTokenMatches({token:legacyToken(),tokenHash})).toBe(false);
  expect(shareTokenMatches({token,tokenHash:'abc'})).toBe(false);expect(shareTokenMatches({token,tokenHash:tokenHash.toUpperCase()})).toBe(false);
 });
});
describe('short share tokens (spec 101 D1)',()=>{
 it('generates 4 characters of the base62 alphabet and stores only their sha256',()=>{
  const a=generateShortShareToken();
  expect(a.token).toMatch(/^[A-Za-z0-9]{4}$/);expect(a.tokenHash).toBe(hashShareToken({token:a.token}));expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(SHORT_TOKEN_ALPHABET).toHaveLength(62);expect(new Set(SHORT_TOKEN_ALPHABET).size).toBe(62);
 });
 it('never produces `-` or `_`, so the slug separator and WhatsApp italics stay unambiguous',()=>{
  for(let i=0;i<3000;i++)expect(generateShortShareToken().token).toMatch(/^[A-Za-z0-9]{4}$/);
 });
 it('maps bytes uniformly by rejecting the bytes above the last multiple of 62',()=>{
  const bytes=[255,248,0,61,62,123];let i=0;
  const t=generateShortShareToken({random:n=>Buffer.from(Array.from({length:n},()=>bytes[i++%bytes.length]!))});
  // 255 and 248 are rejected; 0→'0', 61→'z' (last), 62→'0', 123→'z'.
  expect(t.token).toBe(SHORT_TOKEN_ALPHABET[0]!+SHORT_TOKEN_ALPHABET[61]+SHORT_TOKEN_ALPHABET[0]+SHORT_TOKEN_ALPHABET[61]);
 });
});
describe('shareSlug',()=>{
 it.each([
  ['Folleto de tarifas 2027','folleto-de-tarifas-2027'],['Cabaña «Río» & más','cabana-rio-mas'],['  ÁÉÍÓÚ üñ  ','aeiou-un'],['--Hola__mundo!!--','hola-mundo'],
  ['***','material'],['','material'],['Tour 360° — Villa Elisa','tour-360-villa-elisa']
 ])('turns %j into %j',(title,slug)=>expect(shareSlug({title})).toBe(slug));
 it('cuts at 40 characters on a dash, never in the middle of a word when it can',()=>{
  const slug=shareSlug({title:'Presentación completa de servicios turísticos para alojamientos'});
  expect(slug.length).toBeLessThanOrEqual(40);expect(slug).toBe('presentacion-completa-de-servicios');expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  expect(shareSlug({title:'a'.repeat(60)})).toBe('a'.repeat(40));
 });
});
describe('normalizeShareSlug',()=>{
 it('ignores case and accents, and decodes percent-encoded text',()=>{
  expect(normalizeShareSlug({slug:'Folleto-De-Tarifas'})).toBe('folleto-de-tarifas');
  expect(normalizeShareSlug({slug:'cabaña-río'})).toBe('cabana-rio');
  expect(normalizeShareSlug({slug:'caba%C3%B1a'})).toBe('cabana');
  expect(normalizeShareSlug({slug:'100%-real'})).toBe('100%-real');
 });
});
describe('parseShareSegment',()=>{
 it('splits a short link into slug and token',()=>{
  expect(parseShareSegment({segment:'folleto-2027-Ab3x'})).toEqual({legacy:null,short:{slug:'folleto-2027',token:'Ab3x'}});
  expect(parseShareSegment({segment:'Cabaña-Río-Ab3x'})).toEqual({legacy:null,short:{slug:'Cabaña-Río',token:'Ab3x'}});
 });
 it('recognizes a legacy token without slug, and offers both readings for an ambiguous 43-character segment',()=>{
  const token=legacyToken();expect(parseShareSegment({segment:token}).legacy).toBe(token);
  const ambiguous='a'.repeat(38)+'-Ab3x';expect(ambiguous).toHaveLength(43);
  expect(parseShareSegment({segment:ambiguous})).toEqual({legacy:ambiguous,short:{slug:'a'.repeat(38),token:'Ab3x'}});
 });
 it('rejects a token without slug, a wrong token length, separators in the token and garbage',()=>{
  for(const segment of ['Ab3x','-Ab3x','folleto-Ab3','folleto-Ab3xy','folleto-Ab_x','folleto_Ab3x','',"x' OR 1=1 --",'a/b-Ab3x','x'.repeat(250)+'-Ab3x'])
   expect(parseShareSegment({segment}),segment).toEqual({legacy:null,short:null});
 });
});
describe('shareClientKey',()=>{
 it('keeps an IPv4 address whole',()=>{expect(shareClientKey({ip:'203.0.113.7'})).toBe('203.0.113.7');expect(shareClientKey({ip:'203.0.113.8'})).not.toBe(shareClientKey({ip:'203.0.113.7'}));});
 it('groups IPv6 addresses by their /64, whatever the notation',()=>{
  const key=shareClientKey({ip:'2001:db8:abcd:12::1'});
  expect(key).toBe('2001:db8:abcd:12::/64');
  for(const ip of ['2001:db8:abcd:12:ffff:ffff:ffff:ffff','2001:0DB8:ABCD:0012:0:0:0:9','2001:db8:abcd:12:1234::'])expect(shareClientKey({ip}),ip).toBe(key);
  expect(shareClientKey({ip:'2001:db8:abcd:13::1'})).not.toBe(key);
  expect(shareClientKey({ip:'::1'})).toBe('0:0:0:0::/64');expect(shareClientKey({ip:'fe80::1'})).toBe('fe80:0:0:0::/64');
  expect(shareClientKey({ip:'2001:db8::'})).toBe('2001:db8:0:0::/64');
 });
 it('treats an IPv4-mapped IPv6 address as IPv4 and leaves unknown alone',()=>{
  expect(shareClientKey({ip:'::ffff:203.0.113.7'})).toBe('203.0.113.7');expect(shareClientKey({ip:'unknown'})).toBe('unknown');
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
 // No '-': a 42-character slice with a '-' before its last 4 characters is a valid short link (`slug-XXXX`), which made the null case flaky.
 const token=(()=>{let t='';do{t=legacyToken()}while(t.includes('-'));return t;})();
 it.each(['/','.',',',')','%29','%2c'])('returns the clean legacy token for a trailing %j',tail=>expect(mangledShareTokenFromPath({pathname:`/m/${token}${tail}`})).toBe(token));
 it.each(['/','.',',',')','%29','%2C'])('returns the clean short segment for a trailing %j',tail=>{
  expect(mangledShareTokenFromPath({pathname:`/m/folleto-2027-Ab3x${tail}`})).toBe('folleto-2027-Ab3x');
  expect(mangledShareTokenFromPath({pathname:`/m/caba%C3%B1a-Ab3x${tail}`})).toBe('caba%C3%B1a-Ab3x');
 });
 it('returns null for the clean path, double punctuation, other suffixes and malformed tokens',()=>{
  for(const path of [`/m/${token}`,`/m/${token}..`,`/m/${token}/file`,`/m/${token}/file/`,`/m/${token.slice(1)}/`,`/m/${token}x.`,'/m/','/x/'+token+'/','/m/folleto-Ab3x','/m/folleto-Ab3x..','/m/folleto-Ab3x/file/','/m/Ab3x.','/m/folleto-Ab3.'])expect(mangledShareTokenFromPath({pathname:path}),path).toBeNull();
 });
});
describe('createShareRateLimiter',()=>{
 it('allows the configured requests per IP per minute, then refuses until the window resets',()=>{
  let t=0;const l=createShareRateLimiter({now:()=>t,requestsPerMinute:60});
  for(let i=0;i<60;i++)expect(l.allowRequest('a')).toBe(true);
  expect(l.allowRequest('a')).toBe(false);expect(l.allowRequest('b')).toBe(true);
  t=60000;expect(l.allowRequest('a')).toBe(true);
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
