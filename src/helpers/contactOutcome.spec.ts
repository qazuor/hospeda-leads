import {describe,expect,it} from 'vitest';
import {CrmApiError} from './apiClient';
import {ALREADY_CONFIRMED_MESSAGE,isAlreadyConfirmed,OUTCOME_FOLLOW_UP_STATUSES,OUTCOME_STALE_DAYS,UNCONFIRMED_STALE_HOURS,WHATSAPP_SCRIPT_WAIT_MS,OUTCOME_READY_STATUSES,UNCONFIRMED_FOLLOW_UP_STATUSES,canLogContactOutcome,followUpKind,contactTitle,contactWorkChannel,contactWorkPurpose,isOpenedUnconfirmed,needsSentAnswer} from './contactOutcome';

describe('canLogContactOutcome',()=>{
 it('accepts real contacts and attempts',()=>{
  for(const status of ['whatsapp_opened','instagram_opened','manual_pending','manual_sent','manual_no_contact','accepted','delivery_confirmed','replied','rejected'])expect(canLogContactOutcome(status)).toBe(true);
 });
 it('never treats drafts, cancelled, failed, not done or uncertain sends as a contact',()=>{
  for(const status of ['draft','cancelled','submitting','unknown','failed','manual_not_done',null,undefined])expect(canLogContactOutcome(status)).toBe(false);
 });
});

describe('follow-up partition (spec 99 §3.6)',()=>{
 it('splits every outcome-ready status into exactly one list, without overlap',()=>{
  const all=[...UNCONFIRMED_FOLLOW_UP_STATUSES,...OUTCOME_FOLLOW_UP_STATUSES];
  expect(new Set(all).size).toBe(all.length);
  expect([...all].sort()).toEqual([...OUTCOME_READY_STATUSES].sort());
  expect(UNCONFIRMED_FOLLOW_UP_STATUSES.filter(s=>(OUTCOME_FOLLOW_UP_STATUSES as readonly string[]).includes(s))).toEqual([]);
 });
 it('puts opened chats and manual attempts in «Envíos sin confirmar» and evidence in «Anotá cómo salió»',()=>{
  for(const status of ['whatsapp_opened','instagram_opened','manual_pending'])expect(followUpKind(status)).toBe('unconfirmed');
  for(const status of ['manual_sent','manual_no_contact','accepted','delivery_confirmed','replied','rejected'])expect(followUpKind(status)).toBe('outcomes');
  for(const status of ['draft','cancelled','failed','unknown','manual_not_done',null])expect(followUpKind(status)).toBeNull();
 });
 it('asks «¿Lo enviaste?» exactly for the unconfirmed list',()=>{
  for(const status of OUTCOME_READY_STATUSES)expect(needsSentAnswer(status)).toBe(followUpKind(status)==='unconfirmed');
 });
});

describe('needsSentAnswer',()=>{
 it('asks whether the message was sent only when opening the channel proved nothing',()=>{
  expect(needsSentAnswer('whatsapp_opened')).toBe(true);
  expect(needsSentAnswer('instagram_opened')).toBe(true);
  expect(needsSentAnswer('manual_pending')).toBe(true);
  expect(needsSentAnswer('accepted')).toBe(false);
  expect(needsSentAnswer('manual_sent')).toBe(false);
  expect(needsSentAnswer('manual_no_contact')).toBe(false);
 });
});

describe('isOpenedUnconfirmed (spec 92)',()=>{
 it('covers WhatsApp and Instagram opened from the composer, and nothing else',()=>{
  expect(isOpenedUnconfirmed('whatsapp_opened')).toBe(true);
  expect(isOpenedUnconfirmed('instagram_opened')).toBe(true);
  for(const status of ['manual_pending','manual_sent','draft','accepted',null,undefined])expect(isOpenedUnconfirmed(status)).toBe(false);
 });
 it('lists an opened Instagram among the contacts ready for «¿Cómo salió?»',()=>{
  expect(OUTCOME_READY_STATUSES).toContain('instagram_opened');
 });
});

describe('contact activity defaults',()=>{
 it('maps communication channels to the work editor channels',()=>{
  expect(contactWorkChannel('call')).toBe('phone');
  expect(contactWorkChannel('whatsapp')).toBe('whatsapp');
  expect(contactWorkChannel('email')).toBe('email');
  expect(contactWorkChannel('social')).toBe('other');
 });
 it('titles the activity by channel',()=>{
  expect(contactTitle('whatsapp')).toBe('Contacto por WhatsApp');
  expect(contactTitle('call')).toBe('Contacto por llamada');
  expect(contactTitle('social')).toBe('Contacto por red social');
 });
 it('keeps care as its own purpose and everything else as commercial work',()=>{
  expect(contactWorkPurpose('care')).toBe('care');
  expect(contactWorkPurpose('first_contact')).toBe('commercial');
  expect(contactWorkPurpose(null)).toBe('commercial');
 });
});

describe('expiry and wait thresholds (spec 100 §7, §9)',()=>{
 it('expires «¿Lo enviaste?» after 72 hours and a management outcome group after 7 days',()=>{expect(UNCONFIRMED_STALE_HOURS).toBe(72);expect(OUTCOME_STALE_DAYS).toBe(7);});
 it('waits 5 minutes for the WhatsApp user script, less than the 15-minute Instagram echo wait',()=>{expect(WHATSAPP_SCRIPT_WAIT_MS).toBe(5*60_000);});
});

describe('isAlreadyConfirmed (spec 100 §8)',()=>{
 it('is true only for the 409 «Este envío ya estaba confirmado.»',()=>{
  expect(ALREADY_CONFIRMED_MESSAGE).toBe('Este envío ya estaba confirmado.');
  expect(isAlreadyConfirmed(new CrmApiError(ALREADY_CONFIRMED_MESSAGE,409))).toBe(true);
  expect(isAlreadyConfirmed(new CrmApiError('Este registro fue anulado.',409))).toBe(false);
  expect(isAlreadyConfirmed(new CrmApiError(ALREADY_CONFIRMED_MESSAGE,400))).toBe(false);
  expect(isAlreadyConfirmed(null)).toBe(false);
 });
});
