// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {readSearchOrCreate} from './businessSearchOrCreate';

describe('readSearchOrCreate (spec 98 §17)',()=>{
 it('reads the search and a phone prefill',()=>{
  // Arrange
  const params=new URLSearchParams({q:'+5493442453797',createPhone:'+5493442453797'});
  // Act
  const value=readSearchOrCreate(params);
  // Assert
  expect(value).toEqual({query:'+5493442453797',prefill:{telefono:'+5493442453797'}});
 });
 it('reads an Instagram prefill as @username, normalized',()=>{
  expect(readSearchOrCreate(new URLSearchParams({q:'Cabanas_Del_Rio',createInstagram:'https://www.instagram.com/Cabanas_Del_Rio/'}))).toEqual({query:'Cabanas_Del_Rio',prefill:{instagram:'@cabanas_del_rio'}});
 });
 it('keeps the search but drops a prefill that is not a phone or a username',()=>{
  expect(readSearchOrCreate(new URLSearchParams({q:'x',createPhone:'<script>'}))).toEqual({query:'x',prefill:null});
  expect(readSearchOrCreate(new URLSearchParams({q:'x',createInstagram:'not a user!'}))).toEqual({query:'x',prefill:null});
 });
 it('ignores the params without a search',()=>{
  expect(readSearchOrCreate(new URLSearchParams({createPhone:'+5493442453797'}))).toBeNull();
  expect(readSearchOrCreate(new URLSearchParams())).toBeNull();
 });
});
