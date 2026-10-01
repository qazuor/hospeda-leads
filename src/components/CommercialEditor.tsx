import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./Dialog";
import { Button } from "./Button";
import { getSettings } from "../endpoints/settings_GET.schema";
import { saveCommercial, type Account, type Contact, type Opportunity, type CommercialDetail } from "../endpoints/commercial.schema";
import { useAuth } from "../helpers/useAuth";
import { dateOnlyInput } from "../helpers/crmDates";
import styles from "./Commercial.module.css";

export type EditorTarget={kind:"account";item?:Account}|{kind:"contact";item?:Contact}|{kind:"opportunity";item?:Opportunity}|{kind:"convert"}|{kind:"delete_contact";item:Contact};
const accountFields=[['nombre','Negocio'],['ciudad','Ciudad'],['telefono','Teléfono genérico'],['email','Email genérico'],['sitioWeb','Sitio web'],['urlGmap','Google Maps'],['perfilInstagram','Instagram'],['perfilFacebook','Facebook'],['perfilAirbnb','Airbnb'],['perfilBooking','Booking'],['perfilTurismoEntreRios','Turismo Entre Ríos']];
const contactFields=[['name','Nombre de la persona'],['position','Cargo'],['phone','Teléfono'],['email','Email'],['preferredChannel','Canal preferido'],['notes','Notas']];
const opportunityFields=[['opportunityName','Nombre de oportunidad'],['serviceInterest','Servicio de interés'],['estimatedCloseDate','Cierre estimado']];
const titles={account:"Datos del negocio",contact:"Persona de contacto",opportunity:"Oportunidad comercial",convert:"Convertir a cliente",delete_contact:"Dar de baja al contacto"};
export function CommercialEditor({target,detail,onClose,onSaved}:{target:EditorTarget;detail?:CommercialDetail;onClose:()=>void;onSaved?:(id:string)=>void}){
  const {authState}=useAuth();
  const admin=authState.type==="authenticated"&&authState.user.role==="admin";
  const qc=useQueryClient();
  const settings=useQuery({queryKey:["settings"],queryFn:getSettings});
  const [draft,setDraft]=useState<Record<string,string>>(()=>{
    const item="item" in target?target.item:undefined;
    const entries=item?Object.entries(item).map(([k,v])=>[k,v==null?"":String(v)]):[];
    const initial=Object.fromEntries(entries);
    if(target.kind==="opportunity"){
      initial.opportunityName=target.item?.opportunityName||target.item?.nombre||"";
      initial.estimatedCloseDate=dateOnlyInput(target.item?.estimatedCloseDate);
      initial.estado=target.item?.estado||detail?.stages[0]||"";
    }
    return initial;
  });
  const [primary,setPrimary]=useState(target.kind==="contact"?(target.item?.isPrimary??!detail?.contacts.some(c=>c.isPrimary&&!c.deletedAt)):false);
  const [error,setError]=useState("");
  const mutation=useMutation({mutationFn:saveCommercial,onSuccess:async result=>{
    await Promise.all(["commercial","commercial-detail","leads","lead-stats","lead-journal","global-journal","analytics"].map(key=>qc.invalidateQueries({queryKey:[key]})));
    onSaved?.(result.id);onClose();
  }});
  const field=(key:string,label:string)=> <label key={key}>{label}{key==="notes"||key==="reason"?<textarea rows={3} value={draft[key]||""} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/>:<input type={key==="estimatedCloseDate"?"date":"text"} inputMode={key==="email"?"email":undefined} required={["nombre","name","opportunityName"].includes(key)} value={draft[key]||""} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/>}</label>;
  const select=(key:string,label:string,options:{value:string;label:string}[])=> <label>{label}<select value={draft[key]||""} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}><option value="">Sin asignar</option>{draft[key]&&!options.some(o=>o.value===draft[key])&&<option value={draft[key]}>{draft[key]} (histórico)</option>}{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
  const submit=(event:React.FormEvent)=>{
    event.preventDefault();setError("");
    const accountId=String(detail?.account.id??"");
    const textFields=(fields:string[][])=>Object.fromEntries(fields.map(([k])=>[k,draft[k]||null]));
    try{
      if(target.kind==="account")mutation.mutate({action:"account_save",...textFields(accountFields),nombre:draft.nombre,id:target.item?String(target.item.id):undefined,...(admin?{assignedUserEmail:draft.assignedUserEmail||null}:{})});
      if(target.kind==="contact")mutation.mutate({action:"contact_save",...textFields(contactFields),accountId,id:target.item?String(target.item.id):undefined,name:draft.name,isPrimary:primary});
      if(target.kind==="opportunity")mutation.mutate({action:"opportunity_save",accountId,id:target.item?String(target.item.id):undefined,opportunityName:draft.opportunityName,tipo:draft.tipo||null,estado:draft.estado||null,primaryContactId:draft.primaryContactId||null,serviceInterest:draft.serviceInterest||null,estimatedCloseDate:draft.estimatedCloseDate||null,...(admin?{assignedUserEmail:draft.assignedUserEmail||null}:{})});
      if(target.kind==="convert")mutation.mutate({action:"convert_client",accountId,reason:draft.reason||""});
      if(target.kind==="delete_contact")mutation.mutate({action:"contact_delete",accountId,id:String(target.item.id)});
    }catch(e){setError(e instanceof Error?e.message:"Datos inválidos")}
  };
  return <Dialog open onOpenChange={open=>{if(!open&&!mutation.isPending)onClose()}}><DialogContent className={styles.editor}>
    <DialogTitle>{titles[target.kind]}</DialogTitle><DialogDescription>{target.kind==="convert"?"Esta condición comercial no acredita ningún pago. El historial se conserva.":target.kind==="delete_contact"?"Conservaremos el historial. Se quitará como contacto principal de las oportunidades.":target.kind==="account"?"Los datos generales se comparten con todas las oportunidades de esta cuenta. Los cambios quedan registrados.":target.kind==="opportunity"?"Una oportunidad es una venta o contratación concreta. Su etapa, responsable y seguimiento son independientes de las otras ventas del negocio.":"Cada persona tiene sus propios datos. Los teléfonos y emails genéricos del negocio se editan por separado."}</DialogDescription>
    <form onSubmit={submit} className={styles.form}>
      {(target.kind==="account"?accountFields:target.kind==="contact"?contactFields:target.kind==="opportunity"?opportunityFields:[]).map(([key,label])=>key==="position"||key==="preferredChannel"?select(key,label,(key==="position"?settings.data?.contactPositions:settings.data?.contactChannels)?.map(value=>({value,label:value}))??[]):field(key,label))}
      {target.kind==="contact"&&<label className={styles.checkbox}><input type="checkbox" checked={primary} onChange={e=>setPrimary(e.target.checked)}/>Principal de la cuenta (reemplaza al anterior)</label>}
      {target.kind==="opportunity"&&<>
        {select("tipo","Vertical",(settings.data?.types??[]).map(value=>({value,label:value})))}
        {select("estado","Estado / etapa",(detail?.stages??[]).map(value=>({value,label:value})))}
        {select("primaryContactId","Contacto principal de oportunidad",(detail?.contacts??[]).filter(c=>!c.deletedAt).map(c=>({value:String(c.id),label:c.name})))}
      </>}
      {admin&&(target.kind==="account"||target.kind==="opportunity")&&select("assignedUserEmail","Responsable",(settings.data?.users??[]).map(u=>({value:u.email,label:u.displayName})))}
      {target.kind==="convert"&&field("reason","Motivo de conversión")}
      {target.kind==="delete_contact"&&<p>{target.item.name}</p>}
      {(error||mutation.error)&&<p role="alert" className={styles.error}>{error||mutation.error?.message}</p>}
      <div className={styles.actions}><Button variant="ghost" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending?"Guardando…":target.kind==="delete_contact"?"Confirmar baja":target.kind==="convert"?"Convertir a cliente":"Guardar"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
