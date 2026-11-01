import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './Dialog';
import {Input} from './Input';
import {Button} from './Button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './DropdownMenu';
import { UnstyledButton } from '@mantine/core';
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type AnyExtension } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import Link from "@tiptap/extension-link";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Underline from "@tiptap/extension-underline";
import Heading from "@tiptap/extension-heading";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import Blockquote from "@tiptap/extension-blockquote";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter, AlignLeft, AlignRight, Bold as BoldIcon, Heading2, Heading3,
  Italic as ItalicIcon, Link as LinkIcon, List, ListOrdered, Minus, Quote,
  Redo2, Smile, Strikethrough, Underline as UnderlineIcon, Undo2, Unlink
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { normalizeTemplateHtml } from "../helpers/renderMessageTemplate";
import { WHATSAPP_EMOJI_GROUPS } from "../helpers/whatsappEmoji";
import styles from "./RichTemplateEditor.module.css";
import type { MessageVariableDefinition } from "../helpers/messageVariables";
import { editorHtmlToMaterialReferences, materialReferencesToEditorHtml } from "../helpers/templateMaterials";
import { SalesMaterialNode } from "./salesMaterialNode";
import { SalesMaterialPicker } from "./SalesMaterialPicker";
import { HelpLink } from "./HelpLink";

const LINK_OPTIONS={openOnClick:false,autolink:true,defaultProtocol:"https"} as const;
/**
 * WhatsApp/Instagram send plain text, where a URL link is just its URL. With autolink the link mark is inclusive, so text typed right after a URL
 * joined the link and was sent as `texto (URL)` (spec 101 review). Here a link whose text starts with its href gives that extra text back, so
 * a URL link never grows; a link with its own label (added at the cursor, then typed) keeps growing as before. Email keeps TipTap's default.
 */
const PlainChannelLink=Link.extend({
  addProseMirrorPlugins(){
    const type=this.type;
    const trimUrlLinks=new Plugin({key:new PluginKey('plainChannelUrlLinks'),appendTransaction:(transactions,_old,state)=>{
      if(!transactions.some(t=>t.docChanged))return null;
      const extra:{from:number;to:number}[]=[];
      let run:{href:string;from:number;to:number;text:string}|null=null;
      const close=()=>{if(run&&run.text.length>run.href.length&&run.text.startsWith(run.href))extra.push({from:run.from+run.href.length,to:run.to});run=null;};
      state.doc.descendants((node,pos)=>{
        if(!node.isText){close();return true;}
        const href=node.marks.find(m=>m.type===type)?.attrs.href as string|undefined;
        if(href&&run&&run.href===href&&run.to===pos){run.to=pos+node.nodeSize;run.text+=node.text??'';return false;}
        close();if(href)run={href,from:pos,to:pos+node.nodeSize,text:node.text??''};return false;
      });
      close();
      if(!extra.length)return null;
      const tr=state.tr;for(const r of extra)tr.removeMark(r.from,r.to,type);
      return tr;
    }});
    return [...(this.parent?.()??[]),trimUrlLinks];
  }
}).configure(LINK_OPTIONS);

/**
 * TipTap editor of templates and drafts. With `salesMaterials` (template editor only, spec 89 §9) it also offers «Insertar material de venta»:
 * references are stored as `{{material:<uuid>}}` (`:attach` in email) and shown as chips with the title from `salesMaterials.titles`.
 */
