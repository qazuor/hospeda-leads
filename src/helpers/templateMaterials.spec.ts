import {describe,expect,it} from 'vitest';
import {UNRESOLVED_MATERIAL_MESSAGE,materialReferenceInTag,neutralizeMaterialReferences,dropMaterialReferences,editorHtmlToMaterialReferences,hasMaterialReferences,labelMaterialReferences,materialReferenceLabel,materialReferenceReplacement,materialReferenceText,materialReferencesToEditorHtml,replaceMaterialReferences,templateMaterialMessage,templateMaterialReferences,templatePreviewSource} from './templateMaterials';
import {removeMaterialLink} from './salesMaterialMessage';
import {htmlToPlainText,renderMessageTemplate,renderMessageTemplateHtml,unresolvedTemplateVariables} from './renderMessageTemplate';

const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-22222222222B';
describe('template material references (spec 89 §9)',()=>{
 it('finds unique references in order, with :attach from any occurrence and lower-case ids',()=>{
  const text=`Mirá {{material:${a}}} y {{material:${b}:attach}}. Otra vez {{material:${a}:attach}}`;
  expect(hasMaterialReferences({text})).toBe(true);
  expect(templateMaterialReferences({text})).toEqual([{materialId:a,attach:true},{materialId:b.toLowerCase(),attach:true}]);
  expect(hasMaterialReferences({text:'{{material:not-a-uuid}} {{name}}'})).toBe(false);
 });
 it('round-trips the stored form',()=>{
  expect(materialReferenceText({materialId:a})).toBe(`{{material:${a}}}`);
  expect(materialReferenceText({materialId:b,attach:true})).toBe(`{{material:${b.toLowerCase()}:attach}}`);
 });
 it('is ignored by the variable engine and the «missing variables» check',()=>{
  const body=`<p>Hola {{name}}, te paso {{material:${a}}}</p>`;
  expect(unresolvedTemplateVariables(body)).toEqual(['name']);
  expect(renderMessageTemplateHtml(body,{name:'Ruca'})).toContain(`{{material:${a}}}`);
  expect(renderMessageTemplate(`Folleto: {{material:${a}}}`,{})).toBe(`Folleto: {{material:${a}}}`);
 });
 it('replaces each reference with the resolved link',()=>{
  const text=`Te paso {{material:${a}}} y {{material:${b}:attach}}`;
  expect(replaceMaterialReferences({text,replace:r=>r.attach?'[A]':'[L]'})).toBe('Te paso [L] y [A]');
 });
 it('drops unavailable references in WhatsApp without leaving empty lines or double spaces',()=>{
  const text=`Hola Ana,\n\nFolleto: {{material:${a}}}\n\nTe paso {{material:${b}}} para que lo veas.`;
  expect(dropMaterialReferences({text,channel:'whatsapp',materialIds:new Set([a])})).toBe(`Hola Ana,\n\nFolleto:\n\nTe paso {{material:${b.toLowerCase()}}} para que lo veas.`);
  expect(dropMaterialReferences({text:`Hola\n\n{{material:${a}}}`,channel:'whatsapp',materialIds:new Set([a])})).toBe('Hola');
  expect(dropMaterialReferences({text:'Sin referencias',channel:'whatsapp',materialIds:new Set([a])})).toBe('Sin referencias');
 });
 it('drops unavailable references in email and removes the paragraph left empty',()=>{
  const html=`<p>Hola</p><p>{{material:${a}}}</p><p>Mirá {{material:${a}}}.</p>`;
  expect(dropMaterialReferences({text:html,channel:'email',materialIds:new Set([a])})).toBe('<p>Hola</p><p>Mirá.</p>');
 });
 it('resolves to «Título: URL» (escaped in email) that removeMaterialLink can take out again',()=>{
  const url='https://crm.example.test/m/'+'x'.repeat(43);
  const wa=materialReferenceReplacement({channel:'whatsapp',title:' Folleto ',url});
  expect(wa).toBe(`Folleto: ${url}`);
  expect(removeMaterialLink({channel:'whatsapp',body:`Hola\n\n${wa}`,url,title:'Folleto'})).toBe('Hola');
  const mail=materialReferenceReplacement({channel:'email',title:'Precios <2027>',url});
  expect(mail).toBe(`Precios &#60;2027&#62;: <a href="${url}">${url}</a>`);
  expect(removeMaterialLink({channel:'email',body:`<p>Hola</p><p>${mail}</p>`,url,title:'Precios <2027>'})).toBe('<p>Hola</p>');
 });
 it('labels references for previews, never with the uuid',()=>{
  expect(materialReferenceLabel({title:'Folleto',attach:true})).toBe('[Material: Folleto · adjunto]');
  expect(materialReferenceLabel({title:null})).toBe('[Material: no disponible]');
  const text=`Te paso {{material:${a}}} y {{material:${b}}}`;
  const labelled=labelMaterialReferences({text,titles:{[a]:'Folleto'},html:false});
  expect(labelled).toBe('Te paso [Material: Folleto] y [Material: no disponible]');
  expect(labelled).not.toContain(a);
  expect(templatePreviewSource({body:text,materialRefs:[{materialId:a,title:'Folleto',problem:null}]})).toBe(labelled);
 });
 it('explains every left-out reason to the seller',()=>{
  expect(templateMaterialMessage({title:'Folleto',problem:'archived'})).toBe('«Folleto» ya no está disponible. No se agregó al mensaje.');
  expect(templateMaterialMessage({title:'Precios',problem:'internal'})).toMatch(/material interno/);
  expect(templateMaterialMessage({title:null,problem:'missing'})).toBe('Un material del modelo ya no existe. No se agregó al mensaje.');
 });
 it('converts references to editor chips and back, whatever the attribute order',()=>{
  const html=`<p>Hola {{material:${a}:attach}} y {{material:${b}}}</p>`;
  const editor=materialReferencesToEditorHtml({html,titles:{[a]:'Folleto "2027"'}});
  expect(editor).toContain(`data-sales-material="${a}"`);
  expect(editor).toContain('[Material: Folleto &#34;2027&#34; · adjunto]');
  expect(editor).toContain('[Material: Material no disponible]');
  expect(editorHtmlToMaterialReferences({html:editor})).toBe(html.replace(b,b.toLowerCase()));
  const tiptap=`<p>Hola <span class="chip" data-title="Folleto" data-attach="true" contenteditable="false" data-sales-material="${a}">[Material: Folleto · adjunto]</span> fin</p>`;
  expect(editorHtmlToMaterialReferences({html:tiptap})).toBe(`<p>Hola {{material:${a}:attach}} fin</p>`);
 });
 it('escapes material titles in HTML previews, so a title can never run script (regression)',()=>{
  const evil='<img src=x onerror=alert(1)>';
  const html=labelMaterialReferences({text:`<p>Mirá {{material:${a}}}</p>`,titles:{[a]:evil},html:true});
  expect(html).not.toContain('<img');expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(renderMessageTemplateHtml(html,{})).not.toContain('<img');
  // The plain-text previews (contact dialogs) decode it back to the readable title instead of dropping it.
  expect(htmlToPlainText(templatePreviewSource({body:`<p>Mirá {{material:${a}}}</p>`,materialRefs:[{materialId:a,title:'Precios <2027> & más',problem:null}]}))).toBe('Mirá [Material: Precios <2027> & más]');
 });
 it('never lets a variable value inject a reference (regression)',()=>{
  const name=`Hotel {{material:${a}}}`;
  expect(neutralizeMaterialReferences(name)).toBe(`Hotel {{ material:${a}}}`);
  expect(hasMaterialReferences({text:renderMessageTemplate('Hola {{name}}',{name})})).toBe(false);
  expect(hasMaterialReferences({text:renderMessageTemplateHtml('<p>Hola {{name}}</p>',{name})})).toBe(false);
  expect(hasMaterialReferences({text:renderMessageTemplateHtml(`<p>Hola {{name}} {{material:${a}}}</p>`,{name})})).toBe(true);
 });
 it('detects references inside a tag (attributes are not valid places)',()=>{
  expect(materialReferenceInTag({html:`<p><a href="{{material:${a}}}">Folleto</a></p>`})).toBe(true);
  expect(materialReferenceInTag({html:`<p><a href="https://x.test">{{material:${a}}}</a></p>`})).toBe(false);
  expect(UNRESOLVED_MATERIAL_MESSAGE).toMatch(/referencia de material sin resolver/);
 });
});
