import {useEffect,useMemo,useState} from 'react';
import {useInfiniteQuery,useQuery} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {ArrowLeft,Search,SlidersHorizontal} from 'lucide-react';
import {getInboxBusinesses,getInboxThreads} from '../endpoints/inbox.schema';
import {inboxSearchLength,INBOX_SEARCH_MIN} from '../endpoints/inboxPure';
import {useAuth} from '../helpers/useAuth';
import {QueryErrorNotice} from '../components/QueryErrorNotice';
import {CrmEmptyState} from '../components/ui/CrmEmptyState';
import {Button} from '../components/Button';
import {InboxDetail} from '../components/inbox/InboxDetail';
import {InboxSearch,INBOX_SEARCH_DEFAULTS,type InboxSearchFilters} from '../components/inbox/InboxSearch';
import {INBOX_CHANNELS,inboxChannelLabel,inboxDateLabel,inboxMessageKey,type InboxBusinessRow,type InboxChannel,type InboxPage,type InboxSearchRow,type InboxThreadRow,type InboxThreadsResponse} from '../components/inbox/inboxTypes';
import styles from '../components/inbox/Inbox.module.css';
import layout from '../components/ui/CrmLayout.module.css';

type Stage='list'|'threads'|'detail';
type Selection={account?:string|null;lead?:string|null;channel?:InboxChannel|null;message?:string|null};
function PaneSkeleton({label}:{label:string}){return <div className={styles.skeleton} role="status" aria-label={label}><i/><i/><i/></div>}
function usePhone(){const [phone,setPhone]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 767px)').matches);useEffect(()=>{const m=window.matchMedia('(max-width: 767px)'),change=()=>setPhone(m.matches);m.addEventListener('change',change);return()=>m.removeEventListener('change',change)},[]);return phone}
/** Debounced copy of `value`, so typing does not fire one search per keystroke. */
function useDebounced(value:string,ms:number){const [debounced,setDebounced]=useState(value);useEffect(()=>{const timer=window.setTimeout(()=>setDebounced(value),ms);return()=>window.clearTimeout(timer)},[value,ms]);return debounced}
const isChannel=(value:string|null):value is InboxChannel=>!!value&&(INBOX_CHANNELS as readonly string[]).includes(value);
const isDirection=(value:string|null)=>value==='in'||value==='out'||value==='all';
const isDay=(value:string|null)=>!!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value));
const sameThread=(row:InboxThreadRow,lead:string|null,channel:InboxChannel|null)=>(row.leadId??'none')===(lead??'')&&(!channel||row.channel===channel);
/** The phone shows one pane, derived from the URL so browser/OS Back and in-app back stay in sync. */
export function inboxStage({accountId,leadId,channel}:{accountId:string|null;leadId:string|null;channel:InboxChannel|null}):Stage{
 return !accountId?'list':leadId===null||!channel?'threads':'detail';
}

