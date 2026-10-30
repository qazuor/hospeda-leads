import {describe,it,expect} from 'vitest';
import {formatDate,formatDateShort,formatDateTime,formatDay,formatTime,relativeAgo,overdueLabel,nextActionInfo} from './crmDates';
import {displayCalendarDate,displayDate} from './leadsTableModel';

describe('Argentina date and time formatting',()=>{
 it('renders 24-hour Argentina time',()=>{
  expect(formatTime('2026-10-20T16:11:00Z')).toBe('13:11');
  expect(formatTime('2026-10-20T03:05:00Z')).toBe('00:05');
  expect(formatDateTime('2026-10-20T16:11:00Z')).toBe(formatDate('2026-10-20T16:11:00Z',true));
  expect(formatDateTime('2026-10-20T16:11:00Z')).toMatch(/13:11$/);
  expect(formatDateTime('2026-10-21T02:30:00Z')).toMatch(/23:30$/);
 });
 it('keeps date-only values on their own day and moves instants to the Argentina day',()=>{
  expect(formatDate('2026-10-01')).toMatch(/^1 de oct\.? de 2026$/);
  expect(formatDay('2026-10-01')).toMatch(/^1 de oct\.? de 2026$/);
  expect(formatDate(new Date('2026-10-01T00:00:00Z'))).toMatch(/^1 de oct\.? de 2026$/);
  expect(formatDay('2026-10-02T01:30:00Z')).toMatch(/^1 de oct\.? de 2026$/);
 });
 it('formats compact timestamp dates in the Argentina calendar',()=>{
  expect(formatDateShort('2026-10-02T01:30:00Z')).toBe('01/10');
  expect(formatDateShort(null)).toBe('Vacío');
 });
 it('renders SQL DATE values (UTC midnight Date, as postgres.js returns them) on their own day',()=>{
  const sqlDate=new Date('2026-10-01T00:00:00Z');
  expect(formatDate(sqlDate)).toMatch(/^1 de oct\.? de 2026$/);
  expect(displayCalendarDate(sqlDate)).toMatch(/^1 de oct\.? de 2026$/);
  expect(displayCalendarDate('2026-10-01T00:00:00.000Z')).toMatch(/^1 de oct\.? de 2026$/);
  expect(displayDate('2026-10-02T01:30:00Z')).toMatch(/^1 de oct\.? de 2026$/);
  expect(displayCalendarDate(null)).toBe('—');
 });
 it('returns a placeholder for invalid values',()=>{
  expect(formatDay(null)).toBe('Vacío');
  expect(formatTime('nope')).toBe('Vacío');
  expect(relativeAgo(null)).toBe('');
 });
 it('describes distance in Argentina calendar days',()=>{
  const now=new Date('2026-10-20T15:00:00Z');
  expect(relativeAgo('2026-10-20T02:59:00Z',now)).toBe('ayer');
  expect(relativeAgo('2026-10-20T03:00:00Z',now)).toBe('hoy');
  expect(relativeAgo('2026-10-14T15:00:00Z',now)).toBe('hace 6 días');
  expect(relativeAgo('2026-10-21T15:00:00Z',now)).toBe('mañana');
  expect(relativeAgo('2026-10-25T15:00:00Z',now)).toBe('en 5 días');
 });
 it('labels overdue calendar days only',()=>{
  const now=new Date('2026-10-20T15:00:00Z');
  expect(overdueLabel('2026-10-19',now)).toBe('Vencida ayer');
  expect(overdueLabel('2026-10-15',now)).toBe('Vencida hace 5 días');
  expect(overdueLabel('2026-10-20',now)).toBeNull();
  expect(overdueLabel(null,now)).toBeNull();
  expect(nextActionInfo('2000-01-01').label).toMatch(/^Vencida hace \d+ días$/);
 });
});
