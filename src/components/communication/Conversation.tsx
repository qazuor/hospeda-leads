import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Switch} from '@mantine/core';
import {ArrowDown} from 'lucide-react';
import {COMMUNICATION_LIST_LIMIT} from '../../endpoints/communication.schema';
import {atListLimit,buildCommunicationTimeline,filterTimeline,managementOptions,newSinceKey,timelineChips,timelineDomId,visibleTimeline,withDaySeparators,type ManagementFilter,type TimelineChannel,type TimelineEntry} from '../../helpers/communicationTimeline';
import {Button} from '../Button';
import {CrmNativeSelect} from '../ui/CrmNativeSelect';
import {ConversationItem} from './ConversationItem';
import type {CommunicationView,ScrollTracker} from './types';
import styles from './CommunicationView.module.css';

/** A request from «Requiere acción» to scroll to an item and highlight it; `seq` repeats a request for the same item. */
export type FocusRequest={readonly key:string;readonly seq:number};
/** «Preparar respuesta» below the last item (spec 91 §10): what it does and, when it cannot, why. */
export type ReplyAction={readonly onReply:()=>void;readonly disabledReason:string};

const byId=(key:string)=>document.getElementById(timelineDomId(key));
/** The element that scrolls `el`: the nearest scrollable ancestor, or the page. */
function scrollParent(el:HTMLElement):{scrollBy:(x:number,y:number)=>void}{
 for(let node=el.parentElement;node;node=node.parentElement){const overflow=getComputedStyle(node).overflowY;if((overflow==='auto'||overflow==='scroll')&&node.scrollHeight>node.clientHeight)return node;}
 return window;
}

/**
 * «Conversación»: one chronological list (oldest first, day separators) of everything sent and received with the business,
 * with or without management. Channel chips and the management selector (spec 91 §11) filter it on the client; long
 * histories show the latest 30 with «Ver anteriores», which keeps the scroll position. On open it scrolls to the latest item
 * unless the user already scrolled (`scroll.userScrolled`; the code's own scrolls are flagged with `scroll.programmatic`), and «Ir al último» shows while the latest item is out of view.
 * «Nuevo desde tu última visita» marks the first item newer than `lastSeenAt` the viewer did not author. The admin
 * «Mostrar anulados» switch asks the server for voided rows (`includeVoided`).
 */
