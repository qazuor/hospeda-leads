import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Skeleton } from "./Skeleton";
import { Textarea } from "./Textarea";
import { ValueBadge } from "./ValueBadge";
import { getLeadNotes } from "../endpoints/lead_notes_GET.schema";
import { postLeadNote } from "../endpoints/lead_notes_POST.schema";
import { getLeadJournal } from "../endpoints/lead_journal_GET.schema";
import styles from "./LeadDetailDialog.module.css";

const text=(v:unknown)=>v==null||v===""?"—":String(v);
const date=(v:unknown)=>v?new Date(v as string).toLocaleString("es-AR"):"—";
const Field=({label,value}:{label:string;value:React.ReactNode})=><div><span>{label}</span><strong>{value}</strong></div>;
const urlRow=(label:string,value:unknown)=>{
  const url=typeof value==="string"?value:"";
  return url?<a href={url} target="_blank" rel="noreferrer"><span>{label}</span><strong>{url}</strong><ExternalLink size={14}/></a>:null;
};
const actionLabel:Record<string,string>={
  created:"Creado",updated:"Editado",inline_updated:"Cambio rápido",note_added:"Nota agregada",bulk_assigned:"Asignación inicial",email_sent:"Email enviado",
  soft_deleted:"Enviado a papelera",restored:"Restaurado",hard_deleted:"Eliminado definitivamente",deleted:"Eliminado"
};
const fieldLabel:Record<string,string>={
  nombre:"Nombre",contactName:"Persona de contacto",tipo:"Vertical",subtipo:"Subtipo",commercialProfile:"Perfil comercial",ciudad:"Ciudad",
  estado:"Estado",suscripcion:"Suscripción",email:"Email",telefono:"Teléfono",sitioWeb:"Sitio web",
  urlGmap:"Google Maps",perfilInstagram:"Instagram",perfilFacebook:"Facebook",perfilAirbnb:"Airbnb",
  perfilBooking:"Booking",perfilTurismoEntreRios:"Turismo Entre Ríos",origen:"Origen",quienCargo:"Quién cargó",
  asignadoA:"Responsable",assignedUserEmail:"Asignado a usuario",fechaCreacion:"Fecha creación",fechaUltimoContacto:"Último contacto",
  medioContactoPreferido:"Medio preferido",resultadoUltimoContacto:"Resultado último contacto",
  prioridad:"Prioridad",fechaProximaAccion:"Próxima acción",fuenteReferencia:"Fuente de referencia",
  clientePotencialRecurrente:"Potencial recurrente",archivoAdjunto:"Archivo adjunto",note:"Nota"
};