export default function InboxPage(){
 const [params,setParams]=useSearchParams(),{authState}=useAuth(),phone=usePhone(),admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const accountId=params.get('account'),leadId=params.get('lead'),rawChannel=params.get('channel'),channel=isChannel(rawChannel)?rawChannel:null,message=params.get('message');
 // The list's «Canal» filter is its own state: the URL `channel` belongs to the selected conversation.
 const [filter,setFilter]=useState<'pending'|'all'>('pending'),[listChannel,setListChannel]=useState<InboxChannel|null>(null),[scope,setScope]=useState<'mine'|'all'>('mine'),[filtersOpen,setFiltersOpen]=useState(false);
 // Search filters live here, so they survive the results unmounting while the text is below the minimum.
 const searchText=params.get('q')??'',searchFilters:InboxSearchFilters={direction:isDirection(params.get('direction'))?params.get('direction') as InboxSearchFilters['direction']:'all',channel:isChannel(params.get('searchChannel'))?params.get('searchChannel') as InboxChannel:'',from:isDay(params.get('from'))?params.get('from') as string:'',to:isDay(params.get('to'))?params.get('to') as string:'',scope:params.get('scope')==='all'?'all':'mine'};
 const searchScroll=useMemo(()=>({top:0}),[]);
 function setSearchText(value:string){const next=new URLSearchParams(params);if(value)next.set('q',value);else next.delete('q');setParams(next,{replace:true})}
 function setSearchFilters(filters:InboxSearchFilters){const next=new URLSearchParams(params);for(const [key,value] of Object.entries({direction:filters.direction,searchChannel:filters.channel,from:filters.from,to:filters.to,scope:filters.scope})){if(value&&!(key==='direction'&&value==='all')&&!(key==='scope'&&value==='mine'))next.set(key,value);else next.delete(key)}setParams(next,{replace:true})}
 const typed=searchText.trim(),term=useDebounced(typed,300),searching=inboxSearchLength(typed)>=INBOX_SEARCH_MIN&&inboxSearchLength(term)>=INBOX_SEARCH_MIN;
 const listScope=admin?scope:undefined;
 // Keyed by every filter: a filter change starts a new list, and an invalidation refetches every loaded page.
 const businesses=useInfiniteQuery({queryKey:['inbox','businesses',filter,listChannel,listScope??'mine'],queryFn:({pageParam})=>getInboxBusinesses({filter,channel:listChannel??undefined,scope:listScope,cursor:pageParam,limit:40}) as Promise<InboxPage<InboxBusinessRow>>,initialPageParam:undefined as string|undefined,getNextPageParam:last=>last.nextCursor??undefined});
 const businessRows=useMemo(()=>businesses.data?.pages.flatMap(page=>page.rows)??[],[businesses.data]);
 const selectedBusiness=businessRows.find(row=>row.accountId===accountId);
 const pendingBusinessCount=businessRows.filter(row=>row.pendingCount>0).length;
 const threads=useQuery({queryKey:['inbox','threads',accountId],queryFn:()=>getInboxThreads({accountId:accountId!}) as Promise<InboxThreadsResponse>,enabled:!!accountId});
 const selectedThread=threads.data?.rows.find(row=>sameThread(row,leadId,channel));
 const stage=inboxStage({accountId,leadId,channel});
 // Desktop opens the newest conversation of the business; the phone stays on its list unless the URL names a stale one.
 useEffect(()=>{if(accountId&&(!phone||leadId!==null)&&threads.data?.rows.length&&!threads.data.rows.some(t=>sameThread(t,leadId,channel))){const first=threads.data.rows[0];const next=new URLSearchParams(params);next.set('lead',first.leadId??'none');next.set('channel',first.channel);next.delete('message');setParams(next,{replace:true})}},[accountId,phone,threads.data,leadId,channel,params,setParams]);
 function update(next:Selection){const value=new URLSearchParams(params);if(next.message===undefined)value.delete('message');for(const key of ['account','lead','channel','message'] as const){const v=next[key];if(v!==undefined){if(v===null)value.delete(key);else value.set(key,v)}}setParams(value)}
 const selectBusiness=(row:InboxBusinessRow)=>update({account:row.accountId,lead:null,channel:null});
 const selectThread=(row:InboxThreadRow)=>update({lead:row.leadId??'none',channel:row.channel});
 function openResult(row:InboxSearchRow){searchScroll.top=window.scrollY;update({account:row.accountId,lead:row.leadId??'none',channel:row.channel,message:inboxMessageKey(row)})}
 useEffect(()=>{if(!accountId&&searching&&searchScroll.top){window.scrollTo(0,searchScroll.top);searchScroll.top=0}},[accountId,searching,searchScroll])
 function backToResults(){const next=new URLSearchParams(params);for(const key of ['account','lead','channel','message'])next.delete(key);setParams(next)}
 const loadMoreBusinesses=()=>{if(businesses.hasNextPage&&!businesses.isFetchingNextPage)void businesses.fetchNextPage()};
 const isVisible=(pane:Stage)=>!phone||stage===pane;
 const backButton=(to:Selection)=>phone?<button className={styles.back} onClick={()=>update(to)} aria-label="Volver"><ArrowLeft/></button>:null;
 // The business name comes with the threads response, so a deep link or a business that left «A revisar» keeps its title.
 const accountName=threads.data?.accountName??selectedBusiness?.accountName;
 const filters=<div className={styles.filters}><label>Canal<select value={listChannel??''} onChange={e=>setListChannel(isChannel(e.target.value)?e.target.value:null)}><option value="">Todos los canales</option>{INBOX_CHANNELS.map(c=><option key={c} value={c}>{inboxChannelLabel(c)}</option>)}</select></label>{admin&&<label>Responsable<select value={scope} onChange={e=>setScope(e.target.value as 'mine'|'all')}><option value="mine">Mis negocios</option><option value="all">Todos</option></select></label>}</div>;
 const showSearch=(!phone||stage==='list')&&!accountId;
 const searchActive=inboxSearchLength(searchText.trim())>=INBOX_SEARCH_MIN;
 return <main className={styles.page}><header className={`${styles.heading} ${layout.pageHeading}`}><h1>Bandeja</h1></header>
 {showSearch&&<><label className={styles.search}><Search size={18}/><input aria-label="Buscar en todas las conversaciones" value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="Buscar en todas las conversaciones: qué dijiste, a quién, cuándo…"/>{!!searchText&&<Button variant="ghost" size="sm" onClick={()=>setSearchText('')}>Limpiar</Button>}</label>
 {typed.length>0&&inboxSearchLength(typed)<INBOX_SEARCH_MIN&&<p className={styles.searchHint} role="status">Escribí al menos 3 letras</p>}</>}
 {searching&&showSearch?<InboxSearch term={term} admin={admin} filters={searchFilters} onFiltersChange={setSearchFilters} onOpen={openResult}/>:
 <section className={`${styles.card} ${layout.panel}`}>
 <div className={`${styles.pane} ${styles.businesses} ${isVisible('list')?'':styles.hidden}`}>
 <header><h2>Negocios</h2><div className={styles.chips}><button aria-pressed={filter==='pending'} onClick={()=>setFilter('pending')}>A revisar · {pendingBusinessCount}</button><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>Todas</button></div>{phone?<><button className={styles.filterToggle} onClick={()=>setFiltersOpen(v=>!v)}><SlidersHorizontal size={16}/> Filtros</button>{filtersOpen&&filters}</>:filters}</header>
 {businesses.isPending?<PaneSkeleton label="Cargando negocios"/>:businesses.error&&!businesses.data?<QueryErrorNotice error={businesses.error} onRetry={businesses.refetch} busy={businesses.isFetching}/>:!businessRows.length?<CrmEmptyState>{filter==='pending'?'No tenés conversaciones a revisar.':'Todavía no hay conversaciones.'}</CrmEmptyState>:<><div className={styles.rows}>{businessRows.map(row=><button key={row.accountId} className={`${styles.row} ${accountId===row.accountId?styles.active:''}`} onClick={()=>selectBusiness(row)}><strong>{row.accountName}</strong><span className={styles.meta}>{inboxDateLabel(row.lastActivityAt)} · {inboxChannelLabel(row.lastChannel)}</span><span className={styles.preview}>{row.lastDirection==='out'?'Vos: ':''}{row.lastPreview}</span>{row.pendingCount>0&&<b className={styles.pending}>{row.pendingCount} a revisar</b>}</button>)}</div>
  {businesses.hasNextPage&&<Button variant="outline" disabled={businesses.isFetchingNextPage} disabledReason="Estamos cargando más negocios." onClick={loadMoreBusinesses}>{businesses.isFetchingNextPage?'Cargando…':'Cargar más'}</Button>}
  {businesses.isFetchNextPageError&&<p role="alert">No pudimos cargar más negocios. Probá de nuevo con «Cargar más».</p>}</>}
 </div>
 <div className={`${styles.pane} ${styles.threads} ${isVisible('threads')?'':styles.hidden}`}>
 {backButton({account:null,lead:null,channel:null})}<header><h2>Conversaciones del negocio</h2>{accountId&&<><strong>{accountName}</strong><a href={`/accounts/${accountId}`}>Abrir ficha del negocio</a></>}</header>
 {!accountId?<CrmEmptyState>Elegí un negocio para ver sus conversaciones.</CrmEmptyState>:threads.isPending?<PaneSkeleton label="Cargando conversaciones"/>:threads.error?<QueryErrorNotice error={threads.error} onRetry={threads.refetch} busy={threads.isFetching}/>:!threads.data?.rows.length?<CrmEmptyState>No hay conversaciones para este negocio.</CrmEmptyState>:<div className={styles.rows}>{threads.data.rows.map(row=><button key={`${row.leadId??'none'}-${row.channel}`} className={`${styles.row} ${(row.leadId??'none')===leadId&&row.channel===channel?styles.active:''}`} onClick={()=>selectThread(row)}><strong>{row.leadId?row.leadTitle:'General'}</strong><span className={styles.meta}>{inboxChannelLabel(row.channel)} · {inboxDateLabel(row.lastActivityAt)} · {row.messageCount} mensajes</span>{row.pendingCount>0&&<b className={styles.pending}>A revisar · {row.pendingCount}</b>}</button>)}</div>}
 </div>
 <div className={`${styles.pane} ${styles.detail} ${isVisible('detail')?'':styles.hidden}`}>
 {accountId?<InboxDetail key={`${accountId}-${leadId}-${channel}`} accountId={accountId} thread={selectedThread} channel={channel} accountName={accountName} message={message} back={searchActive?<Button variant="outline" onClick={backToResults}>← Volver a los resultados</Button>:backButton({lead:null,channel:null})}/>:<CrmEmptyState>Elegí una conversación para ver el detalle.</CrmEmptyState>}
 </div></section>}</main>
}
