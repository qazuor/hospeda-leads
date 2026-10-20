import {describe,it,expect} from 'vitest';
import {groupBy,countBy} from './groupBy';

describe('groupBy',()=>{
  it('groups by key and keeps the input order inside each group',()=>{
    const tasks=[{accountId:2,title:'b1'},{accountId:1,title:'a1'},{accountId:2,title:'b2'}];
    const groups=groupBy(tasks,t=>String(t.accountId));
    expect([...groups.keys()]).toEqual(['2','1']);
    expect(groups.get('2')!.map(t=>t.title)).toEqual(['b1','b2']);
    expect(groups.get('1')!.map(t=>t.title)).toEqual(['a1']);
    expect(groups.get('3')).toBeUndefined();
  });
  it('returns an empty map for no items',()=>{
    expect(groupBy([],x=>x).size).toBe(0);
  });
});

describe('countBy',()=>{
  it('counts items per key',()=>{
    const counts=countBy([{accountId:'7'},{accountId:'8'},{accountId:'7'}],c=>c.accountId);
    expect(counts.get('7')).toBe(2);
    expect(counts.get('8')).toBe(1);
    expect(counts.get('9')).toBeUndefined();
  });
});
