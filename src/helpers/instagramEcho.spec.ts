import {describe,expect,it} from 'vitest';
import {ECHO_WINDOW_FUTURE_MS,ECHO_WINDOW_PAST_MS,pickEchoCandidate,type EchoCandidate} from './instagramEcho';

const echoAt=new Date('2026-10-27T15:00:00Z');
const TEXT='Hola, soy Ana de Hospeda. Me comunico por Hotel Sol para contarte cómo difundimos alojamientos de la zona.';
const candidate=(over:Partial<EchoCandidate>&{id:string}):EchoCandidate=>({status:'instagram_opened',recipient:'@hotel.sol',body:TEXT,textBody:TEXT,lastInteractionAt:new Date(echoAt.getTime()-60_000),externalId:null,...over});
const pick=(candidates:EchoCandidate[],text=TEXT)=>pickEchoCandidate({candidates,username:'hotel.sol',text,receivedAt:echoAt})?.id??null;

describe('pickEchoCandidate (spec 92 §2.5)',()=>{
 it('resolves the attempt with the same username and similar text',()=>{
  expect(pick([candidate({id:'a'})])).toBe('a');
  expect(pick([candidate({id:'a'})],TEXT.replace('Hola,','Buenas tardes,')+' Saludos!')).toBe('a');
 });
 it('needs the same chat username',()=>{
  expect(pick([candidate({id:'a',recipient:'@otro.hotel'})])).toBeNull();
  expect(pick([candidate({id:'a',recipient:'@Hotel.Sol'})])).toBe('a');
 });
 it('honours the window edges: echo − 24 h and echo + 10 min, inclusive',()=>{
  expect(pick([candidate({id:'a',lastInteractionAt:new Date(echoAt.getTime()-ECHO_WINDOW_PAST_MS)})])).toBe('a');
  expect(pick([candidate({id:'a',lastInteractionAt:new Date(echoAt.getTime()-ECHO_WINDOW_PAST_MS-1)})])).toBeNull();
  expect(pick([candidate({id:'a',lastInteractionAt:new Date(echoAt.getTime()+ECHO_WINDOW_FUTURE_MS)})])).toBe('a');
  expect(pick([candidate({id:'a',lastInteractionAt:new Date(echoAt.getTime()+ECHO_WINDOW_FUTURE_MS+1)})])).toBeNull();
 });
 it('lets the newest matching attempt win',()=>{
  expect(pick([candidate({id:'old',lastInteractionAt:new Date(echoAt.getTime()-3600_000)}),candidate({id:'new',lastInteractionAt:new Date(echoAt.getTime()-60_000)})])).toBe('new');
 });
 it('prefers an opened attempt over one confirmed by hand, even if older',()=>{
  expect(pick([candidate({id:'hand',status:'manual_sent',lastInteractionAt:new Date(echoAt.getTime()-30_000)}),candidate({id:'opened',lastInteractionAt:new Date(echoAt.getTime()-3600_000)})])).toBe('opened');
  expect(pick([candidate({id:'hand',status:'manual_sent'})])).toBe('hand');
 });
 it('does not claim with a different text (Dice < 0.5): a quick greeting is a standalone echo',()=>{
  expect(pick([candidate({id:'a'})],'Hola!')).toBeNull();
  expect(pick([candidate({id:'a'})],'Te paso el link de la propuesta mañana temprano')).toBeNull();
 });
 it('anchors the window on the open, not on a later «Sí, se envió» (late echo with Meta timestamp)',()=>{
  // Opened at T, confirmed by hand at T+16 min (last_interaction_at moves), echo stamped T+1 min.
  const t=echoAt.getTime()-60_000;
  expect(pick([candidate({id:'hand',status:'manual_sent',openedAt:new Date(t),lastInteractionAt:new Date(t+16*60_000)})])).toBe('hand');
  expect(pick([candidate({id:'hand',status:'manual_sent',lastInteractionAt:new Date(t+16*60_000)})])).toBeNull();
 });
 it('never touches an attempt answered «No se envió», one already linked, or one without prepared text',()=>{
  expect(pick([candidate({id:'a',status:'manual_not_done'})])).toBeNull();
  expect(pick([candidate({id:'a',status:'manual_sent',externalId:'mid.0'})])).toBeNull();
  expect(pick([candidate({id:'a',body:'',textBody:null})])).toBeNull();
  // L3: a prepared text without comparable words (emoji, one letter) never matches, unlike the WhatsApp rule.
  expect(pick([candidate({id:'a',body:'🙂 !',textBody:'🙂 !'})],'🙂 !')).toBeNull();
 });
});
