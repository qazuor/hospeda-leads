import {describe,it,expect} from 'vitest';
import {resolveViewPins} from './viewPins';
const views=[{name:'a',kind:'Rápida',key:'quick:all'},{name:'b',kind:'Rápida',key:'quick:mine'},{name:'c',kind:'Tuya',key:'personal:1'}];
describe('resolveViewPins',()=>{
 it('pins every available view by default',()=>expect(resolveViewPins(views).pinned).toEqual(views));
 it('applies hidden and configured order, ignoring stale ids and pinning new views last',()=>{const result=resolveViewPins([...views,{name:'d',kind:'Tuya',key:'personal:2'}],{order:['personal:1','deleted'],hidden:['quick:mine']},'quick:all');expect(result.pinned.map(v=>v.key)).toEqual(['personal:1','quick:all','personal:2']);expect(result.unpinned.map(v=>v.key)).toEqual(['quick:mine']);});
 it('never allows all to be hidden',()=>expect(resolveViewPins(views,{order:[],hidden:['quick:all']},'quick:all').pinned.map(v=>v.key)).toContain('quick:all'));
 it('omits views excluded from the available input',()=>expect(resolveViewPins(views.filter(v=>v.key!=='quick:mine')).pinned.map(v=>v.key)).not.toContain('quick:mine'));
});

describe('view pin key builders',()=>{
 it('adds the namespace expected by the storage schema',async()=>{const {systemViewKey,quickViewKey,personalViewKey}=await import('./viewPins');expect(systemViewKey('custom:123e4567-e89b-12d3-a456-426614174000')).toBe('system:custom:123e4567-e89b-12d3-a456-426614174000');expect(quickViewKey('today')).toBe('quick:today');expect(personalViewKey('legacy-'+'a'.repeat(64))).toBe('personal:legacy-'+'a'.repeat(64));});
});
