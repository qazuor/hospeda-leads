import React,{useState,useRef} from 'react';
import {Table} from '@mantine/core';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {RotateCcw} from 'lucide-react';
import {commercialRequest,saveCommercial,type CommercialList,type Account} from '../endpoints/commercial.schema';
import {useDebounce} from '../helpers/useDebounce';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {Input} from './Input';
import {Button} from './Button';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogFooter} from './Dialog';
import {QueryErrorNotice} from './QueryErrorNotice';
import {CrmEmptyState} from './ui/CrmEmptyState';
import {crmSuccess} from '../helpers/crmFeedback';
import styles from '../pages/trash.module.css';
export function BusinessTrashPanel(){
 const qc=useQueryClient(),lock=useRef(false);
 const [q,setQ]=useState(''),[page,setPage]=useState(1),[target,setTarget]=useState<Account|null>(null);
 const query=useDebounce(q,250);
 const trash=useQuery({queryKey:['trash-businesses',query,page],queryFn:()=>commercialRequest<CommercialList>('commercial?'+new URLSearchParams({deleted:'true',q:query,page:String(page)}))});
 const restore=useGuardedMutation({mutationFn:saveCommercial});
 async function confirm(){if(!target||lock.current)return;lock.current=true;try{await restore.mutateAsync({action:'account_trash',accountIds:[String(target.id)],deleted:false,reason:'Restauración desde Papelera'});const old=target;setTarget(null);await Promise.all(['trash-businesses','commercial','leads','lead-stats','work','crm-search'].map(key=>qc.invalidateQueries({queryKey:[key]})));crmSuccess(old.archivedAt?'Negocio restaurado en Archivados':'Negocio restaurado',{label:old.archivedAt?'Ver archivados':'Ver negocio',href:old.archivedAt?'/archived':'/accounts/'+old.id});}catch{/* Keep the dialog and its error available for retry. */}finally{lock.current=false;}}
 return <><p className={styles.description}>Negocios mal cargados o que no corresponden al CRM. Restaurarlos conserva sus contactos, gestiones e historial. Los negocios válidos que dejaste de trabajar están en <Link to="/archived">Archivados</Link>.</p>
 <section className={styles.toolbar}><Input aria-label="Buscar negocios en papelera" placeholder="Buscar por nombre, ciudad o email…" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></section>
 {trash.error?<QueryErrorNotice error={trash.error} onRetry={trash.refetch} busy={trash.isFetching}/>:trash.isPending?<p role="status">Cargando negocios eliminados…</p>:<section className={styles.card}><div className={styles.meta}><strong>{trash.data.total} negocios en papelera</strong><span>Página {page}</span></div>{!trash.data.rows.length?<CrmEmptyState>No hay negocios en papelera.</CrmEmptyState>:<div className={styles.scroller}><Table><thead><tr><th>Negocio</th><th>Ciudad</th><th>Motivo</th><th>Eliminado</th><th>Por</th><th>Acciones</th></tr></thead><tbody>{trash.data.rows.map(account=><tr key={String(account.id)}><td><strong>{account.nombre}</strong><small>{account.opportunityCount} gestiones · {account.contactCount} contactos conservados</small></td><td>{account.ciudad||'—'}</td><td>{account.deletionReason||'—'}</td><td>{account.deletedAt?new Date(account.deletedAt).toLocaleString('es-AR'):'—'}</td><td>{account.deletedByEmail||'—'}</td><td><Button variant="ghost" size="sm" onClick={()=>{restore.reset();setTarget(account);}}><RotateCcw size={15}/>Restaurar</Button></td></tr>)}</tbody></Table></div>}<div className={styles.actions}><Button variant="ghost" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><Button variant="ghost" disabled={page*50>=trash.data.total} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div></section>}
 <Dialog open={!!target} onOpenChange={open=>{if(!open&&!restore.isPending)setTarget(null);}}><DialogContent><DialogTitle>Restaurar negocio</DialogTitle><DialogDescription>{target?.nombre}. {target?.archivedAt?'Volverá a Archivados; conservamos su estado anterior.':'Volverá al listado de negocios.'} Sus gestiones y contactos mantienen su estado anterior. Los seguimientos automáticos detenidos no se reinician.</DialogDescription>{restore.error&&<p role="alert">{restore.error.message}</p>}<DialogFooter><Button variant="ghost" disabled={restore.isPending} onClick={()=>setTarget(null)}>Cancelar</Button><Button disabled={restore.isPending} onClick={confirm}>{restore.isPending?'Restaurando…':'Restaurar negocio'}</Button></DialogFooter></DialogContent></Dialog></>;
}
