import {describe,expect,it} from 'vitest';
import {canLogContactOutcome,contactTitle,contactWorkChannel,contactWorkPurpose,needsSentAnswer} from './contactOutcome';

describe('canLogContactOutcome',()=>{
 it('accepts real contacts and attempts',()=>{
  for(const status of ['whatsapp_opened','manual_pending','manual_sent','manual_no_contact','accepted','delivery_confirmed','replied','rejected'])expect(canLogContactOutcome(status)).toBe(true);
 });
 it('never treats drafts, cancelled, failed, not done or uncertain sends as a contact',()=>{
  for(const status of ['draft','cancelled','submitting','unknown','failed','manual_not_done',null,undefined])expect(canLogContactOutcome(status)).toBe(false);
 });
});

describe('needsSentAnswer',()=>{
 it('asks whether the message was sent only when opening the channel proved nothing',()=>{
  expect(needsSentAnswer('whatsapp_opened')).toBe(true);
  expect(needsSentAnswer('manual_pending')).toBe(true);
  expect(needsSentAnswer('accepted')).toBe(false);
  expect(needsSentAnswer('manual_sent')).toBe(false);
  expect(needsSentAnswer('manual_no_contact')).toBe(false);
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
