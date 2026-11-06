import {HelpLink} from "../components/HelpLink";
import {CrmResponsiveNavigation} from '../components/ui/CrmResponsiveNavigation';
import {QueryLoadingNotice} from '../components/QueryLoadingNotice';
import {QueryErrorNotice} from '../components/QueryErrorNotice';
import {useOperationGuard} from '../helpers/useOperationGuard';
import {crmError} from '../helpers/crmErrors';
import {toast} from 'sonner';
import { UnstyledButton } from '@mantine/core';
import { NativeSelect } from '../components/NativeSelect';
import {BusinessListDefaults} from '../components/BusinessListDefaults';
import {ClassificationSettings} from "../components/ClassificationSettings";
import {SectionTabs, SectionTabList, SectionTab, SectionTabPanel} from "../components/SectionTabs";
import {SalesMaterialCategories} from "../components/SalesMaterialCategories";
import {PipelineSettings} from "../components/PipelineSettings";
import {WorkTypesSettings} from "../components/WorkTypesSettings";
import {BusinessReassignment} from "../components/BusinessReassignment";
import {MessageVariablesSettings} from "../components/MessageVariablesSettings";
import {InstagramIntegration} from '../components/InstagramIntegration';
import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, FileText, KeyRound, Mail, MailPlus, Minus, Pencil, Plus, Radio, RotateCw, Shield, SlidersHorizontal, Tags, UserCheck, Users, UserX, Variable } from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/Dialog";
import { Input } from "../components/Input";
import { LiveModeSwitch } from "../components/LiveModeSwitch";
import { ThemeModeSwitch } from "../components/ThemeModeSwitch";
import { TemplatesContent } from "./templates";
import {useAuth} from "../helpers/useAuth";
import { getSettings, type OperationalUser } from "../endpoints/settings_GET.schema";
import { postSettingsSave } from "../endpoints/settings_save_POST.schema";
import {CrmApiError} from '../helpers/apiClient';
import styles from "./settings.module.css";
import {plural} from '../content/vocabulary';

type Section="businesses"|"users"|"reassignment"|"classifications"|"process"|"communication"|"templates"|"variables"|"materialCategories"|"system";
const SECTIONS:Section[]=["businesses","users","reassignment","classifications","process","communication","templates","variables","materialCategories","system"];

