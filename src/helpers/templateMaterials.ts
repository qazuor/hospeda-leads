/**
 * Sales material references inside message templates (spec 89 §9). A template stores `{{material:<uuid>}}`, or `{{material:<uuid>:attach}}` in email
 * to also attach the file. The variable engine (`{{([a-zA-Z0-9_]+)}}`) never matches them; `prepare` resolves each one into a fresh share link per send.
 * Pure helpers shared by the server and the template editor (no Node imports).
 */
/** One reference found in a template. `attach` is true when any occurrence of that material asks for the file. */
export type TemplateMaterialReference={materialId:string;attach:boolean};
/** Why a referenced material is left out when a template is opened or prepared. */
export type TemplateMaterialProblem='missing'|'internal'|'archived';
/** A reference that cannot be sent, as the seller and the template editor see it. Never carries a raw uuid as text for the user. */
export type TemplateMaterialWarning={materialId:string;title:string|null;problem:TemplateMaterialProblem|'attach';message:string};
/** A reference as `settings` lists it per template, so the editor shows a title instead of the uuid. */
export type TemplateMaterialRef={materialId:string;title:string|null;problem:TemplateMaterialProblem|null};

const PATTERN=/{{material:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(:attach)?}}/g;
const pattern=()=>new RegExp(PATTERN.source,'g');
/** The stored form of one reference. */
export const materialReferenceText=({materialId,attach=false}:{materialId:string;attach?:boolean}):string=>`{{material:${materialId.toLowerCase()}${attach?':attach':''}}}`;
/** Whether a text has at least one reference. */
export const hasMaterialReferences=({text}:{text:string}):boolean=>pattern().test(text);
/** Unique references of a text, in order of appearance. */
export function templateMaterialReferences({text}:{text:string}):TemplateMaterialReference[]{
 const out=new Map<string,TemplateMaterialReference>();
 for(const match of text.matchAll(pattern())){const id=match[1]!.toLowerCase(),prev=out.get(id);out.set(id,{materialId:id,attach:!!match[2]||!!prev?.attach});}
 return [...out.values()];
}
/** Replaces every reference with what `replace` returns for it. */
export function replaceMaterialReferences({text,replace}:{text:string;replace:(ref:TemplateMaterialReference)=>string}):string{
 return text.replace(pattern(),(_,id:string,attach:string|undefined)=>replace({materialId:id.toLowerCase(),attach:!!attach}));
}
const GAP='\u0000';
const closeGap=(text:string)=>text.replace(/[ \t]*\u0000[ \t]*(?=[.,;:!?)]|<\/|$)/g,'').replace(/(^|>)[ \t]*\u0000[ \t]*/g,'$1').replace(/[ \t]*\u0000[ \t]*/g,' ');
/**
 * Drops the references of `materialIds` from a prepared body without leaving double spaces. A WhatsApp line or an email paragraph left empty
 * is removed (in WhatsApp, with the blank line before it).
 */
export function dropMaterialReferences({text,channel,materialIds}:{text:string;channel:'email'|'whatsapp';materialIds:ReadonlySet<string>}):string{
 const marked=replaceMaterialReferences({text,replace:ref=>materialIds.has(ref.materialId)?GAP:materialReferenceText(ref)});
 if(!marked.includes(GAP))return text;
 if(channel==='email')return closeGap(marked.replace(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<\/p>/g,p=>{
  if(!p.includes(GAP))return p;
  const open=p.match(/^<p\b[^>]*>/)![0],inner=closeGap(p.slice(open.length,-4));
  return /^(?:\s|<br\s*\/?>|&nbsp;)*$/i.test(inner)?'':open+inner+'</p>';
 }));
 const kept:string[]=[];
 for(const line of marked.split('\n')){
  if(!line.includes(GAP)){kept.push(line);continue;}
  const rest=closeGap(line);
  if(rest.trim()){kept.push(rest);continue;}
  if(kept.length&&kept[kept.length-1]!.trim()==='')kept.pop();
 }
 return kept.join('\n').replace(/\s+$/,'');
}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
/**
 * What a resolved reference becomes in the body: «Título: URL» in WhatsApp and the same with a link in email, inline where the template put it
 * (the composer's `removeMaterialLink` recognises both forms).
 */
