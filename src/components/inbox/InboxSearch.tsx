import {useState} from 'react';
import {useInfiniteQuery} from '@tanstack/react-query';
import {searchInbox} from '../../endpoints/inbox.schema';
import {findSearchMatch} from '../../helpers/searchHighlight';
import {Button} from '../Button';
import {QueryErrorNotice} from '../QueryErrorNotice';
import {CrmEmptyState} from '../ui/CrmEmptyState';
import {CrmDateInput} from '../ui/CrmDateInput';
import {INBOX_CHANNELS,inboxChannelLabel,inboxDateLabel,type InboxChannel,type InboxPage,type InboxSearchRow} from './inboxTypes';
import styles from './Inbox.module.css';

/** Minimum trimmed length the server searches for (shorter terms return no rows). */
export const INBOX_SEARCH_MIN=3;

/** Highlights the first match of `query` in `snippet` with the server's equivalence: accents ignored, ñ distinct from n. */
export function HighlightedSnippet({snippet,query}:{snippet:string;query:string}){
 const match=findSearchMatch({text:snippet,query});
 if(!match)return <>{snippet}</>;
 return <>{snippet.slice(0,match.start)}<mark>{snippet.slice(match.start,match.end)}</mark>{snippet.slice(match.end)}</>;
}

/**
 * Results of the Bandeja search for an already debounced `term` (≥3 letters). Filters stay local; the count only covers
 * the rows loaded so far, because the API returns a cursor and no total.
 */
export function InboxSearch({term,admin,onOpen}:{term:string;admin:boolean;onOpen:(row:InboxSearchRow)=>void}){
 const [direction,setDirection]=useState<'all'|'in'|'out'>('all'),[channel,setChannel]=useState<InboxChannel|''>(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[scope,setScope]=useState<'mine'|'all'>('mine');
 const badRange=!!from&&!!to&&from>to;
 const params={q:term,direction,channel:channel||undefined,from:from||undefined,to:to||undefined,scope:admin?scope:undefined,limit:30};
 const search=useInfiniteQuery({queryKey:['inbox','search',params],queryFn:({pageParam})=>searchInbox({...params,cursor:pageParam}) as Promise<InboxPage<InboxSearchRow>>,initialPageParam:undefined as string|undefined,getNextPageParam:last=>last.nextCursor??undefined,enabled:term.length>=INBOX_SEARCH_MIN&&!badRange});
 const rows=search.data?.pages.flatMap(page=>page.rows)??[];
 const count=rows.length===1?'1 resultado':`${rows.length} resultados`;
 return <section className={`${styles.card} ${styles.searchResults}`} aria-label="Resultados de la búsqueda">
  <div className={styles.filters}>
   <label>Dirección<select value={direction} onChange={e=>setDirection(e.target.value as typeof direction)}><option value="all">Enviados y recibidos</option><option value="out">Enviados</option><option value="in">Recibidos</option></select></label>
   <label>Canal<select value={channel} onChange={e=>setChannel(e.target.value as InboxChannel|'')}><option value="">Todos los canales</option>{INBOX_CHANNELS.map(c=><option key={c} value={c}>{inboxChannelLabel(c)}</option>)}</select></label>
   <label>Fecha desde<CrmDateInput aria-label="Fecha desde" value={from} onValueChange={setFrom} clearable/></label>
   <label>Fecha hasta<CrmDateInput aria-label="Fecha hasta" value={to} onValueChange={setTo} clearable/></label>
   {admin&&<label>Responsable<select value={scope} onChange={e=>setScope(e.target.value as 'mine'|'all')}><option value="mine">Mis negocios</option><option value="all">Todos</option></select></label>}
  </div>
  {badRange?<p role="alert">La fecha desde no puede ser posterior a la fecha hasta.</p>:search.isPending?<div className={styles.skeleton} role="status" aria-label="Buscando"><i/><i/><i/></div>:search.error&&!rows.length?<QueryErrorNotice error={search.error} onRetry={search.refetch} busy={search.isFetching}/>:!rows.length?<CrmEmptyState>No encontramos mensajes con «{term}».</CrmEmptyState>:<>
   <p className={styles.searchCount} role="status">{search.hasNextPage?`${count} ${rows.length===1?'cargado':'cargados'}`:count}</p>
   <div className={styles.rows}>{rows.map(row=><button key={`${row.kind}-${row.id}`} className={styles.row} onClick={()=>onOpen(row)}>
    <strong>{row.accountName} · {row.leadId?row.leadTitle:'General'}</strong>
    <span className={styles.tags}><span className={styles.tag}>{inboxChannelLabel(row.channel)}</span><span className={styles.tag}>{row.kind==='in'?'Recibido':'Enviado'}</span><span className={styles.meta}>{inboxDateLabel(row.at)}</span></span>
    <span className={styles.snippet}><HighlightedSnippet snippet={row.snippet} query={term}/></span>
   </button>)}</div>
   {search.hasNextPage&&<Button variant="outline" disabled={search.isFetchingNextPage} disabledReason="Estamos cargando más resultados." onClick={()=>void search.fetchNextPage()}>{search.isFetchingNextPage?'Cargando…':'Cargar más'}</Button>}
   {search.isFetchNextPageError&&<p role="alert">No pudimos cargar más resultados. Probá de nuevo con «Cargar más».</p>}
  </>}
 </section>;
}
