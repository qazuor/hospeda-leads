import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowRightLeft,RefreshCw,Scale} from 'lucide-react';
import {toast} from 'sonner';
import {Badge} from './Badge';
import {Button} from './Button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from './Dialog';
import {QueryErrorNotice} from './QueryErrorNotice';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import {businessStatusLabels} from '../helpers/businessStatus';
import {executeBusinessReassignment,getBusinessReassignmentPreview} from '../endpoints/business_reassignment.schema';
import styles from '../pages/settings.module.css';

export function BusinessReassignment(){
 const client=useQueryClient();
 const [confirmOpen,setConfirmOpen]=useState(false);
 const preview=useQuery({queryKey:['business-reassignment-preview'],queryFn:getBusinessReassignmentPreview});
 const execute=useMutation({mutationFn:()=>executeBusinessReassignment(preview.data!.fingerprint),onSuccess:async result=>{
  setConfirmOpen(false);
  toast.success(result.moved?`Se reasignaron ${result.moved} negocios nuevos.`:'No había negocios para reasignar.');
  await Promise.all([client.invalidateQueries({queryKey:['business-reassignment-preview']}),client.invalidateQueries({queryKey:['leads']}),client.invalidateQueries({queryKey:['commercial']})]);
 }});
 const data=preview.data;
 const refresh=()=>{execute.reset();void preview.refetch();};
 return <section className={styles.content}>
  <article className={styles.card}>
   <div className={styles.cardTitle}><Scale/><div><h2>Redistribuir negocios nuevos</h2><p>Equilibra la carga total entre los usuarios vendedores. Solo cambia la persona responsable de negocios en estado Nuevo.</p></div></div>
   <div className={styles.reassignmentNotice}><strong>Qué se conserva</strong><p>Los negocios en cualquier otro estado, los de Papelera y los archivados mantienen su responsable y forman parte de la carga fija. Los fusionados tampoco cambian, aunque no se cuentan porque ya no son negocios canónicos. Las asignaciones de las gestiones tampoco cambian.</p></div>
   {preview.isPending?<QueryLoadingNotice/>:preview.error?<QueryErrorNotice error={preview.error} onRetry={refresh} busy={preview.isFetching}/>:data&&<>
    <div className={styles.reassignmentSummary}><Badge variant="outline">{data.eligibleCount.toLocaleString('es-AR')} negocios nuevos</Badge><Badge variant="outline">{data.moves.length.toLocaleString('es-AR')} cambiarían de responsable</Badge>{data.unassignedLocked>0&&<Badge variant="warning">{data.unassignedLocked.toLocaleString('es-AR')} fijos sin responsable</Badge>}</div>
    <div className={styles.reassignmentTableWrap}><table className={styles.reassignmentTable}><thead><tr><th>Usuario</th><th>Trabajo fijo</th><th>Nuevo actual</th><th>Nuevo después</th><th>Total actual</th><th>Total después</th></tr></thead><tbody>{data.users.map(user=><tr key={user.email}><th scope="row"><strong>{user.displayName}</strong><small>{user.email}</small></th><td>{user.locked.toLocaleString('es-AR')}<small>{Object.entries(user.lockedByStatus).map(([status,count])=>`${businessStatusLabels[status as keyof typeof businessStatusLabels]??status}: ${count}`).join(' · ')}{user.lockedDeleted?` · Papelera: ${user.lockedDeleted}`:''}</small></td><td>{user.newBefore.toLocaleString('es-AR')}</td><td><strong>{user.newAfter.toLocaleString('es-AR')}</strong></td><td>{user.before.toLocaleString('es-AR')}</td><td><strong>{user.after.toLocaleString('es-AR')}</strong></td></tr>)}</tbody></table></div>
    <p className={styles.reassignmentHelp}>“Trabajo fijo” agrupa por estado los negocios que no se pueden mover. Se prioriza en cada paso al usuario con menor total proyectado; la diferencia final depende también de las cargas fijas.</p>
    <div className={styles.reassignmentActions}><Button variant="outline" onClick={refresh} disabled={preview.isFetching||execute.isPending} disabledReason={(preview.isFetching || execute.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Completá los campos obligatorios o resolvé las condiciones indicadas en pantalla para habilitar esta acción."}><RefreshCw size={15}/>{preview.isFetching?'Actualizando…':'Actualizar vista previa'}</Button><Button onClick={()=>setConfirmOpen(true)} disabled={!data.moves.length||preview.isFetching||execute.isPending} disabledReason={(preview.isFetching || execute.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Completá los campos obligatorios o resolvé las condiciones indicadas en pantalla para habilitar esta acción."}><ArrowRightLeft size={16}/>Revisar y ejecutar</Button></div>
   </>}
   {execute.error&&<p role="alert" className={styles.error}>{execute.error.message}<Button variant="outline" size="sm" onClick={refresh}>Actualizar vista previa</Button></p>}
  </article>
  <Dialog open={confirmOpen} onOpenChange={open=>{if(!execute.isPending)setConfirmOpen(open)}}><DialogContent><DialogHeader><DialogTitle>¿Ejecutar esta redistribución?</DialogTitle><DialogDescription>Se cambiará el responsable de {data?.moves.length.toLocaleString('es-AR')} negocios en estado Nuevo. Los demás negocios conservarán su responsable. Esta acción se registrará en el historial de cada negocio.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={execute.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>setConfirmOpen(false)}>Volver a la vista previa</Button><Button disabled={execute.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>execute.mutate()}>{execute.isPending?'Redistribuyendo…':'Confirmar redistribución'}</Button></DialogFooter></DialogContent></Dialog>
 </section>;
}
