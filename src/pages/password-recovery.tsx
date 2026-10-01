import React,{useState,useEffect} from "react";
import {Link} from "react-router-dom";
import {Input} from "../components/Input";
import {Button} from "../components/Button";
import {recoverPassword,requestSchema,resetSchema} from "../endpoints/auth/password_recovery.schema";
import styles from "./login.module.css";
export default function PasswordRecoveryPage({reset=false}:{reset?:boolean}){
 const [token]=useState(()=>{const value=new URLSearchParams(window.location.hash.slice(1)).get("token")||"";return value;});
 useEffect(()=>{if(reset)window.history.replaceState(null,"",window.location.pathname);},[reset]);
 const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [confirmation,setConfirmation]=useState("");
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [error,setError]=useState("");const [done,setDone]=useState(false);
 async function submit(event:React.FormEvent){event.preventDefault();setError("");setBusy(true);
 try{const parsed=reset?resetSchema.safeParse({token,password,confirmation}):requestSchema.safeParse({email});
 if(!parsed.success){setError(parsed.error.issues[0].message);return;}
 const result=await recoverPassword(reset?"reset":"request",parsed.data);setMessage(result.message);setDone(true);
 }catch(err){setError(err instanceof Error?err.message:"No se pudo completar la solicitud");}finally{setBusy(false);}}
 return <main className={styles.page}><section className={styles.card}><img className={styles.logo} src="/hospeda-logo.jpg" alt="Hospeda"/><h1>{reset?"Nueva contraseña":"Recuperar contraseña"}</h1><p>{reset?"Elegí una contraseña de entre 8 y 72 caracteres.":"Ingresá el email con el que accedés al CRM."}</p>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 {reset&&!token?<p role="alert">El enlace no es válido. <Link to="/forgot-password">Solicitar otro enlace</Link></p>:!done&&<form onSubmit={submit} className={styles.recoveryForm}>
 {reset?<><label>Nueva contraseña<Input type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label><label>Repetir contraseña<Input type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy}/></label></>:<label>Email<Input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>}
 <Button type="submit" disabled={busy}>{busy?"Procesando…":reset?"Guardar contraseña":"Enviar enlace de recuperación"}</Button></form>}
 <div className={styles.foot}><Link to="/login">Volver al login</Link>{reset&&<><br/><Link to="/forgot-password">Solicitar otro enlace</Link></>}</div></section></main>;
}
