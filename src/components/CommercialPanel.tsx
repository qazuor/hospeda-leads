import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "./Button";
import { CommercialEditor, type EditorTarget } from "./CommercialEditor";
import { getCommercialDetail } from "../endpoints/commercial.schema";
import { formatDate, journalValue, dateOnlyInput } from "../helpers/crmDates";
import styles from "./Commercial.module.css";

const actionLabels:Record<string,string>={account_created:"Cuenta creada",account_updated:"Cuenta editada",converted_to_client:"Convertida a cliente",contact_created:"Contacto creado",contact_updated:"Contacto editado",contact_deleted:"Contacto dado de baja",contact_primary_changed:"Principal reemplazado",created:"Creada",updated:"Editada",inline_updated:"Cambio rápido",bulk_updated:"Edición masiva",note_added:"Nota agregada",email_sent:"Email enviado",contact_logged:"Contacto registrado",soft_deleted:"Enviada a papelera",restored:"Restaurada",hard_deleted:"Eliminada definitivamente"};
const fieldLabels:Record<string,string>={nombre:"Negocio",name:"Nombre",position:"Cargo",phone:"Teléfono",telefono:"Teléfono genérico",email:"Email",ciudad:"Ciudad",preferredChannel:"Canal preferido",isPrimary:"Principal",notes:"Notas",assignedUserEmail:"Responsable",commercialStatus:"Condición comercial",clientSince:"Cliente desde",deletedAt:"Fecha de baja",reason:"Motivo",opportunityName:"Oportunidad",primaryContactId:"Contacto principal",serviceInterest:"Servicio de interés",estimatedCloseDate:"Cierre estimado",tipo:"Vertical",subtipo:"Subtipo",commercialProfile:"Perfil comercial",estado:"Estado",suscripcion:"Suscripción",origen:"Origen",prioridad:"Prioridad",contactName:"Persona",medioContactoPreferido:"Canal preferido",resultadoUltimoContacto:"Resultado de contacto",fechaCreacion:"Fecha de creación",fechaUltimoContacto:"Último contacto",fechaProximaAccion:"Próxima acción",fuenteReferencia:"Fuente de referencia",clientePotencialRecurrente:"Potencial recurrente",archivoAdjunto:"Archivo adjunto",quienCargo:"Quién cargó",note:"Nota",contactId:"Contacto",channel:"Canal",result:"Resultado",recipient:"Destinatario",templateName:"Template",sender:"Remitente",subject:"Asunto",sitioWeb:"Sitio web",urlGmap:"Google Maps",perfilInstagram:"Instagram",perfilFacebook:"Facebook",perfilAirbnb:"Airbnb",perfilBooking:"Booking",perfilTurismoEntreRios:"Turismo Entre Ríos"};
const ignoredFields=new Set(["id","sourceLeadId","accountId","createdAt","updatedAt","paymentVerified","templateId","outboxId","messageId"]);
const valueLabel=(key:string,value:unknown)=>{
  if(value==null||value==="")return "Vacío";
  if(typeof value==="boolean")return value?"Sí":"No";
  if(key==="commercialStatus")return value==="client"?"Cliente comercial":"Prospecto";
  if(["clientSince","deletedAt","estimatedCloseDate"].includes(key))return formatDate(key==="estimatedCloseDate"?dateOnlyInput(value):String(value),key!=="estimatedCloseDate");
  return typeof value==="object"?JSON.stringify(value):journalValue(key,value);
};
function auditDetail(metadata:unknown){
  if(!metadata||typeof metadata!=="object"||Array.isArray(metadata))return "";
  const m=metadata as Record<string,unknown>;
  const before=(m.before&&typeof m.before==="object"?m.before:{}) as Record<string,unknown>;
  const after=(m.after&&typeof m.after==="object"?m.after:m) as Record<string,unknown>;
  return Object.entries(after).filter(([key,value])=>!ignoredFields.has(key)&&JSON.stringify(value)!==JSON.stringify(before[key]))
    .map(([key,value])=>`${fieldLabels[key]||key}: ${"before" in m?valueLabel(key,before[key])+" → ":""}${valueLabel(key,value)}`).join("\n");
}
export function CommercialPanel({accountId,leadId,compact=false,readOnly=false}:{accountId?:string;leadId?:string;compact?:boolean;readOnly?:boolean}){
  const q=useQuery({queryKey:["commercial-detail",accountId??"",leadId??""],queryFn:()=>getCommercialDetail(accountId,leadId)});
  const [editor,setEditor]=useState<EditorTarget|null>(null);
  if(q.isPending)return <p>Cargando cuenta…</p>;
  if(q.error)return <p role="alert" className={styles.error}>{q.error.message}</p>;
  const d=q.data;
  const contacts=d.contacts.filter(c=>!c.deletedAt);
  const opportunities=d.opportunities.filter(o=>!o.deletedAt);
  const history=[...d.journal.map(j=>({id:"c"+j.id,date:j.createdAt,actor:j.actorName,label:actionLabels[j.action]||j.action,detail:auditDetail(j.metadata)})),...d.leadJournal.map(j=>({id:"l"+j.id,date:j.createdAt,actor:j.actorName,label:`${d.opportunities.find(o=>String(o.id)===String(j.leadId))?.opportunityName||j.leadName} · ${actionLabels[j.action]||j.action}${j.fieldName?" · "+(fieldLabels[j.fieldName]||j.fieldName):""}`,detail:j.fieldName?`${valueLabel(j.fieldName,j.oldValue)} → ${valueLabel(j.fieldName,j.newValue)}`:auditDetail(j.metadata)}))].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  return <section className={styles.panel}>
    <div className={styles.heading}><div><h2>{compact?<Link to={"/accounts/"+d.account.id}>{d.account.nombre}</Link>:d.account.nombre}</h2><p className={styles.muted}>Negocio · datos compartidos por todas sus oportunidades</p><p>{d.account.commercialStatus==="client"?"Cliente comercial · no acredita pago":"Prospecto"}{d.account.clientSince?" · desde "+formatDate(d.account.clientSince):""}</p></div>
      {!readOnly&&<div className={styles.actions}><Button size="sm" variant="outline" onClick={()=>setEditor({kind:"account",item:d.account})}>Editar negocio</Button>{d.account.commercialStatus!=="client"&&<Button size="sm" onClick={()=>setEditor({kind:"convert"})}>Convertir a cliente</Button>}</div>}
    </div>
    {!compact&&<div className={styles.summary}><span>Ciudad: {d.account.ciudad||"Sin datos"}</span><span>Email genérico: {d.account.email||"Sin datos"}</span><span>Teléfono genérico: {d.account.telefono||"Sin datos"}</span><span>Responsable: {d.account.assignedUserEmail||"Sin asignar"}</span></div>}
    <div className={styles.heading}><h3>Personas de contacto ({contacts.length})</h3>{!readOnly&&<Button size="sm" variant="outline" onClick={()=>setEditor({kind:"contact"})}>Agregar contacto</Button>}</div>
    {!contacts.length&&<p>Sin personas identificadas. Los canales genéricos del negocio siguen disponibles.</p>}
    <div className={styles.rows}>{contacts.map(c=><article key={c.id}><div><strong>{c.name}{c.isPrimary?" · Principal":""}</strong><span>{[c.position,c.phone,c.email,c.preferredChannel].filter(Boolean).join(" · ")||"Sin canales cargados"}</span>{c.notes&&<p>{c.notes}</p>}</div>{!readOnly&&<div className={styles.actions}><Button size="sm" variant="ghost" onClick={()=>setEditor({kind:"contact",item:c})}>Editar</Button><Button size="sm" variant="ghost" onClick={()=>setEditor({kind:"delete_contact",item:c})}>Dar de baja</Button></div>}</article>)}</div>
    <p className={styles.muted}>Una oportunidad es una venta o contratación concreta: cada una tiene su propia etapa y seguimiento. {compact?"Este lead es una de ellas.":"Podés crear otra venta sin duplicar el negocio."}</p>
    <div className={styles.heading}><h3>Oportunidades ({opportunities.length})</h3>{!readOnly&&<Button size="sm" onClick={()=>setEditor({kind:"opportunity"})}>Nueva oportunidad</Button>}</div>
    <div className={styles.rows}>{opportunities.map(o=><article key={o.id}><div><Link to={"/?leadId="+o.id}><strong>{o.opportunityName||"Gestión comercial inicial"} · #{o.id}{String(o.id)===leadId?" · Actual":""}</strong></Link><span>{[o.tipo,o.estado,o.serviceInterest,o.assignedUserEmail].filter(Boolean).join(" · ")||"Sin clasificación"}</span><span>Contacto: {contacts.find(c=>String(c.id)===String(o.primaryContactId))?.name||"Sin principal"}{o.estimatedCloseDate?" · Cierre: "+formatDate(dateOnlyInput(o.estimatedCloseDate)):""}</span></div>{!readOnly&&<Button size="sm" variant="outline" onClick={()=>setEditor({kind:"opportunity",item:o})}>Editar oportunidad</Button>}</article>)}</div>
    {!compact&&<><h3>Historial comercial</h3><p className={styles.muted}>Incluye oportunidades en papelera y contactos dados de baja. Últimos 200 eventos de cada historial.</p><div className={styles.history}>{history.map(h=><details key={h.id}><summary>{formatDate(h.date,true)} · {h.label} · {h.actor}</summary><pre>{h.detail}</pre></details>)}</div></>}
    {editor&&<CommercialEditor key={editor.kind+("item" in editor?editor.item?.id??"new":"")} target={editor} detail={d} onClose={()=>setEditor(null)}/>}
  </section>;
}
