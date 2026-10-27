import {QueryLoadingNotice} from './QueryLoadingNotice';
import {BusinessHistory} from './BusinessHistory';
import {CommunicationPanel} from './CommunicationPanel';
import {QueryErrorNotice} from './QueryErrorNotice';
import { Disclosure, DisclosureSummary } from './Disclosure';
import {canModifyBusiness,canModifyManagement} from '../helpers/crmPermissions';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './DropdownMenu';
import {useAuth} from '../helpers/useAuth';
import {BusinessContactDialog} from './BusinessContactDialog';
import {ResourcesPanel} from './ResourcesPanel';
import {DataQualityPanel} from './DataQualityPanel';
import {BusinessStatusControl} from './BusinessStatusControl';
import {managementTypeLabels} from '../helpers/businessManagement';
import {stageLabel,actorLabel} from '../helpers/crmLabels';
import {StageStepper} from './StageStepper';
import {VOCAB,managementDisplayName} from '../content/vocabulary';
import {businessSection} from '../helpers/businessSections';
import {ValueBadge} from './ValueBadge';
import {SectionTabs,SectionTabList,SectionTab,SectionTabPanel} from "./SectionTabs";
import {WorkPanel} from "./WorkPanel";
import {NextWork} from './NextWork';
import {HelpLink} from './HelpLink';
import {WorkEditor,type WorkTarget} from './WorkEditor';
import {getWork} from '../endpoints/work.schema';
import React, { useState,useEffect,useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "./Button";
import { CommercialEditor, type EditorTarget } from "./CommercialEditor";
import { getCommercialDetail } from "../endpoints/commercial.schema";
import { getBusinessHistory } from '../endpoints/businessHistory.schema';
import { prettyInstant } from '../helpers/workDates';
import { formatDate, journalValue, dateOnlyInput } from "../helpers/crmDates";
import { doNotContactSince } from "../helpers/doNotContactSince";
import { Ellipsis } from "lucide-react";
import {toast} from 'sonner';
import {agendaName} from '../helpers/userscriptPure';
import {splitEmptyFields} from '../helpers/emptyFields';
import { usePageCrumb } from './AppLayout';
import styles from "./Commercial.module.css";
import { BusinessSidebar, BusinessRestrictionBanner, BUSINESS_SIDEBAR_LABEL } from './BusinessSidebar';
import { BusinessSummaryTab } from './BusinessSummaryTab';
import {FloatingComposerProvider} from './FloatingComposerContext';

const actionLabels:Record<string,string>={account_deleted:"Negocio enviado a Papelera",account_restored:"Negocio restaurado",account_archived:"Negocio archivado",account_unarchived:"Negocio recuperado",contact_policy:"Política de recontacto",leandro_referral_changed:"Derivación a Leandro actualizada",account_merged:"Negocios fusionados",import_updated:"Actualizado desde lote",account_created:"Negocio creado",account_updated:"Negocio editado",account_contact_data_updated:"Datos de contacto corregidos",business_assignment_rebalanced:"Responsable actualizado por redistribución",converted_to_client:"Conversión a cliente",business_status_changed:"Estado del negocio actualizado",business_state_changed:"Estado o indicador del negocio actualizado",client_marked:"Marcado como Cliente",client_unmarked:"Marca Cliente quitada",stage:"Etapa de gestión actualizada",contact_created:"Persona agregada",contact_updated:"Persona editada",contact_deleted:"Persona quitada",contact_primary_changed:"Persona principal reemplazada",created:"Creada",updated:"Editada",inline_updated:"Cambio rápido",bulk_updated:"Edición masiva",note_added:"Nota agregada",email_sent:"Email enviado",contact_logged:"Contacto registrado",soft_deleted:"Enviada a papelera",restored:"Restaurada",hard_deleted:"Eliminada definitivamente"};
const fieldLabels:Record<string,string>={provincia:"Provincia",direccion:"Dirección",whatsapp:"WhatsApp comercial",businessNotes:"Notas del negocio",discoverySource:"Fuente de descubrimiento",verificationUrls:"URLs de verificación",verifiedOn:"Fecha de verificación",reviewStatus:"Estado del negocio",doNotContact:"No contactar",isClient:"Cliente",referredToLeandro:"Derivado a Leandro",status:"Estado del negocio",recontactAt:"Fecha de recontacto",nombre:"Negocio",name:"Nombre",position:"Cargo",phone:"Teléfono",telefono:"Teléfono genérico",email:"Email",ciudad:"Ciudad",preferredChannel:"Canal preferido",isPrimary:"Principal",notes:"Notas",assignedUserEmail:"Responsable",commercialStatus:"Condición comercial",clientSince:"Cliente desde",deletedAt:"Fecha de borrado",reason:"Motivo",opportunityName:"Gestión",primaryContactId:"Persona principal",serviceInterest:"Propuesta",estimatedCloseDate:"Cierre estimado",tipo:"Vertical",subtipo:"Subtipo",commercialProfile:"Perfil comercial",estado:"Etapa",suscripcion:"Suscripción",origen:"Origen",prioridad:"Prioridad",contactName:"Persona",medioContactoPreferido:"Canal preferido",resultadoUltimoContacto:"Resultado de contacto",fechaCreacion:"Fecha de creación",fechaUltimoContacto:"Último contacto",fechaProximaAccion:"Próxima acción",fuenteReferencia:"Fuente de referencia",clientePotencialRecurrente:"Potencial recurrente",archivoAdjunto:"Archivo adjunto",quienCargo:"Quién cargó",note:"Nota",contactId:"Persona",channel:"Canal",result:"Resultado",recipient:"Destinatario",templateName:"Modelo",sender:"Remitente",subject:"Asunto",sitioWeb:"Sitio web",urlGmap:"Google Maps",perfilInstagram:"Instagram",perfilFacebook:"Facebook",perfilAirbnb:"Airbnb",perfilBooking:"Booking",perfilTurismoEntreRios:"Turismo Entre Ríos"};
const businessDataFields=["ciudad","tipo","subtipo","telefono","email","sitioWeb","direccion","provincia","whatsapp","businessNotes","discoverySource","verificationUrls","verifiedOn"] as const;
const ignoredFields=new Set(["id","sourceLeadId","accountId","createdAt","updatedAt","paymentVerified","templateId","outboxId","messageId"]);
const valueLabel=(key:string,value:unknown)=>{
  if(value==null||value==="")return "Vacío";
  if(typeof value==="boolean")return value?"Sí":"No";
  if(key==="reviewStatus")return value==="filtered"?"Revisado":"Nuevo";
  if(key==="estado")return stageLabel(String(value));
  if(key==="commercialStatus")return value==="client"?"Cliente comercial":"Potencial cliente";
  if(["clientSince","deletedAt","estimatedCloseDate"].includes(key))return formatDate(key==="estimatedCloseDate"?dateOnlyInput(value):String(value),key!=="estimatedCloseDate");
  return typeof value==="object"?JSON.stringify(value):journalValue(key,value);
};
function auditDetail(metadata:unknown){
  if(!metadata||typeof metadata!=="object"||Array.isArray(metadata))return "";
  const m=metadata as Record<string,unknown>;
  const before=(m.before&&typeof m.before==="object"?m.before:{}) as Record<string,unknown>;
  const after=(m.after&&typeof m.after==="object"?m.after:m) as Record<string,unknown>;
  const changes=Object.entries(after).filter(([key,value])=>!ignoredFields.has(key)&&JSON.stringify(value)!==JSON.stringify(before[key]))
    .map(([key,value])=>`${fieldLabels[key]||key}: ${"before" in m?valueLabel(key,before[key])+" → ":""}${valueLabel(key,value)}`);
  if(typeof m.reason==="string"&&m.reason.trim())changes.push(`Motivo: ${m.reason}`);
  if(m.origin==="automatic")changes.unshift(`Origen: Automático${m.cause==="management_change"?" · derivado de un cambio en la gestión":m.cause==="work_outcome"?" · derivado del resultado de una actividad":""}`);
  else if(m.origin==="direct")changes.unshift("Origen: Cambio directo");
  return changes.join("\n");
}
export function CommercialPanel({accountId,leadId,compact=false,readOnly=false}:{accountId?:string;leadId?:string;compact?:boolean;readOnly?:boolean}){
  const {authState}=useAuth();
  const q=useQuery({queryKey:["commercial-detail",accountId??"",leadId??""],queryFn:()=>getCommercialDetail(accountId,leadId)});
  usePageCrumb(accountId ? q.data?.account.nombre : null);
  const historySummary=useQuery({queryKey:['commercial-detail','history',q.data?.account.id??'',1],queryFn:()=>getBusinessHistory(String(q.data!.account.id),1),enabled:!!accountId&&!!q.data?.account.id});
  const workScope=authState.type==='authenticated'&&authState.user.role==='admin'?'all':undefined;
  const workSummary=useQuery({queryKey:['work','next',q.data?.account.id??'',workScope],queryFn:()=>getWork({accountId:String(q.data!.account.id),mode:'detail',responsible:workScope}),enabled:!compact&&!!q.data?.account.id});
  const [savedStep,setSavedStep]=useState<{kind:'contact'|'opportunity';id:string}|null>(null);
  const [params]=useSearchParams();
  const [section,setSection]=useState<string>(()=>params.get('section')==='work'&&readOnly?'resumen':businessSection(params.get('section')));
  const [workFocus,setWorkFocus]=useState(()=>params.get('section')==='work'?1:0);
  const [contacting,setContacting]=useState(false),[floatingActive,setFloatingActive]=useState(false),[floatingLeadId,setFloatingLeadId]=useState<string>();
  const [contactChannel,setContactChannel]=useState<'email'|'whatsapp'|undefined>();
  const contactReturnFocus=useRef<HTMLElement|null>(null);
  const closeContact=()=>{setContacting(false);setFloatingActive(false);setContactChannel(undefined);contactReturnFocus.current=null};
  const openContact=(channel?:'email'|'whatsapp')=>{if(contacting){window.dispatchEvent(new Event('crm:restore-floating-composer'));return}contactReturnFocus.current=document.activeElement as HTMLElement;setContactChannel(channel);setContacting(true)};
  const [editor,setEditor]=useState<EditorTarget|null>(null);
  const [workEditor,setWorkEditor]=useState<WorkTarget|null>(null);
  /** True while the person editor was opened from the next step, the only flow that shows "Persona guardada". */
  const [personFromNextStep,setPersonFromNextStep]=useState(false);
  const requestedContact=params.get('contactId');
  useEffect(()=>{if(!workFocus||q.isPending)return;const frame=requestAnimationFrame(()=>document.getElementById('business-work')?.scrollIntoView({block:'start'}));return()=>cancelAnimationFrame(frame)},[workFocus,q.isPending]);
  useEffect(()=>{if(!requestedContact||q.isPending)return;const frame=requestAnimationFrame(()=>{const node=document.querySelector<HTMLElement>('[data-contact-id="'+requestedContact.replace(/[^0-9]/g,'')+'"]');node?.scrollIntoView({block:'center'});node?.focus({preventScroll:true})});return()=>cancelAnimationFrame(frame)},[requestedContact,q.isPending]);
  if(!q.data&&q.isPending)return <QueryLoadingNotice>Cargando negocio…</QueryLoadingNotice>;
  if(!q.data)return <QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching} label="Reintentar negocio"/>;
  const d=q.data;
  const businessDataSplit=splitEmptyFields(businessDataFields,field=>d.account[field]);
  const requestedReadOnly=readOnly;
  const dncMark=d.account.doNotContact?doNotContactSince(d.journal??[]):null;
  const modifiable=canModifyBusiness(authState.type==="authenticated"?authState.user:undefined,d.account);
  /** Decision 8A: read-only for everything except the contact data of a business where the user has an open management. */
  const contactEditable=!requestedReadOnly&&!modifiable&&!!d.canEditContactData&&!compact;
  readOnly=readOnly||!canModifyBusiness(authState.type==="authenticated"?authState.user:undefined,d.account);
  const displayedSection=readOnly&&section==='tareas'?'resumen':section;
  const contacts=d.contacts.filter(c=>!c.deletedAt);
  const mainContact=contacts.find(c=>c.isPrimary&&(c.phone||c.email))||contacts.find(c=>c.phone||c.email)||contacts[0];
  const opportunities=d.opportunities.filter(o=>!o.deletedAt);
  const canDoWork=authState.type==='authenticated'&&(authState.user.role==='admin'||d.account.assignedUserEmail===authState.user.email)&&!readOnly;
  const openTasks=(workSummary.data?.tasks??[]).filter(task=>task.status==='pending').slice(0,5);
  const work={ready:!!workSummary.data,blockedReason:workSummary.error?'No se pudieron cargar las tareas. Reintentá antes de abrir el editor.':'Cargando tareas…',error:workSummary.error,retry:()=>void workSummary.refetch(),retrying:workSummary.isFetching};
  const openWork=()=>{setSection('tareas');setWorkFocus(n=>n+1)};
  const history=[...d.journal.map(j=>({id:"c"+j.id,date:j.createdAt,actor:actorLabel(j.actorName),label:actionLabels[j.action]||j.action,detail:auditDetail(j.metadata)})),...d.leadJournal.filter(j=>!(j.metadata&&typeof j.metadata==="object"&&"activityId" in j.metadata)).map(j=>({id:"l"+j.id,date:j.createdAt,actor:actorLabel(j.actorName),label:`${(o=>managementDisplayName({opportunityName:o?.opportunityName??j.leadName,createdAt:o?.createdAt}))(d.opportunities.find(o=>String(o.id)===String(j.leadId)))} · ${actionLabels[j.action]||j.action}${j.fieldName?" · "+(fieldLabels[j.fieldName]||j.fieldName):""}`,detail:j.fieldName?`${valueLabel(j.fieldName,j.oldValue)} → ${valueLabel(j.fieldName,j.newValue)}`:auditDetail(j.metadata)})),...(d.managementJournal??[]).map(j=>{const opportunity=d.opportunities.find(o=>String(o.id)===String(j.leadId));return{id:"p"+j.id,date:j.createdAt,actor:actorLabel(j.actorName),label:`${opportunity?managementDisplayName(opportunity):"Gestión"} · ${actionLabels[j.action]||j.action}`,detail:`Etapa: ${stageLabel(j.oldStage)} → ${stageLabel(j.newStage)}${j.comment?"\nMotivo: "+j.comment:""}`}})].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const contactSection=<section className={styles.section}>
    <div className={styles.heading}><div>{compact&&<h3>Personas ({contacts.length})</h3>}<p className={styles.muted}>Las personas con las que hablás en este negocio. La principal es la de referencia.</p></div>{(!readOnly||contactEditable)&&contacts.length>0&&<Button size="sm" variant="outline" onClick={()=>setEditor({kind:"contact"})}>{VOCAB.addPerson}</Button>}</div>
    {!contacts.length&&<div className={styles.empty}><p>Todavía no hay personas cargadas. Una persona es con quien hablás en el negocio, por ejemplo «Marta, la dueña». Mientras tanto podés usar el teléfono y el email del negocio.</p>{(!readOnly||contactEditable)&&<Button size="sm" onClick={()=>setEditor({kind:"contact"})}>{VOCAB.addPerson}</Button>}</div>}
    <div className={styles.rows}>{contacts.map(c=><article key={c.id} data-contact-id={c.id} tabIndex={-1}><div><strong>{c.name}{c.isPrimary?" · Principal":""}</strong><span>{[c.position,c.phone,c.email,c.preferredChannel].filter(Boolean).join(" · ")||"Sin canales cargados"}</span>{c.notes&&<p>{c.notes}</p>}</div>{(!readOnly||contactEditable)&&<div className={styles.actions}><Button size="sm" variant="outline" onClick={()=>setEditor({kind:"contact",item:c})}>Editar</Button>{!readOnly&&<Button size="sm" variant="ghost" onClick={()=>setEditor({kind:"delete_contact",item:c})}>{VOCAB.removePerson}</Button>}</div>}</article>)}</div>
  </section>;
  const opportunitySection=<section className={styles.section}>
    <div className={styles.heading}><div><h3>Gestiones ({opportunities.length})</h3><p className={styles.muted}>{compact?"La gestión abierta está marcada como Actual.":"Cada gestión tiene su propia propuesta, etapa y tareas."}</p>{d.account.archivedAt&&<p className={styles.muted}>Un administrador debe desarchivar este negocio antes de iniciar otra gestión.</p>}</div>{!readOnly&&opportunities.length>0&&<Button size="sm" disabled={!!d.account.archivedAt||d.account.status==='archived'} disabledReason={"El negocio está archivado. Un administrador debe desarchivarlo antes de continuar."} onClick={()=>setEditor({kind:"opportunity"})}>Iniciar gestión</Button>}</div>
    {!opportunities.length&&<div className={styles.empty}><p>Sin gestiones iniciadas. Una gestión es lo que querés lograr con este negocio, por ejemplo «Plan anual 2027». Iniciala para preparar una propuesta antes de contactar.</p>{!readOnly&&<Button size="sm" disabled={!!d.account.archivedAt||d.account.status==='archived'} disabledReason={"El negocio está archivado. Un administrador debe desarchivarlo antes de continuar."} onClick={()=>setEditor({kind:"opportunity"})}>Iniciar gestión</Button>}</div>}
  <div className={styles.rows}>{opportunities.map(o=><article key={o.id}><div><Link to={"/sales/"+o.id} state={{from:'business'}}><strong>{managementDisplayName(o)}</strong></Link>{String(o.id)===leadId&&<span>Actual</span>}<span>{[o.managementType?managementTypeLabels[o.managementType]:o.tipo,o.serviceInterest].filter(Boolean).join(" · ")||"Sin clasificación"}</span><span className={styles.stageLine}><StageStepper stage={o.estado} type={o.managementType}/></span><span>Persona principal: {contacts.find(c=>String(c.id)===String(o.primaryContactId))?.name||"Sin elegir"}{o.estimatedCloseDate?" · Cierre: "+formatDate(dateOnlyInput(o.estimatedCloseDate)):""}</span><Link to={"/sales/"+o.id} state={{from:'business'}}>Abrir gestión</Link></div>{!requestedReadOnly&&canModifyManagement(authState.type==="authenticated"?authState.user:undefined,o,d.account)&&<Button size="sm" variant="outline" onClick={()=>setEditor({kind:"opportunity",item:o})}>Editar datos de gestión</Button>}</article>)}</div>
  </section>;
  const lastContact=historySummary.data?.lastContact;
  const copyAgendaName=async()=>{try{await navigator.clipboard.writeText(agendaName(d.account.nombre,d.account.id));toast.success('Nombre para agendar copiado');}catch{toast.error('No se pudo copiar el nombre.');}};
  return <FloatingComposerProvider value={{active:floatingActive,leadId:floatingLeadId,restore:()=>window.dispatchEvent(new Event('crm:restore-floating-composer'))}}><section className={compact?styles.panel:styles.businessDetail}>
    {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/>}{q.isFetching&&!q.error&&<QueryLoadingNotice>Actualizando negocio…</QueryLoadingNotice>}
    <header className={styles.heading+" "+styles.businessHeader}><div className={styles.businessIdentity}><span className={styles.eyebrow}>NEGOCIO</span><div className={styles.businessTitle}>{compact?<h2><Link to={"/accounts/"+d.account.id}>{d.account.nombre}</Link></h2>:<h1>{d.account.nombre}</h1>}{!compact&&<BusinessStatusControl compact account={d.account} readOnly={readOnly} users={d.users} currentUserEmail={authState.type==='authenticated'?authState.user.email:null}/>}</div><p className={styles.muted}>{['H'+d.account.id,d.account.ciudad,d.account.tipo,d.account.subtipo,d.account.isClient?'Cliente':'Potencial cliente',d.account.clientSince?'desde '+formatDate(d.account.clientSince):'',d.account.referredToLeandro?'Derivado a Leandro':'',VOCAB.businessOwner+': '+(d.users?.find(u=>u.email===d.account.assignedUserEmail)?.displayName||'Sin asignar')].filter(Boolean).join(" · ")}</p>{!compact&&<p className={styles.headerContact}><strong>{mainContact?.name||'Sin persona de contacto'}</strong> · {mainContact?'Persona':'Canales del negocio'}: {[mainContact?.email,mainContact?.phone].filter(Boolean).join(' · ')||[d.account.email,d.account.telefono].filter(Boolean).join(' · ')||'Falta teléfono o email'}</p>}{!compact&&accountId&&<p className={styles.headerContact}>{lastContact?<><strong>Último contacto:</strong> {lastContact.title} · {prettyInstant(lastContact.occurredAt)}</>:historySummary.isPending?'Buscando último contacto…':historySummary.error?'No se pudo cargar el último contacto':'Sin contactos registrados'}</p>}</div>
      {!readOnly&&<div className={styles.actions}>{!compact&&!d.account.doNotContact&&<Button onClick={()=>openContact()}>Contactar</Button>}<Button size="sm" variant="outline" onClick={()=>setEditor({kind:"account",item:d.account})}>Editar negocio</Button><DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" aria-label="Más acciones del negocio"><Ellipsis size={19} aria-hidden="true"/>{compact&&<span>Más acciones del negocio</span>}</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={copyAgendaName}>Copiar nombre para agendar</DropdownMenuItem>{authState.type==='authenticated'&&authState.user.role==='admin'&&<DropdownMenuItem onSelect={()=>setEditor({kind:"archive"})}>{d.account.archivedAt?"Recuperar negocio archivado":"Archivar negocio válido"}</DropdownMenuItem>}<DropdownMenuItem onSelect={()=>setEditor({kind:"delete_account"})}>Enviar a Papelera · registro inválido</DropdownMenuItem>{!d.account.isClient&&<DropdownMenuItem onSelect={()=>setEditor({kind:"convert"})}>Registrar cliente previo</DropdownMenuItem>}{d.account.isClient&&authState.type==='authenticated'&&authState.user.role==='admin'&&<DropdownMenuItem onSelect={()=>setEditor({kind:"unmark_client"})}>Quitar marca Cliente</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div>}
      {readOnly&&!compact&&<div className={styles.actions}><Button variant="outline" title="Agendá el contacto en WhatsApp con este nombre para que el script lo reconozca" onClick={copyAgendaName}>Copiar nombre para agendar</Button></div>}
    </header>
    <BusinessRestrictionBanner account={d.account} dncMark={dncMark}/>
    {readOnly&&!d.account.archivedAt&&<p role="status">Podés consultar este negocio{contactEditable?" y corregir sus datos de contacto":""}. {d.account.doNotContact?"Mientras tenga No contactar, solo un administrador puede modificarlo.":"Solo su responsable o un administrador puede modificarlo."}</p>}
    {savedStep&&!compact&&<section className={styles.conversationContinue} role="status"><h2>{savedStep.kind==='contact'?'Persona guardada. Seguimos con el próximo paso.':'Gestión iniciada. Ahora planificá cómo empezar.'}</h2><p>{savedStep.kind==='contact'?'El próximo paso permanece visible para revisar qué corresponde hacer. No hace falta cargar otra vez el negocio.':'Abrí esta gestión para dejar el primer compromiso con fecha. La creación no envía mensajes.'}</p><div className={styles.actions}>{savedStep.kind==='opportunity'?<Button asChild><Link to={'/sales/'+savedStep.id} state={{from:'business'}}>Abrir gestión</Link></Button>:<Button onClick={()=>{setSavedStep(null);document.querySelector('[aria-label="Próximo paso"]')?.scrollIntoView({block:'center'})}}>Volver al próximo paso</Button>}<Button variant="ghost" onClick={()=>setSavedStep(null)}>Seguir en esta pantalla</Button></div></section>}
    {accountId&&accountId!==String(d.account.id)&&<p className={styles.muted}>El negocio que abriste fue fusionado con este. Estás viendo el negocio que quedó.</p>}
    {compact?<><Disclosure className={styles.relatedSection}><DisclosureSummary>Personas del negocio ({contacts.length})</DisclosureSummary>{contactSection}</Disclosure><Disclosure className={styles.relatedSection}><DisclosureSummary>Gestiones de este negocio ({opportunities.length})</DisclosureSummary>{opportunitySection}</Disclosure></>:<><div className={styles.recordColumns}><BusinessSidebar detail={d} mainContact={mainContact} contactCount={contacts.length} contactSection={contactSection}
        facts={businessDataSplit.populated.map(field=>({field,label:fieldLabels[field]||field,value:d.account[field]}))} emptyFactLabels={businessDataSplit.empty.map(field=>fieldLabels[field]||field)}
        readOnly={readOnly} contactEditable={contactEditable} canDoWork={canDoWork} work={work} onContact={openContact} onWork={setWorkEditor} onEditAccount={()=>setEditor({kind:"account",item:d.account})}/><div className={styles.recordMain}><div className={styles.nextWorkWrap}><HelpLink topic="nextStep"/><NextWork accountId={d.account.id} classification={d.account.commercialStatus==='client'?'won':'open'} detail={d} onAddContact={()=>{document.querySelector<HTMLElement>('aside[aria-label="'+BUSINESS_SIDEBAR_LABEL+'"] h3')?.scrollIntoView({block:'center'});document.querySelector<HTMLElement>('aside[aria-label="'+BUSINESS_SIDEBAR_LABEL+'"] h3')?.focus({preventScroll:true});if(!contacts.length){setPersonFromNextStep(true);setEditor({kind:'contact'});}}} onContact={openContact} onAddChannel={()=>setEditor({kind:'account',item:d.account})} readOnly={readOnly} onOpenWork={readOnly?undefined:openWork}/></div><SectionTabs value={displayedSection} onValueChange={setSection}>
      <div className={styles.businessTabHeader}><SectionTabList aria-label="Secciones del negocio"><SectionTab value="resumen">Resumen</SectionTab><SectionTab value="historial">Historial</SectionTab>{!readOnly&&<SectionTab value="tareas">Tareas <span aria-hidden="true" className={styles.tabCount}>{workSummary.data?.tasks.filter(task=>task.status==='pending').length??0}</span></SectionTab>}<SectionTab value="comunicacion">Comunicación</SectionTab><SectionTab value="gestiones">Gestiones <span aria-hidden="true" className={styles.tabCount}>{opportunities.length}</span></SectionTab><SectionTab value="documentos">Documentos</SectionTab></SectionTabList>{displayedSection==='historial'?<HelpLink topic="businessHistory"/>:displayedSection==='tareas'?<HelpLink topic="businessTasks"/>:displayedSection==='comunicacion'?<HelpLink topic="communication"/>:displayedSection==='gestiones'?<HelpLink topic="managements"/>:displayedSection==='documentos'?<HelpLink topic="library"/>:<HelpLink topic="businesses"/>}</div>
      <SectionTabPanel value="resumen"><BusinessSummaryTab detail={d} opportunities={opportunities} openTasks={openTasks} workQuery={workSummary} history={historySummary} readOnly={readOnly} canDoWork={canDoWork} work={work}
        onOpenWork={openWork} onSection={setSection} onLogActivity={()=>setWorkEditor({kind:'activity',accountId:d.account.id})}/></SectionTabPanel>
      <SectionTabPanel value="historial"><BusinessHistory key={`history-${d.account.id}`} accountId={String(d.account.id)} users={d.users} readOnly={readOnly}/><Disclosure className={styles.relatedSection}><DisclosureSummary>Revisar calidad y procedencia de los datos</DisclosureSummary><DataQualityPanel accountId={d.account.id} readOnly={readOnly}/></Disclosure><Disclosure className={styles.relatedSection}><DisclosureSummary>Cambios registrados en los datos</DisclosureSummary><section className={styles.section}><div><h3>Cambios registrados</h3><p className={styles.muted}>Cambios de datos del negocio, personas y gestiones. Últimos 200 eventos de cada historial.</p></div><div className={styles.history}>{history.map(h=><Disclosure key={h.id}><DisclosureSummary>{formatDate(h.date,true)} · {h.label} · {h.actor}</DisclosureSummary><pre>{h.detail}</pre></Disclosure>)}</div></section></Disclosure></SectionTabPanel>
      {!readOnly&&<SectionTabPanel value="tareas"><div id="business-work"><WorkPanel accountId={d.account.id}/></div></SectionTabPanel>}
      <SectionTabPanel value="comunicacion"><CommunicationPanel key={`comm-${d.account.id}`} accountId={String(d.account.id)} readOnly={readOnly}/></SectionTabPanel>
      <SectionTabPanel value="gestiones">{opportunitySection}</SectionTabPanel>
      <SectionTabPanel value="documentos"><ResourcesPanel accountId={d.account.id} readOnly={readOnly}/></SectionTabPanel>
    </SectionTabs></div></div></>}
    {contacting&&!compact&&!readOnly&&<BusinessContactDialog detail={d} initialChannel={contactChannel} returnFocusTo={contactReturnFocus.current} floatingComposer onClose={closeContact} onFloatingOpen={leadId=>{setFloatingActive(true);setFloatingLeadId(leadId)}} onFloatingClose={floating=>{setFloatingActive(false);setFloatingLeadId(undefined);if(floating)closeContact();else{setContactChannel(undefined);contactReturnFocus.current=null}}}/>}
    {workEditor&&workSummary.data&&<WorkEditor target={workEditor} data={workSummary.data} onClose={()=>setWorkEditor(null)}/>}
    {editor&&<CommercialEditor key={editor.kind+("item" in editor?editor.item?.id??"new":"")} target={editor} detail={d} onSaved={id=>{if((editor.kind==='opportunity'||(editor.kind==='contact'&&personFromNextStep))&&!editor.item)setSavedStep({kind:editor.kind,id})}} onClose={()=>{setEditor(null);setPersonFromNextStep(false)}}/>}
  </section></FloatingComposerProvider>;
}
