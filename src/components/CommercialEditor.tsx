import { Disclosure, DisclosureSummary } from './Disclosure';
import { Textarea } from './Textarea';
import { Input } from './Input';
import {CrmDateInput} from './ui/CrmDateInput';
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
import {BusinessQuickCreate} from './BusinessQuickCreate';
import {canModifyBusiness} from '../helpers/crmPermissions';
import {managementTypes,managementTypeLabels,managementTypeHints,managementStageCatalog,type ManagementType} from '../helpers/businessManagement';

export type EditorTarget={kind:"account";item?:Account}|{kind:"contact";item?:Contact}|{kind:"opportunity";item?:Opportunity}|{kind:"convert"}|{kind:"unmark_client"}|{kind:"archive"}|{kind:"delete_account"}|{kind:"delete_contact";item:Contact};
const accountFields=[['nombre','Negocio'],['ciudad','Ciudad'],['telefono','Teléfono genérico'],['email','Email genérico'],['sitioWeb','Sitio web'],['urlGmap','Google Maps'],['perfilInstagram','Instagram'],['perfilFacebook','Facebook'],['perfilAirbnb','Airbnb'],['perfilBooking','Booking'],['perfilTurismoEntreRios','Turismo Entre Ríos']];
const researchFields=[['provincia','Provincia'],['direccion','Dirección'],['whatsapp','WhatsApp comercial'],['discoverySource','Fuente de descubrimiento'],['verificationUrls','URLs de verificación'],['verifiedOn','Fecha de verificación'],['businessNotes','Notas del negocio']];
const contactFields=[['name','Nombre de la persona'],['position','Cargo'],['phone','Teléfono'],['email','Email'],['preferredChannel','Canal preferido'],['notes','Notas']];
const opportunityExamples:Record<ManagementType,string>={main:'Ejemplo: Plan de alojamiento 2027',partner:'Ejemplo: Propuesta para una institución',provider:'Ejemplo: Servicios de fotografía',editor:'Ejemplo: Carga de eventos de verano',accompaniment:'Ejemplo: Completar la ficha de Hospeda'};
const opportunityOptionalFields=[['serviceInterest','Propuesta o tema (opcional)'],['estimatedCloseDate','Fecha estimada (opcional)']];
const titles={account:"Datos del negocio",contact:"Persona de contacto",opportunity:"Iniciar gestión",archive:"Archivar negocio",delete_account:"Enviar a Papelera",convert:"Registrar cliente previo",unmark_client:"Quitar marca Cliente",delete_contact:"Quitar persona"};
type EditorProps={target:EditorTarget;detail?:CommercialDetail;onClose:()=>void;onSaved?:(id:string)=>void;/** New business only: false when `onSaved` already opens it, so the toast has no "Abrir negocio". */createdToastLink?:boolean};
/** Business, person, management and business-condition dialogs. A new business uses the one-step `BusinessQuickCreate`. */
export function CommercialEditor(props:EditorProps){
  return props.target.kind==="account"&&!props.target.item?<BusinessQuickCreate onClose={props.onClose} onSaved={props.onSaved} toastLink={props.createdToastLink}/>:<CommercialEditorForm {...props}/>;
}
function CommercialEditorForm({target,detail,onClose,onSaved}:EditorProps){
  const {authState}=useAuth();
  const admin=authState.type==="authenticated"&&authState.user.role==="admin";
  /** Decision 8A: a seller with an open management (not the owner) only sees the contact fields; the server enforces the whitelist. */
  const contactOnly=!admin&&!!detail?.canEditContactData&&!!detail&&authState.type==="authenticated"&&!canModifyBusiness(authState.user,detail.account)&&(target.kind==="contact"||(target.kind==="account"&&!!target.item));
  const confirmReviewed=target.kind==="opportunity"&&!target.item&&detail?.account.status==="new";
  const qc=useQueryClient();
  const settings=useQuery({queryKey:["settings"],queryFn:getSettings});
  const [draft,setDraft]=useState<Record<string,string>>(()=>{
    const item="item" in target?target.item:undefined;
    const entries=item?Object.entries(item).map(([k,v])=>[k,v==null?"":String(v)]):[];
    const initial=Object.fromEntries(entries);
    if(target.kind==="opportunity"){
      initial.opportunityName=target.item?.opportunityName||"Presentación de Hospeda";
      initial.estimatedCloseDate=dateOnlyInput(target.item?.estimatedCloseDate);
      initial.estado=target.item?.estado||"";
      initial.managementType=target.item?.managementType||'main';
      initial.tipo=target.item?.tipo||detail?.account.tipo||"";
      initial.primaryContactId=String((target.item?target.item.primaryContactId:detail?.contacts.find(c=>c.isPrimary&&!c.deletedAt)?.id)||"");
      initial.assignedUserEmail=target.item?(target.item.assignedUserEmail||""):detail?.account.assignedUserEmail||(authState.type==="authenticated"?authState.user.email:"");
    }
    return initial;
  });
  const [primary,setPrimary]=useState(target.kind==="contact"?(target.item?.isPrimary??(!contactOnly&&!detail?.contacts.some(c=>c.isPrimary&&!c.deletedAt))):false);
  const replacesPrimary=target.kind==="contact"&&!!detail?.contacts.some(c=>c.isPrimary&&!c.deletedAt&&String(c.id)!==String(target.item?.id??""));
  const [error,setError]=useState("");
  const submitting=useRef(false);
  const [creationRequestKey]=useState(()=>crypto.randomUUID());
  const [baseline]=useState(()=>JSON.stringify({draft,primary}));
  const mutation=useMutation({mutationFn:saveCommercial,onSuccess:async (result,input)=>{
    await qc.cancelQueries({queryKey:["leads"]});
    await Promise.all(["commercial","commercial-detail","leads","lead-stats","lead-journal","global-journal","analytics","trash-businesses","work","crm-search"].map(key=>qc.invalidateQueries({queryKey:[key],refetchType:"all"})));
    if(input.action==='contact_save')crmSuccess('Persona guardada',{label:'Ver persona',href:'/accounts/'+input.accountId+'?section=contacts&contactId='+result.id});
    else if(input.action==='opportunity_save')crmSuccess('Gestión guardada',{label:'Abrir gestión',href:'/sales/'+result.id});
    else if(input.action==='account_save')crmSuccess('Negocio guardado',{label:'Ver negocio',href:'/accounts/'+result.id});
    onSaved?.(result.id);onClose();
  }});
  const guard=useUnsavedChanges(JSON.stringify({draft,primary})!==baseline,onClose,mutation.isPending);
  const field=(key:string,label:string)=> <label key={key}>{label}{key==="notes"||key==="reason"||key==="businessNotes"||key==="verificationUrls"?<Textarea disabled={mutation.isPending} rows={3} required={key==="reason"} minLength={key==="reason"?(target.kind==="archive"||target.kind==="delete_account"?3:1):undefined} value={draft[key]||""} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/>:(key==="estimatedCloseDate"||key==="verifiedOn")?<CrmDateInput disabled={mutation.isPending} value={draft[key]||""} onValueChange={value=>setDraft(d=>({...d,[key]:value}))}/>:<Input disabled={mutation.isPending} type={key==="email"?"email":key==="telefono"||key==="phone"?"tel":"text"} required={["nombre","name","opportunityName"].includes(key)} value={draft[key]||""} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/>}</label>;
  const select=(key:string,label:string,options:{value:string;label:string}[])=> <label>{label}<NativeSelect disabled={mutation.isPending} value={draft[key]||""} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}><option value="" disabled={key==="estado"&&target.kind==="opportunity"&&!!target.item?.estado}>{key==="estado"?"Sin etapa":key==="primaryContactId"?"Sin persona elegida":"Sin asignar"}</option>{draft[key]&&!options.some(o=>o.value===draft[key])&&<option value={draft[key]}>{draft[key]} (histórico)</option>}{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</NativeSelect></label>;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(submitting.current)return;submitting.current=true;setError("");
    const accountId=String(detail?.account.id??"");
    const textFields=(fields:string[][])=>Object.fromEntries(fields.map(([k])=>[k,draft[k]||null]));
    try{
      if(target.kind==="account"&&contactOnly)await mutation.mutateAsync({action:"account_save",id:String(target.item!.id),nombre:target.item!.nombre,...textFields([['telefono'],['email'],['whatsapp']])});
      else if(target.kind==="account")await mutation.mutateAsync({action:"account_save",...textFields([...accountFields,...researchFields]),tipo:draft.tipo||null,subtipo:draft.subtipo||null,nombre:draft.nombre,id:target.item?String(target.item.id):undefined,...(admin?{assignedUserEmail:draft.assignedUserEmail||null}:{})});
      if(target.kind==="contact")await mutation.mutateAsync({action:"contact_save",...textFields(contactFields),accountId,id:target.item?String(target.item.id):undefined,name:draft.name,isPrimary:primary});
      if(target.kind==="opportunity")await mutation.mutateAsync({action:"opportunity_save",accountId,id:target.item?String(target.item.id):undefined,opportunityName:draft.opportunityName,...(!target.item?{creationRequestKey,managementType:draft.managementType as ManagementType,...(confirmReviewed?{confirmReviewed:true}:{})}:{}),tipo:draft.tipo||null,estado:target.item?.managementType?null:draft.estado||null,primaryContactId:draft.primaryContactId||null,serviceInterest:draft.serviceInterest||null,estimatedCloseDate:draft.estimatedCloseDate||null,...(admin?{assignedUserEmail:draft.assignedUserEmail||null}:{})});
      if(target.kind==="delete_account")await mutation.mutateAsync({action:"account_trash",accountIds:[accountId],deleted:true,reason:draft.reason||""});
      if(target.kind==="archive")await mutation.mutateAsync({action:"account_archive",accountId,archived:!detail?.account.archivedAt,reason:draft.reason||""});
      if(target.kind==="convert")await mutation.mutateAsync({action:"convert_client",accountId,reason:draft.reason||""});
      if(target.kind==="unmark_client")await mutation.mutateAsync({action:"set_client",accountId,isClient:false,reason:draft.reason||""});
      if(target.kind==="delete_contact")await mutation.mutateAsync({action:"contact_delete",accountId,id:String(target.item.id)});
    }catch(e){setError(e instanceof Error?e.message:"Datos inválidos")}finally{submitting.current=false;}
  };
  return <Dialog open onOpenChange={open=>{if(!open&&!mutation.isPending)guard.requestClose()}}><DialogContent className={styles.editor}>
    <DialogTitle>{target.kind==="archive"&&detail?.account.archivedAt?"Desarchivar negocio":contactOnly&&target.kind==="account"?"Corregir datos de contacto":titles[target.kind]}</DialogTitle><DialogDescription>{target.kind==="delete_account"?"Enviar a Papelera es para un registro inválido o cargado por error. El negocio dejará de aparecer en las listas habituales; sus contactos, gestiones, tareas e historial se conservan. Solo un administrador puede restaurarlo desde Papelera. Si el negocio es válido y solo dejaste de trabajarlo, usá Archivar.":target.kind==="archive"?detail?.account.archivedAt?"El negocio volverá a aparecer en la lista, con su información, gestiones, tareas e historial. Solo un administrador puede desarchivarlo.":"Archivar es para un negocio válido que no vas a trabajar por ahora. Lo oculta de la lista activa, pero conserva sus personas, gestiones, tareas e historial. No lo envía a Papelera; solo un administrador puede recuperarlo desde Negocios archivados.":target.kind==="convert"?"Usá esta opción solo si el negocio ya tenía una relación comercial antes de empezar a registrar su seguimiento en el CRM. Para una venta trabajada acá, cerrá la gestión como ganada: el CRM lo marcará como Cliente cuando corresponda. Esto no acredita pagos ni entregas.":target.kind==="unmark_client"?"Solo un administrador puede quitar esta marca. El historial comercial se conserva.":target.kind==="delete_contact"?"Conservaremos el historial. Se quitará como contacto principal de las gestiones.":contactOnly&&target.kind==="account"?"Podés corregir teléfono, email y WhatsApp del negocio. Queda registrado en el historial.":target.kind==="account"?"Los datos generales se comparten con todas las gestiones de este negocio. Los cambios quedan registrados.":target.kind==="opportunity"?"Poné un nombre que te ayude a reconocer qué van a trabajar. El responsable se toma del negocio; los datos adicionales son opcionales. Guardar inicia la gestión, pero no registra contacto ni envío.":"Cada persona tiene sus propios datos. Los teléfonos y emails genéricos del negocio se editan por separado."}</DialogDescription>
    {target.kind==="opportunity"&&<p className={styles.editorContext}>Negocio: <strong>{detail?.account.nombre}</strong></p>}
    {confirmReviewed&&<p role="note"><strong>Este negocio figura como Nuevo.</strong> Al iniciar la gestión, confirmás que verificaste que existe y es válido. En el mismo guardado quedará Revisado y se creará la gestión.</p>}
    <form onSubmit={submit} className={styles.form} aria-busy={mutation.isPending}>
      {contactOnly&&target.kind==="account"?<fieldset className={styles.formSection}><legend>Datos de contacto</legend>{field('telefono','Teléfono')}{field('email','Email')}{field('whatsapp','WhatsApp')}</fieldset>:target.kind==="account"?<><fieldset className={styles.formSection}><legend>Lo necesario para empezar</legend>{accountFields.slice(0,2).map(([key,label])=>field(key,label))}<label>Vertical<NativeSelect disabled={mutation.isPending} value={draft.tipo||''} onChange={e=>setDraft(d=>({...d,tipo:e.target.value,subtipo:''}))}><option value="">Sin clasificar</option>{draft.tipo&&!settings.data?.types.includes(draft.tipo)&&<option value={draft.tipo}>{draft.tipo} (histórico)</option>}{(settings.data?.types??[]).map(t=><option key={t}>{t}</option>)}</NativeSelect></label>{select('subtipo','Subtipo',(settings.data?.subtypes??[]).filter(s=>s.typeName===draft.tipo).map(s=>({value:s.name,label:s.name})))}</fieldset><Disclosure className={styles.optionalFields}><DisclosureSummary>Ubicación y relevamiento (opcional)</DisclosureSummary><div className={styles.formSection}>{researchFields.map(([key,label])=>field(key,label))}<p>WhatsApp solo si el negocio lo publica como tal. Guardá las URLs consultadas y las dudas en las notas.</p></div></Disclosure><Disclosure className={styles.optionalFields}><DisclosureSummary>Teléfono, email y enlaces (opcional)</DisclosureSummary><div className={styles.formSection}>{accountFields.slice(2).map(([key,label])=>field(key,label))}</div></Disclosure></>:target.kind==="contact"?contactFields.map(([key,label])=>key==="position"||key==="preferredChannel"?select(key,label,(key==="position"?settings.data?.contactPositions:settings.data?.contactChannels)?.map(value=>({value,label:value}))??[]):field(key,label)):target.kind==="opportunity"&&target.item?field('opportunityName','Nombre de la gestión'):null}
      {target.kind==="contact"&&!contactOnly&&<label className={styles.checkbox}><Checkbox disabled={mutation.isPending}  checked={primary} onChange={e=>setPrimary(e.target.checked)}/>Principal del negocio{replacesPrimary?" (reemplaza al anterior)":""}</label>}
      {target.kind==="opportunity"&&<>
        {!target.item&&<><label>Tipo de gestión<NativeSelect disabled={mutation.isPending} value={draft.managementType||'main'} onChange={e=>{const next=e.target.value as ManagementType;setDraft(d=>({...d,managementType:next,estado:managementStageCatalog(next)[0]?.key||''}));}}>{managementTypes.map(value=><option key={value} value={value} disabled={value==='accompaniment'&&!detail?.account.isClient}>{managementTypeLabels[value]}{value==='accompaniment'&&!detail?.account.isClient?' (requiere Cliente)':''}</option>)}</NativeSelect></label><small className={styles.fullField}>{managementTypeHints[(draft.managementType||'main') as ManagementType]}</small>{!detail?.account.isClient&&<small className={styles.fullField}>El acompañamiento de ficha se inicia después de cerrar una gestión comercial como ganada y marcar el negocio como Cliente.</small>}{field('opportunityName','Nombre de la gestión')}<small className={styles.fullField}>{opportunityExamples[(draft.managementType||'main') as ManagementType]}</small>{admin?select("assignedUserEmail","Responsable de esta gestión",(settings.data?.users??[]).map(u=>({value:u.email,label:u.displayName}))):<p className={styles.fullField}>Responsable: <strong>{detail?.users?.find(u=>u.email===draft.assignedUserEmail)?.displayName||"responsable del negocio"}</strong></p>}<Disclosure className={styles.optionalFields}><DisclosureSummary>Más datos (opcional)</DisclosureSummary><div className={styles.formSection}>{opportunityOptionalFields.map(([key,label])=>field(key,label))}{select("primaryContactId","Persona principal de esta gestión",(detail?.contacts??[]).filter(c=>!c.deletedAt).map(c=>({value:String(c.id),label:c.name})))}</div></Disclosure></>}
        {target.item?.managementType&&<p><strong>Tipo de gestión:</strong> {managementTypeLabels[target.item.managementType]}</p>}
        {!target.item?.managementType&&target.item&&<>{select("tipo","Tipo de negocio",(settings.data?.types??[]).map(value=>({value,label:value})))}{select("estado","Etapa histórica",(detail?.stages??[]).map(value=>({value,label:value})))}</>}
        {target.item&&<Disclosure className={styles.optionalFields}><DisclosureSummary>Datos opcionales de la gestión</DisclosureSummary><div className={styles.formSection}>{opportunityOptionalFields.map(([key,label])=>field(key,label))}{select("primaryContactId","Persona principal de esta gestión",(detail?.contacts??[]).filter(c=>!c.deletedAt).map(c=>({value:String(c.id),label:c.name})))}</div></Disclosure>}
      </>}
      {target.kind==="contact"&&<p className={styles.muted}>Cargo indica el rol de esta persona. Canal preferido registra su preferencia; no envía mensajes automáticamente. Marcar Principal reemplaza la referencia general anterior, sin cambiar el contacto elegido en cada gestión.</p>}
      {target.kind==="opportunity"&&<p className={styles.muted}>{target.item?'El tipo y la etapa se consultan o cambian desde la gestión.':'La nueva gestión empieza en Por contactar.'} Contacto y cierre estimado son opcionales.</p>}
      {contactOnly&&<p className={styles.muted}>Queda registrado en el historial.</p>}
      {target.kind==="account"&&!contactOnly&&<p className={styles.muted}>El responsable del negocio coordina esa relación; el de la gestión gestiona esa gestión. Pueden ser distintos. Solo un administrador puede cambiarlos.</p>}
      {admin&&(target.kind==="account"||(target.kind==="opportunity"&&!!target.item))&&select("assignedUserEmail","Responsable",(settings.data?.users??[]).map(u=>({value:u.email,label:u.displayName})))}
      {target.kind==="delete_account"&&field("reason","Motivo para enviar a Papelera (al menos 3 caracteres)")}{target.kind==="convert"&&field("reason","¿Qué relación comercial previa tuvo?")}{target.kind==="unmark_client"&&field("reason","Motivo para quitar la marca")}{target.kind==="archive"&&<>{field("reason",detail?.account.archivedAt?"Motivo para desarchivar (al menos 3 caracteres)":"Motivo para archivar (al menos 3 caracteres)")}<p>{detail?.account.archivedAt?"El negocio volverá a la lista activa.":"Se conserva el negocio y sus tareas; no se envía a Papelera."}</p></>}
      {target.kind==="delete_contact"&&<p>{target.item.name}</p>}
      {(error||mutation.error)&&<p role="alert" className={styles.error}>{error||mutation.error?.message}</p>}
      <div className={styles.actions}><Button variant="ghost" disabled={mutation.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={guard.requestClose}>Cancelar</Button><Button type="submit" variant={target.kind==="delete_account"?"destructive":"primary"} disabled={mutation.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar.">{target.kind==="delete_account"?(mutation.isPending?"Enviando a Papelera…":"Enviar a Papelera"):mutation.isPending?target.kind==="opportunity"?"Guardando gestión…":target.kind==="contact"?"Guardando contacto…":target.kind==="delete_contact"?"Quitando persona…":target.kind==="archive"?detail?.account.archivedAt?"Recuperando negocio…":"Archivando negocio…":target.kind==="convert"||target.kind==="unmark_client"?"Guardando condición comercial…":"Guardando negocio…":target.kind==="archive"?detail?.account.archivedAt?"Desarchivar negocio":"Archivar negocio":target.kind==="delete_contact"?"Confirmar y quitar":target.kind==="convert"?"Registrar cliente previo":target.kind==="unmark_client"?"Quitar marca Cliente":confirmReviewed?"Marcar Revisado e iniciar gestión":target.kind==="opportunity"?"Iniciar gestión":target.kind==="account"?"Guardar cambios":"Guardar"}</Button></div>
    </form>
  </DialogContent>{guard.confirmation}</Dialog>;
}
