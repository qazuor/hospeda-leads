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
import { renderMessageTemplate, renderMessageTemplateHtml, normalizeTemplateHtml } from "../helpers/renderMessageTemplate";
import { htmlToWhatsApp, whatsappTextToPreviewHtml } from "../helpers/templateChannelFormatting";
import { useAuth } from "../helpers/useAuth";
import styles from "./templates.module.css";

type Channel="email"|"whatsapp";
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
  const [profile,setProfile]=useState<Profile>("");
  const [name,setName]=useState("");
  const [subject,setSubject]=useState("");
  const [body,setBody]=useState("<p></p>");
  const [previewLeadId,setPreviewLeadId]=useState("");
  const [groupBy,setGroupBy]=useState<"channel"|"vertical"|"profile">("channel");
  const [expandedGroups,setExpandedGroups]=useState<Set<string>>(new Set());
  const [deleteOpen,setDeleteOpen]=useState(false);

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
      if(groupBy==="channel")return template.channel==="email"?"Email":"WhatsApp";
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
    setTemplateId(undefined);setChannel("whatsapp");setVertical("");setProfile("");
    setName("");setSubject("");setBody("<p></p>");
  };
  const selectTemplate=(template:(typeof filtered)[number])=>{
    setTemplateId(template.id);setChannel(template.channel as Channel);setVertical(template.vertical??"");
    setProfile((template.commercialProfile as Profile)??"");setName(template.name);
    setSubject(template.subject??"");setBody(normalizeTemplateHtml(template.body));
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
      subject:channel==="email"?subject:null,body,vertical:vertical||null,
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

  const historicalVertical=!!vertical&&!!data&&!data.types.includes(vertical);
  const previewLead=(leadsQ.data?.rows??[]).find(lead=>String(lead.id)===previewLeadId);
  const senderShort=authState.type==="authenticated"?authState.user.displayName:"Hospeda";
  const sender=authState.type==="authenticated"?(authState.user.fullName?.trim()||authState.user.displayName):"Hospeda";
  const example=!previewLeadId;
  const context=example?{
    name:"Ruca Lihuén",contact:"María",contact_name:"María",city:"Concepción del Uruguay",
    type:vertical||"Alojamiento",subtype:"Cabañas",phone:"3442 000000",email:"contacto@ejemplo.com",
    website:"https://hospeda.com.ar",sender,sender_short:senderShort
  }:{
    name:previewLead?.nombre??"",contact:previewLead?.contactName??"",contact_name:previewLead?.contactName??"",
    city:previewLead?.ciudad??"",type:previewLead?.tipo??"",subtype:previewLead?.subtipo??"",
    phone:previewLead?.telefono??"",email:previewLead?.email??"",website:previewLead?.sitioWeb??"",
    sender,sender_short:senderShort
  };
  const renderedBody=renderMessageTemplateHtml(body,context);
  const renderedSubject=renderMessageTemplate(subject,context);
  const whatsappPreview=htmlToWhatsApp(renderedBody);
  const whatsappPreviewHtml=whatsappTextToPreviewHtml(whatsappPreview);

  return <section className={styles.embedded}>
    <header className={styles.embeddedHeader}>
      <div><h2>Modelos de mensajes</h2><p>Prepará mensajes reutilizables y elegí para qué canal, vertical y perfil aparecen.</p></div>
      <Button onClick={reset}><Plus size={16}/>Nuevo modelo</Button>
    </header>
    {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/> }
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.search}><Search size={15}/><Input disabled={save.isPending} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar modelo…"/></div>
        <div className={styles.groupPicker}>
          <span>Agrupar por</span>
          <div>
            <UnstyledButton disabled={save.isPending} type="button" className={groupBy==="channel"?styles.groupActive:""} onClick={()=>setGroupBy("channel")}>Canal</UnstyledButton>
            <UnstyledButton disabled={save.isPending} type="button" className={groupBy==="vertical"?styles.groupActive:""} onClick={()=>setGroupBy("vertical")}>Vertical</UnstyledButton>
            <UnstyledButton disabled={save.isPending} type="button" className={groupBy==="profile"?styles.groupActive:""} onClick={()=>setGroupBy("profile")}>Perfil</UnstyledButton>
          </div>
        </div>
        <div className={styles.templateCount}>{filtered.length} modelo{filtered.length===1?"":"s"}</div>
        {q.isLoading?<><QueryLoadingNotice>Cargando modelos…</QueryLoadingNotice><Skeleton className={styles.loading}/></>:<div className={styles.templateGroups}>
          {templateGroups.map(group=>{
            const collapsed=!expandedGroups.has(groupKey(group.label));
            return <section className={styles.templateGroup} key={group.label}>
              <UnstyledButton disabled={save.isPending} type="button" className={styles.templateGroupTitle} onClick={()=>toggleGroup(group.label)} aria-expanded={!collapsed}>
                <div>{collapsed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<strong>{group.label}</strong></div>
                <span>{group.templates.length}</span>
              </UnstyledButton>
              {!collapsed&&<div className={styles.templateList}>
                {group.templates.map(template=>{
                  const active=template.id===templateId;
                  return <UnstyledButton disabled={save.isPending} type="button" key={template.id} onClick={()=>selectTemplate(template)} className={active?styles.activeTemplate:""}>
                    <div className={styles.templateIcon}>{template.channel==="email"?<Mail size={15}/>:<MessageCircle size={15}/>}</div>
                    <div><strong>{template.name}</strong><span>{[template.vertical||"Todas",template.commercialProfile||"Todos",template.channel].filter(Boolean).join(" · ")}</span></div>
                  </UnstyledButton>;
                })}
              </div>}
            </section>;
          })}
          {!templateGroups.length&&<div className={styles.emptyTemplates}>No hay modelos para mostrar.</div>}
        </div>}
      </aside>

      <div className={styles.editorWorkspace}>
        <article className={styles.editorCard}>
          <div className={styles.editorHeader}>
            <div className={styles.titleRow}><FileText size={20}/><div><h3>{templateId?"Editar modelo":"Nuevo modelo"}</h3><p>{channel==="whatsapp"?"Formato compatible con WhatsApp":"HTML enriquecido para email"}</p></div></div>
            <div className={styles.headerActions}><Button className={styles.previewShortcut} variant="outline" onClick={()=>{previewRef.current?.scrollIntoView({block:"start",behavior:"smooth"});previewRef.current?.focus({preventScroll:true})}}>Ver vista previa</Button>
              {templateId&&<Button size="sm" variant="outline" disabled={save.isPending} onClick={duplicate}><Copy size={15}/>Duplicar</Button>}
              {templateId&&<Button size="sm" variant="destructive" disabled={save.isPending} onClick={()=>setDeleteOpen(true)}><Trash2 size={15}/>Eliminar</Button>}
              <Badge variant={channel==="email"?"primary":"success"}>{channel==="email"?"Email":"WhatsApp"}</Badge>
            </div>
          </div>
          <div className={styles.metaGrid}>
            <label>Canal<NativeSelect disabled={save.isPending} value={channel} onChange={e=>setChannel(e.target.value as Channel)}><option value="whatsapp">WhatsApp</option><option value="email">Email</option></NativeSelect></label>
            <label>Vertical<NativeSelect disabled={save.isPending} value={vertical} onChange={e=>setVertical(e.target.value)}><option value="">Todas las verticales</option>{historicalVertical&&<option value={vertical}>{vertical} · Valor histórico</option>}{data?.types.map(type=><option key={type}>{type}</option>)}</NativeSelect></label>
            <label>Perfil comercial<NativeSelect disabled={save.isPending} value={profile} onChange={e=>setProfile(e.target.value as Profile)}><option value="">Todos los perfiles</option><option>Independiente</option><option>Consolidado</option><option>Referente</option></NativeSelect></label>
          </div>
          <label className={styles.field}>Nombre del modelo<Input disabled={save.isPending} value={name} onChange={e=>setName(e.target.value)} placeholder="Ej: Primer contacto · Alojamiento · Independiente"/></label>
          {channel==="email"&&<label className={styles.field}>Asunto<Input disabled={save.isPending} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Asunto del email"/></label>}
          <div className={styles.editorLabel}>Contenido</div>
          <div inert={save.isPending}><RichTemplateEditor key={channel+"-"+(templateId??"new")} value={body} onChange={setBody} channel={channel}/></div>
          <p className={styles.scopeHelp}>{TEMPLATE_SCOPE_HELP} Email y WhatsApp están disponibles para todos los perfiles.</p>
          {historicalVertical&&<p className={styles.warning}>Este modelo usa una vertical histórica: {vertical}. Conservá ese valor o elegí explícitamente una vertical actual; no se cambia automáticamente.</p>}
          {save.error&&<div className={styles.errorInline}>{save.error.message}</div>}
          <div className={styles.footer}><Button variant="outline" disabled={save.isPending} onClick={reset}>Limpiar editor</Button><Button onClick={saveTemplate} disabled={save.isPending||!name.trim()}>{save.isPending?"Guardando…":templateId?"Guardar cambios":"Crear modelo"}</Button></div>
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
            : <><div className={styles.subjectPreview}>{renderedSubject||"Sin asunto"}</div><iframe className={styles.previewFrame} title="Vista previa del email" srcDoc={buildHospedaEmailHtml({bodyHtml:renderedBody,senderName:sender,subject:renderedSubject||"Mensaje de Hospeda",vertical:previewLead?.tipo??vertical,commercialProfile:previewLead?.commercialProfile??profile})}/></>}
        </aside>
      </div>
    </div>

    <Dialog open={deleteOpen} onOpenChange={open=>{if(!save.isPending)setDeleteOpen(open)}}>
      <DialogContent className={styles.deleteDialog}>
        <DialogHeader>
          <DialogTitle>Eliminar modelo</DialogTitle>
          <DialogDescription><strong>{name||"Este modelo"}</strong> dejará de aparecer en la lista y no podrá usarse en nuevos contactos.</DialogDescription>
        </DialogHeader>
        <div className={styles.deleteWarning}>Los envíos históricos y referencias existentes se conservan. La baja es reversible a nivel de datos, aunque no exponemos restauración en la interfaz.</div>
        <DialogFooter>
          <Button variant="outline" onClick={()=>setDeleteOpen(false)} disabled={save.isPending}>Cancelar</Button>
          <Button variant="destructive" onClick={deleteTemplate} disabled={save.isPending}>{save.isPending?"Eliminando…":"Eliminar modelo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

export default function TemplatesPage(){
  return <Navigate to="/settings?section=templates" replace/>;
}
