import { htmlToPlainText } from "./renderMessageTemplate";

const clean=(value:string)=>value.replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n");

const escapePreview=(value:string)=>value
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;")
  .replaceAll("'","&#39;");

export function whatsappTextToPreviewHtml(text:string){
  let out=escapePreview(text);
  out=out
    .replace(/```([\s\S]*?)```/g,"<code>$1</code>")
    .replace(/\*([^*\n]+)\*/g,"<strong>$1</strong>")
    .replace(/_([^_\n]+)_/g,"<em>$1</em>")
    .replace(/~([^~\n]+)~/g,"<s>$1</s>");
  return out.replace(/\n/g,"<br>");
}


export function htmlToWhatsApp(html:string){
  if(typeof DOMParser==="undefined")return htmlToPlainText(html);
  const doc=new DOMParser().parseFromString("<div>"+html+"</div>","text/html");
  const render=(node:Node):string=>{
    if(node.nodeType===Node.TEXT_NODE)return node.textContent??"";
    if(node.nodeType!==Node.ELEMENT_NODE)return "";
    const el=node as HTMLElement;
    const tag=el.tagName.toLowerCase();
    const children=Array.from(el.childNodes).map(render).join("");
    if(tag==="br")return "\n";
    if(tag==="strong"||tag==="b")return children.trim()?"*"+children+"*":"";
    if(tag==="em"||tag==="i")return children.trim()?"_"+children+"_":"";
    if(tag==="s"||tag==="del"||tag==="strike")return children.trim()?"~"+children+"~":"";
    if(tag==="a"){
      const href=el.getAttribute("href")??"";
      const label=children.trim();
      if(!href)return label;
      return !label||label===href?href:label+" ("+href+")";
    }
    if(tag==="p"||tag==="div")return children+"\n\n";
    return children;
  };
  return clean(render(doc.body.firstElementChild!))
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}

export async function copyRichEmailToClipboard(html:string,plain:string){
  if(typeof ClipboardItem!=="undefined"&&navigator.clipboard?.write){
    const item=new ClipboardItem({
      "text/html":new Blob([html],{type:"text/html"}),
      "text/plain":new Blob([plain],{type:"text/plain"})
    });
    await navigator.clipboard.write([item]);
    return true;
  }
  if(navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(plain);
    return false;
  }
  return false;
}