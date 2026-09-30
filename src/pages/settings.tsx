import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, MapPin, Plus, Tags } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { getSettings } from "../endpoints/settings_GET.schema";
import { postSettingsSave } from "../endpoints/settings_save_POST.schema";
import styles from "./settings.module.css";

export default function SettingsPage(){
  const qc=useQueryClient();
  const q=useQuery({queryKey:["settings"],queryFn:getSettings});
  const save=useMutation({mutationFn:postSettingsSave,onSuccess:()=>qc.invalidateQueries({queryKey:["settings"]})});
  const [city,setCity]=useState("");
  const [subtype,setSubtype]=useState("");
  const [subtypeType,setSubtypeType]=useState("");
  const [email,setEmail]=useState("");
  const [displayName,setDisplayName]=useState("");
  const data=q.data;

  const saveCity=async()=>{if(!city.trim())return;await save.mutateAsync({action:"addCity",name:city});setCity("")};
  const saveSubtype=async()=>{if(!subtype.trim())return;await save.mutateAsync({action:"addSubtype",name:subtype,typeName:subtypeType||null});setSubtype("")};
  const saveEmail=async()=>{if(!email.trim())return;await save.mutateAsync({action:"addEmail",email,displayName:displayName||null});setEmail("");setDisplayName("")};

  return <>
    <AppHeader/>
    <main className={styles.shell}>
      <header className={styles.pageHeader}><div><div className={styles.eyebrow}>ADMINISTRACIÓN</div><h1>Configuración</h1><p>Opciones generales que alimentan los formularios y el acceso al CRM.</p></div></header>
      {q.error&&<div className={styles.error}>{q.error.message}</div>}
      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardTitle}><MapPin/><div><h2>Ciudades</h2><p>Opciones disponibles al cargar un lead.</p></div></div>
          <div className={styles.inlineForm}><Input value={city} onChange={e=>setCity(e.target.value)} placeholder="Nueva ciudad"/><Button onClick={saveCity} disabled={save.isPending}><Plus size={16}/>Agregar</Button></div>
          <div className={styles.tags}>{data?.cities.map(x=><Badge key={x.id} variant="outline">{x.name}</Badge>)}</div>
        </article>
        <article className={styles.card}>
          <div className={styles.cardTitle}><Tags/><div><h2>Subtipos</h2><p>Clasificación dependiente del tipo de lead.</p></div></div>
          <div className={styles.stackForm}><select value={subtypeType} onChange={e=>setSubtypeType(e.target.value)}><option value="">Sin tipo específico</option>{data?.types.map(x=><option key={x}>{x}</option>)}</select><div className={styles.inlineForm}><Input value={subtype} onChange={e=>setSubtype(e.target.value)} placeholder="Nuevo subtipo"/><Button onClick={saveSubtype} disabled={save.isPending}><Plus size={16}/>Agregar</Button></div></div>
          <div className={styles.list}>{data?.subtypes.map(x=><div key={x.id}><strong>{x.name}</strong><span>{x.typeName||"Todos los tipos"}</span></div>)}</div>
        </article>
        <article className={styles.card}>
          <div className={styles.cardTitle}><AtSign/><div><h2>Emails autorizados</h2><p>Quién puede registrarse e ingresar a la app.</p></div></div>
          <div className={styles.stackForm}><Input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="correo@ejemplo.com"/><Input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nombre visible (opcional)"/><Button onClick={saveEmail} disabled={save.isPending}><Plus size={16}/>Autorizar email</Button></div>
          <div className={styles.list}>{data?.authorizedEmails.map(x=><div key={x.id}><strong>{x.displayName||x.email}</strong><span>{x.email}</span></div>)}</div>
        </article>
      </section>
    </main>
  </>;
}