import { Disclosure, DisclosureSummary } from './Disclosure';
import { Textarea } from './Textarea';
import { Input } from './Input';
import { NativeSelect } from './NativeSelect';
import { Checkbox } from './Checkbox';
import {useUnsavedChanges} from "./UnsavedChanges";
import React, { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./Dialog";
import { Button } from "./Button";
import { getSettings } from "../endpoints/settings_GET.schema";
import { saveCommercial, type Account, type Contact, type Opportunity, type CommercialDetail } from "../endpoints/commercial.schema";
import { useAuth } from "../helpers/useAuth";
import { dateOnlyInput } from "../helpers/crmDates";
import {crmSuccess} from '../helpers/crmFeedback';
import styles from "./Commercial.module.css";

export type EditorTarget={kind:"account";item?:Account}|{kind:"contact";item?:Contact}|{kind:"opportunity";item?:Opportunity}|{kind:"convert"}|{kind:"archive"}|{kind:"delete_contact";item:Contact};
const accountFields=[['nombre','Negocio'],['ciudad','Ciudad'],['telefono','Teléfono genérico'],['email','Email genérico'],['sitioWeb','Sitio web'],['urlGmap','Google Maps'],['perfilInstagram','Instagram'],['perfilFacebook','Facebook'],['perfilAirbnb','Airbnb'],['perfilBooking','Booking'],['perfilTurismoEntreRios','Turismo Entre Ríos']];
const researchFields=[['provincia','Provincia'],['direccion','Dirección'],['whatsapp','WhatsApp comercial'],['discoverySource','Fuente de descubrimiento'],['verificationUrls','URLs de verificación'],['verifiedOn','Fecha de verificación'],['businessNotes','Notas del negocio']];
const contactFields=[['name','Nombre de la persona'],['position','Cargo'],['phone','Teléfono'],['email','Email'],['preferredChannel','Canal preferido'],['notes','Notas']];
const opportunityFields=[['opportunityName','Nombre de la gestión'],['serviceInterest','Propuesta (opcional)'],['estimatedCloseDate','Cierre estimado']];
const titles={account:"Datos del negocio",contact:"Persona de contacto",opportunity:"Preparar gestión",archive:"Archivar negocio",convert:"Convertir a cliente",delete_contact:"Dar de baja al contacto"};
export function CommercialEditor({target,detail,onClose,onSaved}:{target:EditorTarget;detail?:CommercialDetail;onClose:()=>void;onSaved?:(id:string)=>void}){
  const {authState}=useAuth();
  const admin=authState.type==="authenticated"&&authState.user.role==="admin";
  const qc=useQueryClient();
  const settings=useQuery({queryKey:["settings"],queryFn:getSettings});
  const [draft,setDraft]=useState<Record<string,string>>(()=>{
    const item="item" in target?target.item:undefined;
    const entries=item?Object.entries(item).map(([k,v])=>[k,v==null?"":String(v)]):[];
    const initial=Object.fromEntries(entries);
    if(target.kind==="account"&&!target.item)initial.assignedUserEmail=authState.type==="authenticated"?authState.user.email:"";
    if(target.kind==="opportunity"){
      initial.opportunityName=target.item?.opportunityName||"Presentación de Hospeda";
      initial.estimatedCloseDate=dateOnlyInput(target.item?.estimatedCloseDate);
      initial.estado=target.item?.estado||"";
      initial.tipo=target.item?.tipo||detail?.account.tipo||"";
      initial.primaryContactId=String((target.item?target.item.primaryContactId:detail?.contacts.find(c=>c.isPrimary&&!c.deletedAt)?.id)||"");
      initial.assignedUserEmail=target.item?(target.item.assignedUserEmail||""):detail?.account.assignedUserEmail||(authState.type==="authenticated"?authState.user.email:"");
    }
    return initial;
  });
  const [primary,setPrimary]=useState(target.kind==="contact"?(target.item?.isPrimary??!detail?.contacts.some(c=>c.isPrimary&&!c.deletedAt)):false);
  const [error,setError]=useState("");
  const submitting=useRef(false);
  const [creationRequestKey]=useState(()=>crypto.randomUUID());
  const [baseline]=useState(()=>JSON.stringify({draft,primary}));
  const guard=useUnsavedChanges(JSON.stringify({draft,primary})!==baseline,onClose);
  const mutation=useMutation({mutationFn:saveCommercial,onSuccess:async (result,input)=>{
    await qc.cancelQueries({queryKey:["leads"]});
    await Promise.all(["commercial","commercial-detail","leads","lead-stats","lead-journal","global-journal","analytics"].map(key=>qc.invalidateQueries({queryKey:[key],refetchType:"all"})));
    if(input.action==='contact_save')crmSuccess('Contacto guardado',{label:'Ver contacto',href:'/accounts/'+input.accountId+'?section=contacts&contactId='+result.id});
    else if(input.action==='opportunity_save')crmSuccess('Gestión guardada',{label:'Abrir gestión',href:'/sales/'+result.id});
    else if(input.action==='account_save')crmSuccess('Negocio guardado',{label:'Ver negocio',href:'/accounts/'+result.id});
    onSaved?.(result.id);onClose();
  }});
  const field=(key:string,label:string)=> <label key={key}>{label}{key==="notes"||key==="reason"||key==="businessNotes"||key==="verificationUrls"?<Textarea disabled={mutation.isPending} rows={3} value={draft[key]||""} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/>:<Input disabled={mutation.isPending} type={(key==="estimatedCloseDate"||key==="verifiedOn")?"date":"text"} inputMode={key==="email"?"email":undefined} required={["nombre","name","opportunityName"].includes(key)} value={draft[key]||""} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/>}</label>;
  const select=(key:string,label:string,options:{value:string;label:string}[])=> <label>{label}<NativeSelect disabled={mutation.isPending} value={draft[key]||""} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}><option value="" disabled={key==="estado"&&target.kind==="opportunity"&&!!target.item?.estado}>{key==="estado"?"Sin etapa":key==="primaryContactId"?"Sin persona elegida":"Sin asignar"}</option>{draft[key]&&!options.some(o=>o.value===draft[key])&&<option value={draft[key]}>{draft[key]} (histórico)</option>}{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</NativeSelect></label>;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(submitting.current)return;submitting.current=true;setError("");
    const accountId=String(detail?.account.id??"");
    const textFields=(fields:string[][])=>Object.fromEntries(fields.map(([k])=>[k,draft[k]||null]));
    try{
      if(target.kind==="account")await mutation.mutateAsync({action:"account_save",...textFields([...accountFields,...researchFields]),tipo:draft.tipo||null,subtipo:draft.subtipo||null,nombre:draft.nombre,id:target.item?String(target.item.id):undefined,...(admin?{assignedUserEmail:draft.assignedUserEmail||null}:{})});
      if(target.kind==="contact")await mutation.mutateAsync({action:"contact_save",...textFields(contactFields),accountId,id:target.item?String(target.item.id):undefined,name:draft.name,isPrimary:primary});
      if(target.kind==="opportunity")await mutation.mutateAsync({action:"opportunity_save",accountId,id:target.item?String(target.item.id):undefined,opportunityName:draft.opportunityName,...(!target.item?{creationRequestKey}:{}),tipo:draft.tipo||null,estado:draft.estado||null,primaryContactId:draft.primaryContactId||null,serviceInterest:draft.serviceInterest||null,estimatedCloseDate:draft.estimatedCloseDate||null,...(admin?{assignedUserEmail:draft.assignedUserEmail||null}:{})});
      if(target.kind==="archive")await mutation.mutateAsync({action:"account_archive",accountId,archived:!detail?.account.archivedAt,reason:draft.reason||""});
      if(target.kind==="convert")await mutation.mutateAsync({action:"convert_client",accountId,reason:draft.reason||""});
      if(target.kind==="delete_contact")await mutation.mutateAsync({action:"contact_delete",accountId,id:String(target.item.id)});
    }catch(e){setError(e instanceof Error?e.message:"Datos inválidos")}finally{submitting.current=false;}
  };
  return <Dialog open onOpenChange={open=>{if(!open&&!mutation.isPending)guard.requestClose()}}><DialogContent className={styles.editor}>
    <DialogTitle>{titles[target.kind]}</DialogTitle><DialogDescription>{target.kind==="archive"?"Archivar oculta el negocio de la lista principal. Sus personas, gestiones, tareas e historial se conservan. Las tareas pendientes siguen en Mi día. Podés recuperarlo en Negocios archivados.":target.kind==="convert"?"Esta condición comercial no acredita ningún pago. El historial se conserva.":target.kind==="delete_contact"?"Conservaremos el historial. Se quitará como contacto principal de las gestiones.":target.kind==="account"?"Los datos generales se comparten con todas las gestiones de este negocio. Los cambios quedan registrados.":target.kind==="opportunity"?"Prepará lo que querés ofrecer. Guardar inicia esta gestión y conserva su seguimiento por separado; no acredita contacto ni envío.":"Cada persona tiene sus propios datos. Los teléfonos y emails genéricos del negocio se editan por separado."}</DialogDescription>
    {target.kind==="opportunity"&&<p className={styles.muted}>Negocio: <strong>{detail?.account.nombre}</strong> · Los datos de este negocio no se modifican al guardar la gestión.</p>}
    <form onSubmit={submit} className={styles.form} aria-busy={mutation.isPending}>
      {target.kind==="account"?<><fieldset className={styles.formSection}><legend>Lo necesario para empezar</legend>{accountFields.slice(0,2).map(([key,label])=>field(key,label))}<label>Vertical<NativeSelect disabled={mutation.isPending} value={draft.tipo||''} onChange={e=>setDraft(d=>({...d,tipo:e.target.value,subtipo:''}))}><option value="">Sin clasificar</option>{draft.tipo&&!settings.data?.types.includes(draft.tipo)&&<option value={draft.tipo}>{draft.tipo} (histórico)</option>}{(settings.data?.types??[]).map(t=><option key={t}>{t}</option>)}</NativeSelect></label>{select('subtipo','Subtipo',(settings.data?.subtypes??[]).filter(s=>s.typeName===draft.tipo).map(s=>({value:s.name,label:s.name})))}<p>Con el nombre alcanza para guardar. Guardar crea solo el negocio. Usá Iniciar gestión para preparar una propuesta.</p></fieldset><Disclosure className={styles.optionalFields}><DisclosureSummary>Ubicación y relevamiento (opcional)</DisclosureSummary><div className={styles.formSection}>{researchFields.map(([key,label])=>field(key,label))}<p>WhatsApp solo si el negocio lo publica como tal. Guardá las URLs consultadas y las dudas en las notas.</p></div></Disclosure><Disclosure className={styles.optionalFields}><DisclosureSummary>Teléfono, email y enlaces (opcional)</DisclosureSummary><div className={styles.formSection}>{accountFields.slice(2).map(([key,label])=>field(key,label))}</div></Disclosure></>:(target.kind==="contact"?contactFields:target.kind==="opportunity"?opportunityFields:[]).map(([key,label])=>key==="position"||key==="preferredChannel"?select(key,label,(key==="position"?settings.data?.contactPositions:settings.data?.contactChannels)?.map(value=>({value,label:value}))??[]):field(key,label))}
      {target.kind==="contact"&&<label className={styles.checkbox}><Checkbox disabled={mutation.isPending}  checked={primary} onChange={e=>setPrimary(e.target.checked)}/>Principal del negocio (reemplaza al anterior)</label>}
      {target.kind==="opportunity"&&<>
        {select("tipo","Tipo de negocio",(settings.data?.types??[]).map(value=>({value,label:value})))}
        {select("estado","Estado / etapa",(detail?.stages??[]).map(value=>({value,label:value})))}
        {select("primaryContactId","Contacto principal de gestión",(detail?.contacts??[]).filter(c=>!c.deletedAt).map(c=>({value:String(c.id),label:c.name})))}
      </>}
      {target.kind==="contact"&&<p className={styles.muted}>Cargo indica el rol de esta persona. Canal preferido registra su preferencia; no envía mensajes automáticamente. Marcar Principal reemplaza la referencia general anterior, sin cambiar el contacto elegido en cada gestión.</p>}
      {target.kind==="opportunity"&&<p className={styles.muted}>La propuesta, la persona y el cierre estimado son opcionales. Elegí una etapa del equipo o dejala sin etapa; no se asigna una automáticamente. Guardar no registra contacto ni envío.</p>}
      {(target.kind==="account"||target.kind==="opportunity")&&<p className={styles.muted}>El responsable del negocio coordina esa relación; el de la gestión gestiona esa gestión. Pueden ser distintos. Solo un administrador puede cambiarlos.</p>}
      {admin&&(target.kind==="account"||target.kind==="opportunity")&&select("assignedUserEmail","Responsable",(settings.data?.users??[]).map(u=>({value:u.email,label:u.displayName})))}
      {target.kind==="convert"&&field("reason","Motivo de conversión")}{target.kind==="archive"&&<>{field("reason","Motivo (al menos 3 caracteres)")}<p>{detail?.account.archivedAt?"Se volverá a mostrar en la lista de negocios.":"Las gestiones no se envían a papelera."}</p></>}
      {target.kind==="delete_contact"&&<p>{target.item.name}</p>}
      {(error||mutation.error)&&<p role="alert" className={styles.error}>{error||mutation.error?.message}</p>}
      <div className={styles.actions}><Button variant="ghost" disabled={mutation.isPending} onClick={guard.requestClose}>Cancelar</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending?target.kind==="opportunity"?"Guardando gestión…":target.kind==="contact"?"Guardando contacto…":target.kind==="delete_contact"?"Dando de baja contacto…":target.kind==="archive"?detail?.account.archivedAt?"Recuperando negocio…":"Archivando negocio…":target.kind==="convert"?"Guardando condición comercial…":"Guardando negocio…":target.kind==="delete_contact"?"Confirmar baja":target.kind==="convert"?"Convertir a cliente":"Guardar"}</Button></div>
    </form>
  </DialogContent>{guard.confirmation}</Dialog>;
}
