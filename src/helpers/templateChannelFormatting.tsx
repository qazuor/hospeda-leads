import { htmlToPlainText } from "./renderMessageTemplate";

const clean=(value:string)=>value.replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n");

const escapePreview=(value:string)=>value
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;")
  .replaceAll("'","&#39;");

const formatPlain=(text:string)=>escapePreview(text)
  .replace(/```([\s\S]*?)```/g,"<code>$1</code>")
  .replace(/\*([^*\n]+)\*/g,"<strong>$1</strong>")
  .replace(/_([^_\n]+)_/g,"<em>$1</em>")
  .replace(/~([^~\n]+)~/g,"<s>$1</s>");
const URL_PATTERN=/https?:\/\/[^\s<>"']+/g;
/** Closing punctuation right after a URL belongs to the sentence, not to the link. */
const TRAILING_PUNCTUATION=/[.,;:!?)»]+$/;

const formatWhatsapp=(text:string,link:(href:string)=>string)=>{
  let out="",last=0;
  for(const match of text.matchAll(URL_PATTERN)){
    const url=match[0].replace(TRAILING_PUNCTUATION,""),start=match.index;
    if(!/^https?:\/\/./.test(url))continue;
    out+=formatPlain(text.slice(last,start))+link(escapePreview(url));
    last=start+url.length;
  }
  return (out+formatPlain(text.slice(last))).replace(/\n/g,"<br>");
};

/**
 * WhatsApp text → editor HTML. `*`, `_`, `~` and ``` format only the text between URLs; each URL is written as `<a href=URL>URL</a>`
 * so a share token with `_` is never shown in italics nor loses characters (spec 101 §6.1). `htmlToWhatsApp` turns it back into the same text.
 */
export function whatsappTextToPreviewHtml(text:string){
  return formatWhatsapp(text,href=>`<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`);
}

/**
 * WhatsApp text → read-only HTML (final view, template preview). Same formatting, but a URL is a non-navigating `<span data-link>`: opening a
 * share link from the CRM would count as an access to the client's link (spec 101 review).
 */
export function whatsappTextToReadOnlyHtml(text:string){
  return formatWhatsapp(text,href=>`<span data-link="">${href}</span>`);
}

/**
 * Text a link becomes in WhatsApp. A label that is itself a URL or starts with the href (text typed into or after a link, or a URL edited inside
 * it) is sent as shown, never as `label (href)`: the href would put back a URL the seller removed (spec 101 review). Other labels keep `(href)`.
 */
const whatsappLink=(label:string,href:string)=>!href||!label||label===href?(href||label):/^https?:\/\/\S/.test(label)||label.startsWith(href)?label:label+" ("+href+")";
const ANCHOR=/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;

export function htmlToWhatsApp(html:string){
  if(typeof DOMParser==="undefined")return clean(htmlToPlainText(html
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi,"*$2*")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi,"_$2_")
    .replace(/<(s|del|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi,"~$2~")
    .replace(ANCHOR,(_,href:string,label:string)=>whatsappLink(label.replace(/<[^>]+>/g,"").trim(),href))));
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
      return whatsappLink(children.trim(),el.getAttribute("href")??"");
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