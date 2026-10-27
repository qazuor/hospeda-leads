import {describe,expect,it} from 'vitest';
import {isInstagramInbound,isInstagramOutbound,socialChannelLabel} from './instagramChannel';
import {inboxChannelLabel,inboxRowsInstagram} from '../components/inbox/inboxTypes';

describe('one Instagram rule (spec 90, L2)',()=>{
 it('treats a sent social row as Instagram only for the echo or an Instagram destination',()=>{
  expect(isInstagramOutbound({channel:'social',ownerEmail:'instagram@hospeda'})).toBe(true);
  expect(isInstagramOutbound({channel:'social',ownerEmail:'leo@example.com',destinationDetail:'https://instagram.com/aguas'})).toBe(true);
  expect(isInstagramOutbound({channel:'social',ownerEmail:'leo@example.com',destinationDetail:'facebook.com/aguas'})).toBe(false);
  expect(isInstagramOutbound({channel:'whatsapp',ownerEmail:'instagram@hospeda'})).toBe(false);
 });
 it('treats a received social row as Instagram unless its channel detail names another network',()=>{
  expect([null,'instagram','facebook'].map(channelDetail=>isInstagramInbound({channel:'social',channelDetail}))).toEqual([true,true,false]);
  expect(socialChannelLabel(false)).toBe('Red social');
 });
 it('labels Bandeja rows per row and conversations by their loaded rows',()=>{
  expect([true,false,undefined].map(flag=>inboxChannelLabel('social',flag))).toEqual(['Instagram','Red social','Instagram / Red social']);
  expect(inboxChannelLabel('email',true)).toBe('Email');
  expect([inboxRowsInstagram([{isInstagram:true}]),inboxRowsInstagram([{isInstagram:false},{isInstagram:false}]),inboxRowsInstagram([{isInstagram:true},{isInstagram:false}]),inboxRowsInstagram([])]).toEqual([true,false,null,null]);
 });
});
