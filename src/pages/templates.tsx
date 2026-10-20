import {CrmResponsiveDisclosure} from '../components/ui/CrmResponsiveDisclosure';
import {QueryLoadingNotice} from '../components/QueryLoadingNotice';
import {QueryErrorNotice} from '../components/QueryErrorNotice';
import {normalizeSearchText} from '../helpers/searchText';
import {TEMPLATE_SCOPE_HELP} from '../helpers/messageTemplatePolicy';
import { UnstyledButton } from '@mantine/core';
import { NativeSelect } from '../components/NativeSelect';
import React, { useRef, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Copy, FileText, Mail, MessageCircle, Plus, Search, Trash2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/Dialog";
import { Input } from "../components/Input";
import { RichTemplateEditor } from "../components/RichTemplateEditor";
import { Skeleton } from "../components/Skeleton";
import { getLeads } from "../endpoints/leads_GET.schema";
import { getSettings } from "../endpoints/settings_GET.schema";
import { postSettingsSave } from "../endpoints/settings_save_POST.schema";
import { buildHospedaEmailHtml } from "../helpers/hospedaEmailLayout";
import { renderMessageTemplate, renderMessageTemplateHtml, normalizeTemplateHtml,htmlToPlainText } from "../helpers/renderMessageTemplate";
import { htmlToWhatsApp, whatsappTextToPreviewHtml } from "../helpers/templateChannelFormatting";
import { useAuth } from "../helpers/useAuth";
import {managementTypes,managementTypeLabels,type ManagementType} from '../helpers/businessManagement';
import { defaultMessageVariableSettings } from "../helpers/messageVariables";
import styles from "./templates.module.css";
import {DisabledTooltip} from '../components/Tooltip';

type Channel="email"|"whatsapp"|"social"|"other";
type Profile=""|"Independiente"|"Consolidado"|"Referente";

export function TemplatesContent(){
  const previewRef=useRef<HTMLElement>(null);
  const qc=useQueryClient();
  const {authState}=useAuth();
  const q=useQuery({queryKey:["settings"],queryFn:getSettings});
  const leadsQ=useQuery({queryKey:["template-preview-leads"],queryFn:()=>getLeads({page:1,pageSize:100,sortBy:"nombre",sortDir:"asc"})});
  const save=useMutation({
    mutationFn:postSettingsSave,
    onSuccess:async()=>{await qc.invalidateQueries({queryKey:["settings"]})}
  });
  const [search,setSearch]=useState("");
  const [templateId,setTemplateId]=useState<string|undefined>();
  const [channel,setChannel]=useState<Channel>("whatsapp");
  const [vertical,setVertical]=useState("");
  const [managementType,setManagementType]=useState<ManagementType|"">("");
  const [profile,setProfile]=useState<Profile>("");
  const [name,setName]=useState("");
  const [subject,setSubject]=useState("");
  const [body,setBody]=useState("<p></p>");
  const [previewLeadId,setPreviewLeadId]=useState("");
  const [groupBy,setGroupBy]=useState<"channel"|"vertical"|"profile">("channel");
  const [expandedGroups,setExpandedGroups]=useState<Set<string>>(new Set());
  const [deleteOpen,setDeleteOpen]=useState(false);
  const [selectedVersion,setSelectedVersion]=useState('');

  const data=q.data;
  const filtered=useMemo(()=>{
    const needle=normalizeSearchText(search);
    if(!needle)return data?.templates??[];
    return (data?.templates??[]).filter(template=>
      [template.name,template.channel,template.vertical,template.commercialProfile]
        .filter(Boolean).some(value=>normalizeSearchText(String(value)).includes(needle))
    );
  },[data?.templates,search]);

  const templateGroups=useMemo(()=>{
    const map=new Map<string,typeof filtered>();
    const groupLabel=(template:(typeof filtered)[number])=>{
      if(groupBy==="channel")return ({email:"Email",whatsapp:"WhatsApp",social:"Red social",other:"Otro"} as Record<string,string>)[template.channel]??template.channel;
      if(groupBy==="vertical")return template.vertical||"Todas las verticales";
      return template.commercialProfile||"Todos los perfiles";
    };
    for(const template of filtered){
      const label=groupLabel(template);
      const list=map.get(label)??[];
      list.push(template);
      map.set(label,list);
    }
    const preferred=groupBy==="channel"
      ? ["WhatsApp","Email"]
      : groupBy==="profile"
        ? ["Independiente","Consolidado","Referente","Todos los perfiles"]
        : [...(data?.types??[]),"Todas las verticales"];
    return Array.from(map,([label,templates])=>({label,templates}))
      .sort((a,b)=>{
        const ai=preferred.indexOf(a.label),bi=preferred.indexOf(b.label);
        if(ai>=0||bi>=0)return (ai<0?999:ai)-(bi<0?999:bi);
        return a.label.localeCompare(b.label,"es");
      });
  },[filtered,groupBy,data?.types]);

  const groupKey=(label:string)=>groupBy+"::"+label;
  const toggleGroup=(label:string)=>{
    const key=groupKey(label);
    setExpandedGroups(prev=>{
      const next=new Set(prev);
      next.has(key)?next.delete(key):next.add(key);
      return next;
    });
  };

  const reset=()=>{
    setTemplateId(undefined);setChannel("whatsapp");setVertical("");setManagementType("");setProfile("");
    setName("");setSubject("");setBody("<p></p>");
  };
  const selectTemplate=(template:(typeof filtered)[number])=>{
    setTemplateId(template.id);setChannel(template.channel as Channel);setVertical(template.vertical??"");setManagementType(template.managementType as ManagementType||"");
    setProfile((template.commercialProfile as Profile)??"");setName(template.name);
    setSubject(template.subject??"");setBody(normalizeTemplateHtml(template.body));
    setSelectedVersion('');
  };
  const duplicate=()=>{
    if(!templateId)return;
    setTemplateId(undefined);
    setName((name.trim()||"Modelo")+" · copia");
  };
  const writeLock=useRef(false);
  const saveTemplate=async()=>{
    if(writeLock.current)return;
    if(!name.trim())return;
    const plainEnough=body.replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").trim();
    if(!plainEnough)return;
    writeLock.current=true;
    try{await save.mutateAsync({
      action:"saveTemplate",id:templateId,channel,name,
      subject:channel==="email"?subject:null,body,vertical:vertical||null,managementType:managementType||null,
      commercialProfile:profile||null
    });
    if(!templateId)reset();
    }catch{}finally{writeLock.current=false;}
  };
  const deleteTemplate=async()=>{
    if(!templateId||writeLock.current)return;
    writeLock.current=true;try{await save.mutateAsync({action:"deleteTemplate",id:templateId});
    setDeleteOpen(false);
    reset();
    }catch{}finally{writeLock.current=false;}
  };
  const selectedTemplate=data?.templates.find(t=>t.id===templateId);
  const versions=data?.templateVersions?.filter(v=>v.templateId===templateId)??[];
  const restoreVersion=async()=>{if(!templateId||!selectedVersion)return;try{await save.mutateAsync({action:'restoreTemplateVersion',id:templateId,version:Number(selectedVersion)});setSelectedVersion('')}catch{}}

  const historicalVertical=!!vertical&&!!data&&!data.types.includes(vertical);
  const previewLead=(leadsQ.data?.rows??[]).find(lead=>String(lead.id)===previewLeadId);
  const previewOwner=previewLead?.assignedUserEmail?data?.users.find(user=>user.email===previewLead.assignedUserEmail):undefined;
  const sender=previewOwner?.fullName?.trim()||previewOwner?.displayName||(authState.type==="authenticated"?(authState.user.fullName?.trim()||authState.user.displayName):"Responsable asignado");
  const example=!previewLeadId;
  const context=example?{
    name:"Ruca Lihuén",contact:"María",city:"Colón",type:vertical||"Alojamiento",subtype:"Hotel",phone:"3447 000000",email:"contacto@ejemplo.com",website:"https://ejemplo.com",sender,hospeda_url:"",managementType,channel
  }:{
    name:previewLead?.nombre??"",contact:previewLead?.contactName??"",city:previewLead?.ciudad??"",phone:previewLead?.telefono??"",email:previewLead?.email??"",website:previewLead?.sitioWeb??"",
    type:previewLead?.tipo??"",subtype:previewLead?.subtipo??"",sender,hospeda_url:"",managementType:previewLead?.managementType,channel
  };
  const messageVariables=data?.messageVariables??defaultMessageVariableSettings();
  const renderedBody=renderMessageTemplateHtml(body,context,messageVariables);
  const renderedSubject=renderMessageTemplate(subject,context,messageVariables);
  const whatsappPreview=htmlToWhatsApp(renderedBody);
  const whatsappPreviewHtml=whatsappTextToPreviewHtml(whatsappPreview);

  return <section className={styles.embedded}>
    <header className={styles.embeddedHeader}>
      <div><h2>Modelos de mensajes</h2><p>Prepará mensajes reutilizables y elegí para qué canal, vertical y perfil aparecen.</p></div>
      <Button onClick={reset}><Plus size={16}/>Nuevo modelo</Button>
    </header>
    {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/> }
    <div className={styles.layout}>
      <CrmResponsiveDisclosure label={`Elegir modelo (${filtered.length})`}><aside className={styles.sidebar}>
        <div className={styles.search}><Search size={15}/><Input disabled={save.isPending} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar modelo…"/></div>
        <div className={styles.groupPicker}>
          <span>Agrupar por</span>
          <div>
            <DisabledTooltip disabled={save.isPending} reason="Se está guardando el modelo. Esperá a que termine para cambiar la agrupación."><UnstyledButton disabled={save.isPending} type="button" className={groupBy==="channel"?styles.groupActive:""} onClick={()=>setGroupBy("channel")}>Canal</UnstyledButton></DisabledTooltip>
            <DisabledTooltip disabled={save.isPending} reason="Se está guardando el modelo. Esperá a que termine para cambiar la agrupación."><UnstyledButton disabled={save.isPending} type="button" className={groupBy==="vertical"?styles.groupActive:""} onClick={()=>setGroupBy("vertical")}>Vertical</UnstyledButton></DisabledTooltip>
            <DisabledTooltip disabled={save.isPending} reason="Se está guardando el modelo. Esperá a que termine para cambiar la agrupación."><UnstyledButton disabled={save.isPending} type="button" className={groupBy==="profile"?styles.groupActive:""} onClick={()=>setGroupBy("profile")}>Perfil</UnstyledButton></DisabledTooltip>
          </div>
        </div>
        <div className={styles.templateCount}>{filtered.length} modelo{filtered.length===1?"":"s"}</div>
        {q.isLoading?<><QueryLoadingNotice>Cargando modelos…</QueryLoadingNotice><Skeleton className={styles.loading}/></>:<div className={styles.templateGroups}>
          {templateGroups.map(group=>{
            const collapsed=!expandedGroups.has(groupKey(group.label));
            return <section className={styles.templateGroup} key={group.label}>
              <DisabledTooltip disabled={save.isPending} reason="Se está guardando el modelo. Esperá a que termine para cambiar la lista."><UnstyledButton disabled={save.isPending} type="button" className={styles.templateGroupTitle} onClick={()=>toggleGroup(group.label)} aria-expanded={!collapsed}>
                <div>{collapsed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<strong>{group.label}</strong></div>
                <span>{group.templates.length}</span>
              </UnstyledButton></DisabledTooltip>
              {!collapsed&&<div className={styles.templateList}>
                {group.templates.map(template=>{
                  const active=template.id===templateId;
                  return <DisabledTooltip key={template.id} disabled={save.isPending} reason="Se está guardando el modelo. Esperá a que termine para seleccionar otro."><UnstyledButton disabled={save.isPending} type="button" onClick={()=>selectTemplate(template)} className={active?styles.activeTemplate:""}>
                    <div className={styles.templateIcon}>{template.channel==="email"?<Mail size={15}/>:<MessageCircle size={15}/>}</div>
                    <div><strong>{template.name}{template.active===false?' · Desactivado':''}</strong><span>{[template.vertical||"Todas las verticales",template.managementType?managementTypeLabels[template.managementType as ManagementType]:"Todos los tipos",template.commercialProfile||"Todos los perfiles",template.channel].filter(Boolean).join(" · ")}</span></div>
                  </UnstyledButton></DisabledTooltip>;
                })}
              </div>}
            </section>;
          })}
          {!templateGroups.length&&<div className={styles.emptyTemplates}>No hay modelos para mostrar.</div>}
        </div>}
      </aside></CrmResponsiveDisclosure>

      <div className={styles.editorWorkspace}>
        <article className={styles.editorCard}>
          <div className={styles.editorHeader}>
            <div className={styles.titleRow}><FileText size={20}/><div><h3>{templateId?"Editar modelo":"Nuevo modelo"}</h3><p>{channel==="whatsapp"?"Formato compatible con WhatsApp":"HTML enriquecido para email"}</p></div></div>
            <div className={styles.headerActions}><Button className={styles.previewShortcut} variant="outline" onClick={()=>{previewRef.current?.scrollIntoView({block:"start",behavior:"smooth"});previewRef.current?.focus({preventScroll:true})}}>Ver vista previa</Button>
              {templateId&&<Button size="sm" variant="outline" disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={duplicate}><Copy size={15}/>Duplicar</Button>}
              {templateId&&selectedTemplate?.active!==false&&<Button size="sm" variant="ghost" className={styles.deleteAction} disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>setDeleteOpen(true)}><Trash2 size={15}/>Desactivar</Button>}
              {templateId&&selectedTemplate?.active===false&&<Button size="sm" variant="outline" disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>save.mutate({action:'setTemplateActive',id:templateId,active:true})}>Reactivar modelo</Button>}
              <Badge variant={channel==="email"?"primary":channel==="whatsapp"?"success":"secondary"}>{channel==="email"?"Email":channel==="whatsapp"?"WhatsApp":channel==='social'?'Red social':'Otro'}</Badge>
            </div>
          </div>
          <div className={styles.metaGrid}>
            <label>Canal<NativeSelect disabled={save.isPending} value={channel} onChange={e=>setChannel(e.target.value as Channel)}><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="social">Red social</option><option value="other">Otro</option></NativeSelect></label>
            <label>Vertical<NativeSelect disabled={save.isPending} value={vertical} onChange={e=>setVertical(e.target.value)}><option value="">Todas las verticales</option>{historicalVertical&&<option value={vertical}>{vertical} · Valor histórico</option>}{data?.types.map(type=><option key={type}>{type}</option>)}</NativeSelect></label>
            <label>Tipo de gestión<NativeSelect disabled={save.isPending} value={managementType} onChange={e=>setManagementType(e.target.value as ManagementType|"")}><option value="">Todos los tipos</option>{managementTypes.map(type=><option key={type} value={type}>{managementTypeLabels[type]}</option>)}</NativeSelect></label>
            <label>Perfil comercial<NativeSelect disabled={save.isPending} value={profile} onChange={e=>setProfile(e.target.value as Profile)}><option value="">Todos los perfiles</option><option>Independiente</option><option>Consolidado</option><option>Referente</option></NativeSelect></label>
          </div>
          <label className={styles.field}>Nombre del modelo<Input disabled={save.isPending} value={name} onChange={e=>setName(e.target.value)} placeholder="Ej: Primer contacto · Alojamiento · Independiente"/></label>
          {channel==="email"&&<label className={styles.field}>Asunto<Input disabled={save.isPending} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Asunto del email"/></label>}
          <div className={styles.editorLabel}>Contenido</div>
          <div inert={save.isPending}><RichTemplateEditor key={channel+"-"+(templateId??"new")} value={body} onChange={setBody} channel={channel==='whatsapp'?'whatsapp':'email'} messageVariables={messageVariables}/></div>
          <p className={styles.scopeHelp}>{TEMPLATE_SCOPE_HELP} Email, WhatsApp, redes sociales y Otros aceptan modelos compartidos; llamadas no usan modelos.</p>
          {!!versions.length&&<section><h4>Versiones anteriores</h4><NativeSelect value={selectedVersion} onChange={e=>setSelectedVersion(e.target.value)}><option value="">Elegí una versión</option>{versions.map(v=><option key={v.version} value={String(v.version)}>Versión {v.version} · {new Date(v.createdAt).toLocaleString('es-AR')}</option>)}</NativeSelect>{selectedVersion&&<><p>{htmlToPlainText(String(versions.find(v=>v.version===Number(selectedVersion))?.snapshot.body??''))}</p><Button variant="outline" disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>void restoreVersion()}>Restaurar esta versión</Button></>}</section>}
          {historicalVertical&&<p className={styles.warning}>Este modelo usa una vertical histórica: {vertical}. Conservá ese valor o elegí explícitamente una vertical actual; no se cambia automáticamente.</p>}
          {save.error&&<div className={styles.errorInline}>{save.error.message}</div>}
          <div className={styles.footer}><Button variant="outline" disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={reset}>Limpiar editor</Button><Button onClick={saveTemplate} disabled={save.isPending||!name.trim()} disabledReason={(save.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Completá los campos obligatorios o resolvé las condiciones indicadas en pantalla para habilitar esta acción."}>{save.isPending?"Guardando…":templateId?"Guardar cambios":"Crear modelo"}</Button></div>
        </article>

        <aside ref={previewRef} tabIndex={-1} aria-label="Vista previa del modelo" className={styles.previewCard}>
          <div className={styles.previewTitle}><strong>Vista previa</strong><span>Elegí un negocio para comprobar variables. Los datos de ejemplo son ficticios.</span></div>
          <label className={styles.previewLead}>Previsualizar como
            <NativeSelect disabled={save.isPending} value={previewLeadId} onChange={e=>setPreviewLeadId(e.target.value)}>
              <option value="">Datos de ejemplo</option>
              {(leadsQ.data?.rows??[]).map(lead=><option key={String(lead.id)} value={String(lead.id)}>{lead.nombre}{lead.ciudad?" · "+lead.ciudad:""}</option>)}
            </NativeSelect>
          </label>
          {channel==="whatsapp"
            ? <div className={styles.whatsappPreview} dangerouslySetInnerHTML={{__html:whatsappPreviewHtml||"El mensaje aparecerá acá."}}/>
            : channel==='email'?<><div className={styles.subjectPreview}>{renderedSubject||"Sin asunto"}</div><iframe className={styles.previewFrame} title="Vista previa del email" srcDoc={buildHospedaEmailHtml({bodyHtml:renderedBody,senderName:sender,subject:renderedSubject||"Mensaje de Hospeda",vertical:previewLead?.tipo??vertical,commercialProfile:previewLead?.commercialProfile??profile})}/></>:<pre className={styles.readable}>{htmlToPlainText(renderedBody)||"El mensaje aparecerá acá."}</pre>}
        </aside>
      </div>
    </div>

    <Dialog open={deleteOpen} onOpenChange={open=>{if(!save.isPending)setDeleteOpen(open)}}>
      <DialogContent className={styles.deleteDialog}>
        <DialogHeader>
          <DialogTitle>Desactivar modelo</DialogTitle>
          <DialogDescription><strong>{name||"Este modelo"}</strong> dejará de aparecer para nuevos contactos. Un administrador puede reactivarlo.</DialogDescription>
        </DialogHeader>
          <div className={styles.deleteWarning}>Las versiones anteriores y los contactos históricos se conservan.</div>
        <DialogFooter>
          <Button variant="outline" onClick={()=>setDeleteOpen(false)} disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar.">Cancelar</Button>
          <Button variant="destructive" onClick={deleteTemplate} disabled={save.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar.">{save.isPending?"Desactivando…":"Desactivar modelo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

export default function TemplatesPage(){
  return <Navigate to="/settings?section=templates" replace/>;
}
