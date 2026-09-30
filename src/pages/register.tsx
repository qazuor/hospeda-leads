import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PasswordRegisterForm } from "../components/PasswordRegisterForm";
import { getInvitation, type InvitationOutput } from "../endpoints/auth/invitation_GET.schema";
import styles from "./login.module.css";

export default function RegisterPage(){
  const [params]=useSearchParams();
  const token=params.get("invite")?.trim()??"";
  const [invitation,setInvitation]=useState<InvitationOutput|null>(null);
  const [loading,setLoading]=useState(!!token);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(!token){setLoading(false);return}
    let active=true;
    setLoading(true);
    setError(null);
    getInvitation(token)
      .then(data=>{if(active)setInvitation(data)})
      .catch(err=>{if(active)setError(err instanceof Error?err.message:"La invitación no es válida.")})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[token]);

  return <main className={styles.page}>
    <section className={styles.card}>
      <img className={styles.logo} src="/hospeda-logo.jpg" alt="Hospeda"/>
      <div className={styles.brand}>HOSPEDA.COM.AR</div>
      <h1>{token?"Completar usuario":"Crear acceso"}</h1>
      <p>{token
        ?"Completá tus datos y elegí una contraseña para activar tu acceso al CRM."
        :"Solo los correos autorizados desde Configuración pueden registrarse."}</p>

      {loading
        ? <p>Validando invitación…</p>
        : error
          ? <div><p>{error}</p><div className={styles.foot}><Link to="/login">Volver al login</Link></div></div>
          : <PasswordRegisterForm invitation={invitation?{token,email:invitation.email}:undefined}/>
      }

      {!token&&<div className={styles.foot}>¿Ya tenés cuenta? <Link to="/login">Ingresar</Link></div>}
    </section>
  </main>;
}
