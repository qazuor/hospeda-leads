import {UnstyledButton} from '@mantine/core';
import {ChevronRight, Building2} from 'lucide-react';
import { Input } from './Input';
import {canModifyBusiness} from "../helpers/crmPermissions";
import {useAuth} from "../helpers/useAuth";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "./Dialog";
import { Button } from "./Button";
import { CommercialEditor } from "./CommercialEditor";
import { getCommercialList, getCommercialDetail } from "../endpoints/commercial.schema";
import { useDebounce } from "../helpers/useDebounce";
import styles from "./Commercial.module.css";
import {DisabledTooltip} from './Tooltip';
import {HelpHint} from './HelpHint';

export function OpportunityStart({onClose,onCreated}:{onClose:()=>void;onCreated:(id:string)=>void}){
  const {authState}=useAuth();
  const user=authState.type==="authenticated"?authState.user:undefined;
  const [search,setSearch]=useState("");
  const [accountId,setAccountId]=useState("");
  const [creatingBusiness,setCreatingBusiness]=useState(false);
  const q=useDebounce(search,250);
  const businesses=useQuery({queryKey:["commercial",q,"",1],queryFn:()=>getCommercialList(q,"",1),enabled:!accountId&&!creatingBusiness});
  const detail=useQuery({queryKey:["commercial-detail",accountId,""],queryFn:()=>getCommercialDetail(accountId),enabled:!!accountId});
  if(creatingBusiness)return <CommercialEditor target={{kind:"account"}} onSaved={setAccountId} onClose={()=>setCreatingBusiness(false)}/>;
  if(accountId&&detail.data)return <CommercialEditor target={{kind:"opportunity"}} detail={detail.data} onSaved={onCreated} onClose={onClose}/>;
  return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent className={`${styles.editor} ${styles.startEditor}`}>
    <DialogTitle>Iniciar gestión</DialogTitle>
    <DialogDescription>Elegí el negocio al que querés ofrecerle un servicio. Buscalo antes de crear uno nuevo.</DialogDescription>
    <p className={styles.muted}>Una gestión es lo que querés lograr con ese negocio. <HelpHint term="management"/></p>
    {accountId?<><p>{detail.error?detail.error.message:"Cargando negocio…"}</p><Button variant="outline" onClick={()=>setAccountId("")}>Volver a elegir</Button></>:<>
      <label className={styles.businessSearch}>Buscar negocio<Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ej.: Hostería Los Sauces, Colón" autoFocus/></label>
      {businesses.isPending?<p role="status">Cargando negocios…</p>:businesses.error?<div role="alert"><p>{businesses.error.message}</p><Button variant="outline" disabled={businesses.isFetching} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>businesses.refetch()}>Reintentar</Button></div>:<div className={styles.businessChoices}>{businesses.data.rows.map(a=>{const allowed=canModifyBusiness(user,a);return <DisabledTooltip key={a.id} disabled={!allowed} reason="Solo podés iniciar gestiones en negocios a tu cargo; un administrador puede hacerlo en cualquiera." style={{width:'100%'}}><UnstyledButton className={styles.businessChoice} disabled={!allowed} onClick={()=>setAccountId(String(a.id))}><Building2 size={19} aria-hidden="true"/><span className={styles.choiceText}><strong>{a.nombre}</strong><small>{[a.ciudad,a.opportunityCount?`${a.opportunityCount} gestiones`:null,!allowed?'Otro responsable':null].filter(Boolean).join(' · ')||'Sin gestiones previas'}</small></span><ChevronRight size={18} aria-hidden="true"/></UnstyledButton></DisabledTooltip>})}{!businesses.data.rows.length&&<p>No encontramos negocios con esa búsqueda.</p>}{businesses.data.total>50&&<p>Mostramos los primeros 50. Escribí un nombre o ciudad para acotar la búsqueda.</p>}</div>}
      <p className={styles.muted}>Solo podés iniciar gestiones en tus negocios; un administrador puede hacerlo en cualquiera.</p>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="outline" onClick={()=>setCreatingBusiness(true)}>Crear negocio nuevo</Button></DialogFooter>
    </>}
  </DialogContent></Dialog>;
}
