// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {htmlToWhatsApp,whatsappTextToPreviewHtml} from './templateChannelFormatting';
describe('WhatsApp rich editor round trip',()=>{
 it('preserves existing emphasis, blank lines, emojis and URLs',()=>{
  const text='*Hola* _equipo_ ~antes~\n\n😊 https://example.com';
  expect(htmlToWhatsApp('<p>'+whatsappTextToPreviewHtml(text)+'</p>')).toBe(text);
 });
 it('treats historical text as text rather than HTML',()=>{
  const text='Texto <script>alert(1)</script> & más';
  expect(htmlToWhatsApp('<p>'+whatsappTextToPreviewHtml(text)+'</p>')).toBe(text);
 });
});
