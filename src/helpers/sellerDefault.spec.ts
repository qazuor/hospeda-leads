import {describe,expect,it} from 'vitest';
import {initialSellerGroups,isMineFilter,mineFilterGroup,sellerDefaultKey} from './sellerDefault';

const memory=(entries:Record<string,string>={})=>({getItem:(key:string)=>entries[key]??null});
const base={email:'ana@example.com',userId:7,deepLinked:false};
const other=[{rules:[{field:'ciudad',operator:'eq',value:'Paraná'}]}] as never;

describe('initialSellerGroups',()=>{
  it('applies Mis gestiones the first time',()=>{
    const groups=initialSellerGroups({...base,stored:[],storage:memory()});
    expect(groups).toEqual([mineFilterGroup('ana@example.com')]);
    expect(isMineFilter(groups,'ana@example.com')).toBe(true);
  });
  it('respects a remembered "Todos" once the marker exists',()=>{
    expect(initialSellerGroups({...base,stored:[],storage:memory({[sellerDefaultKey(7)]:'1'})})).toEqual([]);
  });
  it('keeps stored filters and deep links',()=>{
    expect(initialSellerGroups({...base,stored:other,storage:memory()})).toBe(other);
    expect(initialSellerGroups({...base,deepLinked:true,stored:[],storage:memory()})).toEqual([]);
    expect(initialSellerGroups({...base,stored:[],storage:null})).toEqual([]);
  });
  it('does not call other filters "mine"',()=>{
    expect(isMineFilter(other,'ana@example.com')).toBe(false);
    expect(isMineFilter([],'ana@example.com')).toBe(false);
  });
});
