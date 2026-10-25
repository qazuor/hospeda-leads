import {describe,it,expect} from 'vitest';
import {canActOnBusiness,commercialDetailKey,shouldPreviewFromTarget} from './businessActionGates';
import type {CommercialDetail} from '../endpoints/commercial.schema';

describe('business preview gates and row targeting',()=>{
 it('shares the commercial detail cache key with row actions',()=>{expect(commercialDetailKey('42')).toEqual(['commercial-detail','42']);});
 it('allows only the owner or admin and rejects archived businesses',()=>{
  const detail={account:{assignedUserEmail:'owner@example.com',archivedAt:null}} as CommercialDetail;
  expect(canActOnBusiness(detail,{type:'authenticated',user:{email:'seller@example.com',role:'user'}})).toBe(false);
  expect(canActOnBusiness(detail,{type:'authenticated',user:{email:'owner@example.com',role:'user'}})).toBe(true);
  expect(canActOnBusiness({...detail,account:{...detail.account,archivedAt:new Date()}},{type:'authenticated',user:{email:'owner@example.com',role:'user'}})).toBe(false);
 });
 it('opens on row body and ignores links, buttons and checkboxes',()=>{
  const row=document.createElement('tr'),link=document.createElement('a'),button=document.createElement('button'),checkbox=document.createElement('input');checkbox.type='checkbox';row.append(link,button,checkbox);
  expect(shouldPreviewFromTarget(row)).toBe(true);expect(shouldPreviewFromTarget(link)).toBe(false);expect(shouldPreviewFromTarget(button)).toBe(false);expect(shouldPreviewFromTarget(checkbox)).toBe(false);
 });
});
