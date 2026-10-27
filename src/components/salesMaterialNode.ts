import {Node,mergeAttributes} from '@tiptap/react';
import {materialReferenceLabel,materialReferenceText} from '../helpers/templateMaterials';

/** Attributes of a sales material chip in the template editor. `title` is only for display: the stored text keeps the id. */
export type SalesMaterialNodeAttrs={materialId:string;attach:boolean;title:string};
/**
 * Atomic inline chip for a `{{material:<uuid>}}` reference in the template editor (spec 89 §9). It parses and renders
 * `<span data-sales-material>` (see `materialReferencesToEditorHtml` / `editorHtmlToMaterialReferences`), so the user sees
 * «[Material: Título]» and never the uuid. Copying it as text gives the stored reference.
 */
export const SalesMaterialNode=Node.create<{HTMLAttributes:Record<string,string>}>({
 name:'salesMaterial',group:'inline',inline:true,atom:true,selectable:true,draggable:false,
 addOptions(){return {HTMLAttributes:{}};},
 addAttributes(){return {
  materialId:{default:'',parseHTML:el=>el.getAttribute('data-sales-material')??'',renderHTML:attrs=>({'data-sales-material':attrs.materialId})},
  attach:{default:false,parseHTML:el=>el.getAttribute('data-attach')==='true',renderHTML:attrs=>({'data-attach':String(!!attrs.attach)})},
  title:{default:'',parseHTML:el=>el.getAttribute('data-title')??'',renderHTML:attrs=>({'data-title':attrs.title})}
 };},
 parseHTML(){return [{tag:'span[data-sales-material]'}];},
 renderHTML({node,HTMLAttributes}){return ['span',mergeAttributes(this.options.HTMLAttributes,HTMLAttributes,{contenteditable:'false'}),materialReferenceLabel({title:node.attrs.title||null,attach:!!node.attrs.attach})];},
 renderText({node}){return materialReferenceText({materialId:node.attrs.materialId,attach:!!node.attrs.attach});}
});
