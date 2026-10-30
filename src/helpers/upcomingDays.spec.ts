import {describe,it,expect} from 'vitest';
import {upcomingDayLabel} from './upcomingDays';
describe('upcomingDayLabel',()=>{it('labels tomorrow in Argentina',()=>{expect(upcomingDayLabel('2026-10-26',null,new Date('2026-10-25T15:00:00Z'))).toBe('Mañana · Lunes 26/10')});it('uses Argentina day for a 23:30 ART dueAt',()=>{expect(upcomingDayLabel('2026-10-26',new Date('2026-10-27T02:30:00Z'),new Date('2026-10-25T15:00:00Z'))).toBe('Mañana · Lunes 26/10')})});
