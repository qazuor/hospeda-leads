import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {Selection,TextSelection} from '@tiptap/pm/state';
import type {Editor} from '@tiptap/core';
import {RichTemplateEditor} from './RichTemplateEditor';
import {htmlToWhatsApp,whatsappTextToPreviewHtml} from '../helpers/templateChannelFormatting';
import {htmlToPlainText} from '../helpers/renderMessageTemplate';

beforeAll(()=>{
 window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
 window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};
 const rect=()=>({x:0,y:0,top:0,left:0,right:0,bottom:0,width:0,height:0,toJSON:()=>({})}) as DOMRect;
 Range.prototype.getBoundingClientRect=rect;Range.prototype.getClientRects=()=>({length:0,item:()=>null,[Symbol.iterator]:function*(){}}) as unknown as DOMRectList;
 document.elementFromPoint=()=>null;
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

// Spec 101 review: a real share token (43 base64url chars) with underscores, preloaded as a link by block 1.
const URL='https://crm.hospeda.com.ar/m/Ab3_xY9kLm0pQr_tUv2wXyZ01234567890abcdefgHI';
const BODY=`Podés ver «F» en: ${URL}`;
/** Renders the real editor and returns its TipTap instance (TipTap keeps it on the editable element). */
const mount=async(channel:'whatsapp'|'instagram',value:string)=>{
 const onChange=vi.fn();
 render(<MantineProvider><RichTemplateEditor value={value} onChange={onChange} channel={channel} showVariables={false} ariaLabel="Mensaje final"/></MantineProvider>);
 const box=await screen.findByRole('textbox',{name:'Mensaje final'}) as HTMLElement&{editor?:Editor};
 await waitFor(()=>expect(box.editor).toBeTruthy());
 return {editor:box.editor!,last:()=>onChange.mock.calls.at(-1)![0] as string};
};
/** Types like the keyboard does: one transaction per character at the cursor. */
const type=(editor:Editor,text:string)=>{for(const ch of text)editor.view.dispatch(editor.state.tr.insertText(ch));};
const atEnd=(editor:Editor)=>editor.view.dispatch(editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)));
const at=(editor:Editor,pos:number)=>editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc,pos)));

describe('RichTemplateEditor · a link never swallows the text around it (spec 101 review)',()=>{
 it('WhatsApp: typing right after a preloaded link sends the text once, without «(URL)»',async()=>{
  // Arrange
  const {editor,last}=await mount('whatsapp','<p>'+whatsappTextToPreviewHtml(BODY)+'</p>');
  atEnd(editor);
  // Act
  type(editor,' Saludos');
  // Assert: the link stays the URL alone, the typed text is plain text
  expect(last()).toContain(`>${URL}</a> Saludos`);
  expect(htmlToWhatsApp(last())).toBe(`${BODY} Saludos`);
 });
 it('WhatsApp: editing inside the link sends exactly what is shown, without the original URL',async()=>{
  // Arrange
  const {editor,last}=await mount('whatsapp','<p>'+whatsappTextToPreviewHtml(BODY)+'</p>');
  const end=Selection.atEnd(editor.state.doc).from;
  at(editor,end-5);
  // Act
  type(editor,'ZZ');
  // Assert
  const broken=URL.slice(0,-5)+'ZZ'+URL.slice(-5);
  expect(htmlToWhatsApp(last())).toBe(`Podés ver «F» en: ${broken}`);
  expect(htmlToWhatsApp(last())).not.toContain(URL);
 });
 it('WhatsApp: a link added at an empty cursor still takes the label typed after it',async()=>{
  // Arrange
  const {editor,last}=await mount('whatsapp','<p></p>');
  editor.chain().focus().setLink({href:'https://example.com/cursor'}).run();
  // Act
  type(editor,'Nueva visita');
  // Assert
  expect(last()).toContain('>Nueva visita</a>');
  expect(htmlToWhatsApp(last())).toBe('Nueva visita (https://example.com/cursor)');
 });
 it('Instagram: typing right after a link the editor detected sends the text once',async()=>{
  // Arrange
  const {editor,last}=await mount('instagram','<p>Podés ver «F» en:</p>');
  atEnd(editor);
  type(editor,` ${URL} `);
  expect(last()).toContain(`<a`);
  const end=editor.state.selection.from;editor.view.dispatch(editor.state.tr.delete(end-1,end));
  // Act: the cursor is back at the end of the link
  type(editor,' Saludos');
  // Assert
  expect(last()).toContain(`>${URL}</a> Saludos`);
  expect(htmlToPlainText(last())).toBe(`${BODY} Saludos`);
 });
});
