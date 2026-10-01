import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/Button";
import { CommercialHelp } from "../components/CommercialHelp";
import { CommercialPanel } from "../components/CommercialPanel";
import { CommercialEditor } from "../components/CommercialEditor";
import { getCommercialList } from "../endpoints/commercial.schema";
import { useDebounce } from "../helpers/useDebounce";
import styles from "../components/Commercial.module.css";

export default function AccountsPage(){
  const {accountId}=useParams();
  const navigate=useNavigate();
  const [search,setSearch]=useState(""),[status,setStatus]=useState(""),[page,setPage]=useState(1),[creating,setCreating]=useState(false);
  const qText=useDebounce(search,250);
  const q=useQuery({queryKey:["commercial",qText,status,page],queryFn:()=>getCommercialList(qText,status,page),enabled:!accountId});
  return <><AppHeader/><main className={styles.shell}>
    {accountId?<><Link to="/accounts">← Cuentas / negocios</Link><CommercialPanel key={accountId} accountId={accountId}/></>:<>
      <div className={styles.heading}><div><h1>Cuentas / negocios</h1><p>Prospectos y clientes comerciales. La condición cliente no acredita pago.</p></div><Button onClick={()=>setCreating(true)}>Nueva cuenta</Button></div>
      <p className={styles.muted}>Creá una cuenta por negocio. Dentro de ella agregá sus personas de contacto y las ventas que querés gestionar, sin duplicar el negocio.</p>
      <CommercialHelp/>
      <div className={styles.filters}><label>Buscar<input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Negocio, ciudad o email"/></label><label>Condición<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Todas</option><option value="prospect">Prospectos</option><option value="client">Clientes comerciales</option></select></label></div>
      {q.isPending?<p>Cargando…</p>:q.error?<p role="alert">{q.error.message}</p>:<><p>{q.data.total} cuentas</p><div className={styles.rows}>{q.data.rows.map(a=><article key={a.id}><div><Link to={"/accounts/"+a.id}><strong>{a.nombre}</strong></Link><span>{a.ciudad||"Sin ciudad"} · {a.commercialStatus==="client"?"Cliente comercial":"Prospecto"} · {a.contactCount} contactos · {a.opportunityCount} oportunidades</span><span>{a.assignedUserEmail||"Sin responsable"}</span></div></article>)}</div><div className={styles.actions}><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span>Página {page}</span><Button variant="outline" disabled={page*50>=q.data.total} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div></>}
      {creating&&<CommercialEditor target={{kind:"account"}} onClose={()=>setCreating(false)} onSaved={id=>navigate("/accounts/"+id)}/>}
    </>}
  </main></>;
}
