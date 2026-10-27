import {useEffect,useLayoutEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {Switch} from '@mantine/core';
import {ArrowDown} from 'lucide-react';
import {COMMUNICATION_LIST_LIMIT} from '../../endpoints/communication.schema';
import {atListLimit,buildCommunicationTimeline,filterTimeline,managementOptions,newSinceKey,timelineChips,timelineDomId,visibleTimeline,withDaySeparators,type ManagementFilter,type TimelineChannel,type TimelineEntry} from '../../helpers/communicationTimeline';
import {Button} from '../Button';
import {CrmNativeSelect} from '../ui/CrmNativeSelect';
import {ConversationItem} from './ConversationItem';
import {ChatLegend} from './ChatLegend';
import type {CommunicationView} from './types';
import styles from './CommunicationView.module.css';

/** A request from «Requiere acción» to scroll to an item and highlight it; `seq` repeats a request for the same item. */
export type FocusRequest={readonly key:string;readonly seq:number};
/** «Preparar respuesta» below the last item (spec 91 §10): what it does and, when it cannot, why. */
export type ReplyAction={readonly onReply:()=>void;readonly disabledReason:string};

const byId=(key:string)=>document.getElementById(timelineDomId(key));
const SCROLL_KEYS=new Set(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' ']);

/**
 * Scroll of the conversation body (spec 91 review 2, «chat window»): the body is the only thing that scrolls, the page never
 * jumps. `userScrolled` turns true on wheel, touch, scroll keys or any scroll the code did not start (a scrollbar drag); a
 * scroll that comes with a height change of the body is a layout clamp, not the user. `programmatic` flags the code's own
 * scrolls for 1s, which covers smooth scrolling.
 */
function useBodyScroll(body:RefObject<HTMLDivElement|null>){
 const userScrolled=useRef(false),ignoreUntil=useRef(0),height=useRef<number|null>(null);
 useEffect(()=>{
  const el=body.current;if(!el)return;
  const mark=()=>{userScrolled.current=true};
  const key=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(SCROLL_KEYS.has(event.key)&&!target?.closest('input,textarea,select,[contenteditable="true"]'))mark()};
  const scroll=()=>{const known=height.current;height.current=el.scrollHeight;if(known===null||known!==el.scrollHeight||Date.now()<ignoreUntil.current)return;mark()};
  height.current=el.scrollHeight;
  el.addEventListener('wheel',mark,{passive:true});el.addEventListener('touchmove',mark,{passive:true});el.addEventListener('keydown',key);el.addEventListener('scroll',scroll,{passive:true});
  return()=>{el.removeEventListener('wheel',mark);el.removeEventListener('touchmove',mark);el.removeEventListener('keydown',key);el.removeEventListener('scroll',scroll)};
 },[body]);
 return useMemo(()=>{
  const programmatic=()=>{ignoreUntil.current=Date.now()+1000;height.current=body.current?.scrollHeight??null};
  return {
   userScrolled,
   /** Scrolls the body to its end (the latest item). */
   toEnd(smooth=false){const el=body.current;if(!el)return;programmatic();if(typeof el.scrollTo==='function')el.scrollTo({top:el.scrollHeight,behavior:smooth?'smooth':'auto'});else el.scrollTop=el.scrollHeight},
   /** Centres `item` in the body; the page scrolls only when the frame itself is out of view. */
   reveal(item:HTMLElement){
    const el=body.current;if(!el)return;programmatic();
    const box=el.getBoundingClientRect(),target=item.getBoundingClientRect();
    const top=el.scrollTop+target.top-box.top-(el.clientHeight-target.height)/2;
    if(typeof el.scrollTo==='function')el.scrollTo({top,behavior:'smooth'});else el.scrollTop=top;
    const frame=el.closest('section');const r=frame?.getBoundingClientRect();
    if(frame&&r&&(r.top<0||r.bottom>window.innerHeight))frame.scrollIntoView?.({block:'nearest',behavior:'smooth'});
   },
   /** Keeps what the user sees when content is inserted above: call `keep()` before, then the returned function after. */
   keep(){const el=body.current;if(!el)return()=>{};const fromEnd=el.scrollHeight-el.scrollTop;return()=>{programmatic();el.scrollTop=el.scrollHeight-fromEnd}},
  };
 },[body]);
}

/**
 * «Conversación» as a chat window (spec 91, review 2): a framed card with a fixed header (title, channel chips, management
 * selector, «Mostrar anulados»), a body with its own scroll (day separators, «Nuevo desde tu última visita», «Ver anteriores»,
 * the bubbles and a sticky «Ir al último») and a fixed footer with «Preparar respuesta». The frame grows with its content up
 * to a viewport-based max height (CSS), so a short history is not a big empty box.
 * On open the body (never the page) scrolls to the latest item, and it stays at the end while content settles unless the user
 * scrolled it. A summary entry from «Requiere acción» reveals its item (clearing filters that hide it), centres it in the
 * body and highlights it. «Ver anteriores» keeps the scroll position. The admin «Mostrar anulados» switch asks the server for
 * voided rows (`includeVoided`).
 */