export function Conversation({view,includeVoided,onToggleVoided,lastSeenAt,focus,reply,scroll}:{view:CommunicationView;includeVoided:boolean;onToggleVoided:()=>void;lastSeenAt:Date|null;focus:FocusRequest|null;reply?:ReplyAction;scroll:ScrollTracker}){
 const {data,detail}=view;
 const entries=useMemo(()=>buildCommunicationTimeline({messages:data.messages,inbound:data.inbound,responses:data.responses,users:detail?.users,managements:detail?.opportunities??data.openManagements}),[data,detail]);
 const [channel,setChannel]=useState<TimelineChannel|'all'>('all'),[management,setManagement]=useState<ManagementFilter>('all'),[showOlder,setShowOlder]=useState(false);
 const [highlight,setHighlight]=useState<string|null>(null),[pendingFocus,setPendingFocus]=useState<string|null>(null),[latestHidden,setLatestHidden]=useState(false);
 const chips=timelineChips(entries),active=chips.some(chip=>chip.channel===channel)?channel:'all';
 const options=managementOptions(entries),activeManagement=options.some(option=>option.value===management)?management:'all';
 const {items,hidden}=visibleTimeline(filterTimeline(entries,active,activeManagement),{showOlder});
 const divider=newSinceKey({entries:items,lastSeenAt,userEmail:view.userEmail});
 const writable=!view.readOnly&&!!detail&&!detail.account.doNotContact&&!detail.account.archivedAt;
 const lastKey=items.at(-1)?.key;
 // Spec 91 §8: open at the latest item once, never against a scroll the user already made.
 const opened=useRef(false);
 useEffect(()=>{if(opened.current||!lastKey)return;opened.current=true;if(!scroll.userScrolled.current){scroll.programmatic();byId(lastKey)?.scrollIntoView?.({block:'nearest'})}},[lastKey,scroll]);
 useEffect(()=>{
  const el=lastKey?byId(lastKey):null;
  if(!el||typeof IntersectionObserver==='undefined'){setLatestHidden(false);return}
  const observer=new IntersectionObserver(([record])=>setLatestHidden(!record.isIntersecting));observer.observe(el);return()=>observer.disconnect();
 },[lastKey]);
 // «Ver anteriores» inserts items above: keep the first visible item where it was.
 const anchor=useRef<{key:string;top:number}|null>(null);
 const showOlderItems=()=>{const first=items[0],el=first?byId(first.key):null;anchor.current=first&&el?{key:first.key,top:el.getBoundingClientRect().top}:null;setShowOlder(true)};
 useLayoutEffect(()=>{const saved=anchor.current;if(!saved)return;anchor.current=null;const el=byId(saved.key);if(!el)return;const delta=el.getBoundingClientRect().top-saved.top;if(delta){scroll.programmatic();scrollParent(el).scrollBy(0,delta)}},[showOlder,scroll]);
 // Spec 91 §9: a summary entry reveals its item (clearing filters that hide it), scrolls to it and highlights it briefly.
 useEffect(()=>{if(!focus)return;if(!items.some(item=>item.key===focus.key)){setChannel('all');setManagement('all');setShowOlder(true)}setPendingFocus(focus.key)},[focus]);
 // One attempt after the filters were cleared: an item that is still not rendered (it went away on a refresh) is dropped.
 useEffect(()=>{if(!pendingFocus)return;const el=byId(pendingFocus);if(!el){setPendingFocus(null);return}scroll.programmatic();el.scrollIntoView?.({block:'center',behavior:'smooth'});el.focus({preventScroll:true});setHighlight(pendingFocus);setPendingFocus(null)},[pendingFocus,items,scroll]);
 useEffect(()=>{if(!highlight)return;const timer=setTimeout(()=>setHighlight(null),2400);return()=>clearTimeout(timer)},[highlight]);
 return <section className={styles.section} aria-label="Conversación">
  <div className={styles.convHead}>
   <h4 className={styles.sectionTitle}>Conversación</h4>
   <div className={styles.filters}>
    {entries.length>0&&<div role="group" aria-label="Filtrar la conversación por canal" className={styles.chips}>{chips.map(chip=><Button key={chip.channel} size="sm" variant={active===chip.channel?'primary':'outline'} aria-pressed={active===chip.channel} onClick={()=>{setChannel(chip.channel);setShowOlder(false)}}>{chip.label} · {chip.count}</Button>)}</div>}
    {options.length>0&&<CrmNativeSelect size="xs" aria-label="Filtrar la conversación por gestión" className={styles.managementFilter} value={activeManagement} onChange={event=>{setManagement(event.currentTarget.value as ManagementFilter);setShowOlder(false)}} data={options}/>}
    {view.admin&&<Switch className={styles.voidedSwitch} size="sm" label="Mostrar anulados" checked={includeVoided} onChange={onToggleVoided}/>}
   </div>
  </div>
  {!entries.length&&<p className={styles.empty}>{writable?'Todavía no hay mensajes ni respuestas. Lo que envíes con «Contactar» aparece acá, en orden; lo que te conteste el negocio sin un mensaje registrado lo anotás con «Registrar» y «Respuesta sin mensaje».':'Todavía no hay mensajes ni respuestas.'}</p>}
  {entries.length>0&&!items.length&&<p className={styles.empty}>No hay mensajes con estos filtros.</p>}
  {atListLimit({messages:data.messages,inbound:data.inbound,responses:data.responses,limit:COMMUNICATION_LIST_LIMIT})&&<p className={styles.limitNote} role="note">Mostrando lo más reciente: los mensajes y respuestas más antiguos no se cargan acá. Buscalos en la Bandeja.</p>}
  {hidden>0&&<Button size="sm" variant="outline" style={{alignSelf:'center'}} onClick={showOlderItems}>Ver anteriores ({hidden})</Button>}
  {items.length>0&&<ol className={styles.timeline}>{withDaySeparators(items).map(({entry,separator})=><Item key={entry.key} view={view} entry={entry} separator={separator} newSince={entry.key===divider} highlighted={entry.key===highlight}/>)}</ol>}
  {latestHidden&&lastKey&&<div className={styles.toLatestWrap}><Button size="sm" className={styles.toLatest} onClick={()=>{scroll.programmatic();byId(lastKey)?.scrollIntoView?.({block:'nearest',behavior:'smooth'})}}><ArrowDown size={16} aria-hidden="true"/>Ir al último</Button></div>}
  {reply&&<div className={styles.replyRow}><Button variant="outline" disabled={!!reply.disabledReason} disabledReason={reply.disabledReason} onClick={reply.onReply}>Preparar respuesta</Button></div>}
 </section>;
}

function Item({view,entry,separator,newSince,highlighted}:{view:CommunicationView;entry:TimelineEntry;separator:string|null;newSince:boolean;highlighted:boolean}){
 return <li>
  {separator&&<div className={styles.day}>{separator}</div>}
  {newSince&&<div className={styles.newSince}>Nuevo desde tu última visita</div>}
  <ConversationItem view={view} entry={entry} highlighted={highlighted}/>
 </li>;
}
