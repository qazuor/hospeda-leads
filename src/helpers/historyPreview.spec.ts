import {describe,expect,it} from 'vitest';
import {historyPreview} from './historyPreview';

describe('historyPreview',()=>{
 it('shows five events by default and the full page when expanded',()=>{
  const events=Array.from({length:8},(_,i)=>i);
  expect(historyPreview(events,false)).toEqual([0,1,2,3,4]);
  expect(historyPreview(events,true)).toEqual(events);
 });
 it('keeps short pages unchanged',()=>expect(historyPreview([1,2],false)).toEqual([1,2]));
});
