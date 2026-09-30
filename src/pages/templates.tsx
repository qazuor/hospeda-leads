import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Mail, MessageCircle, Plus, Search } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { RichTemplateEditor } from "../components/RichTemplateEditor";
import { Skeleton } from "../components/Skeleton";
import { getSettings } from "../endpoints/settings_GET.schema";
import { postSettingsSave } from "../endpoints/settings_save_POST.schema";
import { normalizeTemplateHtml } from "../helpers/renderMessageTemplate";
import styles from "./templates.module.css";

type Channel="email"|"whatsapp";
type Profile=""|"Independiente"|"Consolidado"|"Referente";

export default function TemplatesPage(){
  const qc=useQueryClient();
  const q=useQuery({queryKey:["settings"],queryFn:getSettings});
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
  const [senderName,setSenderName]=useState("");
  const [senderEmail,setSenderEmail]=useState("");
  const [replyToEmail,setReplyToEmail]=useState("");

  const data=q.data;
  useEffect(()=>{
    if(!data?.emailDelivery)return;
    setSenderName(data.emailDelivery.senderName);
    setSenderEmail(data.emailDelivery.senderEmail);
    setReplyToEmail(data.emailDelivery.replyToEmail);
  },[data?.emailDelivery?.senderName,data?.emailDelivery?.senderEmail,data?.emailDelivery?.replyToEmail]);
  const filtered=useMemo(()=>{
    const needle=search.trim().toLowerCase();
    if(!needle)return data?.templates??[];
    return (data?.templates??[]).filter(template=>
      [template.name,template.channel,template.vertical,template.commercialProfile]
        .filter(Boolean)
        .some(value=>String(value).toLowerCase().includes(needle))
    );
  },[data?.templates,search]);

  const reset=()=>{
    setTemplateId(undefined);
    setChannel("whatsapp");
    setVertical("");
    setProfile("");
    setName("");
    setSubject("");
    setBody("<p></p>");
  };
  const selectTemplate=(template:(typeof filtered)[number])=>{
    setTemplateId(template.id);
    setChannel(template.channel as Channel);
    setVertical(template.vertical??"");
    setProfile((template.commercialProfile as Profile)??"");
    setName(template.name);
    setSubject(template.subject??"");
    setBody(normalizeTemplateHtml(template.body));
  };
  const saveTemplate=async()=>{
    if(!name.trim())return;
    const plainEnough=body.replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").trim();
    if(!plainEnough)return;
    await save.mutateAsync({
      action:"saveTemplate",
      id:templateId,
      channel,
      name,
      subject:channel==="email"?subject:null,
      body,
      vertical:vertical||null,
      commercialProfile:profile||null
    });
    if(!templateId)reset();
  };
  const saveEmailDelivery=async()=>{
    if(!senderName.trim()||!senderEmail.trim()||!replyToEmail.trim())return;
    await save.mutateAsync({
      action:"saveEmailDelivery",
      senderName,
      senderEmail,
      replyToEmail
    });
  };
  const referenteWhatsapp=channel==="whatsapp"&&profile==="Referente";

  return <>
    <AppHeader/>
    <main className={styles.shell}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>COMUNICACIÓN</div>
          <h1>Templates</h1>
          <p>Mensajes segmentados por canal, vertical y perfil comercial.</p>
        </div>
        <Button onClick={reset}><Plus size={16}/>Nuevo template</Button>
      </header>

      {q.error&&<div className={styles.error}>{q.error.message}</div>}

      <section className={styles.deliveryCard}>
        <div className={styles.deliveryTitle}>
          <div>
            <strong>Envío de Email · Brevo</strong>
            <span>Configuración usada por el backend para enviar templates enriquecidos.</span>
          </div>
          <Badge variant={data?.emailDelivery.brevoConnected?"success":"warning"}>
            {data?.emailDelivery.brevoConnected?"Brevo conectado":"Falta API key"}
          </Badge>
        </div>
        <div className={styles.deliveryGrid}>
          <label>Nombre remitente<Input value={senderName} onChange={e=>setSenderName(e.target.value)} placeholder="Hospeda"/></label>
          <label>Email remitente<Input type="email" value={senderEmail} onChange={e=>setSenderEmail(e.target.value)} placeholder="notificaciones@hospeda.com.ar"/></label>
          <label>Reply-To<Input type="email" value={replyToEmail} onChange={e=>setReplyToEmail(e.target.value)} placeholder="contacto@hospeda.com.ar"/></label>
          <Button variant="outline" onClick={saveEmailDelivery} disabled={save.isPending}>Guardar envío</Button>
        </div>
      </section>

      <section className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.search}>
            <Search size={15}/>
            <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar template…"/>
          </div>
          <div className={styles.templateCount}>{filtered.length} templates</div>
          {q.isLoading?<Skeleton className={styles.loading}/>:<div className={styles.templateList}>
            {filtered.map(template=>{
              const active=template.id===templateId;
              return <button type="button" key={template.id} onClick={()=>selectTemplate(template)} className={active?styles.activeTemplate:""}>
                <div className={styles.templateIcon}>{template.channel==="email"?<Mail size={15}/>:<MessageCircle size={15}/>}</div>
                <div>
                  <strong>{template.name}</strong>
                  <span>{[template.channel,template.vertical,template.commercialProfile].filter(Boolean).join(" · ")}</span>
                </div>
              </button>;
            })}
          </div>}
        </aside>

        <article className={styles.editorCard}>
          <div className={styles.editorHeader}>
            <div className={styles.titleRow}>
              <FileText size={20}/>
              <div>
                <h2>{templateId?"Editar template":"Nuevo template"}</h2>
                <p>{channel==="whatsapp"?"Formato compatible con WhatsApp":"HTML enriquecido para email"}</p>
              </div>
            </div>
            <Badge variant={channel==="email"?"primary":"success"}>{channel==="email"?"Email":"WhatsApp"}</Badge>
          </div>

          <div className={styles.metaGrid}>
            <label>Canal
              <select value={channel} onChange={e=>setChannel(e.target.value as Channel)}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </label>
            <label>Vertical
              <select value={vertical} onChange={e=>setVertical(e.target.value)}>
                <option value="">Todas las verticales</option>
                {data?.types.map(type=><option key={type}>{type}</option>)}
              </select>
            </label>
            <label>Perfil comercial
              <select value={profile} onChange={e=>setProfile(e.target.value as Profile)}>
                <option value="">Todos los perfiles</option>
                <option>Independiente</option>
                <option>Consolidado</option>
                <option>Referente</option>
              </select>
            </label>
          </div>

          <label className={styles.field}>Nombre del template
            <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Ej: Primer contacto · Alojamiento · Independiente"/>
          </label>

          {channel==="email"&&<label className={styles.field}>Asunto
            <Input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Asunto del email"/>
          </label>}

          <div className={styles.editorLabel}>Contenido</div>
          <RichTemplateEditor key={channel+"-"+(templateId??"new")} value={body} onChange={setBody} channel={channel}/>

          {referenteWhatsapp&&<div className={styles.warning}>El perfil Referente se contacta con templates por Email, no por WhatsApp.</div>}
          {save.error&&<div className={styles.errorInline}>{save.error.message}</div>}

          <div className={styles.footer}>
            <Button variant="outline" onClick={reset}>Limpiar editor</Button>
            <Button onClick={saveTemplate} disabled={save.isPending||!name.trim()||referenteWhatsapp}>
              {save.isPending?"Guardando…":templateId?"Guardar cambios":"Crear template"}
            </Button>
          </div>
        </article>
      </section>
    </main>
  </>;
}