import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw, Search, Trash2 } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/Dialog";
import { Input } from "../components/Input";
import { Skeleton } from "../components/Skeleton";
import { ValueBadge } from "../components/ValueBadge";
import { getTrashLeads } from "../endpoints/leads_trash_GET.schema";
import { postLeadRestore } from "../endpoints/leads_restore_POST.schema";
import { postLeadHardDelete } from "../endpoints/leads_hard_delete_POST.schema";
import { useDebounce } from "../helpers/useDebounce";
import styles from "./trash.module.css";

export default function TrashPage(){
  const qc=useQueryClient();
  const [q,setQ]=useState("");
  const [page,setPage]=useState(1);
  const [hardTarget,setHardTarget]=useState<any|null>(null);
  const debounced=useDebounce(q,300);
  const trash=useQuery({
    queryKey:["trash-leads",debounced,page],
    queryFn:()=>getTrashLeads({q:debounced||undefined,page,pageSize:50}),
    placeholderData:previous=>previous
  });
  const refresh=async()=>Promise.all([
    qc.invalidateQueries({queryKey:["trash-leads"]}),
    qc.invalidateQueries({queryKey:["leads"]}),
    qc.invalidateQueries({queryKey:["lead-stats"]}),
    qc.invalidateQueries({queryKey:["analytics"]}),
    qc.invalidateQueries({queryKey:["global-journal"]}),
    qc.invalidateQueries({queryKey:["lead-journal"]})
  ]);
  const restore=useMutation({mutationFn:postLeadRestore,onSuccess:refresh});
  const hardDelete=useMutation({mutationFn:postLeadHardDelete,onSuccess:async()=>{setHardTarget(null);await refresh()}});
  const data=trash.data;
  return <>
    <AppHeader/>
    <main className={styles.shell}>
      <header className={styles.pageHeader}>
        <div><div className={styles.eyebrow}>ADMINISTRACIÓN</div><h1>Papelera</h1><p>Leads eliminados de forma reversible. Desde acá podés restaurarlos o borrarlos definitivamente.</p></div>
        <Trash2 size={30}/>
      </header>
      <section className={styles.toolbar}>
        <div className={styles.search}><Search size={17}/><Input value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder="Buscar por nombre, contacto, email, ciudad o vertical…"/></div>
      </section>
      <section className={styles.card}>
        <div className={styles.meta}><strong>{(data?.total??0).toLocaleString("es-AR")} leads en papelera</strong><span>Página {page} de {Math.max(1,Math.ceil((data?.total??0)/50))}</span></div>
        {trash.isLoading?<div className={styles.loading}>{Array.from({length:8}).map((_,i)=><Skeleton key={i} className={styles.skeleton}/>)}</div>:trash.error?<div className={styles.error}>{trash.error.message}</div>:<div className={styles.scroller}><table><thead><tr><th>Lead</th><th>Contacto</th><th>Ciudad</th><th>Vertical</th><th>Estado</th><th>Eliminado</th><th>Por</th><th>Acciones</th></tr></thead><tbody>
          {(data?.rows??[]).map(lead=><tr key={String(lead.id)}>
            <td><strong>{lead.nombre}</strong><small>#{String(lead.id)}</small></td>
            <td><strong>{lead.contactName||"—"}</strong><small>{lead.email||lead.telefono||""}</small></td>
            <td>{lead.ciudad?<ValueBadge value={lead.ciudad} category="city"/>:"—"}</td>
            <td>{lead.tipo?<ValueBadge value={lead.tipo} category="vertical"/>:"—"}</td>
            <td>{lead.estado?<ValueBadge value={lead.estado} category="status"/>:"—"}</td>
            <td>{lead.deletedAt?new Date(lead.deletedAt).toLocaleString("es-AR"):"—"}</td>
            <td><strong>{lead.deletedByName||"—"}</strong><small>{lead.deletedByEmail||""}</small></td>
            <td><div className={styles.actions}><Button size="sm" variant="outline" onClick={()=>restore.mutate({id:String(lead.id)})} disabled={restore.isPending}><RotateCcw size={15}/>Restaurar</Button><Button size="sm" variant="destructive" onClick={()=>setHardTarget(lead)}><Trash2 size={15}/>Hard delete</Button></div></td>
          </tr>)}
        </tbody></table></div>}
        <div className={styles.pagination}><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</Button><span>{page} / {Math.max(1,Math.ceil((data?.total??0)/50))}</span><Button variant="outline" disabled={page>=Math.ceil((data?.total??0)/50)} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>
      </section>
      <Dialog open={!!hardTarget} onOpenChange={open=>{if(!open&&!hardDelete.isPending)setHardTarget(null)}}><DialogContent className={styles.confirmDialog}>
        <DialogHeader><DialogTitle>Eliminar definitivamente</DialogTitle><DialogDescription>Vas a borrar físicamente <strong>{hardTarget?.nombre}</strong>.</DialogDescription></DialogHeader>
        <div className={styles.warning}><AlertTriangle size={21}/><span>Esta acción no se puede deshacer. Se eliminarán el lead y sus notas. El journal de auditoría se conservará.</span></div>
        <DialogFooter><Button variant="outline" onClick={()=>setHardTarget(null)} disabled={hardDelete.isPending}>Cancelar</Button><Button variant="destructive" onClick={()=>hardTarget&&hardDelete.mutate({id:String(hardTarget.id)})} disabled={hardDelete.isPending}>{hardDelete.isPending?"Eliminando…":"Eliminar definitivamente"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </main>
  </>;
}