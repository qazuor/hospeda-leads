import {QueryLoadingNotice} from './QueryLoadingNotice';
import {BusinessHistory} from './BusinessHistory';
import {QueryErrorNotice} from './QueryErrorNotice';
import { Disclosure, DisclosureSummary } from './Disclosure';
import {canModifyBusiness,canModifyManagement} from '../helpers/crmPermissions';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './DropdownMenu';
import {useAuth} from '../helpers/useAuth';
import {BusinessContactDialog} from './BusinessContactDialog';
import {BusinessSummary} from './BusinessSummary';
import {ResourcesPanel} from './ResourcesPanel';
import {DataQualityPanel} from './DataQualityPanel';
import {ContactPolicy} from "./ContactPolicy";
import {SectionTabs,SectionTabList,SectionTab,SectionTabPanel} from "./SectionTabs";
import {WorkPanel} from "./WorkPanel";
import React, { useState,useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CommercialHelp } from "./CommercialHelp";
import { Button } from "./Button";
import { CommercialEditor, type EditorTarget } from "./CommercialEditor";
import { getCommercialDetail } from "../endpoints/commercial.schema";
import { formatDate, journalValue, dateOnlyInput } from "../helpers/crmDates";
import styles from "./Commercial.module.css";

const actionLabels:Record<string,string>={account_archived:"Negocio archivado",account_unarchived:"Negocio recuperado",contact_policy:"Política de recontacto",account_merged:"Negocios fusionados",import_updated:"Actualizado desde lote",account_created:"Negocio creado",account_updated:"Negocio editado",converted_to_client:"Conversión a cliente",contact_created:"Contacto creado",contact_updated:"Contacto editado",contact_deleted:"Contacto dado de baja",contact_primary_changed:"Principal reemplazado",created:"Creada",updated:"Editada",inline_updated:"Cambio rápido",bulk_updated:"Edición masiva",note_added:"Nota agregada",email_sent:"Email enviado",contact_logged:"Contacto registrado",soft_deleted:"Enviada a papelera",restored:"Restaurada",hard_deleted:"Eliminada definitivamente"};
const fieldLabels:Record<string,string>={provincia:"Provincia",direccion:"Dirección",whatsapp:"WhatsApp comercial",businessNotes:"Notas del negocio",discoverySource:"Fuente de descubrimiento",verificationUrls:"URLs de verificación",verifiedOn:"Fecha de verificación",doNotContact:"No contactar",nombre:"Negocio",name:"Nombre",position:"Cargo",phone:"Teléfono",telefono:"Teléfono genérico",email:"Email",ciudad:"Ciudad",preferredChannel:"Canal preferido",isPrimary:"Principal",notes:"Notas",assignedUserEmail:"Responsable",commercialStatus:"Condición comercial",clientSince:"Cliente desde",deletedAt:"Fecha de baja",reason:"Motivo",opportunityName:"Gestión",primaryContactId:"Contacto principal",serviceInterest:"Propuesta",estimatedCloseDate:"Cierre estimado",tipo:"Vertical",subtipo:"Subtipo",commercialProfile:"Perfil comercial",estado:"Estado",suscripcion:"Suscripción",origen:"Origen",prioridad:"Prioridad",contactName:"Persona",medioContactoPreferido:"Canal preferido",resultadoUltimoContacto:"Resultado de contacto",fechaCreacion:"Fecha de creación",fechaUltimoContacto:"Último contacto",fechaProximaAccion:"Próxima acción",fuenteReferencia:"Fuente de referencia",clientePotencialRecurrente:"Potencial recurrente",archivoAdjunto:"Archivo adjunto",quienCargo:"Quién cargó",note:"Nota",contactId:"Contacto",channel:"Canal",result:"Resultado",recipient:"Destinatario",templateName:"Modelo",sender:"Remitente",subject:"Asunto",sitioWeb:"Sitio web",urlGmap:"Google Maps",perfilInstagram:"Instagram",perfilFacebook:"Facebook",perfilAirbnb:"Airbnb",perfilBooking:"Booking",perfilTurismoEntreRios:"Turismo Entre Ríos"};
const ignoredFields=new Set(["id","sourceLeadId","accountId","createdAt","updatedAt","paymentVerified","templateId","outboxId","messageId"]);
const valueLabel=(key:string,value:unknown)=>{
  if(value==null||value==="")return "Vacío";
  if(typeof value==="boolean")return value?"Sí":"No";
  if(key==="commercialStatus")return value==="client"?"Cliente comercial":"Potencial cliente";
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
  const {authState}=useAuth();
  const q=useQuery({queryKey:["commercial-detail",accountId??"",leadId??""],queryFn:()=>getCommercialDetail(accountId,leadId)});
  const [savedStep,setSavedStep]=useState<{kind:'contact'|'opportunity';id:string}|null>(null);
  const [params]=useSearchParams();
  const [section,setSection]=useState(()=>['documents','history','work','contacts'].includes(params.get('section')??'')?params.get('section')!:'opportunities');
  const [contacting,setContacting]=useState(false);
  const [editor,setEditor]=useState<EditorTarget|null>(null);
  const requestedContact=params.get('contactId');
  useEffect(()=>{if(section!=='contacts'||!requestedContact||q.isPending)return;const frame=requestAnimationFrame(()=>{const node=document.querySelector<HTMLElement>('[data-contact-id="'+requestedContact.replace(/[^0-9]/g,'')+'"]');node?.scrollIntoView({block:'center'});node?.focus({preventScroll:true})});return()=>cancelAnimationFrame(frame)},[section,requestedContact,q.isPending]);
  if(!q.data&&q.isPending)return <QueryLoadingNotice>Cargando negocio…</QueryLoadingNotice>;
  if(!q.data)return <QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching} label="Reintentar negocio"/>;
  const d=q.data;
  const requestedReadOnly=readOnly;
  readOnly=readOnly||!canModifyBusiness(authState.type==="authenticated"?authState.user:undefined,d.account);
  const contacts=d.contacts.filter(c=>!c.deletedAt);
  const mainContact=contacts.find(c=>c.isPrimary&&(c.phone||c.email))||contacts.find(c=>c.phone||c.email)||contacts[0];
  const opportunities=d.opportunities.filter(o=>!o.deletedAt);
  const history=[...d.journal.map(j=>({id:"c"+j.id,date:j.createdAt,actor:j.actorName,label:actionLabels[j.action]||j.action,detail:auditDetail(j.metadata)})),...d.leadJournal.filter(j=>!(j.metadata&&typeof j.metadata==="object"&&"activityId" in j.metadata)).map(j=>({id:"l"+j.id,date:j.createdAt,actor:j.actorName,label:`${d.opportunities.find(o=>String(o.id)===String(j.leadId))?.opportunityName||j.leadName} · ${actionLabels[j.action]||j.action}${j.fieldName?" · "+(fieldLabels[j.fieldName]||j.fieldName):""}`,detail:j.fieldName?`${valueLabel(j.fieldName,j.oldValue)} → ${valueLabel(j.fieldName,j.newValue)}`:auditDetail(j.metadata)}))].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const contactSection=<section className={styles.section}>
    <div className={styles.heading}><div><h3>Personas de contacto ({contacts.length})</h3><p className={styles.muted}>Elegí con quién comunicarte. Principal identifica a la persona de referencia.</p></div>{!readOnly&&<Button size="sm" variant="outline" onClick={()=>setEditor({kind:"contact"})}>Agregar contacto</Button>}</div>
    {!contacts.length&&<p className={styles.empty}>Sin personas identificadas. Podés usar los canales genéricos del negocio.</p>}
    <div className={styles.rows}>{contacts.map(c=><article key={c.id} data-contact-id={c.id} tabIndex={-1}><div><strong>{c.name}{c.isPrimary?" · Principal":""}</strong><span>{[c.position,c.phone,c.email,c.preferredChannel].filter(Boolean).join(" · ")||"Sin canales cargados"}</span>{c.notes&&<p>{c.notes}</p>}</div>{!readOnly&&<div className={styles.actions}><Button size="sm" variant="outline" onClick={()=>setEditor({kind:"contact",item:c})}>Editar</Button><Button size="sm" variant="ghost" onClick={()=>setEditor({kind:"delete_contact",item:c})}>Dar de baja</Button></div>}</article>)}</div>
  </section>;
  const opportunitySection=<section className={styles.section}>
    <div className={styles.heading}><div><h3>Gestiones comerciales ({opportunities.length})</h3><p className={styles.muted}>{compact?"La gestión abierta está marcada como Actual.":"Cada gestión conserva su propuesta, etapa y seguimiento."}</p></div>{!readOnly&&<Button size="sm" onClick={()=>setEditor({kind:"opportunity"})}>Iniciar gestión</Button>}</div>
    {!opportunities.length&&<p className={styles.empty}>Sin gestiones iniciadas. Usá Iniciar gestión para preparar una propuesta antes de contactar.</p>}
    <div className={styles.rows}>{opportunities.map(o=><article key={o.id}><div><Link to={"/sales/"+o.id}><strong>{o.opportunityName||"Gestión comercial inicial"}</strong></Link><span>#{o.id}{String(o.id)===leadId?" · Actual":""}</span><span>{[o.tipo,o.estado,o.serviceInterest].filter(Boolean).join(" · ")||"Sin clasificación"}</span><span>Contacto: {contacts.find(c=>String(c.id)===String(o.primaryContactId))?.name||"Sin principal"}{o.estimatedCloseDate?" · Cierre: "+formatDate(dateOnlyInput(o.estimatedCloseDate)):""}</span><Link to={"/sales/"+o.id}>Abrir gestión</Link></div>{!requestedReadOnly&&canModifyManagement(authState.type==="authenticated"?authState.user:undefined,o,d.account)&&<Button size="sm" variant="outline" onClick={()=>setEditor({kind:"opportunity",item:o})}>Editar datos de gestión</Button>}</article>)}</div>
  </section>;
  return <section className={compact?styles.panel:styles.businessDetail}>
    {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/>}{q.isFetching&&!q.error&&<QueryLoadingNotice>Actualizando negocio…</QueryLoadingNotice>}
    <header className={styles.heading+" "+styles.businessHeader}><div><span className={styles.eyebrow}>NEGOCIO</span>{compact?<h2><Link to={"/accounts/"+d.account.id}>{d.account.nombre}</Link></h2>:<h1>{d.account.nombre}</h1>}<p className={styles.muted}>{[d.account.ciudad,d.account.tipo,d.account.subtipo].filter(Boolean).join(" · ")||"Sin localidad"} · {d.account.commercialStatus==="client"?"Cliente":"Potencial cliente"}{d.account.clientSince?" · desde "+formatDate(d.account.clientSince):""}</p>{!compact&&<p>Responsable: {d.users?.find(u=>u.email===d.account.assignedUserEmail)?.displayName||"Sin asignar"}</p>}</div>
      {!readOnly&&<div className={styles.actions}>{!compact&&<Button onClick={()=>setContacting(true)}>Contactar</Button>}<Button size="sm" variant="outline" onClick={()=>setEditor({kind:"account",item:d.account})}>Editar negocio</Button><DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost">Más acciones del negocio</Button></DropdownMenuTrigger><DropdownMenuContent>{authState.type==='authenticated'&&authState.user.role==='admin'&&<DropdownMenuItem onSelect={()=>setEditor({kind:"archive"})}>{d.account.archivedAt?"Recuperar negocio":"Archivar"}</DropdownMenuItem>}{d.account.commercialStatus!=="client"&&<DropdownMenuItem onSelect={()=>setEditor({kind:"convert"})}>Convertir a cliente</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div>}
    </header>
    {readOnly&&<p role="status">Podés consultar este negocio. Solo su responsable o un administrador puede modificarlo.</p>}
    {savedStep&&!compact&&<section className={styles.conversationContinue} role="status"><h2>{savedStep.kind==='contact'?'Persona guardada. Seguimos con el próximo paso.':'Gestión iniciada. Ahora planificá cómo empezar.'}</h2><p>{savedStep.kind==='contact'?'El próximo paso permanece visible para revisar qué corresponde hacer. No hace falta cargar otra vez el negocio.':'Abrí esta gestión para dejar el primer compromiso con fecha. La creación no envía mensajes.'}</p><div className={styles.actions}>{savedStep.kind==='opportunity'?<Button asChild><Link to={'/sales/'+savedStep.id}>Abrir gestión</Link></Button>:<Button onClick={()=>{setSection('opportunities');setSavedStep(null)}}>Volver al próximo paso</Button>}<Button variant="ghost" onClick={()=>setSavedStep(null)}>Seguir en esta pantalla</Button></div></section>}
    {d.account.archivedAt&&<p role="status">Este negocio está archivado. Sus tareas e historial se conservan.</p>}
    {accountId&&accountId!==String(d.account.id)&&<p className={styles.muted}>El negocio #{accountId} fue fusionado. Estás viendo su destino #{d.account.id}.</p>}
    {!compact&&<div className={styles.identityFacts}><span>{mainContact?.name||'Sin persona de contacto'}</span><span><strong>{mainContact?'Contacto':'Canales del negocio'}</strong>{[mainContact?.email,mainContact?.phone].filter(Boolean).join(' · ')||[d.account.email,d.account.telefono].filter(Boolean).join(' · ')||'Falta teléfono o email'}</span></div>}
    {!compact&&<BusinessSummary continuityOnly detail={d} readOnly={readOnly} onContact={()=>{setSection("contacts");if(!contacts.length)setEditor({kind:"contact"});}} onSale={()=>setEditor({kind:"opportunity"})} onDirectContact={()=>setContacting(true)} onEditChannels={()=>setEditor({kind:"account",item:d.account})}/> }
    {compact?<><Disclosure className={styles.relatedSection}><DisclosureSummary>Contactos del negocio ({contacts.length})</DisclosureSummary>{contactSection}</Disclosure><Disclosure className={styles.relatedSection}><DisclosureSummary>Gestiones comerciales de este negocio ({opportunities.length})</DisclosureSummary>{opportunitySection}</Disclosure></>:<SectionTabs value={section} onValueChange={setSection}>
      <SectionTabList aria-label="Secciones del negocio"><SectionTab value="opportunities">Gestiones comerciales ({opportunities.length})</SectionTab><SectionTab value="summary">Datos del negocio</SectionTab><SectionTab value="contacts">Contactos ({contacts.length})</SectionTab>{!readOnly&&<SectionTab value="work">Seguimiento</SectionTab>}<SectionTab value="documents">Documentos</SectionTab><SectionTab value="history">Historial</SectionTab></SectionTabList>
      <SectionTabPanel value="summary"><section className={styles.section}><h2>Datos del negocio</h2><dl className={styles.businessFacts}>{(["ciudad","tipo","subtipo","telefono","email","sitioWeb","direccion","provincia","whatsapp","businessNotes","discoverySource","verificationUrls","verifiedOn"] as const).map(field=><div key={field}><dt>{fieldLabels[field]||field}</dt><dd className={styles.researchValue}>{d.account[field]||"Sin datos"}</dd></div>)}</dl>{!readOnly&&<Button variant="outline" onClick={()=>setEditor({kind:"account",item:d.account})}>Editar datos del negocio</Button>}</section></SectionTabPanel><SectionTabPanel value="opportunities">{opportunitySection}</SectionTabPanel>
      <SectionTabPanel value="contacts">{contactSection}</SectionTabPanel>
      {!readOnly&&<SectionTabPanel value="work"><WorkPanel accountId={d.account.id}/></SectionTabPanel>}
      <SectionTabPanel value="documents"><ResourcesPanel accountId={d.account.id} readOnly={readOnly}/></SectionTabPanel>
      <SectionTabPanel value="history"><BusinessHistory key={d.account.id} accountId={String(d.account.id)} users={d.users} readOnly={readOnly} onFollow={()=>setSection('work')}/><Disclosure className={styles.relatedSection}><DisclosureSummary>Revisar calidad y procedencia de los datos</DisclosureSummary><DataQualityPanel accountId={d.account.id} readOnly={readOnly}/></Disclosure><Disclosure className={styles.relatedSection}><DisclosureSummary>Auditoría de cambios de datos</DisclosureSummary><section className={styles.section}><div><h3>Auditoría de cambios</h3><p className={styles.muted}>Cambios de datos del negocio, contactos y gestiones. Últimos 200 eventos de cada historial.</p></div><div className={styles.history}>{history.map(h=><Disclosure key={h.id}><DisclosureSummary>{formatDate(h.date,true)} · {h.label} · {h.actor}</DisclosureSummary><pre>{h.detail}</pre></Disclosure>)}</div></section></Disclosure></SectionTabPanel>
    </SectionTabs>}
    {!compact&&<Disclosure><DisclosureSummary>Ayuda sobre negocios y gestiones</DisclosureSummary><CommercialHelp/></Disclosure>}
    {contacting&&!compact&&!readOnly&&<BusinessContactDialog detail={d} onClose={()=>setContacting(false)}/>}
    {editor&&<CommercialEditor key={editor.kind+("item" in editor?editor.item?.id??"new":"")} target={editor} detail={d} onSaved={id=>{if((editor.kind==='contact'||editor.kind==='opportunity')&&!editor.item)setSavedStep({kind:editor.kind,id})}} onClose={()=>setEditor(null)}/>}
  </section>;
}
