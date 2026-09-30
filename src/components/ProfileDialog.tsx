import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCircle } from "lucide-react";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Input } from "./Input";
import { Skeleton } from "./Skeleton";
import { AUTH_QUERY_KEY } from "../helpers/useAuth";
import { getProfile } from "../endpoints/profile_GET.schema";
import { postProfile } from "../endpoints/profile_POST.schema";
import styles from "./ProfileDialog.module.css";

export function ProfileDialog({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}){
  const qc=useQueryClient();
  const q=useQuery({queryKey:["profile"],queryFn:getProfile,enabled:open});
  const save=useMutation({
    mutationFn:postProfile,
    onSuccess:async result=>{
      qc.setQueryData(AUTH_QUERY_KEY,result.user);
      await Promise.all([qc.invalidateQueries({queryKey:["profile"]}),qc.invalidateQueries({queryKey:["settings"]})]);
      onOpenChange(false);
    }
  });
  const [displayName,setDisplayName]=useState(""),[fullName,setFullName]=useState(""),[phone,setPhone]=useState(""),[sex,setSex]=useState("");
  useEffect(()=>{
    if(!q.data?.profile)return;
    setDisplayName(q.data.profile.displayName);setFullName(q.data.profile.fullName??"");setPhone(q.data.profile.phone??"");setSex(q.data.profile.sex??"");
  },[q.data?.profile]);

  const submit=()=>save.mutate({
    displayName:displayName.trim(),fullName:fullName.trim()||null,phone:phone.trim()||null,
    sex:(sex||null) as "masculino"|"femenino"|"otro"|"prefiero_no_decir"|null
  });

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={styles.dialog}>
    <DialogHeader><DialogTitle>Mi perfil</DialogTitle><DialogDescription>Estos datos identifican tu actividad dentro del CRM.</DialogDescription></DialogHeader>
    {q.isLoading?<Skeleton className={styles.loading}/>:q.error?<div className={styles.error}>{q.error.message}</div>:q.data&&<div className={styles.body}>
      <div className={styles.identity}><UserCircle size={28}/><div><strong>{q.data.profile.displayName}</strong><span>{q.data.profile.email}</span></div></div>
      <div className={styles.grid}>
        <label><span>Nombre completo</span><Input value={fullName} onChange={e=>setFullName(e.target.value)}/></label>
        <label><span>Nombre visible</span><Input value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label>
        <label><span>Teléfono</span><Input type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
        <label><span>Sexo</span><select value={sex} onChange={e=>setSex(e.target.value)}><option value="">Sin completar</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro</option><option value="prefiero_no_decir">Prefiero no decir</option></select></label>
        <label className={styles.wide}><span>Email de acceso</span><Input value={q.data.profile.email} disabled/></label>
        <label className={styles.wide}><span>Email Hospeda para envíos</span><Input value={q.data.profile.senderEmail??"Sin configurar"} disabled/></label>
      </div>
      {save.error&&<div className={styles.error}>{save.error.message}</div>}
    </div>}
    <DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={save.isPending||!displayName.trim()||q.isLoading}>{save.isPending?"Guardando…":"Guardar perfil"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}