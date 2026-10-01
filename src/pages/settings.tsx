import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Mail, MailPlus, MapPin, Pencil, Radio, RotateCw, SlidersHorizontal, Tags, Trash2, Users, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/Dialog";
import { Input } from "../components/Input";
import { LiveModeSwitch } from "../components/LiveModeSwitch";
import { ThemeModeSwitch } from "../components/ThemeModeSwitch";
import { TemplatesContent } from "./templates";
import { getSettings, type SettingsUser } from "../endpoints/settings_GET.schema";
import { postSettingsSave } from "../endpoints/settings_save_POST.schema";
import styles from "./settings.module.css";

type Section="users"|"classifications"|"communication"|"templates"|"system";
const SECTIONS:Section[]=["users","classifications","communication","templates","system"];

export default function SettingsPage(){
  const qc=useQueryClient();
  const [params,setParams]=useSearchParams();
  const requested=params.get("section") as Section|null;
  const section:Section=requested&&SECTIONS.includes(requested)?requested:"users";
  const q=useQuery({queryKey:["settings"],queryFn:getSettings});
  const save=useMutation({mutationFn:postSettingsSave,onSuccess:()=>qc.invalidateQueries({queryKey:["settings"]})});
  const [city,setCity]=useState("");
  const [subtypeDrafts,setSubtypeDrafts]=useState<Record<string,string>>({});
  const [editingSubtype,setEditingSubtype]=useState<{id:string;name:string;typeName:string|null}|null>(null);
  const [deletingSubtype,setDeletingSubtype]=useState<{id:string;name:string;typeName:string|null}|null>(null);
  const [inviteOpen,setInviteOpen]=useState(false);
  const [inviteEmail,setInviteEmail]=useState("");
  const [editingUser,setEditingUser]=useState<SettingsUser|null>(null);
  const [editEmail,setEditEmail]=useState("");
  const [editFullName,setEditFullName]=useState("");
  const [editDisplayName,setEditDisplayName]=useState("");
  const [editPhone,setEditPhone]=useState("");
  const [editSex,setEditSex]=useState("");
  const [editSenderEmail,setEditSenderEmail]=useState("");
  const [senderName,setSenderName]=useState("");
  const [senderEmail,setSenderEmail]=useState("");
  const [replyToEmail,setReplyToEmail]=useState("");
  const data=q.data;

  useEffect(()=>{
    if(!editingUser)return;
    setEditEmail(editingUser.email);setEditFullName(editingUser.fullName??"");setEditDisplayName(editingUser.displayName);
    setEditPhone(editingUser.phone??"");setEditSex(editingUser.sex??"");setEditSenderEmail(editingUser.senderEmail??"");
  },[editingUser]);
  useEffect(()=>{
    if(!data?.emailDelivery)return;
    setSenderName(data.emailDelivery.senderName);setSenderEmail(data.emailDelivery.senderEmail);setReplyToEmail(data.emailDelivery.replyToEmail);
  },[data?.emailDelivery?.senderName,data?.emailDelivery?.senderEmail,data?.emailDelivery?.replyToEmail]);

  const go=(next:Section)=>setParams(next==="users"?{}:{section:next});
  const saveCity=async()=>{if(!city.trim())return;await save.mutateAsync({action:"addCity",name:city});setCity("")};
  const addSubtype=async(typeName:string|null)=>{
    const key=typeName??"__GENERAL__";
    const name=(subtypeDrafts[key]??"").trim();
    if(!name)return;
    await save.mutateAsync({action:"addSubtype",name,typeName});
    setSubtypeDrafts(prev=>({...prev,[key]:""}));
  };
  const saveSubtypeEdit=async()=>{
    if(!editingSubtype?.name.trim())return;
    await save.mutateAsync({action:"editSubtype",id:editingSubtype.id,name:editingSubtype.name.trim()});
    setEditingSubtype(null);
  };
  const confirmSubtypeDelete=async()=>{
    if(!deletingSubtype)return;
    await save.mutateAsync({action:"deleteSubtype",id:deletingSubtype.id});
    setDeletingSubtype(null);
  };
  const inviteUser=async()=>{if(!inviteEmail.trim())return;await save.mutateAsync({action:"inviteUser",email:inviteEmail.trim()});setInviteEmail("");setInviteOpen(false)};
  const saveUser=async()=>{
    if(!editingUser||!editEmail.trim()||!editDisplayName.trim())return;
    await save.mutateAsync({action:"updateUser",userId:editingUser.id,email:editEmail.trim(),fullName:editFullName.trim()||null,displayName:editDisplayName.trim(),phone:editPhone.trim()||null,sex:(editSex||null) as "masculino"|"femenino"|"otro"|"prefiero_no_decir"|null,senderEmail:editSenderEmail.trim()||null});
    setEditingUser(null);
  };
  const resendInvite=async(userId:number)=>{await save.mutateAsync({action:"resendUserInvite",userId})};
  const saveEmailDelivery=async()=>{
    if(!senderName.trim()||!senderEmail.trim()||!replyToEmail.trim())return;
    await save.mutateAsync({action:"saveEmailDelivery",senderName,senderEmail,replyToEmail});
  };

  const tabs=[
    {key:"users" as const,label:"Usuarios",icon:Users},
    {key:"classifications" as const,label:"Clasificaciones",icon:Tags},
    {key:"communication" as const,label:"Comunicación",icon:Mail},
    {key:"templates" as const,label:"Templates",icon:FileText},
    {key:"system" as const,label:"Sistema",icon:SlidersHorizontal},
  ];

  return <>
    <AppHeader/>
    <main className={styles.shell}>
      <header className={styles.pageHeader}><div><div className={styles.eyebrow}>ADMINISTRACIÓN</div><h1>Configuración</h1><p>Usuarios, clasificaciones, comunicación y comportamiento general del CRM.</p></div></header>
      <nav className={styles.sectionNav}>{tabs.map(tab=>{const Icon=tab.icon;return <button key={tab.key} type="button" className={section===tab.key?styles.sectionActive:""} onClick={()=>go(tab.key)}><Icon size={15}/>{tab.label}</button>})}</nav>
      {(q.error||save.error)&&<div className={styles.error}>{(q.error||save.error)?.message}</div>}

      {section==="users"&&<section className={styles.content}>
        <article className={styles.usersCard}>
          <div className={styles.usersHeader}>
            <div className={styles.cardTitle}><Users/><div><h2>Usuarios</h2><p>Accesos, identidad y remitente de Hospeda de cada integrante.</p></div></div>
            <Button onClick={()=>setInviteOpen(true)}><MailPlus size={16}/>Agregar usuario</Button>
          </div>
          <div className={styles.userTableHeader}><span>Usuario</span><span>Email real</span><span>Email Hospeda</span><span>Rol</span><span>Estado</span><span/></div>
          <div className={styles.usersList}>{data?.users.map(user=><div className={styles.userRow} key={user.id}>
            <div className={styles.userMain}><strong>{user.displayName}</strong><span>{user.fullName||"Nombre completo sin cargar"}</span></div>
            <div className={styles.userCell}>{user.email}</div><div className={styles.userCell}>{user.senderEmail||"—"}</div>
            <div><Badge variant="outline">{user.role==="admin"?"Administrador":"Usuario"}</Badge></div>
            <div><Badge variant={user.hasPassword?"success":"outline"}>{user.hasPassword?"Activo":user.invitationPending?"Invitación enviada":"Pendiente"}</Badge></div>
            <div className={styles.userActions}>
              {!user.hasPassword&&<Button variant="ghost" size="icon-sm" title={user.invitationPending?"Reenviar invitación":"Enviar invitación"} onClick={()=>resendInvite(user.id)} disabled={save.isPending}><RotateCw size={15}/></Button>}
              <Button variant="ghost" size="icon-sm" title="Editar usuario" onClick={()=>setEditingUser(user)}><Pencil size={15}/></Button>
            </div>
          </div>)}</div>
        </article>
      </section>}

      {section==="classifications"&&<section className={styles.classificationsLayout}>
        <article className={styles.card}>
          <div className={styles.cardTitle}><MapPin/><div><h2>Ciudades</h2><p>Opciones disponibles al cargar y filtrar oportunidades.</p></div></div>
          <div className={styles.inlineForm}><Input value={city} onChange={e=>setCity(e.target.value)} placeholder="Nueva ciudad"/><Button onClick={saveCity} disabled={save.isPending}>Agregar</Button></div>
          <div className={styles.tags}>{data?.cities.map(x=><Badge key={x.id} variant="outline">{x.name}</Badge>)}</div>
        </article>
        <div className={styles.subtypesArea}>
          <div className={styles.subtypesHeader}><Tags/><div><h2>Subtipos por vertical</h2><p>Cada vertical administra su propia lista. Los Generales están disponibles para todas.</p></div></div>
          <div className={styles.subtypeCards}>
            {[...(data?.types??[]).map(typeName=>({key:typeName,label:typeName,typeName})),{key:"__GENERAL__",label:"Generales",typeName:null}].map(group=>{
              const items=(data?.subtypes??[]).filter(item=>item.typeName===group.typeName);
              const draft=subtypeDrafts[group.key]??"";
              return <article className={styles.subtypeCard} key={group.key}>
                <div className={styles.subtypeCardHeader}>
                  <div><strong>{group.label}</strong><span>{group.typeName?"Subtipos exclusivos de esta vertical":"Disponibles para cualquier vertical"}</span></div>
                  <Badge variant="outline">{items.length}</Badge>
                </div>
                <div className={styles.subtypeList}>
                  {items.length===0&&<div className={styles.subtypeEmpty}>Todavía no hay subtipos.</div>}
                  {items.map(item=><div className={styles.subtypeRow} key={item.id}>
                    {editingSubtype?.id===item.id
                      ? <>
                          <Input value={editingSubtype.name} onChange={e=>setEditingSubtype({...editingSubtype,name:e.target.value})} autoFocus onKeyDown={e=>{if(e.key==="Enter")void saveSubtypeEdit();if(e.key==="Escape")setEditingSubtype(null)}}/>
                          <div className={styles.subtypeActions}><Button size="icon-sm" onClick={saveSubtypeEdit} disabled={save.isPending||!editingSubtype.name.trim()} title="Guardar"><Check size={15}/></Button><Button size="icon-sm" variant="ghost" onClick={()=>setEditingSubtype(null)} title="Cancelar"><X size={15}/></Button></div>
                        </>
                      : <>
                          <span>{item.name}</span>
                          <div className={styles.subtypeActions}><Button size="icon-sm" variant="ghost" onClick={()=>setEditingSubtype({id:item.id,name:item.name,typeName:item.typeName})} title="Editar subtipo"><Pencil size={14}/></Button><Button size="icon-sm" variant="ghost" onClick={()=>setDeletingSubtype({id:item.id,name:item.name,typeName:item.typeName})} title="Eliminar subtipo"><Trash2 size={14}/></Button></div>
                        </>}
                  </div>)}
                </div>
                <div className={styles.subtypeAdd}>
                  <Input value={draft} onChange={e=>setSubtypeDrafts(prev=>({...prev,[group.key]:e.target.value}))} placeholder={"Agregar a "+group.label+"…"} onKeyDown={e=>{if(e.key==="Enter")void addSubtype(group.typeName)}}/>
                  <Button size="sm" onClick={()=>addSubtype(group.typeName)} disabled={save.isPending||!draft.trim()}>Agregar</Button>
                </div>
              </article>;
            })}
          </div>
        </div>
      </section>}

      {section==="communication"&&<section className={styles.content}>
        <article className={styles.card}>
          <div className={styles.cardTitle}><Mail/><div><h2>Envío de email</h2><p>Configuración global de Brevo. El remitente personal de cada usuario sigue teniendo prioridad.</p></div><Badge variant={data?.emailDelivery.brevoConnected?"success":"warning"}>{data?.emailDelivery.brevoConnected?"Brevo conectado":"Falta API key"}</Badge></div>
          <div className={styles.deliveryGrid}>
            <label>Nombre remitente<Input value={senderName} onChange={e=>setSenderName(e.target.value)} placeholder="Hospeda"/></label>
            <label>Email remitente<Input type="email" value={senderEmail} onChange={e=>setSenderEmail(e.target.value)} placeholder="notificaciones@hospeda.com.ar"/></label>
            <label>Reply-To<Input type="email" value={replyToEmail} onChange={e=>setReplyToEmail(e.target.value)} placeholder="contacto@hospeda.com.ar"/></label>
          </div>
          <div className={styles.cardFooter}><Button onClick={saveEmailDelivery} disabled={save.isPending}>{save.isPending?"Guardando…":"Guardar configuración"}</Button></div>
        </article>
      </section>}

      {section==="templates"&&<section className={styles.templatesSection}><TemplatesContent/></section>}

      {section==="system"&&<section className={styles.grid}>
        <article className={styles.card}><div className={styles.cardTitle}><Radio/><div><h2>Actualización en tiempo real</h2><p>Controla si el CRM detecta cambios de otros usuarios automáticamente.</p></div></div><div className={styles.systemControl}><LiveModeSwitch/></div></article>
        <article className={styles.card}><div className={styles.cardTitle}><SlidersHorizontal/><div><h2>Apariencia</h2><p>Elegí tema claro, oscuro o el definido por el sistema operativo.</p></div></div><div className={styles.systemControl}><ThemeModeSwitch/></div></article>
      </section>}

      <Dialog open={!!deletingSubtype} onOpenChange={open=>{if(!open&&!save.isPending)setDeletingSubtype(null)}}>
        <DialogContent className={styles.userDialog}>
          <DialogHeader><DialogTitle>Eliminar subtipo</DialogTitle><DialogDescription><strong>{deletingSubtype?.name}</strong> dejará de aparecer como opción para nuevos cambios. Las oportunidades existentes conservarán ese valor.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={()=>setDeletingSubtype(null)} disabled={save.isPending}>Cancelar</Button><Button variant="destructive" onClick={confirmSubtypeDelete} disabled={save.isPending}>{save.isPending?"Eliminando…":"Eliminar subtipo"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}><DialogContent className={styles.userDialog}><DialogHeader><DialogTitle>Agregar usuario</DialogTitle><DialogDescription>Solo necesitamos su email. La persona completa el resto desde la invitación.</DialogDescription></DialogHeader><label className={styles.dialogField}><span>Email real</span><Input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="persona@ejemplo.com" autoFocus/></label><DialogFooter><Button variant="outline" onClick={()=>setInviteOpen(false)}>Cancelar</Button><Button onClick={inviteUser} disabled={save.isPending||!inviteEmail.trim()}><MailPlus size={16}/>{save.isPending?"Enviando…":"Enviar invitación"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={!!editingUser} onOpenChange={open=>{if(!open)setEditingUser(null)}}><DialogContent className={styles.userDialog}><DialogHeader><DialogTitle>Editar usuario</DialogTitle><DialogDescription>El email Hospeda se usa como From y Reply-To cuando esta persona envía correos desde el CRM.</DialogDescription></DialogHeader><div className={styles.editUserGrid}>
        <label className={styles.dialogField}><span>Nombre completo</span><Input value={editFullName} onChange={e=>setEditFullName(e.target.value)}/></label>
        <label className={styles.dialogField}><span>Nombre visible</span><Input value={editDisplayName} onChange={e=>setEditDisplayName(e.target.value)}/></label>
        <label className={styles.dialogField}><span>Teléfono</span><Input type="tel" value={editPhone} onChange={e=>setEditPhone(e.target.value)}/></label>
        <label className={styles.dialogField}><span>Sexo</span><select value={editSex} onChange={e=>setEditSex(e.target.value)}><option value="">Sin completar</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro</option><option value="prefiero_no_decir">Prefiere no decir</option></select></label>
        <label className={styles.dialogField+" "+styles.span2}><span>Email real</span><Input type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)}/></label>
        <label className={styles.dialogField+" "+styles.span2}><span>Email Hospeda para enviar mails</span><Input type="email" value={editSenderEmail} onChange={e=>setEditSenderEmail(e.target.value)} placeholder="nombre@hospeda.com.ar"/></label>
      </div><DialogFooter><Button variant="outline" onClick={()=>setEditingUser(null)}>Cancelar</Button><Button onClick={saveUser} disabled={save.isPending||!editEmail.trim()||!editDisplayName.trim()}>{save.isPending?"Guardando…":"Guardar cambios"}</Button></DialogFooter></DialogContent></Dialog>
    </main>
  </>;
}