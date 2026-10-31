import {useQuery} from '@tanstack/react-query';
import {apiJson} from '../helpers/apiClient';
import {InboundUnmatchedCard,type InboundUnmatchedRow} from './InboundUnmatchedCard';
import {QueryErrorNotice} from './QueryErrorNotice';

export function InboundUnmatchedPanel(){
 const list=useQuery({queryKey:['communication','inbound-unmatched'],queryFn:()=>apiJson<{rows:InboundUnmatchedRow[]}>('/_api/inbound/unmatched')});
 return <section><h2>Mensajes sin asociar</h2><p>Asociá cada email o mensaje de Instagram con el negocio correcto para que quede disponible en Comunicación.</p>{list.error&&<QueryErrorNotice error={list.error} onRetry={list.refetch} busy={list.isFetching}/>}{list.isPending?<p role="status">Cargando mensajes…</p>:!list.data?.rows.length?<p>No hay mensajes sin asociar.</p>:list.data.rows.map(row=><InboundUnmatchedCard key={row.id} row={row}/>)}</section>;
}
