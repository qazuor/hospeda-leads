import {describe,expect,it} from 'vitest';
import {dayProgress} from './dayProgress';

describe('dayProgress',()=>{
 it('shows progress while tasks are left',()=>expect(dayProgress({overdue:1,today:3,done:3,waiting:0})).toEqual({kind:'progress',done:3,total:7}));
 it('is finished only when tasks and pending outcomes are all done',()=>{
  expect(dayProgress({overdue:0,today:0,done:3,waiting:0}).kind).toBe('finished');
  expect(dayProgress({overdue:0,today:0,done:3,waiting:2}).kind).toBe('progress');
 });
 it('says nothing on an empty day',()=>expect(dayProgress({overdue:0,today:0,done:0,waiting:0}).kind).toBe('none'));
});
