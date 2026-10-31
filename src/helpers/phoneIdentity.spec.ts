import {describe,expect,it} from 'vitest';
import {phoneDigits,samePhone} from './phoneIdentity';

describe('samePhone (spec 99 §3.4 identity)',()=>{
 it('matches equal digits whatever the format',()=>{
  expect(phoneDigits({phone:'+54 9 (3442) 55-5111'})).toBe('5493442555111');
  expect(samePhone({a:'+54 9 3442 555111',b:'5493442555111'})).toBe(true);
  expect(samePhone({a:'4123456',b:'412-3456'})).toBe(true);
 });
 it('matches the last 10 digits when both have at least 10 (+54 9 and 0 prefixes)',()=>{
  expect(samePhone({a:'+5493414123456',b:'0341 4123456'})).toBe(true);
  expect(samePhone({a:'3414123456',b:'+54 341 4123456'})).toBe(true);
 });
 it('never matches another area code with the same local number',()=>{
  expect(samePhone({a:'341-4123456',b:'351-4123456'})).toBe(false);
  expect(samePhone({a:'+5493414123456',b:'+5493514123456'})).toBe(false);
 });
 it('never matches a short number against a longer one by suffix, nor empty values',()=>{
  expect(samePhone({a:'4123456',b:'3414123456'})).toBe(false);
  expect(samePhone({a:'',b:''})).toBe(false);
  expect(samePhone({a:null,b:'3414123456'})).toBe(false);
  expect(samePhone({a:'sin teléfono',b:'otro texto'})).toBe(false);
 });
});
