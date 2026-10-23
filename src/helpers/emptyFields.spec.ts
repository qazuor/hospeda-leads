import {describe,expect,it} from 'vitest';
import {splitEmptyFields} from './emptyFields';

describe('splitEmptyFields',()=>{
 const fields=['phone','website','city'] as const;
 it('splits populated and empty fields in source order',()=>{const values={phone:'123',website:'',city:'Gualeguaychú'};expect(splitEmptyFields(fields,field=>values[field])).toEqual({populated:['phone','city'],empty:['website']})});
 it('returns only empty fields when no value is present',()=>{const values={phone:null,website:'',city:undefined};expect(splitEmptyFields(fields,field=>values[field])).toEqual({populated:[],empty:['phone','website','city']})});
});