export function Conversation({view,includeVoided,onToggleVoided,lastSeenAt,focus,reply}:{view:CommunicationView;includeVoided:boolean;onToggleVoided:()=>void;lastSeenAt:Date|null;focus:FocusRequest|null;reply?:ReplyAction}){
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
 const body=useRef<HTMLDivElement>(null),list=useRef<HTMLOListElement>(null),scroll=useBodyScroll(body);
 // Open at the latest item, inside the body only; then stay there while content settles (fonts, clamps, details loading)
 // until the user scrolls the body.
 useLayoutEffect(()=>{if(!scroll.userScrolled.current)scroll.toEnd()},[lastKey,scroll]);
 useEffect(()=>{
  const el=list.current;if(!el||typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(()=>{if(!scroll.userScrolled.current)scroll.toEnd()});observer.observe(el);return()=>observer.disconnect();
 },[scroll,items.length>0]);
 useEffect(()=>{
  const el=lastKey?byId(lastKey):null;
  if(!el||typeof IntersectionObserver==='undefined'){setLatestHidden(false);return}
  const observer=new IntersectionObserver(([record])=>setLatestHidden(!record.isIntersecting),{root:body.current});observer.observe(el);return()=>observer.disconnect();
 },[lastKey]);
 // «Ver anteriores» inserts items above: keep the visible items where they were.
 const restore=useRef<(()=>void)|null>(null);
 const showOlderItems=()=>{restore.current=scroll.keep();setShowOlder(true)};
 useLayoutEffect(()=>{const done=restore.current;restore.current=null;done?.()},[showOlder]);
 // Spec 91 §9: a summary entry reveals its item (clearing filters that hide it), scrolls to it and highlights it briefly.
 useEffect(()=>{if(!focus)return;if(!items.some(item=>item.key===focus.key)){setChannel('all');setManagement('all');setShowOlder(true)}setPendingFocus(focus.key)},[focus]);
 // One attempt after the filters were cleared: an item that is still not rendered (it went away on a refresh) is dropped.
 useEffect(()=>{if(!pendingFocus)return;const el=byId(pendingFocus);if(!el){setPendingFocus(null);return}scroll.userScrolled.current=true;scroll.reveal(el);el.focus({preventScroll:true});setHighlight(pendingFocus);setPendingFocus(null)},[pendingFocus,items,scroll]);
 useEffect(()=>{if(!highlight)return;const timer=setTimeout(()=>setHighlight(null),2400);return()=>clearTimeout(timer)},[highlight]);
 return <section className={styles.frame} aria-label="Conversación">
  <div className={styles.frameHead}>
   <div className={styles.frameTitle}><h4 className={styles.sectionTitle}>Conversación</h4><ChatLegend/></div>
   <div className={styles.filters}>
    {entries.length>0&&<div role="group" aria-label="Filtrar la conversación por canal" className={styles.chips}>{chips.map(chip=><Button key={chip.channel} size="sm" variant={active===chip.channel?'primary':'outline'} aria-pressed={active===chip.channel} onClick={()=>{setChannel(chip.channel);setShowOlder(false)}}>{chip.channel!=='all'&&<span className={styles.chipDot} data-channel={chip.channel} aria-hidden="true"/>}{chip.label} · {chip.count}</Button>)}</div>}
    {options.length>0&&<CrmNativeSelect size="xs" aria-label="Filtrar la conversación por gestión" className={styles.managementFilter} value={activeManagement} onChange={event=>{setManagement(event.currentTarget.value as ManagementFilter);setShowOlder(false)}} data={options}/>}
    {view.admin&&<Switch className={styles.voidedSwitch} size="sm" label="Mostrar anulados" checked={includeVoided} onChange={onToggleVoided}/>}
   </div>
  </div>
  <div ref={body} className={styles.frameBody} data-testid="conversation-body" tabIndex={-1}>
   {!entries.length&&<p className={styles.empty}>{writable?'Todavía no hay mensajes ni respuestas. Lo que envíes con «Contactar» aparece acá, en orden; lo que te conteste el negocio sin un mensaje registrado lo anotás con «Registrar» y «Respuesta sin mensaje».':'Todavía no hay mensajes ni respuestas.'}</p>}
   {entries.length>0&&!items.length&&<p className={styles.empty}>No hay mensajes con estos filtros.</p>}
   {atListLimit({messages:data.messages,inbound:data.inbound,responses:data.responses,limit:COMMUNICATION_LIST_LIMIT})&&<p className={styles.limitNote} role="note">Mostrando lo más reciente: los mensajes y respuestas más antiguos no se cargan acá. Buscalos en la Bandeja.</p>}
   {hidden>0&&<Button size="sm" variant="outline" style={{alignSelf:'center'}} onClick={showOlderItems}>Ver anteriores ({hidden})</Button>}
   {items.length>0&&<ol ref={list} className={styles.timeline}>{withDaySeparators(items).map(({entry,separator})=><Item key={entry.key} view={view} entry={entry} separator={separator} newSince={entry.key===divider} highlighted={entry.key===highlight}/>)}</ol>}
   {latestHidden&&lastKey&&<div className={styles.toLatestWrap}><Button size="sm" className={styles.toLatest} onClick={()=>{scroll.userScrolled.current=false;scroll.toEnd(true)}}><ArrowDown size={16} aria-hidden="true"/>Ir al último</Button></div>}
  </div>
  {reply&&<div className={styles.frameFoot}><Button variant="outline" disabled={!!reply.disabledReason} disabledReason={reply.disabledReason} onClick={reply.onReply}>Preparar respuesta</Button></div>}
 </section>;
}

function Item({view,entry,separator,newSince,highlighted}:{view:CommunicationView;entry:TimelineEntry;separator:string|null;newSince:boolean;highlighted:boolean}){
 return <li>
  {separator&&<div className={styles.day}>{separator}</div>}
  {newSince&&<div className={styles.newSince}>Nuevo desde tu última visita</div>}
  <ConversationItem view={view} entry={entry} highlighted={highlighted}/>
 </li>;
}