export function materialReferenceReplacement({channel,title,url}:{channel:'email'|'whatsapp';title:string;url:string}):string{
 return channel==='whatsapp'?`${title.trim()}: ${url}`:`${escapeHtml(title.trim())}: <a href="${url}">${url}</a>`;
}
/** Readable label of a reference for previews and the script's model popover: «[Material: Título]», never the uuid. */
export function materialReferenceLabel({title,attach=false}:{title:string|null;attach?:boolean}):string{
 return `[Material: ${title?.trim()||'no disponible'}${attach?' · adjunto':''}]`;
}
/** Escapes text for HTML with the named entities `htmlToPlainText` decodes, so a label survives both an HTML render and a plain-text preview. */
const escapeHtmlText=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/**
 * Replaces the references of a text with their readable labels. `html` must be true whenever the result is rendered as HTML (an email preview,
 * a template body): material titles are admin input and are escaped there.
 */
export function labelMaterialReferences({text,titles,html}:{text:string;titles:Readonly<Record<string,string|null|undefined>>;html:boolean}):string{
 return replaceMaterialReferences({text,replace:ref=>{const label=materialReferenceLabel({title:titles[ref.materialId]??null,attach:ref.attach});return html?escapeHtmlText(label):label;}});
}
/** Message of every refusal of a reference left in a draft: `edit`, the material actions and `dispatch` use the same text. */
export const UNRESOLVED_MATERIAL_MESSAGE='El mensaje tiene una referencia de material sin resolver. Quitala y agregá el material desde «Agregar material de venta».';
/** True when a reference sits inside a tag (an attribute such as `href="{{material:…}}"`): only text references are valid. */
export const materialReferenceInTag=({html}:{html:string}):boolean=>/<[^>]*{{material:/i.test(html);
/** Breaks a `{{material:` that comes from a variable value (a business or person name), so data can never inject a reference. */
export const neutralizeMaterialReferences=(value:string):string=>value.replace(/{{(?=\s*material:)/gi,'{{ ');
/** The seller-facing explanation of a reference left out at `prepare`. */
export function templateMaterialMessage({title,problem}:{title:string|null;problem:TemplateMaterialProblem}):string{
 const name=title?`«${title.trim()}»`:'Un material del modelo';
 return problem==='missing'?`${name} ya no existe. No se agregó al mensaje.`:problem==='internal'?`${name} es material interno: no se manda a clientes. No se agregó al mensaje.`:`${name} ya no está disponible. No se agregó al mensaje.`;
}
/** Editor markup of a reference: an atomic chip with the title. The stored text is restored by {@link editorHtmlToMaterialReferences}. */
export function materialReferencesToEditorHtml({html,titles}:{html:string;titles:Readonly<Record<string,string|null|undefined>>}):string{
 return replaceMaterialReferences({text:html,replace:ref=>{
  const title=titles[ref.materialId]?.trim()||'Material no disponible';
  return `<span data-sales-material="${ref.materialId}" data-attach="${ref.attach}" data-title="${escapeHtml(title)}">${escapeHtml(materialReferenceLabel({title,attach:ref.attach}))}</span>`;
 }});
}
/** Turns the editor chips back into `{{material:<uuid>}}` (attribute order does not matter). */
export function editorHtmlToMaterialReferences({html}:{html:string}):string{
 return html.replace(/<span\b([^>]*\bdata-sales-material="([0-9a-fA-F-]{36})"[^>]*)>[\s\S]*?<\/span>/g,(_,attrs:string,id:string)=>materialReferenceText({materialId:id,attach:/\bdata-attach="true"/.test(attrs)}));
}
/** A template body (HTML) ready for a client-side preview: each reference becomes its escaped readable label, using the titles `settings` sends. */
export function templatePreviewSource({body,materialRefs=[]}:{body:string;materialRefs?:readonly TemplateMaterialRef[]}):string{
 return labelMaterialReferences({text:body,titles:Object.fromEntries(materialRefs.map(r=>[r.materialId,r.title])),html:true});
}
