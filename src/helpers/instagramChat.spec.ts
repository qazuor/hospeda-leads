import {describe,expect,it} from 'vitest';
import {INSTAGRAM_ECHO_WAIT_MS,composerChannelOf,instagramChatUrl,instagramProfileUrl,instagramTarget,instagramTextEdited,instagramWaitRemainingMs,isInstagramAttempt,isInstagramConfirmed,isWaitingForInstagramEcho,normalizeInstagramUsername} from './instagramChat';

const attempt=(over:Record<string,unknown>={})=>({channel:'social',destinationDetail:'instagram',ownerEmail:'ana@example.com',status:'instagram_opened',lastInteractionAt:new Date('2026-10-27T15:00:00Z'),...over});
const t0=new Date('2026-10-27T15:00:00Z').getTime();

describe('instagramChatUrl (spec 92)',()=>{
 it('builds the ig.me chat link for a valid username, with or without @',()=>{
  expect(instagramChatUrl({username:'hotel.sol'})).toBe('https://ig.me/m/hotel.sol');
  expect(instagramChatUrl({username:'@cabanas_del_rio'})).toBe('https://ig.me/m/cabanas_del_rio');
 });
 it('refuses anything that is not a normalized username (never builds a URL from free text)',()=>{
  for(const value of ['',null,undefined,'Hotel Sol','hotel/sol','https://instagram.com/hotel','a'.repeat(31),'HOTEL','hotel?x=1','javascript:alert(1)'])expect(instagramChatUrl({username:value})).toBeNull();
 });
 it('keeps the path encoded (only safe characters reach the URL)',()=>{
  expect(new URL(instagramChatUrl({username:'a.b_c9'})!).pathname).toBe('/m/a.b_c9');
 });
});

describe('instagramTarget: one device decision (ig.me is not supported on Instagram Web)',()=>{
 it('opens the profile on a computer, with a trailing slash',()=>{
  expect(instagramTarget({username:'@hotel.sol',mobile:false})).toEqual({url:'https://www.instagram.com/hotel.sol/',kind:'profile',label:'Abrir el perfil de @hotel.sol en Instagram'});
  expect(instagramProfileUrl({username:'a.b_c9'})).toBe('https://www.instagram.com/a.b_c9/');
 });
 it('opens the chat in the app on a phone',()=>{
  expect(instagramTarget({username:'hotel.sol',mobile:true})).toEqual({url:'https://ig.me/m/hotel.sol',kind:'chat',label:'Ir al chat de @hotel.sol en Instagram'});
 });
 it('never builds either URL from free text',()=>{
  for(const mobile of [true,false])for(const value of ['Hotel Sol','hotel/sol','../x',null,''])expect(instagramTarget({username:value,mobile})).toBeNull();
  expect(instagramProfileUrl({username:'hotel?x=1'})).toBeNull();
 });
});

describe('normalizeInstagramUsername',()=>{
 it('accepts profiles, URLs and scheme-less hosts',()=>{
  expect(normalizeInstagramUsername('@Hotel.Sol')).toBe('hotel.sol');
  expect(normalizeInstagramUsername('instagram.com/hotel.sol/?hl=es')).toBe('hotel.sol');
  expect(normalizeInstagramUsername('https://www.instagram.com/hotel.sol')).toBe('hotel.sol');
  expect(normalizeInstagramUsername('https://facebook.com/hotel')).toBeNull();
 });
});

describe('Instagram attempts',()=>{
 it('tells a prepared attempt from an echo or a «Red social» log',()=>{
  expect(isInstagramAttempt(attempt())).toBe(true);
  expect(isInstagramAttempt(attempt({ownerEmail:'instagram@hospeda'}))).toBe(false);
  expect(isInstagramAttempt(attempt({destinationDetail:'Instagram del dueño'}))).toBe(false);
  expect(isInstagramAttempt(attempt({channel:'whatsapp'}))).toBe(false);
 });
 it('waits 15 minutes from the open, then stops waiting',()=>{
  expect(isWaitingForInstagramEcho({message:attempt(),now:t0+1000})).toBe(true);
  expect(instagramWaitRemainingMs({message:attempt(),now:t0+60_000})).toBe(INSTAGRAM_ECHO_WAIT_MS-60_000);
  expect(isWaitingForInstagramEcho({message:attempt(),now:t0+INSTAGRAM_ECHO_WAIT_MS})).toBe(false);
  expect(isWaitingForInstagramEcho({message:attempt({status:'manual_sent'}),now:t0+1000})).toBe(false);
  expect(isWaitingForInstagramEcho({message:attempt({lastInteractionAt:null}),now:t0})).toBe(false);
  expect(instagramWaitRemainingMs({message:attempt(),now:t0+INSTAGRAM_ECHO_WAIT_MS+1})).toBeNull();
 });
 it('is confirmed only when sent and carrying the echo mid',()=>{
  expect(isInstagramConfirmed(attempt({status:'manual_sent',externalId:'mid.1'}))).toBe(true);
  expect(isInstagramConfirmed(attempt({status:'manual_sent',externalId:null}))).toBe(false);
  expect(isInstagramConfirmed(attempt({status:'manual_sent',externalId:'mid.1',ownerEmail:'instagram@hospeda'}))).toBe(false);
 });
 it('notices an edit before sending, ignoring whitespace',()=>{
  expect(instagramTextEdited({body:'Hola  Ana',textBody:'Hola Ana'})).toBe(false);
  expect(instagramTextEdited({body:'Hola Ana',textBody:'Hola Ana, ¿todo bien?'})).toBe(true);
  expect(instagramTextEdited({body:'Hola',textBody:null})).toBe(false);
 });
 it('maps a stored row to its composer channel',()=>{
  expect(composerChannelOf({channel:'social',destinationDetail:'instagram'})).toBe('instagram');
  expect(composerChannelOf({channel:'email'})).toBe('email');
  expect(composerChannelOf({channel:'whatsapp'})).toBe('whatsapp');
 });
});
