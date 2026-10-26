import {fromChatModel,type InternalChatModel} from './internals';
import {normalizePhone,parseCode} from './parse';

export type ChatRow={key:string;title:string;phone:string|null;row:HTMLElement};
type Fiber={return?:Fiber|null;memoizedProps?:{chat?:InternalChatModel}|null};
// WhatsApp's current list uses role="row"; older builds used listitem or the cell-frame test id.
const rowSelector='[role="row"],[role="listitem"],[data-testid="cell-frame-container"]';
const archivedView=(root:HTMLElement)=>/archiv/i.test(root.getAttribute('aria-label')||'')||/archiv/i.test(root.querySelector<HTMLElement>('[data-testid*="list-header" i],[data-testid*="pane-header" i],[role="heading"]')?.textContent||'');

export function readChatRow(row:HTMLElement,doc:Document=document):ChatRow|null{
 const root=row.closest<HTMLElement>('#pane-side')||doc.querySelector<HTMLElement>('#pane-side');
 if(row.matches('[data-testid*="archived" i]')||row.closest('[data-testid*="archived-chat" i]'))return null;
 if(root&&archivedView(root))return null;
 const name=row.querySelector<HTMLElement>('[data-testid="cell-frame-title"] span[title]')||row.querySelector<HTMLElement>('[data-testid="cell-frame-title"] span')||row.querySelector<HTMLElement>('span[title]');
 const title=(name?.getAttribute('title')||name?.textContent||'').trim();
 const page=typeof unsafeWindow!=='undefined'?unsafeWindow.document:doc;
 let phone:string|null=null,stableId=row.getAttribute('data-id'),modelId='',modelName='';
 // The fiber expando is only visible on the page's own node: pair the row with it by data-id, else by its position in the list.
 const pageRow=page===doc?row:pageCounterpart(row,root,page,stableId);
 for(const node of pageRow?[pageRow,...pageRow.querySelectorAll<HTMLElement>('*')]:[]){
  const fiberKey=Object.keys(node).find(key=>key.startsWith('__reactFiber$'));
  let fiber=fiberKey?(node as unknown as Record<string,unknown>)[fiberKey] as Fiber|undefined:undefined;
  for(let depth=0;fiber&&depth<40;depth++,fiber=fiber.return??undefined){
   const chat=fiber.memoizedProps?.chat;if(!chat)continue;
   const id=chat.id?._serialized||chat.contact?.id?._serialized||'';if(id){modelId=id;stableId=id;}modelName=(chat as InternalChatModel&{name?:string;contact?:{name?:string}}).name||(chat as InternalChatModel&{contact?:{name?:string}}).contact?.name||'';
   const identity=fromChatModel(chat);if(identity.group)return null;phone=identity.phone;break;
  }
  if(modelId)break;
 }
 if(!stableId||stableId.length>100||/@g\.us/i.test(stableId))return null;
 if(!phone&&title)phone=normalizePhone(title.replace(/[^\d+]/g,''));
 if(phone==='+0'||phone?.replace(/\D/g,'')==='0')return null;
 const displayTitle=title||modelName||phone||'';if(!phone&&!parseCode(displayTitle))return null;
 return {key:stableId,title:displayTitle.slice(0,200),phone,row};
}

function pageCounterpart(row:HTMLElement,root:HTMLElement|null,page:Document,stableId:string|null):HTMLElement|undefined{
 const pageRows=[...(page.querySelector<HTMLElement>('#pane-side')||page).querySelectorAll<HTMLElement>(rowSelector)];
 if(stableId){const byId=pageRows.find(candidate=>candidate.getAttribute('data-id')===stableId);if(byId)return byId;}
 const index=root?listRows(root).indexOf(row):-1,candidate=index>=0?pageRows[index]:undefined;
 // Same position and same visible name, so a list that changed between both reads never lends one chat's model to another.
 return candidate&&candidate.textContent===row.textContent?candidate:undefined;
}

export function listRows(root:HTMLElement):HTMLElement[]{return [...root.querySelectorAll<HTMLElement>(rowSelector)];}
export function isArchivedView(root:HTMLElement):boolean{return archivedView(root);}
