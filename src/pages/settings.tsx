import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, MapPin, Pencil, RotateCw, Tags, Users } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/Dialog";
import { Input } from "../components/Input";
import { getSettings, type SettingsUser } from "../endpoints/settings_GET.schema";
import { postSettingsSave } from "../endpoints/settings_save_POST.schema";
import styles from "./settings.module.css";

const sexLabel=(value:string|null)=>{
  if(value==="masculino")return "Masculino";
  if(value==="femenino")return "Femenino";
  if(value==="otro")return "Otro";
  if(value==="prefiero_no_decir")return "Prefiere no decir";
  return "Sin completar";
};

export default function SettingsPage(){
  const qc=useQueryClient();
  const q=useQuery({queryKey:["settings"],queryFn:getSettings});
  const save=useMutation({
    mutationFn:postSettingsSave,
    onSuccess:()=>qc.invalidateQueries({queryKey:["settings"]})
  });

  const [city,setCity]=useState("");
  const [subtype,setSubtype]=useState("");
  const [subtypeType,setSubtypeType]=useState("");

  const [inviteOpen,setInviteOpen]=useState(false);
  const [inviteEmail,setInviteEmail]=useState("");

  const [editingUser,setEditingUser]=useState<SettingsUser|null>(null);
  const [editEmail,setEditEmail]=useState("");
  const [editFullName,setEditFullName]=useState("");
  const [editDisplayName,setEditDisplayName]=useState("");
  const [editPhone,setEditPhone]=useState("");
  const [editSex,setEditSex]=useState("");
  const [editSenderEmail,setEditSenderEmail]=useState("");

  const data=q.data;

  useEffect(()=>{
    if(!editingUser)return;
    setEditEmail(editingUser.email);
    setEditFullName(editingUser.fullName??"");
    setEditDisplayName(editingUser.displayName);
    setEditPhone(editingUser.phone??"");
    setEditSex(editingUser.sex??"");
    setEditSenderEmail(editingUser.senderEmail??"");
  },[editingUser]);

  const saveCity=async()=>{
    if(!city.trim())return;
    await save.mutateAsync({action:"addCity",name:city});
    setCity("");
  };

  const saveSubtype=async()=>{
    if(!subtype.trim())return;
    await save.mutateAsync({action:"addSubtype",name:subtype,typeName:subtypeType||null});
    setSubtype("");
  };

  const inviteUser=async()=>{
    if(!inviteEmail.trim())return;
    await save.mutateAsync({action:"inviteUser",email:inviteEmail.trim()});
    setInviteEmail("");
    setInviteOpen(false);
  };

  const saveUser=async()=>{
    if(!editingUser||!editEmail.trim()||!editDisplayName.trim())return;
    await save.mutateAsync({
      action:"updateUser",
      userId:editingUser.id,
      email:editEmail.trim(),
      fullName:editFullName.trim()||null,
      displayName:editDisplayName.trim(),
      phone:editPhone.trim()||null,
      sex:(editSex||null) as "masculino"|"femenino"|"otro"|"prefiero_no_decir"|null,
      senderEmail:editSenderEmail.trim()||null
    });
    setEditingUser(null);
  };

  const resendInvite=async(userId:number)=>{
    await save.mutateAsync({action:"resendUserInvite",userId});
  };

  return <>
    <AppHeader/>
    <main className={styles.shell}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>ADMINISTRACIÓN</div>
          <h1>Configuración</h1>
          <p>Usuarios y opciones generales del CRM.</p>
        </div>
      </header>

      {(q.error||save.error)&&<div className={styles.error}>{(q.error||save.error)?.message}</div>}

      <section className={styles.grid}>
        <article className={styles.usersCard}>
          <div className={styles.usersHeader}>
            <div className={styles.cardTitle}>
              <Users/>
              <div>
                <h2>Usuarios</h2>
                <p>Accesos, datos personales y remitente de Hospeda de cada integrante.</p>
              </div>
            </div>
            <Button onClick={()=>setInviteOpen(true)}><MailPlus size={16}/>Agregar usuario</Button>
          </div>

          <div className={styles.userTableHeader}>
            <span>Usuario</span>
            <span>Email real</span>
            <span>Teléfono</span>
            <span>Sexo</span>
            <span>Email Hospeda</span>
            <span>Estado</span>
            <span/>
          </div>

          <div className={styles.usersList}>
            {data?.users.map(user=><div className={styles.userRow} key={user.id}>
              <div className={styles.userMain}>
                <strong>{user.displayName}</strong>
                <span>{user.fullName||"Nombre completo sin cargar"}</span>
              </div>
              <div className={styles.userCell}>{user.email}</div>
              <div className={styles.userCell}>{user.phone||"—"}</div>
              <div className={styles.userCell}>{sexLabel(user.sex)}</div>
              <div className={styles.userCell}>{user.senderEmail||"—"}</div>
              <div>
                <Badge variant={user.hasPassword?"default":"outline"}>
                  {user.hasPassword?"Activo":user.invitationPending?"Invitación enviada":"Pendiente"}
                </Badge>
              </div>
              <div className={styles.userActions}>
                {!user.hasPassword&&<Button
                  variant="ghost"
                  size="icon-sm"
                  title={user.invitationPending?"Reenviar invitación":"Enviar invitación"}
                  onClick={()=>resendInvite(user.id)}
                  disabled={save.isPending}
                ><RotateCw size={15}/></Button>}
                <Button variant="ghost" size="icon-sm" title="Editar usuario" onClick={()=>setEditingUser(user)}>
                  <Pencil size={15}/>
                </Button>
              </div>
            </div>)}
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}><MapPin/><div><h2>Ciudades</h2><p>Opciones disponibles al cargar un lead.</p></div></div>
          <div className={styles.inlineForm}>
            <Input value={city} onChange={e=>setCity(e.target.value)} placeholder="Nueva ciudad"/>
            <Button onClick={saveCity} disabled={save.isPending}>Agregar</Button>
          </div>
          <div className={styles.tags}>{data?.cities.map(x=><Badge key={x.id} variant="outline">{x.name}</Badge>)}</div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}><Tags/><div><h2>Subtipos</h2><p>Clasificación dependiente del tipo de lead.</p></div></div>
          <div className={styles.stackForm}>
            <select value={subtypeType} onChange={e=>setSubtypeType(e.target.value)}>
              <option value="">Sin tipo específico</option>
              {data?.types.map(x=><option key={x}>{x}</option>)}
            </select>
            <div className={styles.inlineForm}>
              <Input value={subtype} onChange={e=>setSubtype(e.target.value)} placeholder="Nuevo subtipo"/>
              <Button onClick={saveSubtype} disabled={save.isPending}>Agregar</Button>
            </div>
          </div>
          <div className={styles.list}>{data?.subtypes.map(x=><div key={x.id}><strong>{x.name}</strong><span>{x.typeName||"Todos los tipos"}</span></div>)}</div>
        </article>
      </section>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className={styles.userDialog}>
          <DialogHeader>
            <DialogTitle>Agregar usuario</DialogTitle>
            <DialogDescription>Solo necesitamos su email. La persona completa el resto de sus datos desde la invitación.</DialogDescription>
          </DialogHeader>
          <label className={styles.dialogField}>
            <span>Email real</span>
            <Input
              type="email"
              value={inviteEmail}
              onChange={e=>setInviteEmail(e.target.value)}
              placeholder="persona@ejemplo.com"
              autoFocus
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={inviteUser} disabled={save.isPending||!inviteEmail.trim()}>
              <MailPlus size={16}/>{save.isPending?"Enviando…":"Enviar invitación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={open=>{if(!open)setEditingUser(null)}}>
        <DialogContent className={styles.userDialog}>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>El email Hospeda se usa como From y Reply-To cuando esta persona envía correos desde el CRM.</DialogDescription>
          </DialogHeader>

          <div className={styles.editUserGrid}>
            <label className={styles.dialogField}>
              <span>Nombre completo</span>
              <Input value={editFullName} onChange={e=>setEditFullName(e.target.value)}/>
            </label>
            <label className={styles.dialogField}>
              <span>Nombre visible</span>
              <Input value={editDisplayName} onChange={e=>setEditDisplayName(e.target.value)}/>
            </label>
            <label className={styles.dialogField}>
              <span>Teléfono</span>
              <Input type="tel" value={editPhone} onChange={e=>setEditPhone(e.target.value)}/>
            </label>
            <label className={styles.dialogField}>
              <span>Sexo</span>
              <select value={editSex} onChange={e=>setEditSex(e.target.value)}>
                <option value="">Sin completar</option>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="otro">Otro</option>
                <option value="prefiero_no_decir">Prefiere no decir</option>
              </select>
            </label>
            <label className={styles.dialogField+" "+styles.span2}>
              <span>Email real</span>
              <Input type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)}/>
            </label>
            <label className={styles.dialogField+" "+styles.span2}>
              <span>Email Hospeda para enviar mails</span>
              <Input
                type="email"
                value={editSenderEmail}
                onChange={e=>setEditSenderEmail(e.target.value)}
                placeholder="nombre@hospeda.com.ar"
              />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditingUser(null)}>Cancelar</Button>
            <Button onClick={saveUser} disabled={save.isPending||!editEmail.trim()||!editDisplayName.trim()}>
              {save.isPending?"Guardando…":"Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  </>;
}
