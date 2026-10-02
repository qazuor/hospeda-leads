import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./Dialog";
import { Button } from "./Button";
import { CommercialEditor } from "./CommercialEditor";
import { getCommercialList, getCommercialDetail } from "../endpoints/commercial.schema";
import { useDebounce } from "../helpers/useDebounce";
import styles from "./Commercial.module.css";

export function OpportunityStart({onClose,onCreated}:{onClose:()=>void;onCreated:(id:string)=>void}){
  const [search,setSearch]=useState("");
  const [accountId,setAccountId]=useState("");
  const [creatingBusiness,setCreatingBusiness]=useState(false);
  const q=useDebounce(search,250);
  const businesses=useQuery({queryKey:["commercial",q,"",1],queryFn:()=>getCommercialList(q,"",1),enabled:!accountId&&!creatingBusiness});
  const detail=useQuery({queryKey:["commercial-detail",accountId,""],queryFn:()=>getCommercialDetail(accountId),enabled:!!accountId});
  if(creatingBusiness)return <CommercialEditor target={{kind:"account"}} onSaved={setAccountId} onClose={()=>setCreatingBusiness(false)}/>;
  if(accountId&&detail.data)return <CommercialEditor target={{kind:"opportunity"}} detail={detail.data} onSaved={onCreated} onClose={onClose}/>;
  return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent className={styles.editor}>
    <DialogTitle>Crear una venta · Elegí el negocio</DialogTitle>
    <DialogDescription>¿A qué negocio querés ofrecerle un servicio? Primero buscá si ya existe para conservar juntos sus contactos y ventas.</DialogDescription>
    {accountId?<><p>{detail.error?detail.error.message:"Cargando negocio…"}</p><Button variant="outline" onClick={()=>setAccountId("")}>Volver a elegir</Button></>:<>
      <label className={styles.businessSearch}>Buscar negocio<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre, ciudad o email" autoFocus/></label>
      {businesses.isPending?<p>Cargando negocios…</p>:businesses.error?<p role="alert">{businesses.error.message}</p>:<div className={styles.businessChoices}>{businesses.data.rows.map(a=><Button key={a.id} variant="outline" onClick={()=>setAccountId(String(a.id))}><span><strong>{a.nombre}</strong><small>{a.ciudad||"Sin ciudad"} · {a.opportunityCount} ventas</small></span><span>Elegir →</span></Button>)}{!businesses.data.rows.length&&<p>No encontramos negocios con esa búsqueda.</p>}{businesses.data.total>50&&<p>Mostramos los primeros 50. Escribí un nombre o ciudad para acotar la búsqueda.</p>}</div>}
      <p className={styles.muted}>¿Es un negocio nuevo? Cargá sus datos una sola vez y después agregá lo que querés venderle.</p>
      <div className={styles.actions}><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={()=>setCreatingBusiness(true)}>Crear negocio nuevo</Button></div>
    </>}
  </DialogContent></Dialog>;
}
