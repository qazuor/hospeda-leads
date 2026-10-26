import {afterEach,describe,expect,it} from 'vitest';
import {allowBadgeRequest,resetBadgeRateLimits} from './userscriptBadges';
describe('userscript badge rate limit',()=>{afterEach(resetBadgeRateLimits);it('allows thirty requests per token and resets after a minute',()=>{for(let i=0;i<30;i++)expect(allowBadgeRequest('token',1000+i)).toBe(true);expect(allowBadgeRequest('token',2000)).toBe(false);expect(allowBadgeRequest('other',2000)).toBe(true);expect(allowBadgeRequest('token',61_001)).toBe(true);});});
