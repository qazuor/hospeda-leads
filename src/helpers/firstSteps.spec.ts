import {describe,expect,it} from 'vitest';
import {firstStepItems,showFirstSteps} from './firstSteps';

const none={contacted:false,logged:false,scheduled:false};
describe('first steps',()=>{
 it('lists four steps in order and ticks only what was really done',()=>{
  const items=firstStepItems({flags:{...none,logged:true},opened:true});
  expect(items.map(i=>i.key)).toEqual(['opened','contacted','logged','scheduled']);
  expect(items.map(i=>i.done)).toEqual([true,false,true,false]);
 });
 it('does not tick step 1 without an opened task',()=>expect(firstStepItems({flags:none,opened:false})[0].done).toBe(false));
 it('treats an experienced user (all three server flags) as having opened a task',()=>{const items=firstStepItems({flags:{contacted:true,logged:true,scheduled:true},opened:false});expect(items.every(i=>i.done)).toBe(true);expect(showFirstSteps({items,dismissed:false})).toBe(false);});
 it('shows while a step is pending',()=>expect(showFirstSteps({items:firstStepItems({flags:none,opened:false}),dismissed:false})).toBe(true));
 it('hides once dismissed',()=>expect(showFirstSteps({items:firstStepItems({flags:none,opened:false}),dismissed:true})).toBe(false));
 it('hides when all four are done',()=>expect(showFirstSteps({items:firstStepItems({flags:{contacted:true,logged:true,scheduled:true},opened:true}),dismissed:false})).toBe(false));
});
