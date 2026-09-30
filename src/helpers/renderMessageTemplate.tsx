export type TemplateContext={
  name?:unknown;
  contact?:unknown;
  contact_name?:unknown;
  city?:unknown;
  type?:unknown;
  subtype?:unknown;
  phone?:unknown;
  email?:unknown;
  website?:unknown;
  sender?:unknown;
};

const text=(value:unknown)=>value==null?"":String(value).trim();
const escapeHtml=(value:string)=>value
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;")
  .replaceAll("'","&#39;");

export const normalizeTemplateHtml=(source:string)=>{
  const trimmed=source.trim();
  if(!trimmed)return "<p></p>";
  if(/<\/?(?:p|div|strong|em|s|u|h[1-6]|ul|ol|li|blockquote|a|hr|br)\b/i.test(trimmed))return trimmed;
  return trimmed
    .split(/\n{2,}/)
    .map(paragraph=>"<p>"+escapeHtml(paragraph).replace(/\n/g,"<br>")+"</p>")
    .join("");
};

export function renderMessageTemplate(source:string,context:TemplateContext){
  const values:Record<string,string>={};
  for(const [key,value] of Object.entries(context))values[key]=text(value);
  let out=source;
  const conditional=/{{#if\s+([a-zA-Z0-9_]+)}}([\s\S]*?)(?:{{else}}([\s\S]*?))?{{\/if}}/g;
  for(let i=0;i<10;i++){
    const next=out.replace(conditional,(_,key,truthy,falsy)=>values[key]?truthy:(falsy??""));
    if(next===out)break;
    out=next;
  }
  out=out.replace(/{{([a-zA-Z0-9_]+)}}/g,(_,key)=>values[key]??"");
  return out
    .replace(/[ \t]+([,.;:!?])/g,"$1")
    .replace(/[ \t]{2,}/g," ")
    .replace(/\n[ \t]+/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}

export function renderMessageTemplateHtml(source:string,context:TemplateContext){
  const values:Record<string,string>={};
  const htmlValues:Record<string,string>={};
  for(const [key,value] of Object.entries(context)){
    values[key]=text(value);
    htmlValues[key]=escapeHtml(values[key]);
  }
  let out=normalizeTemplateHtml(source);
  const conditional=/{{#if\s+([a-zA-Z0-9_]+)}}([\s\S]*?)(?:{{else}}([\s\S]*?))?{{\/if}}/g;
  for(let i=0;i<10;i++){
    const next=out.replace(conditional,(_,key,truthy,falsy)=>values[key]?truthy:(falsy??""));
    if(next===out)break;
    out=next;
  }
  out=out.replace(/{{([a-zA-Z0-9_]+)}}/g,(_,key)=>htmlValues[key]??"");
  return out
    .replace(/<p>\s*<\/p>/g,"")
    .replace(/javascript:/gi,"")
    .replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi,"")
    .trim();
}

export function htmlToPlainText(source:string){
  return source
    .replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<\/(p|div|h[1-6]|blockquote)>/gi,"\n\n")
    .replace(/<li[^>]*>/gi,"• ")
    .replace(/<\/li>/gi,"\n")
    .replace(/<hr[^>]*>/gi,"\n---\n")
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,(_,href,label)=>{
      const clean=String(label).replace(/<[^>]+>/g,"").trim();
      return clean&&clean!==href?clean+" ("+href+")":href;
    })
    .replace(/<[^>]+>/g,"")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}