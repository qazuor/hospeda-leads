import { Table } from '@mantine/core';
import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, RotateCcw, Search, Trash2 } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/Dialog";
import { Input } from "../components/Input";
import { LeadDetailDialog } from "../components/LeadDetailDialog";
import { Skeleton } from "../components/Skeleton";
import { ValueBadge } from "../components/ValueBadge";
import { getTrashLeads } from "../endpoints/leads_trash_GET.schema";
import { getSettings } from "../endpoints/settings_GET.schema";
import { postLeadRestore } from "../endpoints/leads_restore_POST.schema";
import { postLeadHardDelete } from "../endpoints/leads_hard_delete_POST.schema";
import { useDebounce } from "../helpers/useDebounce";
import styles from "./trash.module.css";

export default function TrashPage(){
  const qc=useQueryClient();
  const [q,setQ]=useState(""),[page,setPage]=useState(1);
  const [hardTarget,setHardTarget]=useState<any|null>(null);
  const [bulkDeleteOpen,setBulkDeleteOpen]=useState(false);
  const [selectedIds,setSelectedIds]=useState<Set<string>>(new Set());
  const [selectedLead,setSelectedLead]=useState<any|null>(null),[viewOpen,setViewOpen]=useState(false);
  const debounced=useDebounce(q,300);
  const trash=useQuery({queryKey:["trash-leads",debounced,page],queryFn:()=>getTrashLeads({q:debounced||undefined,page,pageSize:50}),placeholderData:previous=>previous});
  const settings=useQuery({queryKey:["settings"],queryFn:getSettings});
  const refresh=async()=>Promise.all([qc.invalidateQueries({queryKey:["trash-leads"]}),qc.invalidateQueries({queryKey:["leads"]}),qc.invalidateQueries({queryKey:["lead-stats"]}),qc.invalidateQueries({queryKey:["analytics"]}),qc.invalidateQueries({queryKey:["global-journal"]}),qc.invalidateQueries({queryKey:["lead-journal"]})]);
  const restore=useMutation({mutationFn:postLeadRestore,onSuccess:refresh});
  const hardDelete=useMutation({mutationFn:postLeadHardDelete,onSuccess:refresh});
  const data=trash.data,rows=data?.rows??[];
  const openView=(lead:any)=>{setSelectedLead(lead);setViewOpen(true)};
  const togglePage=()=>{const ids=rows.map(lead=>String(lead.id)),all=ids.length>0&&ids.every(id=>selectedIds.has(id));setSelectedIds(prev=>{const next=new Set(prev);ids.forEach(id=>all?next.delete(id):next.add(id));return next})};
  const restoreSelected=async()=>{const ids=Array.from(selectedIds);for(const id of ids)await restore.mutateAsync({id});setSelectedIds(new Set())};
  const deleteSelected=async()=>{const ids=Array.from(selectedIds);for(const id of ids)await hardDelete.mutateAsync({id});setSelectedIds(new Set());setBulkDeleteOpen(false)};
  const deleteOne=async()=>{if(!hardTarget)return;await hardDelete.mutateAsync({id:String(hardTarget.id)});setHardTarget(null)};

  return <><AppHeader/><main className={styles.shell}>
    <header className={styles.pageHeader}><div><div className={styles.eyebrow}>ADMINISTRACIÓN</div><h1>Papelera</h1><p>Gestiones comerciales eliminados de forma reversible. Podés restaurarlos o borrarlos definitivamente.</p></div><Trash2 size={30}/></header>
    <section className={styles.toolbar}><div className={styles.search}><Search size={17}/><Input value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder="Buscar por nombre, contacto, email, ciudad o vertical…"/></div></section>
    {selectedIds.size>0&&<section className={styles.bulkBar}><strong>{selectedIds.size} seleccionados</strong><Button size="sm" variant="outline" onClick={restoreSelected} disabled={restore.isPending}><RotateCcw size={15}/>Restaurar</Button><Button size="sm" variant="destructive" onClick={()=>setBulkDeleteOpen(true)}><Trash2 size={15}/>Eliminar definitivamente</Button><Button size="sm" variant="ghost" onClick={()=>setSelectedIds(new Set())}>Cancelar selección</Button></section>}
    <section className={styles.card}>
      <div className={styles.meta}><strong>{(data?.total??0).toLocaleString("es-AR")} gestiones en papelera</strong><span>Página {page} de {Math.max(1,Math.ceil((data?.total??0)/50))}</span></div>
      {trash.isLoading?<div className={styles.loading}>{Array.from({length:8}).map((_,i)=><Skeleton key={i} className={styles.skeleton}/>)}</div>:trash.error?<div className={styles.error}>{trash.error.message}</div>:<div className={styles.scroller}><Table><thead><tr><th className={styles.selectCell}><Checkbox checked={rows.length>0&&rows.every(lead=>selectedIds.has(String(lead.id)))} onChange={togglePage}/></th><th>Gestión</th><th>Contacto</th><th>Ciudad</th><th>Vertical</th><th>Estado</th><th>Eliminado</th><th>Por</th><th>Acciones</th></tr></thead><tbody>
        {rows.map(lead=>{const id=String(lead.id);return <tr key={id} className={selectedIds.has(id)?styles.selectedRow:""} onDoubleClick={()=>openView(lead)}>
          <td className={styles.selectCell} onDoubleClick={e=>e.stopPropagation()}><Checkbox checked={selectedIds.has(id)} onChange={()=>setSelectedIds(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next})}/></td>
          <td><strong>{lead.nombre}</strong><small>#{id}</small></td><td><strong>{lead.contactName||"—"}</strong><small>{lead.email||lead.telefono||""}</small></td>
          <td>{lead.ciudad?<ValueBadge value={lead.ciudad} category="city"/>:"—"}</td><td>{lead.tipo?<ValueBadge value={lead.tipo} category="vertical"/>:"—"}</td><td>{lead.estado?<ValueBadge value={lead.estado} category="status"/>:"—"}</td>
          <td>{lead.deletedAt?new Date(lead.deletedAt).toLocaleString("es-AR"):"—"}</td><td><strong>{lead.deletedByName||"—"}</strong><small>{lead.deletedByEmail||""}</small></td>
          <td><div className={styles.actions}><Button size="sm" variant="ghost" onClick={()=>openView(lead)}><Eye size={15}/>Ver</Button><Button size="sm" variant="outline" onClick={()=>restore.mutate({id})} disabled={restore.isPending}><RotateCcw size={15}/>Restaurar</Button><Button size="sm" variant="destructive" onClick={()=>setHardTarget(lead)}><Trash2 size={15}/>Eliminar definitivamente</Button></div></td>
        </tr>})}
      </tbody></Table></div>}
      <div className={styles.pagination}><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</Button><span>{page} / {Math.max(1,Math.ceil((data?.total??0)/50))}</span><Button variant="outline" disabled={page>=Math.ceil((data?.total??0)/50)} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>
    </section>
    <LeadDetailDialog open={viewOpen} onOpenChange={setViewOpen} lead={selectedLead} users={settings.data?.users} readOnly/>
    <Dialog open={!!hardTarget} onOpenChange={open=>{if(!open&&!hardDelete.isPending)setHardTarget(null)}}><DialogContent className={styles.confirmDialog}><DialogHeader><DialogTitle>Eliminar definitivamente</DialogTitle><DialogDescription>Vas a borrar físicamente <strong>{hardTarget?.nombre}</strong>.</DialogDescription></DialogHeader><div className={styles.warning}><AlertTriangle size={21}/><span>Esta acción no se puede deshacer. Se eliminarán la gestión y sus notas. El journal de auditoría se conservará.</span></div><DialogFooter><Button variant="outline" onClick={()=>setHardTarget(null)} disabled={hardDelete.isPending}>Cancelar</Button><Button variant="destructive" onClick={deleteOne} disabled={hardDelete.isPending}>{hardDelete.isPending?"Eliminando…":"Eliminar definitivamente"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}><DialogContent className={styles.confirmDialog}><DialogHeader><DialogTitle>Eliminar {selectedIds.size} gestiones definitivamente</DialogTitle><DialogDescription>Vas a borrar físicamente todas las gestiones seleccionadas.</DialogDescription></DialogHeader><div className={styles.warning}><AlertTriangle size={21}/><span>Esta acción no se puede deshacer. Los journals de auditoría se conservarán.</span></div><DialogFooter><Button variant="outline" onClick={()=>setBulkDeleteOpen(false)} disabled={hardDelete.isPending}>Cancelar</Button><Button variant="destructive" onClick={deleteSelected} disabled={hardDelete.isPending}>{hardDelete.isPending?"Eliminando…":"Eliminar definitivamente"}</Button></DialogFooter></DialogContent></Dialog>
  </main></>;
}