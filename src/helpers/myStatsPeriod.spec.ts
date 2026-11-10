import {describe,expect,it} from 'vitest';
import {parseStatsPeriod,presetPeriod,serializeStatsPeriod,validateStatsRange} from './myStatsPeriod';

describe('my stats period',()=>{
 const now=new Date('2026-11-10T02:00:00Z');
 it('computes Argentina presets, including Monday through today',()=>{
  expect(presetPeriod('today',now).from).toBe('2026-11-09');
  expect(presetPeriod('week',now)).toMatchObject({from:'2026-11-09',to:'2026-11-09'});
  expect(presetPeriod('month',now)).toMatchObject({from:'2026-11-01',to:'2026-11-09'});
 });
 it('parses and serializes presets and ranges, falling back on invalid URLs',()=>{
  expect(parseStatsPeriod(new URLSearchParams('period=week'),now).preset).toBe('week');
  expect(serializeStatsPeriod(presetPeriod('month',now))).toBe('period=month');
  const range=parseStatsPeriod(new URLSearchParams('from=2026-01-01&to=2026-01-31'),now);
  expect(serializeStatsPeriod(range)).toBe('from=2026-01-01&to=2026-01-31');
  expect(parseStatsPeriod(new URLSearchParams('period=unknown'),now).preset).toBe('month');
  expect(parseStatsPeriod(new URLSearchParams('from=2026-02-01&to=2026-01-01'),now).valid).toBe(false);
 });
 it('limits custom ranges to 366 inclusive days',()=>{
  expect(validateStatsRange('2024-01-01','2024-12-31')).toBeNull();
  expect(validateStatsRange('2024-01-01','2025-01-01')).toContain('366');
  expect(validateStatsRange('2026-02-02','2026-02-01')).toContain('anterior');
 });
});
