import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './Dialog';
import {Input} from './Input';
import {Button} from './Button';
import { UnstyledButton } from '@mantine/core';
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import Link from "@tiptap/extension-link";
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

const VARIABLES=["sender","sender_short","name","contact","contact_name","city","type","subtype","phone","email","website"];

export const RichTemplateEditor=({
  value,onChange,channel,showVariables=true,ariaLabel='Contenido del template'
}:{
  value:string;
  onChange:(html:string)=>void;
  channel:"whatsapp"|"email";
  showVariables?:boolean;
  ariaLabel?:string;
})=>{
  const linkErrorId=useId();
  const [linkOpen,setLinkOpen]=useState(false),[linkUrl,setLinkUrl]=useState(''),[linkError,setLinkError]=useState('');
  const linkSelection=useRef<{from:number;to:number}|null>(null);
  const [emojiGroup,setEmojiGroup]=useState(WHATSAPP_EMOJI_GROUPS[0].key);
  const extensions=useMemo(()=>{
    const base=[
      Document,Paragraph,Text,Bold,Italic,Strike,HardBreak,History,
      Link.configure({openOnClick:false,autolink:true,defaultProtocol:"https"})
    ];
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
  },[channel]);

  const editor=useEditor({
    extensions,
    content:normalizeTemplateHtml(value),
    immediatelyRender:false,
    editorProps:{attributes:{class:styles.editor,role:'textbox','aria-label':ariaLabel,'aria-multiline':'true'}},
    onUpdate:({editor})=>onChange(editor.getHTML())
  },[channel]);

  useEffect(()=>{
    if(!editor)return;
    const next=normalizeTemplateHtml(value);
    if(editor.getHTML()!==next)editor.commands.setContent(next,{emitUpdate:false});
  },[editor,value]);

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

  return <div className={styles.wrapper}>
    <div className={styles.toolbar}>
      <div className={styles.toolGroup}>
        {toolbarButton("Deshacer",false,()=>editor.chain().focus().undo().run(),<Undo2 size={15}/>)}
        {toolbarButton("Rehacer",false,()=>editor.chain().focus().redo().run(),<Redo2 size={15}/>)}
      </div>
      <div className={styles.toolGroup}>
        {toolbarButton("Negrita",editor.isActive("bold"),()=>editor.chain().focus().toggleBold().run(),<BoldIcon size={15}/>)}
        {toolbarButton("Cursiva",editor.isActive("italic"),()=>editor.chain().focus().toggleItalic().run(),<ItalicIcon size={15}/>)}
        {channel==="email"&&toolbarButton("Subrayado",editor.isActive("underline"),()=>editor.chain().focus().toggleUnderline().run(),<UnderlineIcon size={15}/>)}
        {toolbarButton("Tachado",editor.isActive("strike"),()=>editor.chain().focus().toggleStrike().run(),<Strikethrough size={15}/>)}
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
        <DialogFooter><Button variant="outline" onClick={closeLink}>Cancelar</Button><Button type="submit" disabled={!linkUrl.trim()}>Guardar enlace</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>}


    {showVariables&&<div className={styles.variables}>
      <span>Insertar variable:</span>
      {VARIABLES.map(variable=><UnstyledButton type="button" key={variable} title={variable==="sender"?"Nombre completo del usuario que envía":variable==="sender_short"?"Nombre visible del usuario que envía":undefined} onClick={()=>insert("{{"+variable+"}}")}>{"{{"+variable+"}}"}</UnstyledButton>)}
      <UnstyledButton type="button" onClick={()=>insert("{{#if contact}}Hola {{contact}}, ¿cómo estás?{{else}}Hola, ¿cómo estás?{{/if}}")}>Saludo opcional</UnstyledButton>
    </div>}
    <p className={styles.hint}>
      {channel==="whatsapp"
        ?"WhatsApp conserva negrita, cursiva y tachado. Los links se envían como URL visible y quedan clickeables."
        :"Email se guarda como HTML enriquecido compatible con clientes habituales. Evitamos formatos frágiles como fuentes o colores personalizados."}
    </p>
  </div>;
};