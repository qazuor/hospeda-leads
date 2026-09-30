import React from "react";
import { Link } from "react-router-dom";
import { PasswordLoginForm } from "../components/PasswordLoginForm";
import styles from "./login.module.css";
export default function LoginPage(){
  return <main className={styles.page}><section className={styles.card}><img className={styles.logo} src="/hospeda-logo.jpg" alt="Hospeda"/><div className={styles.brand}>HOSPEDA.COM.AR</div><h1>Ingresar a Leads</h1><p>Gestión comercial interna de Hospeda.</p><PasswordLoginForm/><div className={styles.foot}>¿Primera vez? <Link to="/register">Crear acceso</Link></div></section></main>
}