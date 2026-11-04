import {describe,it,expect} from 'vitest';
import {canChangeUserRole,canDeactivateUser,normalizeWhatsappPhone,resolveWhatsappAccountPhone} from './userAdmin';
describe('WhatsApp user admin helpers',()=>{
 it('normalizes human phone input and accepts clearing',()=>{expect(normalizeWhatsappPhone('+54 9 3442 12-3456')).toEqual({phone:'5493442123456',error:null});expect(normalizeWhatsappPhone('')).toEqual({phone:null,error:null});});
 it('rejects phone numbers outside 8 to 15 digits',()=>{expect(normalizeWhatsappPhone('1234567').error).toMatch(/8 y 15/);expect(normalizeWhatsappPhone('1'.repeat(16)).error).toMatch(/8 y 15/);});
 it('prefers the user line, falls back to env, then stays unconfigured',()=>{const env={WHATSAPP_ACCOUNT_PHONE:'54911112222'};expect(resolveWhatsappAccountPhone({userPhone:'5493442123456',env})).toBe('5493442123456');expect(resolveWhatsappAccountPhone({userPhone:null,env})).toBe(env.WHATSAPP_ACCOUNT_PHONE);expect(resolveWhatsappAccountPhone({userPhone:null,env:{}})).toBeNull();});
 it('guards self-role changes and last admin removal',()=>{expect(canChangeUserRole({actorId:1,targetId:1,targetRole:'admin',nextRole:'user',activeAdmins:2})).toBe(false);expect(canChangeUserRole({actorId:1,targetId:2,targetRole:'admin',nextRole:'user',activeAdmins:1})).toBe(false);expect(canChangeUserRole({actorId:1,targetId:2,targetRole:'user',nextRole:'user',activeAdmins:1})).toBe(true);});
 it('guards self-deactivation and last active admin',()=>{expect(canDeactivateUser({actorId:1,targetId:1,targetRole:'user',activeAdmins:2})).toBe(false);expect(canDeactivateUser({actorId:1,targetId:2,targetRole:'admin',activeAdmins:1})).toBe(false);});
});
