import React from "react";
import { Link } from "react-router-dom";
import { PasswordRegisterForm } from "../components/PasswordRegisterForm";
import styles from "./login.module.css";
export default function RegisterPage(){
  return <main className={styles.page}><section className={styles.card}><img className={styles.logo} src="/hospeda-logo.jpg" alt="Hospeda"/><div className={styles.brand}>HOSPEDA.COM.AR</div><h1>Crear acceso</h1><p>Solo los correos autorizados desde Configuración pueden registrarse.</p><PasswordRegisterForm/><div className={styles.foot}>¿Ya tenés cuenta? <Link to="/login">Ingresar</Link></div></section></main>
}