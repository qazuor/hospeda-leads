import {describe,expect,it} from 'vitest';
import {callSummary,isDialable,telHref} from './phoneCall';

describe('phone call helpers',()=>{
 it('builds a dialable tel: link and recognises numbers without digits',()=>{
  expect(telHref('+54 9 3442 00-0001')).toBe('tel:+5493442000001');expect(telHref('5493442000001')).toBe('tel:5493442000001');
  expect(isDialable('(0345) 421-0000')).toBe(true);expect(isDialable(' - ')).toBe(false);expect(isDialable(null)).toBe(false);
 });
 it('keeps the seller note and otherwise states only what she pressed',()=>{
  expect(callSummary({result:'manual_sent',who:'Ana',phone:'123',note:'  Pidió precios '})).toBe('Pidió precios');
  expect(callSummary({result:'manual_sent',who:'Ana',phone:'123',note:''})).toBe('Llamada realizada a Ana (123).');
  expect(callSummary({result:'manual_no_contact',who:'Hotel',phone:'',note:' '})).toBe('Intento de llamada sin contacto a Hotel.');
 });
});