export default function SettingsPage(){
  const {authState}=useAuth();
  const qc=useQueryClient();
  const [params,setParams]=useSearchParams();
  const requested=params.get("section") as Section|null;
  const section:Section=requested&&SECTIONS.includes(requested)?requested:"users";
  const q=useQuery({queryKey:["settings"],queryFn:getSettings});
  const runOperation=useOperationGuard(error=>toast.error(error instanceof Error?crmError(error):'No se pudo guardar'));
  const save=useMutation({mutationFn:postSettingsSave,onSuccess:()=>qc.invalidateQueries({queryKey:["settings"]})});
  const [inviteOpen,setInviteOpen]=useState(false);
  const [inviteEmail,setInviteEmail]=useState("");
  const [editingUser,setEditingUser]=useState<OperationalUser|null>(null);
  const [userAction,setUserAction]=useState<{user:OperationalUser;action:'role'|'reset'|'deactivate'|'reactivate'}|null>(null);
  const [reassignToUserId,setReassignToUserId]=useState<number|undefined>(undefined);
  const [editEmail,setEditEmail]=useState("");
  const [editFullName,setEditFullName]=useState("");
  const [editDisplayName,setEditDisplayName]=useState("");
  const [editPhone,setEditPhone]=useState("");
  const [editWhatsappPhones,setEditWhatsappPhones]=useState<string[]>([]);
  const [editSex,setEditSex]=useState("");
  const [editSenderEmail,setEditSenderEmail]=useState("");
  const [senderName,setSenderName]=useState("");
  const [senderEmail,setSenderEmail]=useState("");
  const [replyToEmail,setReplyToEmail]=useState("");
  const data=q.data;

  useEffect(()=>{
    if(!editingUser)return;
    setEditEmail(editingUser.email);setEditFullName(editingUser.fullName??"");setEditDisplayName(editingUser.displayName);
    setEditPhone(editingUser.phone??"");setEditWhatsappPhones(editingUser.whatsappPhones??[]);setEditSex(editingUser.sex??"");setEditSenderEmail(editingUser.senderEmail??"");
  },[editingUser]);
  useEffect(()=>{
    if(!data?.emailDelivery)return;
    setSenderName(data.emailDelivery.senderName);setSenderEmail(data.emailDelivery.senderEmail);setReplyToEmail(data.emailDelivery.replyToEmail);
  },[data?.emailDelivery?.senderName,data?.emailDelivery?.senderEmail,data?.emailDelivery?.replyToEmail]);

  const go=(next:Section)=>setParams(next==="users"?{}:{section:next});
  const inviteUser=async()=>{return runOperation('settings',async()=>{if(!inviteEmail.trim())return;await save.mutateAsync({action:"inviteUser",email:inviteEmail.trim()});setInviteEmail("");setInviteOpen(false)});};
  const saveUser=async()=>{return runOperation('settings',async()=>{
    if(!editingUser||!editEmail.trim()||!editDisplayName.trim())return;
    await save.mutateAsync({action:"updateUser",userId:editingUser.id,email:editEmail.trim(),fullName:editFullName.trim()||null,displayName:editDisplayName.trim(),phone:editPhone.trim()||null,whatsappPhones:editWhatsappPhones,sex:(editSex||null) as "masculino"|"femenino"|"otro"|"prefiero_no_decir"|null,senderEmail:editSenderEmail.trim()||null});
    setEditingUser(null);
  });};
  const resendInvite=async(userId:number)=>{return runOperation('settings',async()=>{await save.mutateAsync({action:"resendUserInvite",userId})});};
  const confirmUserAction=async()=>{if(!userAction)return;return runOperation('settings',async()=>{const {user,action}=userAction;try{if(action==='role')await save.mutateAsync({action:'setUserRole',userId:user.id,role:user.role==='admin'?'user':'admin'});else if(action==='reset')await save.mutateAsync({action:'resetUserPassword',userId:user.id});else if(action==='deactivate')await save.mutateAsync({action:'deactivateUser',userId:user.id,...(user.businessCount||user.managementCount||user.taskCount?{reassignToUserId}: {})});else await save.mutateAsync({action:'reactivateUser',userId:user.id});}catch(error){if(action==='deactivate'&&error instanceof CrmApiError&&error.status===409){const refreshed=await q.refetch();const latest=refreshed.data?.users.find(item=>item.id===user.id);if(latest)setUserAction({user:latest,action});}throw error;}toast.success(action==='reset'?'Enviamos el enlace de recuperación.':action==='role'?'Se actualizó el rol.':action==='deactivate'?'Usuario desactivado.':'Usuario reactivado.');setUserAction(null);});};
  const saveEmailDelivery=async()=>{return runOperation('settings',async()=>{
    if(!senderName.trim()||!senderEmail.trim()||!replyToEmail.trim())return;
    await save.mutateAsync({action:"saveEmailDelivery",senderName,senderEmail,replyToEmail});
  });};

  const tabs=[
    {key:"businesses" as const,label:"Listado de negocios",icon:SlidersHorizontal},
    {key:"users" as const,label:"Usuarios",icon:Users},
    {key:"reassignment" as const,label:"Redistribución",icon:GitBranch},
    {key:"classifications" as const,label:"Clasificaciones",icon:Tags},
    {key:"process" as const,label:"Proceso comercial",icon:GitBranch},
    {key:"communication" as const,label:"Comunicación",icon:Mail},
    {key:"templates" as const,label:"Modelos de mensajes",icon:FileText},
    {key:"variables" as const,label:"Variables de texto",icon:Variable},
    {key:"materialCategories" as const,label:"Categorías de material",icon:FileText},
    {key:"system" as const,label:"Sistema",icon:SlidersHorizontal},
  ];

  // The library section was replaced by «Material de venta» (spec 89); old links land on the new page.
  if(params.get("section")==="library")return <Navigate to="/sales-material" replace/>;
  return <>
    
    <main className={styles.shell}>
      <header className={styles.pageHeader}><div><div className={styles.eyebrow}>ADMINISTRACIÓN</div><h1 aria-label="Configuración" style={{display:"flex",alignItems:"center",gap:5,width:"max-content",maxWidth:"100%"}}>Configuración<HelpLink topic="settings"/></h1><p>Usuarios, clasificaciones, comunicación y comportamiento general del CRM.</p></div></header>
      <CrmResponsiveNavigation label="Sección de configuración" value={section} options={tabs.map(tab=>({value:tab.key,label:tab.label}))} onChange={value=>go(value as Section)}><nav aria-label="Secciones de configuración" className={styles.sectionNav}>{tabs.map(tab=>{const Icon=tab.icon;return <UnstyledButton key={tab.key} aria-current={section===tab.key?"page":undefined} type="button" className={section===tab.key?styles.sectionActive:""} onClick={()=>go(tab.key)}><Icon size={15}/>{tab.label}</UnstyledButton>})}</nav></CrmResponsiveNavigation>
      {q.isPending&&<QueryLoadingNotice/>}{q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/>}{save.error&&<div role="alert" className={styles.error}>{save.error.message}</div>}

      {section==="businesses"&&<BusinessListDefaults/>}
      {section==="reassignment"&&<BusinessReassignment/>}
      {section==="users"&&<section className={styles.content}>
        <article className={styles.usersCard}>
          <div className={styles.usersHeader}>
            <div className={styles.cardTitle}><Users/><div><h2>Usuarios</h2><p>Accesos, identidad y remitente de Hospeda de cada integrante.</p></div></div>
            <Button onClick={()=>setInviteOpen(true)}><MailPlus size={16}/>Agregar usuario</Button>
          </div>
          <div className={styles.userTableHeader}><span>Usuario</span><span>Email real</span><span>Email Hospeda</span><span>Rol</span><span>Estado</span><span/></div>
          <div className={styles.usersList}>{[...(data?.users??[])].sort((a,b)=>Number(!!a.deactivatedAt)-Number(!!b.deactivatedAt)).map(user=><div className={styles.userRow} key={user.id} style={user.deactivatedAt?{opacity:.58}:undefined}>
            <div className={styles.userMain}><strong>{user.displayName}</strong><span>{user.fullName||"Nombre completo sin cargar"}</span></div>
            <div className={styles.userCell}>{user.email}{!!user.whatsappPhones?.length&&<small>WhatsApp: {user.whatsappPhones.join(", ")}</small>}</div><div className={styles.userCell}>{user.senderEmail||"—"}</div>
            <div><Badge variant="outline">{user.role==="admin"?"Administrador":"Usuario"}</Badge></div>
            <div><Badge variant={user.deactivatedAt?"warning":user.hasPassword?"success":"outline"}>{user.deactivatedAt?"Inactivo":user.hasPassword?"Activo":user.invitationPending?"Invitación enviada":"Pendiente"}</Badge></div>
            <div className={styles.userActions}>
              {!user.deactivatedAt&&!user.hasPassword&&<Button variant="ghost" size="icon-sm" title={user.invitationPending?"Reenviar invitación":"Enviar invitación"} onClick={()=>resendInvite(user.id)} disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar."><RotateCw size={15}/></Button>}
              {!user.deactivatedAt&&user.hasPassword&&<Button variant="ghost" size="icon-sm" title="Restablecer contraseña" aria-label="Restablecer contraseña" onClick={()=>setUserAction({user,action:'reset'})} disabled={save.isPending}><KeyRound size={15}/></Button>}
              {!user.deactivatedAt&&authState.type==='authenticated'&&user.id!==authState.user.id&&<><Button variant="ghost" size="icon-sm" title={user.role==='admin'?'Hacer usuario':'Hacer administrador'} aria-label={user.role==='admin'?'Hacer usuario':'Hacer administrador'} onClick={()=>setUserAction({user,action:'role'})} disabled={save.isPending}><Shield size={15}/></Button><Button variant="ghost" size="icon-sm" title="Desactivar usuario" aria-label="Desactivar usuario" onClick={()=>{setReassignToUserId(undefined);setUserAction({user,action:'deactivate'})}} disabled={save.isPending}><UserX size={15}/></Button></>}
              {user.deactivatedAt&&<Button variant="ghost" size="icon-sm" title="Reactivar usuario" aria-label="Reactivar usuario" onClick={()=>setUserAction({user,action:'reactivate'})} disabled={save.isPending}><UserCheck size={15}/></Button>}
              <Button variant="ghost" size="icon-sm" title="Editar usuario" onClick={()=>setEditingUser(user)}><Pencil size={15}/></Button>
            </div>
          </div>)}</div>
      </article>
      </section>}
      <Dialog open={!!userAction} onOpenChange={open=>{if(!open&&!save.isPending)setUserAction(null)}}><DialogContent><DialogHeader><DialogTitle>{userAction?.action==='role'?'Cambiar rol':userAction?.action==='reset'?'Restablecer contraseña':userAction?.action==='deactivate'?'Desactivar usuario':'Reactivar usuario'}</DialogTitle><DialogDescription>{userAction?.action==='role'?`¿Querés cambiar el rol de ${userAction.user.displayName}?`:userAction?.action==='reset'?`Se invalida la contraseña actual y enviamos un enlace a ${userAction.user.email}.`:userAction?.action==='deactivate'?`¿Desactivar a ${userAction.user.displayName}?`: `¿Reactivar a ${userAction?.user.displayName}?`}</DialogDescription></DialogHeader>{userAction?.action==='deactivate'&&!!userAction.user.sellerGroupWarnings?.length&&<div role="note">{userAction.user.sellerGroupWarnings.map((warning,i)=><p key={i}>{warning}</p>)}</div>}{userAction?.action==='deactivate'&&!!((userAction.user.businessCount||0)+(userAction.user.managementCount||0)+(userAction.user.taskCount||0))&&<div><p>Tiene {plural(userAction.user.businessCount||0,'negocio','negocios')}, {plural(userAction.user.managementCount||0,'gestión abierta','gestiones abiertas')} y {plural(userAction.user.taskCount||0,'tarea pendiente','tareas pendientes')}. Elegí a quién reasignarlas:</p><NativeSelect value={reassignToUserId??''} onChange={e=>setReassignToUserId(Number(e.target.value)||undefined)}><option value="">Elegir usuario activo</option>{(data?.users??[]).filter(u=>!u.deactivatedAt&&u.id!==userAction.user.id).map(u=><option key={u.id} value={u.id}>{u.displayName}</option>)}</NativeSelect></div>}<DialogFooter><Button variant="outline" onClick={()=>setUserAction(null)} disabled={save.isPending}>Cancelar</Button><Button onClick={()=>void confirmUserAction()} disabled={save.isPending||(userAction?.action==='deactivate'&&!!((userAction.user.businessCount||0)+(userAction.user.managementCount||0)+(userAction.user.taskCount||0))&&!reassignToUserId)}>{save.isPending?'Procesando…':'Confirmar'}</Button></DialogFooter></DialogContent></Dialog>

      {section==="classifications"&&<section className={styles.content}>{data?<ClassificationSettings data={data}/>:<p role="status">Cargando clasificaciones…</p>}</section>}

      {section==="process"&&<section className={styles.processSection}>
        <header className={styles.processHeading}><h2>Proceso comercial</h2><p>Definí cómo avanzan las gestiones y cómo el equipo organiza sus próximos pasos.</p></header>
        <SectionTabs defaultValue="stages">
          <SectionTabList aria-label="Configuración del proceso comercial"><SectionTab value="stages">Etapas y resultados</SectionTab><SectionTab value="tasks">Tareas y seguimiento</SectionTab></SectionTabList>
          <SectionTabPanel value="stages"><PipelineSettings/></SectionTabPanel>
          <SectionTabPanel value="tasks"><WorkTypesSettings/></SectionTabPanel>
        </SectionTabs>
      </section>}

      {section==="communication"&&<section className={styles.content}><header className={styles.processHeading}><h2>Comunicación</h2><p>Configuración de los canales conectados.</p></header><InstagramIntegration/>
        <article className={styles.card}>
          <div className={styles.cardTitle}><Mail/><div><h2>Envío de email</h2><p>Configuración global de Brevo. El remitente personal de cada usuario sigue teniendo prioridad.</p></div><Badge variant={data?.emailDelivery?.brevoConnected?"success":"warning"}>{data?.emailDelivery?.brevoConnected?"Brevo conectado":"Falta API key"}</Badge></div>
          <div className={styles.deliveryGrid}>
            <label>Nombre remitente<Input value={senderName} onChange={e=>setSenderName(e.target.value)} placeholder="Hospeda"/></label>
            <label>Email remitente<Input type="email" value={senderEmail} onChange={e=>setSenderEmail(e.target.value)} placeholder="notificaciones@hospeda.com.ar"/></label>
            <label>Reply-To<Input type="email" value={replyToEmail} onChange={e=>setReplyToEmail(e.target.value)} placeholder="contacto@hospeda.com.ar"/></label>
          </div>
          <div className={styles.cardFooter}><Button onClick={saveEmailDelivery} disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar.">{save.isPending?"Guardando…":"Guardar configuración"}</Button></div>
        </article>
      </section>}

      {section==="materialCategories"&&<section className={styles.content}><SalesMaterialCategories/></section>}

      {section==="templates"&&<section className={styles.templatesSection}><TemplatesContent/></section>}

      {section==="variables"&&data&&<section className={styles.templatesSection}><MessageVariablesSettings data={data}/></section>}

      {section==="system"&&<section className={styles.grid}>
        {data?.userscriptAutoRegister&&<article className={styles.card}><div className={styles.cardTitle}><SlidersHorizontal/><div><h2>Registro automático de WhatsApp</h2><p>Permite registrar mensajes de chats asociados a un único negocio elegible.</p></div></div><div className={styles.systemControl}><label><input type="checkbox" checked={data.userscriptAutoRegister.enabled} disabled={save.isPending} onChange={e=>void runOperation('settings',()=>save.mutateAsync({action:'saveUserscriptAutoRegister',enabled:e.currentTarget.checked}))}/> Activar registro automático</label></div></article>}
        {data?.userscriptAttachFiles&&<article className={styles.card}><div className={styles.cardTitle}><SlidersHorizontal/><div><h2>Adjuntar archivos desde el script</h2><p>Permite adjuntar al chat de WhatsApp archivos de material de venta de hasta 50 MB.</p></div></div><div className={styles.systemControl}><label><input type="checkbox" checked={data.userscriptAttachFiles.enabled} disabled={save.isPending} onChange={e=>void runOperation('settings',()=>save.mutateAsync({action:'saveUserscriptAttachFiles',enabled:e.currentTarget.checked}))}/> Activar adjuntos desde el script</label></div></article>}
        <article className={styles.card}><div className={styles.cardTitle}><Radio/><div><h2>Actualización en tiempo real</h2><p>Controla si el CRM detecta cambios de otros usuarios automáticamente.</p></div></div><div className={styles.systemControl}><LiveModeSwitch/></div></article>
        <article className={styles.card}><div className={styles.cardTitle}><SlidersHorizontal/><div><h2>Apariencia</h2><p>Elegí tema claro, oscuro o el definido por el sistema operativo.</p></div></div><div className={styles.systemControl}><ThemeModeSwitch/></div></article>
      </section>}

      <Dialog open={inviteOpen} onOpenChange={open=>{if(!save.isPending)setInviteOpen(open)}}><DialogContent className={styles.userDialog}><DialogHeader><DialogTitle>Agregar usuario</DialogTitle><DialogDescription>Solo necesitamos su email. La persona completa el resto desde la invitación.</DialogDescription></DialogHeader><label className={styles.dialogField}><span>Email real</span><Input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="persona@ejemplo.com" autoFocus/></label><DialogFooter><Button variant="outline" disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>setInviteOpen(false)}>Cancelar</Button><Button onClick={inviteUser} disabled={save.isPending||!inviteEmail.trim()} disabledReason={(save.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Escribí el email de la persona."}><MailPlus size={16}/>{save.isPending?"Enviando…":"Enviar invitación"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={!!editingUser} onOpenChange={open=>{if(!open&&!save.isPending)setEditingUser(null)}}><DialogContent className={styles.userDialog}><DialogHeader><DialogTitle>Editar usuario</DialogTitle><DialogDescription>El email Hospeda se usa como From y Reply-To cuando esta persona envía correos desde el CRM.</DialogDescription></DialogHeader><div className={styles.editUserGrid}>
        <label className={styles.dialogField}><span>Nombre completo</span><Input value={editFullName} onChange={e=>setEditFullName(e.target.value)}/></label>
        <label className={styles.dialogField}><span>Nombre visible</span><Input value={editDisplayName} onChange={e=>setEditDisplayName(e.target.value)}/></label>
        <label className={styles.dialogField}><span>Teléfono</span><Input type="tel" value={editPhone} onChange={e=>setEditPhone(e.target.value)}/></label>
        <div className={styles.dialogField+" "+styles.span2}><span>WhatsApp asignados</span><small className={styles.whatsappHint}>El panel del CRM solo se activa si WhatsApp Web está conectado a uno de estos números. Si queda vacío, no hay restricción.</small><div className={styles.whatsappList}>{editWhatsappPhones.map((phone,index)=><div className={styles.whatsappInput} key={index}><Input type="tel" value={phone} onChange={e=>setEditWhatsappPhones(current=>current.map((item,i)=>i===index?e.target.value:item))} placeholder="+54 9 3442 12-3456" aria-label={`WhatsApp asignado ${index+1}`}/><Button type="button" variant="outline" size="icon-sm" aria-label={`Quitar WhatsApp ${index+1}`} onClick={()=>setEditWhatsappPhones(current=>current.filter((_,i)=>i!==index))}><Minus size={15}/></Button></div>)}<Button type="button" variant="outline" onClick={()=>setEditWhatsappPhones(current=>current.length<5?[...current,""]:current)} disabled={editWhatsappPhones.length>=5||save.isPending}><Plus size={15}/>Agregar número</Button></div></div>
        <label className={styles.dialogField}><span>Sexo</span><NativeSelect value={editSex} onChange={e=>setEditSex(e.target.value)}><option value="">Sin completar</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro</option><option value="prefiero_no_decir">Prefiere no decir</option></NativeSelect></label>
        <label className={styles.dialogField+" "+styles.span2}><span>Email real</span><Input type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)}/></label>
        <label className={styles.dialogField+" "+styles.span2}><span>Email Hospeda para enviar mails</span><Input type="email" value={editSenderEmail} onChange={e=>setEditSenderEmail(e.target.value)} placeholder="nombre@hospeda.com.ar"/></label>
      </div><DialogFooter><Button variant="outline" disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>setEditingUser(null)}>Cancelar</Button><Button onClick={saveUser} disabled={save.isPending||!editEmail.trim()||!editDisplayName.trim()} disabledReason={(save.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Completá el email y el nombre."}>{save.isPending?"Guardando…":"Guardar cambios"}</Button></DialogFooter></DialogContent></Dialog>
    </main>
  </>;
}
