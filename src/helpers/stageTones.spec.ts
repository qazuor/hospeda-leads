import {describe,expect,it} from 'vitest';
import {stageTone,type StageToneEntry} from './stageTones';

describe('stageTone',()=>{
 const stages:StageToneEntry[]=['main:a','main:b','main:c','main:d','main:e','main:f','main:g'].map(name=>({name,classification:'open',managementType:'main'}));
 it('assigns open tones by their order and cycles after six',()=>{expect(stageTone({stage:stages[0]!,stages})).toBe('slate');expect(stageTone({stage:stages[1]!,stages})).toBe('sky');expect(stageTone({stage:stages[6]!,stages})).toBe('slate')});
 it('uses outcome tones and falls back to slate for unknown stages',()=>{expect(stageTone({stage:{name:'main:won',classification:'won',managementType:'main'},stages})).toBe('green');expect(stageTone({stage:{name:'main:lost',classification:'lost',managementType:'main'},stages})).toBe('red');expect(stageTone({stage:null,stages})).toBe('slate')});
});
