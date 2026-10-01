import {describe,it,expect} from 'vitest';
import {localDay,calendarDay,localDateTime,argentinaInstant,taskBucket} from './workDates';
import {day} from '../endpoints/work.schema';
import {nextActionInfo,toDateInput} from './crmDates';
describe('Commercial days are explicit Argentina calendar days',()=>{
 it('uses Argentina at UTC midnight, independent from server/browser zone',()=>{
  const now=new Date('2026-10-02T01:30:00Z');
  expect(localDay(now)).toBe('2026-10-01');
  expect(localDateTime(now)).toBe('2026-10-01T22:30');
  expect(argentinaInstant('2026-10-01T22:30').toISOString()).toBe('2026-10-02T01:30:00.000Z');
 });
 it('separates no-time days from timed deadlines',()=>{
  const now=new Date('2026-10-02T01:30:00Z');
  expect(taskBucket('2026-10-01',null,now)).toBe('today');
  expect(taskBucket('2026-10-01','2026-10-01T15:00:00Z',now)).toBe('overdue');
  expect(taskBucket('2026-10-02',null,now)).toBe('upcoming');
  expect(taskBucket('2026-09-30',null,now)).toBe('overdue');
 });
 it('preserves legacy calendar date and rejects impossible dates',()=>{
  expect(calendarDay(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10-01');
  expect(toDateInput(new Date('2026-10-01T12:00:00Z'))).toBe('2026-10-01');
  expect(day.safeParse('2026-02-30').success).toBe(false);
  expect(day.safeParse('2028-02-29').success).toBe(true);
  expect(nextActionInfo(null).tone).toBe('empty');
 });
});
