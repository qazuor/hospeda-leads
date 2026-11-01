import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {apiJson,postJson} from '../helpers/apiClient';
import {RESCAN_CLIENT_TIMEOUT_MS,rescanNotice,type RescanResult,type UnmatchedChannel,type UnmatchedList,type UnmatchedView} from '../helpers/inboundUnmatchedShared';
import {Button} from './Button';
import {InboundUnmatchedCard} from './InboundUnmatchedCard';
import {QueryErrorNotice} from './QueryErrorNotice';

/** Spec 103 D1–D5: conversations without a business, «Descartados», the channel filter and «Volver a buscar negocios». Admin only (server). */
export function InboundUnmatchedPanel(){
 const qc=useQueryClient(),[view,setView]=useState<UnmatchedView>('unmatched'),[channel,setChannel]=useState<UnmatchedChannel>('all');
 const list=useQuery({queryKey:['communication','inbound-unmatched',view,channel],queryFn:()=>apiJson<UnmatchedList>(`/_api/inbound/unmatched?view=${view}&channel=${channel}`)});
 const rescan=useMutation({mutationFn:()=>postJson<RescanResult>('/_api/inbound/unmatched/rescan',{},{timeoutMs:RESCAN_CLIENT_TIMEOUT_MS}),onSuccess:r=>{toast.success(rescanNotice(r));void qc.invalidateQueries({queryKey:['communication']});}});
 const total=list.data?.total??0,prefix=list.data?.totalAtLeast?'Más de ':'',count=view==='dismissed'?`${prefix}${total} ${total===1&&!prefix?'conversación descartada':'conversaciones descartadas'}`:`${prefix}${total} ${total===1&&!prefix?'conversación sin asociar':'conversaciones sin asociar'}`;
 return <section><h2>Mensajes sin asociar</h2><p>Asociá cada conversación de email o Instagram con el negocio correcto para que quede disponible en Comunicación.</p>
  <div><label>Ver<select value={view} onChange={e=>setView(e.target.value as UnmatchedView)}><option value="unmatched">Sin asociar</option><option value="dismissed">Descartados</option></select></label> <label>Canal<select value={channel} onChange={e=>setChannel(e.target.value as UnmatchedChannel)}><option value="all">Todos</option><option value="email">Email</option><option value="instagram">Instagram</option></select></label>{' '}
   {view==='unmatched'&&<Button variant="secondary" disabled={rescan.isPending} disabledReason="La búsqueda está en curso. Esperá a que termine." onClick={()=>{if(!rescan.isPending)rescan.mutate();}}>{rescan.isPending?'Buscando negocios…':'Volver a buscar negocios'}</Button>}</div>
  {rescan.data&&!rescan.isPending&&<p role="status">{rescanNotice(rescan.data)}</p>}{rescan.error&&!rescan.isPending&&<p role="alert">{(rescan.error as Error).message}</p>}
  {list.error&&<QueryErrorNotice error={list.error} onRetry={list.refetch} busy={list.isFetching}/>}
  {list.isPending?<p role="status">Cargando mensajes…</p>:!list.data?.groups.length?<p>{view==='dismissed'?'No hay mensajes descartados.':'No hay mensajes sin asociar.'}</p>:<><p>{count}{list.data.truncated?` · mostrando las ${list.data.groups.length} más recientes${view==='unmatched'?', primero las que tienen un negocio sugerido':''}`:''}</p>{list.data.groups.map(g=><InboundUnmatchedCard key={g.key+view} group={g} view={view}/>)}</>}
 </section>;
}
