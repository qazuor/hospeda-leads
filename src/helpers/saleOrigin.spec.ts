import {describe,expect,it} from 'vitest';
import {saleBackLink} from './saleOrigin';

describe('management page back link',()=>{
 it('returns to the section the page was opened from',()=>{
  expect(saleBackLink({state:{from:'my-day'},accountId:'a1'})).toEqual({to:'/my-day',label:'← Volver a Hoy'});
  expect(saleBackLink({state:{from:'business'},accountId:'a1'})).toEqual({to:'/accounts/a1',label:'← Volver al negocio'});
  expect(saleBackLink({state:{from:'opportunities'},accountId:'a1'})).toEqual({to:'/opportunities',label:'← Volver a Gestiones'});
 });
 it('has no origin link without a usable origin',()=>{
  expect(saleBackLink({state:null})).toBeNull();
  expect(saleBackLink({state:{from:'business'},accountId:null})).toBeNull();
  expect(saleBackLink({state:{from:'elsewhere'}})).toBeNull();
 });
});
