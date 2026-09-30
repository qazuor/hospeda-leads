import React, { useEffect, useMemo } from "react";
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
import styles from "./RichTemplateEditor.module.css";

const EMOJIS=["🙂","😊","👋","✨","📍","🏡","🍽️","🌿","🎉","📲","✅","🤝","💙","👉","📅","⭐"];
const VARIABLES=["sender","name","contact","contact_name","city","type","subtype","phone","email","website"];

export const RichTemplateEditor=({
  value,onChange,channel
}:{
  value:string;
  onChange:(html:string)=>void;
  channel:"whatsapp"|"email";
})=>{
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
    editorProps:{attributes:{class:styles.editor}},
    onUpdate:({editor})=>onChange(editor.getHTML())
  },[channel]);

  useEffect(()=>{
    if(!editor)return;
    const next=normalizeTemplateHtml(value);
    if(editor.getHTML()!==next)editor.commands.setContent(next,{emitUpdate:false});
  },[editor,value]);

  if(!editor)return <div className={styles.loading}>Cargando editor…</div>;

  const toolbarButton=(label:string,active:boolean,onClick:()=>void,icon:React.ReactNode)=>(
    <button type="button" title={label} aria-label={label} className={active?styles.active:""} onClick={onClick}>{icon}</button>
  );
  const setLink=()=>{
    const previous=editor.getAttributes("link").href as string|undefined;
    const input=window.prompt("URL del enlace",previous??"https://");
    if(input===null)return;
    const trimmed=input.trim();
    if(!trimmed){editor.chain().focus().unsetLink().run();return}
    const href=/^[a-z][a-z0-9+.-]*:/i.test(trimmed)?trimmed:"https://"+trimmed;
    editor.chain().focus().extendMarkRange("link").setLink({href}).run();
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
          <PopoverTrigger asChild><button type="button" title="Emoji"><Smile size={15}/></button></PopoverTrigger>
          <PopoverContent align="start" className={styles.emojiPopover}>
            {EMOJIS.map(emoji=><button type="button" key={emoji} onClick={()=>insert(emoji)}>{emoji}</button>)}
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <EditorContent editor={editor}/>

    <div className={styles.variables}>
      <span>Insertar variable:</span>
      {VARIABLES.map(variable=><button type="button" key={variable} onClick={()=>insert("{{"+variable+"}}")}>{"{{"+variable+"}}"}</button>)}
      <button type="button" onClick={()=>insert("{{#if contact}}Hola {{contact}}, ¿cómo estás?{{else}}Hola, ¿cómo estás?{{/if}}")}>Saludo opcional</button>
    </div>
    <p className={styles.hint}>
      {channel==="whatsapp"
        ?"WhatsApp conserva negrita, cursiva y tachado. Los links se envían como URL visible y quedan clickeables."
        :"Email se guarda como HTML enriquecido compatible con clientes habituales. Evitamos formatos frágiles como fuentes o colores personalizados."}
    </p>
  </div>;
};