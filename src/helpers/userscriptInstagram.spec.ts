// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('./db',()=>({db:{}}));
const {allowInstagramThreadReport,instagramAccountUsername,instagramProfilePattern,instagramQueryUsername,instagramThreadInput,instagramThreadStaleInput,resetInstagramThreadRateLimits}=await import('./userscriptInstagram');
const {panelPurposes}=await import('./userscriptInstagramTemplates');
const {normalizeInstagramUsername}=await import('./instagramChat');

const THREAD='17848251833510164';
afterEach(()=>resetInstagramThreadRateLimits());

describe('Instagram thread report input (spec 97 §5.2)',()=>{
 it('accepts a normalized username, a numeric thread id and a known proof',()=>{
  expect(instagramThreadInput.parse({username:'hotel.sol',threadId:THREAD,proof:'header'})).toEqual({username:'hotel.sol',threadId:THREAD,proof:'header'});
  expect(instagramThreadInput.safeParse({username:'hotel.sol',threadId:THREAD,proof:'seller'}).success).toBe(true);
 });
 it('rejects uppercase or @ usernames, non-numeric threads, unknown proofs and extra keys',()=>{
  for(const body of [{username:'Hotel.Sol',threadId:THREAD,proof:'header'},{username:'@hotel.sol',threadId:THREAD,proof:'header'},{username:'hotel.sol',threadId:'abc',proof:'header'},{username:'hotel.sol',threadId:'1'.repeat(41),proof:'header'},{username:'hotel.sol',threadId:THREAD,proof:'guess'},{username:'hotel.sol',threadId:THREAD,proof:'header',accountId:'1'}])expect(instagramThreadInput.safeParse(body).success,JSON.stringify(body)).toBe(false);
  expect(instagramThreadStaleInput.safeParse({username:'hotel.sol',threadId:THREAD}).success).toBe(true);
  expect(instagramThreadStaleInput.safeParse({username:'hotel.sol',threadId:THREAD,proof:'header'}).success).toBe(false);
 });
});

describe('Hospeda Instagram account (decision 12.7)',()=>{
 it('reads INSTAGRAM_ACCOUNT_USERNAME normalized, null when unset or invalid',()=>{
  expect(instagramAccountUsername({INSTAGRAM_ACCOUNT_USERNAME:'@Hospeda.com.ar'})).toBe('hospeda.com.ar');
  expect(instagramAccountUsername({INSTAGRAM_ACCOUNT_USERNAME:'https://www.instagram.com/hospeda.com.ar/'})).toBe('hospeda.com.ar');
  expect(instagramAccountUsername({})).toBeNull();expect(instagramAccountUsername({INSTAGRAM_ACCOUNT_USERNAME:'no valid'})).toBeNull();
 });
 it('normalizes the context query and refuses long or invalid values',()=>{
  expect(instagramQueryUsername('@Hotel.Sol')).toBe('hotel.sol');
  expect(instagramQueryUsername(null)).toBeNull();expect(instagramQueryUsername('x'.repeat(201))).toBeNull();expect(instagramQueryUsername('dos palabras')).toBeNull();
 });
});

describe('thread report rate limit',()=>{
 it('allows 30 reports per token per minute, per token, and recovers after the window',()=>{
  const t0=1_000_000;
  for(let i=0;i<30;i++)expect(allowInstagramThreadReport('a',t0+i)).toBe(true);
  expect(allowInstagramThreadReport('a',t0+31)).toBe(false);
  expect(allowInstagramThreadReport('b',t0+31)).toBe(true);
  expect(allowInstagramThreadReport('a',t0+61_000)).toBe(true);
 });
});

describe('panel purposes without a management (decision 12.6)',()=>{
 it('offers only verification for a Nuevo business',()=>{
  expect(panelPurposes({status:'new',isClient:false}).map(p=>p.value)).toEqual(['verification']);
 });
 it('drops «care» for a business that is not a client yet, keeps it for a client',()=>{
  const prospect=panelPurposes({status:'contacted',isClient:false}).map(p=>p.value),client=panelPurposes({status:'client',isClient:true}).map(p=>p.value);
  expect(prospect).not.toContain('care');expect(prospect).toContain('first_contact');expect(prospect).toContain('other');
  expect(client).toContain('care');
 });
});

describe('perfil_instagram pattern for the business lookup (M2)',()=>{
 // Same ARE subset in JavaScript: anchors, (?:), \s, classes, ? and *; Postgres runs it with ~* (case-insensitive).
 const matches=(username:string,value:string)=>new RegExp(instagramProfilePattern(username),'i').test(value);
 const corpus=['al','@al','AL/','  @Al  ','https://www.instagram.com/al','https://instagram.com/al/?hl=es','http://m.instagram.com/al/reels/','www.instagram.com/al','instagram.com/Al#x','https://www.instagram.com/al.x','alx','@a.l','https://facebook.com/al','https://evilinstagram.com/al','al hotel','mi ig: al','https://www.instagram.com/p/al','@al_','a.l'];
 it('matches a short username only as a whole handle or the first URL segment, never as a substring',()=>{
  expect(corpus.filter(value=>matches('al',value))).toEqual(['al','@al','AL/','  @Al  ','https://www.instagram.com/al','https://instagram.com/al/?hl=es','http://m.instagram.com/al/reels/','www.instagram.com/al','instagram.com/Al#x']);
 });
 it('is a superset of the normalization: every value that normalizes to the username matches (the JS rule stays the final filter)',()=>{
  for(const username of ['al','a.l','hotel.sol','al_'])for(const value of [...corpus,...corpus.map(v=>v.split('al').join(username))])if(normalizeInstagramUsername(value)===username)expect(matches(username,value),`${username} ← ${value}`).toBe(true);
 });
 it('escapes the dot: a.l does not match abl',()=>{expect(matches('a.l','abl')).toBe(false);expect(matches('a.l','@a.l')).toBe(true);});
});
