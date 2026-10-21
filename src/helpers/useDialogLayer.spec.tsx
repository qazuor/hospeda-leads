import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {act,cleanup,render} from '@testing-library/react';
import {useDialogLayer} from './useDialogLayer';

function Probe({open}:{open:boolean}){useDialogLayer(open);return null;}
const root=()=>document.documentElement.style;
let viewport:EventTarget&{height:number;offsetTop:number};

beforeEach(()=>{
 viewport=Object.assign(new EventTarget(),{height:800,offsetTop:0});
 Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
});
afterEach(()=>{cleanup();Reflect.deleteProperty(window,'visualViewport');});

describe('useDialogLayer visual viewport',()=>{
 it('mirrors the visual viewport into CSS variables while a dialog is open and follows the keyboard',()=>{
  render(<Probe open/>);
  expect(root().getPropertyValue('--crm-vv-height')).toBe('800px');
  act(()=>{viewport.height=420;viewport.offsetTop=12;viewport.dispatchEvent(new Event('resize'));});
  expect(root().getPropertyValue('--crm-vv-height')).toBe('420px');
  expect(root().getPropertyValue('--crm-vv-top')).toBe('12px');
 });
 it('removes the variables once the last dialog closes, not before',()=>{
  const first=render(<Probe open/>),second=render(<Probe open/>);
  first.unmount();
  expect(root().getPropertyValue('--crm-vv-height')).toBe('800px');
  second.unmount();
  expect(root().getPropertyValue('--crm-vv-height')).toBe('');
  expect(root().getPropertyValue('--crm-vv-top')).toBe('');
 });
 it('does nothing while closed', ()=>{
  render(<Probe open={false}/>);
  expect(root().getPropertyValue('--crm-vv-height')).toBe('');
 });
});
