// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest';
import {htmlToWhatsApp,whatsappTextToPreviewHtml,whatsappTextToReadOnlyHtml} from './templateChannelFormatting';

// Spec 101 finding 13: a real share token (43 base64url chars) with two underscores.
const TOKEN='Ab3_xY9kLm0pQr_tUv2wXyZ01234567890abcdefgHI';
const SHARE='https://crm.hospeda.com.ar/m/'+TOKEN;
const roundTrip=(text:string)=>htmlToWhatsApp('<p>'+whatsappTextToPreviewHtml(text)+'</p>');
const dom=(html:string)=>{const div=document.createElement('div');div.innerHTML=html;return div;};

describe('whatsappTextToPreviewHtml · URLs stay out of the formatting (spec 101 block 1)',()=>{
 it('keeps a share link with two underscores whole inside a link and still formats italics outside it',()=>{
  // Arrange
  expect(TOKEN).toHaveLength(43);
  const text=`Mirá ${SHARE} y _hola_`;
  // Act
  const html=dom(whatsappTextToPreviewHtml(text));
  // Assert
  const links=html.querySelectorAll('a');
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute('href')).toBe(SHARE);
  expect(links[0].textContent).toBe(SHARE);
  expect(Array.from(html.querySelectorAll('em')).map(e=>e.textContent)).toEqual(['hola']);
  expect(html.textContent).toContain(SHARE);
 });
 it('does not pair an underscore of a link with one in the text or in another link',()=>{
  // Arrange
  const text='Ver https://crm.x/m/ab_cd y https://crm.x/m/ef_gh _ok_';
  // Act
  const html=dom(whatsappTextToPreviewHtml(text));
  // Assert
  expect(Array.from(html.querySelectorAll('a')).map(a=>a.getAttribute('href'))).toEqual(['https://crm.x/m/ab_cd','https://crm.x/m/ef_gh']);
  expect(Array.from(html.querySelectorAll('em')).map(e=>e.textContent)).toEqual(['ok']);
 });
 it('leaves * and ~ inside URLs untouched',()=>{
  // Arrange
  const text='https://ex.com/a*b*c y https://ex.com/x~y~z';
  // Act
  const html=dom(whatsappTextToPreviewHtml(text));
  // Assert
  expect(html.querySelector('strong')).toBeNull();
  expect(html.querySelector('s')).toBeNull();
  expect(Array.from(html.querySelectorAll('a')).map(a=>a.textContent)).toEqual(['https://ex.com/a*b*c','https://ex.com/x~y~z']);
 });
 it('leaves trailing punctuation outside the link',()=>{
  // Arrange
  const text=`Mirá (${SHARE}). También «https://ex.com/a_b»,`;
  // Act
  const html=dom(whatsappTextToPreviewHtml(text));
  // Assert
  expect(Array.from(html.querySelectorAll('a')).map(a=>a.getAttribute('href'))).toEqual([SHARE,'https://ex.com/a_b']);
 });
 it('escapes the link text and the surrounding text',()=>{
  // Arrange
  const text='<b>x</b> https://ex.com/?a=1&b=2';
  // Act
  const html=whatsappTextToPreviewHtml(text);
  // Assert
  expect(html).not.toContain('<b>');
  expect(dom(html).querySelector('a')?.getAttribute('href')).toBe('https://ex.com/?a=1&b=2');
 });
 it('keeps normal emphasis working outside links',()=>{
  // Arrange & Act
  const html=whatsappTextToPreviewHtml('*Hola* _Leo_ ~ayer~\nchau');
  // Assert
  expect(html).toContain('<strong>Hola</strong>');
  expect(html).toContain('<em>Leo</em>');
  expect(html).toContain('<s>ayer</s>');
  expect(html).toContain('<br>');
 });
 it.each([
  ['share link with underscores',`Podés ver «Tarifas» en: ${SHARE}`],
  ['two links and italics','Ver https://crm.x/m/ab_cd y https://crm.x/m/ef_gh _ok_'],
  ['* and ~ in URLs','https://ex.com/a*b*c y https://ex.com/x~y~z *fin*'],
  ['trailing punctuation',`Mirá (${SHARE}). También «https://ex.com/a_b»,`],
  ['several lines',`*Hola* _Ana_\n\nTe paso el material: ${SHARE}\nSaludos`],
 ])('round-trips with htmlToWhatsApp to the same text: %s',(_name,text)=>{
  // Arrange, Act & Assert
  expect(roundTrip(text)).toBe(text);
 });
});

describe('htmlToWhatsApp · what is shown is what is sent (spec 101 review)',()=>{
 it.each([
  ['text typed into the link',`<p>Ver: <a href="${SHARE}">${SHARE} Saludos</a></p>`,`Ver: ${SHARE} Saludos`],
  ['a link edited inside',`<p>Ver: <a href="${SHARE}">${SHARE.slice(0,-3)}ZZ${SHARE.slice(-3)}</a></p>`,`Ver: ${SHARE.slice(0,-3)}ZZ${SHARE.slice(-3)}`],
  ['a URL label with another href','<p><a href="https://ex.com/a">https://ex.com/b</a></p>','https://ex.com/b'],
 ])('never appends «(href)» when the label is or starts with a URL: %s',(_name,html,text)=>{
  // Arrange, Act & Assert
  expect(htmlToWhatsApp(html)).toBe(text);
 });
 it('keeps «label (href)» for a link with its own words',()=>{
  // Arrange, Act & Assert
  expect(htmlToWhatsApp('<p><a href="https://ex.com/a">Ver aquí</a></p>')).toBe('Ver aquí (https://ex.com/a)');
 });
});

describe('htmlToWhatsApp without DOMParser (server render)',()=>{
 it('applies the same link rule',()=>{
  // Arrange
  vi.stubGlobal('DOMParser',undefined);
  try{
   // Act & Assert
   expect(htmlToWhatsApp(`<p>Ver: <a href="${SHARE}">${SHARE} Saludos</a></p>`)).toBe(`Ver: ${SHARE} Saludos`);
   expect(htmlToWhatsApp('<p><a href="https://ex.com/a"><strong>Ver</strong></a></p>')).toBe('*Ver* (https://ex.com/a)');
  }finally{vi.unstubAllGlobals();}
 });
});

describe('whatsappTextToReadOnlyHtml · the final view never navigates (spec 101 review)',()=>{
 it('shows the URL whole, without italics and without a link',()=>{
  // Arrange & Act
  const html=dom(whatsappTextToReadOnlyHtml(`Mirá ${SHARE} y _hola_`));
  // Assert
  expect(html.querySelector('a')).toBeNull();
  expect(Array.from(html.querySelectorAll('[data-link]')).map(e=>e.textContent)).toEqual([SHARE]);
  expect(Array.from(html.querySelectorAll('em')).map(e=>e.textContent)).toEqual(['hola']);
 });
});