export const LeadDetailDialog=({
  open,onOpenChange,lead,users,onEdit,onDelete,onWhatsApp,onEmail,readOnly=false
}:{
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  lead:any|null;
  users?:{id:number;email:string;displayName:string;role:"admin"|"user"}[];
  onEdit?:(lead:any)=>void;
  onDelete?:(lead:any)=>void;
  onWhatsApp?:(lead:any)=>void;
  onEmail?:(lead:any)=>void;
  readOnly?:boolean;
})=>{
  const qc=useQueryClient();
  const [note,setNote]=useState("");
  const notesQ=useQuery({
    queryKey:["lead-notes",String(lead?.id??"")],
    queryFn:()=>getLeadNotes({leadId:String(lead!.id)}),
    enabled:open&&!!lead?.id
  });
  const journalQ=useQuery({
    queryKey:["lead-journal",String(lead?.id??"")],
    queryFn:()=>getLeadJournal({leadId:String(lead!.id),page:1,pageSize:100}),
    enabled:open&&!!lead?.id
  });
  const noteM=useMutation({
    mutationFn:postLeadNote,
    onSuccess:async()=>{
      setNote("");
      await Promise.all([
        qc.invalidateQueries({queryKey:["lead-notes",String(lead?.id??"")]}),
        qc.invalidateQueries({queryKey:["lead-journal",String(lead?.id??"")]}),
        qc.invalidateQueries({queryKey:["global-journal"]})
      ]);
    }
  });
  if(!lead)return null;
  const assignedUser=users?.find(user=>user.email===lead.assignedUserEmail);

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={styles.dialog}>
    <DialogHeader>
      <div className={styles.titleRow}>
        <div>
          <DialogTitle>{lead.nombre}</DialogTitle>
          <DialogDescription>
            {lead.contactName?lead.contactName+" · ":""}{lead.tipo||"Sin vertical"}{lead.subtipo?" · "+lead.subtipo:""}
          </DialogDescription>
        </div>
        {lead.estado?<ValueBadge value={lead.estado} category="status"/>:<Badge variant="outline">Sin estado</Badge>}
      </div>
    </DialogHeader>

    <div className={styles.actions}>
      {!readOnly&&lead.telefono&&onWhatsApp&&<Button variant="outline" onClick={()=>onWhatsApp(lead)}><MessageCircle size={16}/>WhatsApp</Button>}
      {!readOnly&&lead.telefono&&<Button variant="outline" asChild><a href={"tel:"+lead.telefono}><Phone size={16}/>Llamar</a></Button>}
      {!readOnly&&lead.email&&onEmail&&<Button variant="outline" onClick={()=>onEmail(lead)}><Mail size={16}/>Email</Button>}
      {lead.urlGmap&&<Button variant="outline" asChild><a href={lead.urlGmap} target="_blank" rel="noreferrer"><MapPin size={16}/>Mapa</a></Button>}
    </div>

    <div className={styles.grid}>
      <section>
        <h3>Contacto</h3>
        <div className={styles.group}>
          <Field label="Persona de contacto" value={text(lead.contactName)}/>
          <Field label="Teléfono" value={text(lead.telefono)}/>
          <Field label="Email" value={text(lead.email)}/>
          <Field label="Medio preferido" value={text(lead.medioContactoPreferido)}/>
          <Field label="Ciudad" value={lead.ciudad?<ValueBadge value={lead.ciudad} category="city"/>:"—"}/>
          <Field label="Potencial recurrente" value={lead.clientePotencialRecurrente?"Sí":"No"}/>
        </div>
      </section>

      <section>
        <h3>Clasificación comercial</h3>
        <div className={styles.group}>
          <Field label="Vertical" value={lead.tipo?<ValueBadge value={lead.tipo} category="vertical"/>:"—"}/>
          <Field label="Subtipo" value={lead.subtipo?<ValueBadge value={lead.subtipo} category="subtype"/>:"—"}/>
          <Field label="Perfil comercial" value={lead.commercialProfile?<ValueBadge value={lead.commercialProfile} category="profile"/>:"—"}/>
          <Field label="Estado" value={lead.estado?<ValueBadge value={lead.estado} category="status"/>:"—"}/>
          <Field label="Prioridad" value={lead.prioridad?<ValueBadge value={lead.prioridad} category="priority"/>:"—"}/>
          <Field label="Suscripción" value={text(lead.suscripcion)}/>
          <Field label="Origen" value={text(lead.origen)}/>
        </div>
      </section>

      <section>
        <h3>Seguimiento</h3>
        <div className={styles.group}>
          <Field label="Fecha creación" value={date(lead.fechaCreacion)}/>
          <Field label="Último contacto" value={date(lead.fechaUltimoContacto)}/>
          <Field label="Próxima acción" value={date(lead.fechaProximaAccion)}/>
          <Field label="Resultado último contacto" value={text(lead.resultadoUltimoContacto)}/>
          <div className={styles.full}><span>Fuente de referencia</span><strong>{text(lead.fuenteReferencia)}</strong></div>
        </div>
      </section>

      <section>
        <h3>Gestión interna</h3>
        <div className={styles.group}>
          <Field label="Responsable" value={lead.asignadoA?<ValueBadge value={lead.asignadoA} category="person"/>:"—"}/>
          <Field label="Asignado a usuario" value={lead.assignedUserEmail?<ValueBadge value={assignedUser?.displayName||lead.assignedUserEmail} category="person"/>:"—"}/>
          <Field label="Quién cargó" value={lead.quienCargo?<ValueBadge value={lead.quienCargo} category="person"/>:"—"}/>
          <Field label="Creado por" value={text(lead.creadoPor)}/>
          <Field label="Creado en sistema" value={date(lead.createdAt)}/>
          <Field label="Última actualización" value={date(lead.updatedAt)}/>
          <Field label="ID" value={text(lead.id)}/>
          <div className={styles.full}><span>Archivo adjunto</span><strong>{text(lead.archivoAdjunto)}</strong></div>
        </div>
      </section>

      {lead.deletedAt&&<section>
        <h3>Papelera</h3>
        <div className={styles.group}>
          <Field label="Eliminado" value={date(lead.deletedAt)}/>
          <Field label="Eliminado por" value={text(lead.deletedByName)}/>
          <div className={styles.full}><span>Email del usuario</span><strong>{text(lead.deletedByEmail)}</strong></div>
        </div>
      </section>}
    </div>

    <section className={styles.links}>
      <h3>Links y perfiles</h3>
      {urlRow("Sitio web",lead.sitioWeb)}
      {urlRow("Google Maps",lead.urlGmap)}
      {urlRow("Instagram",lead.perfilInstagram)}
      {urlRow("Facebook",lead.perfilFacebook)}
      {urlRow("Airbnb",lead.perfilAirbnb)}
      {urlRow("Booking",lead.perfilBooking)}
      {urlRow("Turismo Entre Ríos",lead.perfilTurismoEntreRios)}
      {!lead.sitioWeb&&!lead.urlGmap&&!lead.perfilInstagram&&!lead.perfilFacebook&&!lead.perfilAirbnb&&!lead.perfilBooking&&!lead.perfilTurismoEntreRios?<p>Sin links cargados.</p>:null}
    </section>

    <section className={styles.notes}>
      <h3>Historial de notas</h3>
      {!readOnly&&<div className={styles.newNote}>
        <Textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Agregar una nueva nota…"/>
        <Button onClick={()=>noteM.mutate({leadId:String(lead.id),note})} disabled={!note.trim()||noteM.isPending}><Plus size={16}/>Agregar nota</Button>
      </div>}
      {notesQ.isLoading?<Skeleton className={styles.notesLoading}/>:<div className={styles.timeline}>
        {(notesQ.data?.notes??[]).length===0?<p>Sin notas todavía.</p>:(notesQ.data?.notes??[]).map(n=><article key={n.id}>
          <div><strong>{n.author||"Sin autor"}</strong><time>{date(n.createdAt)}</time></div>
          <p>{n.note}</p>
        </article>)}
      </div>}
    </section>

    <section className={styles.journal}>
      <h3>Journal de cambios</h3>
      <p className={styles.sectionHint}>Cambios registrados desde la activación del journal.</p>
      {journalQ.isLoading?<Skeleton className={styles.notesLoading}/>:journalQ.error?<p className={styles.journalError}>{journalQ.error.message}</p>:<div className={styles.journalList}>
        {(journalQ.data?.rows??[]).length===0?<p>Sin cambios registrados todavía.</p>:(journalQ.data?.rows??[]).map(entry=><article key={entry.id}>
          <div className={styles.journalHead}><div><Badge variant={entry.action==="created"||entry.action==="restored"?"success":["deleted","soft_deleted","hard_deleted"].includes(entry.action)?"destructive":"outline"}>{actionLabel[entry.action]??entry.action}</Badge><strong>{entry.fieldName?fieldLabel[entry.fieldName]??entry.fieldName:""}</strong></div><time>{date(entry.createdAt)}</time></div>
          <div className={styles.journalActor}>{entry.actorName}{entry.actorEmail?" · "+entry.actorEmail:""}</div>
          {entry.fieldName&&<div className={styles.journalValues}><span><small>Anterior</small>{text(entry.oldValue)}</span><span><small>Nuevo</small>{text(entry.newValue)}</span></div>}
        </article>)}
      </div>}
    </section>

    <DialogFooter>
      {!readOnly&&onDelete&&<Button variant="destructive" onClick={()=>onDelete(lead)}><Trash2 size={16}/>Enviar a papelera</Button>}
      <div className={styles.grow}/>
      <Button variant="outline" onClick={()=>onOpenChange(false)}>Cerrar</Button>
      {!readOnly&&onEdit&&<Button onClick={()=>{onOpenChange(false);onEdit(lead)}}><Pencil size={16}/>Editar lead</Button>}
    </DialogFooter>
  </DialogContent></Dialog>;
};
