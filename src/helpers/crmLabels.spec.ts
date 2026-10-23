import {describe,expect,it} from 'vitest';
import {actorLabel,channelLabel,inboundMeta,inboundNoun,outcomeLabel,responseCategoryLabel,stageLabel,userLabel} from './crmLabels';

describe('crm labels',()=>{
 it('resolves stage keys of any type and passes legacy names through',()=>{
  expect(stageLabel('provider:interested')).toBe('Interesado en participar');
  expect(stageLabel('main:lost')).toBe('Cerrada perdida');
  expect(stageLabel('accompaniment:working')).toBe('Trabajando en la ficha');
  expect(stageLabel('Prospecto')).toBe('Prospecto');
  expect(stageLabel(null)).toBe('Sin etapa');
 });

 it('labels channels and response categories without raw keys',()=>{
  expect(channelLabel('whatsapp')).toBe('WhatsApp');
  expect(channelLabel('call')).toBe('Llamada');
  expect(channelLabel('phone')).toBe('Teléfono');
  expect(channelLabel('')).toBe('Sin canal');
  expect(channelLabel('toString')).toBe('toString');
  expect(responseCategoryLabel('information')).toBe('Pidió información');
  expect(responseCategoryLabel('interested')).toBe('Respondió, le interesa');
  expect(responseCategoryLabel('rejected')).toBe('No le interesa');
  expect(responseCategoryLabel(null)).toBe('Sin clasificar');
 });

 it('shows canonical outcomes and maps legacy stored values for display',()=>{
  expect(outcomeLabel('interested')).toBe('Respondió, le interesa');
  expect(outcomeLabel('later')).toBe('Pidió que lo contacte más adelante');
  expect(outcomeLabel('replied')).toBe('Respondió');
  expect(outcomeLabel('delivered')).toBe('Entrega confirmada');
  expect(outcomeLabel(undefined)).toBe('Sin resultado');
 });

 it('never shows an email for a user or actor',()=>{
  const users=[{email:'marta@example.test',displayName:'Marta'},{email:'sin.nombre@example.test',displayName:null},{email:'mail.name@example.test',displayName:'mail.name@example.test'}];
  expect(userLabel(users,'MARTA@example.test')).toBe('Marta');
  expect(userLabel(users,'sin.nombre@example.test')).toBe('Otra persona del equipo');
  expect(userLabel(users,'seller1@example.test')).toBe('Otra persona del equipo');
  expect(userLabel(undefined,'seller1@example.test')).not.toContain('@');
  expect(userLabel(users,null)).toBe('Sin responsable');
  expect(userLabel(users,'mail.name@example.test')).toBe('Otra persona del equipo');
  expect(actorLabel('Sistema')).toBe('Automático');
  expect(actorLabel('SISTEMA')).toBe('Automático');
  expect(actorLabel('mail.name@example.test',users)).toBe('Otra persona del equipo');
  expect(actorLabel(null)).toBe('Automático');
  expect(actorLabel('  ')).toBe('Automático');
  expect(actorLabel('marta@example.test',users)).toBe('Marta');
  expect(actorLabel('seller1@example.test')).toBe('Otra persona del equipo');
  expect(actorLabel('Leandro')).toBe('Leandro');
 });
 it('names received WhatsApp messages without an email subject',()=>{
  expect(inboundNoun('whatsapp')).toBe('mensaje');
  expect(inboundNoun('email')).toBe('email');
  expect(inboundMeta({item:{channel:'whatsapp',fromAddress:'+54 9 345 1234567',subject:null},when:'hoy'})).toBe('+54 9 345 1234567 · hoy');
  expect(inboundMeta({item:{channel:'whatsapp',fromAddress:'',subject:null},when:'hoy'})).toBe('hoy');
  expect(inboundMeta({item:{channel:'email',fromAddress:'ana@example.com',subject:''},when:'hoy'})).toBe('ana@example.com · (sin asunto) · hoy');
  expect(inboundMeta({item:{channel:'email',fromAddress:'ana@example.com',subject:'Precios'},when:'hoy'})).toBe('ana@example.com · Precios · hoy');
 });
});
