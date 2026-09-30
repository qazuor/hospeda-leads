import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileText, Mail, MessageCircle, Plus, Search } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { RichTemplateEditor } from "../components/RichTemplateEditor";
import { Skeleton } from "../components/Skeleton";
import { getLeads } from "../endpoints/leads_GET.schema";
import { getSettings } from "../endpoints/settings_GET.schema";
import { postSettingsSave } from "../endpoints/settings_save_POST.schema";
import { buildHospedaEmailHtml } from "../helpers/hospedaEmailLayout";
import { renderMessageTemplate, renderMessageTemplateHtml, normalizeTemplateHtml } from "../helpers/renderMessageTemplate";
import { htmlToWhatsApp } from "../helpers/templateChannelFormatting";
import { useAuth } from "../helpers/useAuth";
import styles from "./templates.module.css";

type Channel="email"|"whatsapp";
type Profile=""|"Independiente"|"Consolidado"|"Referente";

export function TemplatesContent(){
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

  const data=q.data;
  const filtered=useMemo(()=>{
    const needle=search.trim().toLowerCase();
    if(!needle)return data?.templates??[];
    return (data?.templates??[]).filter(template=>
      [template.name,template.channel,template.vertical,template.commercialProfile]
        .filter(Boolean).some(value=>String(value).toLowerCase().includes(needle))
    );
  },[data?.templates,search]);

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
    setName((name.trim()||"Template")+" · copia");
  };
  const saveTemplate=async()=>{
    if(!name.trim())return;
    const plainEnough=body.replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").trim();
    if(!plainEnough)return;
    await save.mutateAsync({
      action:"saveTemplate",id:templateId,channel,name,
      subject:channel==="email"?subject:null,body,vertical:vertical||null,
      commercialProfile:profile||null
    });
    if(!templateId)reset();
  };

  const referenteWhatsapp=channel==="whatsapp"&&profile==="Referente";
  const previewLead=(leadsQ.data?.rows??[]).find(lead=>String(lead.id)===previewLeadId);
  const sender=authState.type==="authenticated"?authState.user.displayName:"Hospeda";
  const context={
    name:previewLead?.nombre??"Ruca Lihuén",
    contact:previewLead?.contactName??"María",
    contact_name:previewLead?.contactName??"María",
    city:previewLead?.ciudad??"Concepción del Uruguay",
    type:previewLead?.tipo??vertical||"Alojamiento",
    subtype:previewLead?.subtipo??"Cabañas",
    phone:previewLead?.telefono??"3442 000000",
    email:previewLead?.email??"contacto@ejemplo.com",
    website:previewLead?.sitioWeb??"https://hospeda.com.ar",
    sender
  };
  const renderedBody=renderMessageTemplateHtml(body,context);
  const renderedSubject=renderMessageTemplate(subject,context);
  const whatsappPreview=htmlToWhatsApp(renderedBody);

  return <section className={styles.embedded}>
    <header className={styles.embeddedHeader}>
      <div><h2>Templates</h2><p>Mensajes segmentados por canal, vertical y perfil comercial.</p></div>
      <Button onClick={reset}><Plus size={16}/>Nuevo template</Button>
    </header>
    {q.error&&<div className={styles.error}>{q.error.message}</div>}
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.search}><Search size={15}/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar template…"/></div>
        <div className={styles.templateCount}>{filtered.length} templates</div>
        {q.isLoading?<Skeleton className={styles.loading}/>:<div className={styles.templateList}>
          {filtered.map(template=>{
            const active=template.id===templateId;
            return <button type="button" key={template.id} onClick={()=>selectTemplate(template)} className={active?styles.activeTemplate:""}>
              <div className={styles.templateIcon}>{template.channel==="email"?<Mail size={15}/>:<MessageCircle size={15}/>}</div>
              <div><strong>{template.name}</strong><span>{[template.channel,template.vertical,template.commercialProfile].filter(Boolean).join(" · ")}</span></div>
            </button>;
          })}
        </div>}
      </aside>

      <div className={styles.editorWorkspace}>
        <article className={styles.editorCard}>
          <div className={styles.editorHeader}>
            <div className={styles.titleRow}><FileText size={20}/><div><h3>{templateId?"Editar template":"Nuevo template"}</h3><p>{channel==="whatsapp"?"Formato compatible con WhatsApp":"HTML enriquecido para email"}</p></div></div>
            <div className={styles.headerActions}>
              {templateId&&<Button size="sm" variant="outline" onClick={duplicate}><Copy size={15}/>Duplicar</Button>}
              <Badge variant={channel==="email"?"primary":"success"}>{channel==="email"?"Email":"WhatsApp"}</Badge>
            </div>
          </div>
          <div className={styles.metaGrid}>
            <label>Canal<select value={channel} onChange={e=>setChannel(e.target.value as Channel)}><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
            <label>Vertical<select value={vertical} onChange={e=>setVertical(e.target.value)}><option value="">Todas las verticales</option>{data?.types.map(type=><option key={type}>{type}</option>)}</select></label>
            <label>Perfil comercial<select value={profile} onChange={e=>setProfile(e.target.value as Profile)}><option value="">Todos los perfiles</option><option>Independiente</option><option>Consolidado</option><option>Referente</option></select></label>
          </div>
          <label className={styles.field}>Nombre del template<Input value={name} onChange={e=>setName(e.target.value)} placeholder="Ej: Primer contacto · Alojamiento · Independiente"/></label>
          {channel==="email"&&<label className={styles.field}>Asunto<Input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Asunto del email"/></label>}
          <div className={styles.editorLabel}>Contenido</div>
          <RichTemplateEditor key={channel+"-"+(templateId??"new")} value={body} onChange={setBody} channel={channel}/>
          {referenteWhatsapp&&<div className={styles.warning}>El perfil Referente se contacta con templates por Email, no por WhatsApp.</div>}
          {save.error&&<div className={styles.errorInline}>{save.error.message}</div>}
          <div className={styles.footer}><Button variant="outline" onClick={reset}>Limpiar editor</Button><Button onClick={saveTemplate} disabled={save.isPending||!name.trim()||referenteWhatsapp}>{save.isPending?"Guardando…":templateId?"Guardar cambios":"Crear template"}</Button></div>
        </article>

        <aside className={styles.previewCard}>
          <div className={styles.previewTitle}><strong>Vista previa</strong><span>Usá un lead real para comprobar variables antes de guardar.</span></div>
          <label className={styles.previewLead}>Previsualizar como
            <select value={previewLeadId} onChange={e=>setPreviewLeadId(e.target.value)}>
              <option value="">Datos de ejemplo</option>
              {(leadsQ.data?.rows??[]).map(lead=><option key={String(lead.id)} value={String(lead.id)}>{lead.nombre}{lead.ciudad?" · "+lead.ciudad:""}</option>)}
            </select>
          </label>
          {channel==="whatsapp"
            ? <div className={styles.whatsappPreview}>{whatsappPreview||"El mensaje aparecerá acá."}</div>
            : <><div className={styles.subjectPreview}>{renderedSubject||"Sin asunto"}</div><iframe className={styles.previewFrame} title="Vista previa del email" srcDoc={buildHospedaEmailHtml({bodyHtml:renderedBody,senderName:sender,subject:renderedSubject||"Mensaje de Hospeda",vertical:previewLead?.tipo??vertical,commercialProfile:previewLead?.commercialProfile??profile})}/></>}
        </aside>
      </div>
    </div>
  </section>;
}

export default function TemplatesPage(){
  return <Navigate to="/settings?section=templates" replace/>;
}