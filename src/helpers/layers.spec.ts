import {describe,expect,it} from 'vitest';
import {DIALOG_LAYER_MAX,LAYERS,dialogZIndex} from './layers';

describe('layer scale',()=>{
 it('keeps the toaster above every other layer, including the dialog maximum',()=>{
  const {toast,...others}=LAYERS;
  expect(DIALOG_LAYER_MAX).toBeLessThan(toast);
  for(const value of Object.values(others))expect(value).toBeLessThan(toast);
 });
 it('stacks dialogs two steps apart and clamps deep stacks below the toaster',()=>{
  expect(dialogZIndex({index:-1}).zIndex).toBe(LAYERS.dialogBase);
  expect(dialogZIndex({index:0}).zIndex).toBe(LAYERS.dialogBase);
  expect(dialogZIndex({index:1}).zIndex).toBe(LAYERS.dialogBase+LAYERS.dialogStep);
  expect(dialogZIndex({index:100000}).zIndex).toBe(DIALOG_LAYER_MAX);
  // The content of a clamped dialog sits one step above its overlay and still below the toaster.
  expect(DIALOG_LAYER_MAX+1).toBeLessThan(LAYERS.toast);
 });
});