export const RichTemplateEditor=({
  value,onChange,channel,showVariables=true,ariaLabel='Contenido del modelo',messageVariables=[],salesMaterials
}:{
  value:string;
  onChange:(html:string)=>void;
  /** `instagram` (spec 92) is plain text: Instagram shows `*asterisks*` literally, so there is no bold, italic or strike. */
  channel:"whatsapp"|"email"|"instagram";
  showVariables?:boolean;
  ariaLabel?:string;
  messageVariables?:MessageVariableDefinition[];
  salesMaterials?:{titles:Readonly<Record<string,string|null>>;onInsert?:(material:{id:string;title:string})=>void};
})=>{
  const withMaterials=!!salesMaterials,titles=salesMaterials?.titles;
  const [materialPicker,setMaterialPicker]=useState(false);
  const titlesKey=JSON.stringify(titles??{}),appliedTitles=useRef(titlesKey);
  const toEditor=(html:string)=>withMaterials?materialReferencesToEditorHtml({html,titles:titles??{}}):html;
  const toStored=(html:string)=>withMaterials?editorHtmlToMaterialReferences({html}):html;
  const linkErrorId=useId();
  const [linkOpen,setLinkOpen]=useState(false),[linkUrl,setLinkUrl]=useState(''),[linkError,setLinkError]=useState('');
  const linkSelection=useRef<{from:number;to:number}|null>(null);
  const [emojiGroup,setEmojiGroup]=useState(WHATSAPP_EMOJI_GROUPS[0].key);
  const extensions=useMemo(()=>{
    const base:AnyExtension[]=[
      Document,Paragraph,Text,Bold,Italic,Strike,HardBreak,History,
      channel==="email"?Link.configure(LINK_OPTIONS):PlainChannelLink
    ];
    if(channel==="instagram")return [Document,Paragraph,Text,HardBreak,History,PlainChannelLink];
    if(withMaterials)base.push(SalesMaterialNode.configure({HTMLAttributes:{class:styles.materialChip}}));
    if(channel==="whatsapp")return base;
    return [
      ...base,
      Underline,
      Heading.configure({levels:[2,3]}),
      BulletList,
      OrderedList,
      ListItem,
      Blockquote,
      HorizontalRule,
      TextAlign.configure({types:["heading","paragraph"]})
    ];
  },[channel,withMaterials]);

  const editor=useEditor({
    extensions,
    content:toEditor(normalizeTemplateHtml(value)),
    immediatelyRender:false,
    editorProps:{attributes:{class:styles.editor,role:'textbox','aria-label':ariaLabel,'aria-multiline':'true'}},
    onUpdate:({editor})=>onChange(toStored(editor.getHTML()))
  },[channel,withMaterials]);

  useEffect(()=>{
    if(!editor)return;
    const next=normalizeTemplateHtml(value),retitle=appliedTitles.current!==titlesKey;
    appliedTitles.current=titlesKey;
    if(retitle||toStored(editor.getHTML())!==next)editor.commands.setContent(toEditor(next),{emitUpdate:false});
    // toEditor/toStored only depend on titlesKey and withMaterials, which are in the dependencies.
  },[editor,value,titlesKey,withMaterials]);
  const selectedMaterial=useEditorState({editor,selector:({editor:current})=>current&&withMaterials&&current.isActive("salesMaterial")?current.getAttributes("salesMaterial") as {materialId:string;attach:boolean;title:string}:null});

  useEffect(()=>{setLinkOpen(false);linkSelection.current=null;},[editor]);

  if(!editor)return <div className={styles.loading}>Cargando editor…</div>;

  const toolbarButton=(label:string,active:boolean,onClick:()=>void,icon:React.ReactNode)=>(
    <UnstyledButton type="button" title={label} aria-label={label} className={active?styles.active:""} onClick={onClick}>{icon}</UnstyledButton>
  );
  const setLink=()=>{
    const {from,to}=editor.state.selection;
    linkSelection.current={from,to};
    setLinkUrl(editor.getAttributes("link").href??"https://");setLinkError('');setLinkOpen(true);
  };
  const restoreLinkSelection=()=>{
    if(editor.isDestroyed||!linkSelection.current)return;
    const selection=linkSelection.current,chain=editor.chain().focus();
    // Avoid clearing stored marks when adding a link at an empty cursor.
    if(editor.state.selection.from!==selection.from||editor.state.selection.to!==selection.to)chain.setTextSelection(selection);
    chain.run();
  };
  const closeLink=()=>{setLinkOpen(false);requestAnimationFrame(restoreLinkSelection);};
  const applyLink=()=>{
    const trimmed=linkUrl.trim();
    const href=/^[a-z][a-z0-9+.-]*:/i.test(trimmed)?trimmed:"https://"+trimmed;
    try{new URL(href);}catch{setLinkError('Escribí una URL válida, por ejemplo https://hospeda.com.ar.');return;}
    if(!editor.can().setLink({href})){setLinkError('Este tipo de enlace no está permitido. Revisá la URL.');return;}
    if(linkSelection.current)editor.chain().focus().setTextSelection(linkSelection.current).extendMarkRange("link").setLink({href}).run();
    closeLink();
  };
  const insert=(value:string)=>editor.chain().focus().insertContent(value).run();
  const insertMaterial=(material:{id:string;title:string})=>{setMaterialPicker(false);salesMaterials?.onInsert?.(material);editor.chain().focus().insertContent([{type:"salesMaterial",attrs:{materialId:material.id,attach:false,title:material.title}},{type:"text",text:" "}]).run();};

  return <div className={styles.wrapper}>
    <div className={styles.toolbar}>
      <div className={styles.toolGroup}>
        {toolbarButton("Deshacer",false,()=>editor.chain().focus().undo().run(),<Undo2 size={15}/>)}
        {toolbarButton("Rehacer",false,()=>editor.chain().focus().redo().run(),<Redo2 size={15}/>)}
      </div>
      <div className={styles.toolGroup}>
        {channel!=="instagram"&&toolbarButton("Negrita",editor.isActive("bold"),()=>editor.chain().focus().toggleBold().run(),<BoldIcon size={15}/>)}
        {channel!=="instagram"&&toolbarButton("Cursiva",editor.isActive("italic"),()=>editor.chain().focus().toggleItalic().run(),<ItalicIcon size={15}/>)}
        {channel==="email"&&toolbarButton("Subrayado",editor.isActive("underline"),()=>editor.chain().focus().toggleUnderline().run(),<UnderlineIcon size={15}/>)}
        {channel!=="instagram"&&toolbarButton("Tachado",editor.isActive("strike"),()=>editor.chain().focus().toggleStrike().run(),<Strikethrough size={15}/>)}
      </div>
      {channel==="email"&&<>
        <div className={styles.toolGroup}>
          {toolbarButton("Título 2",editor.isActive("heading",{level:2}),()=>editor.chain().focus().toggleHeading({level:2}).run(),<Heading2 size={15}/>)}
          {toolbarButton("Título 3",editor.isActive("heading",{level:3}),()=>editor.chain().focus().toggleHeading({level:3}).run(),<Heading3 size={15}/>)}
          {toolbarButton("Lista",editor.isActive("bulletList"),()=>editor.chain().focus().toggleBulletList().run(),<List size={15}/>)}
          {toolbarButton("Lista numerada",editor.isActive("orderedList"),()=>editor.chain().focus().toggleOrderedList().run(),<ListOrdered size={15}/>)}
          {toolbarButton("Cita",editor.isActive("blockquote"),()=>editor.chain().focus().toggleBlockquote().run(),<Quote size={15}/>)}
          {toolbarButton("Separador",false,()=>editor.chain().focus().setHorizontalRule().run(),<Minus size={15}/>)}
        </div>
        <div className={styles.toolGroup}>
          {toolbarButton("Alinear izquierda",editor.isActive({textAlign:"left"}),()=>editor.chain().focus().setTextAlign("left").run(),<AlignLeft size={15}/>)}
          {toolbarButton("Centrar",editor.isActive({textAlign:"center"}),()=>editor.chain().focus().setTextAlign("center").run(),<AlignCenter size={15}/>)}
          {toolbarButton("Alinear derecha",editor.isActive({textAlign:"right"}),()=>editor.chain().focus().setTextAlign("right").run(),<AlignRight size={15}/>)}
        </div>
      </>}
      <div className={styles.toolGroup}>
        {toolbarButton("Agregar link",editor.isActive("link"),setLink,<LinkIcon size={15}/>)}
        {editor.isActive("link")&&toolbarButton("Quitar link",false,()=>editor.chain().focus().unsetLink().run(),<Unlink size={15}/>)}
        <Popover>
          <PopoverTrigger asChild><UnstyledButton type="button" title="Emoji"><Smile size={15}/></UnstyledButton></PopoverTrigger>
          <PopoverContent align="start" className={styles.emojiPopover}>
            <div className={styles.emojiTabs}>
              {WHATSAPP_EMOJI_GROUPS.map(group=><UnstyledButton type="button" key={group.key} className={emojiGroup===group.key?styles.emojiTabActive:""} onClick={()=>setEmojiGroup(group.key)}>{group.label}</UnstyledButton>)}
            </div>
            <div className={styles.emojiGrid}>
              {(WHATSAPP_EMOJI_GROUPS.find(group=>group.key===emojiGroup)?.emojis??[]).map((emoji,index)=><UnstyledButton type="button" key={emoji+"-"+index} onClick={()=>insert(emoji)}>{emoji}</UnstyledButton>)}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <EditorContent editor={editor}/>
    {linkOpen&&<Dialog open onOpenChange={open=>{if(!open)closeLink()}}><DialogContent onCloseAutoFocus={event=>{
      event.preventDefault();restoreLinkSelection();
    }}><DialogHeader><DialogTitle>Editar enlace</DialogTitle><DialogDescription>El enlace se aplicará al texto seleccionado. Podés escribir la URL completa o un dominio.</DialogDescription></DialogHeader>
      <form onSubmit={event=>{event.preventDefault();event.stopPropagation();if(linkUrl.trim())applyLink();}}>
        <label>URL del enlace<Input autoFocus value={linkUrl} maxLength={2000} onChange={event=>{setLinkUrl(event.target.value);setLinkError('')}} aria-invalid={!!linkError} aria-describedby={linkError?linkErrorId:undefined}/></label>
        {linkError&&<p role="alert" id={linkErrorId}>{linkError}</p>}
        <DialogFooter><Button variant="outline" onClick={closeLink}>Cancelar</Button><Button type="submit" disabled={!linkUrl.trim()} disabledReason={"Escribí la dirección del enlace."}>Guardar enlace</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>}


    {withMaterials&&<div className={styles.variables}>
      <Button variant="outline" onClick={()=>setMaterialPicker(true)}>Insertar material de venta</Button>
      {channel==="email"&&selectedMaterial&&<Button variant="outline" aria-pressed={!!selectedMaterial.attach} onClick={()=>editor.chain().focus().updateAttributes("salesMaterial",{attach:!selectedMaterial.attach}).run()}>{selectedMaterial.attach?"No adjuntar el archivo":"Adjuntar el archivo"}</Button>}
      <HelpLink topic="salesMaterial" hint="templateMaterial"/>
      <SalesMaterialPicker opened={materialPicker} onClose={()=>setMaterialPicker(false)} onPick={insertMaterial} title="Insertar material de venta"/>
    </div>}
    {showVariables&&<div className={styles.variables}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline">Insertar variable</Button></DropdownMenuTrigger>
        <DropdownMenuContent className={styles.variableMenu}>
          {messageVariables.filter(variable=>variable.active).map(variable=><DropdownMenuItem key={variable.key} onSelect={()=>insert("{{"+variable.key+"}}") }><span className={styles.variableOption}><span>{variable.label}</span><code>{"{{"+variable.key+"}}"}</code></span></DropdownMenuItem>)}
          <DropdownMenuItem onSelect={()=>insert("{{#if contact}}Hola {{contact}}, ¿cómo estás?{{else}}Hola, ¿cómo estás?{{/if}}")}>Saludo opcional</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>}
    <p className={styles.hint}>
      {channel==="instagram"
        ?"Instagram muestra el texto tal cual: sin negrita ni cursiva. Los links se envían como URL visible."
        :channel==="whatsapp"
        ?"WhatsApp conserva negrita, cursiva y tachado. Los links se envían como URL visible y quedan clickeables."
        :"Email se guarda como HTML enriquecido compatible con clientes habituales. Evitamos formatos frágiles como fuentes o colores personalizados."}
    </p>
  </div>;
};
