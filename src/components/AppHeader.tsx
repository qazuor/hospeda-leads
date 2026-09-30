import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, FileText, History, ListFilter, LogOut, Settings, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { useAuth } from "../helpers/useAuth";
import { ThemeModeSwitch } from "./ThemeModeSwitch";
import { LiveModeSwitch } from "./LiveModeSwitch";
import styles from "./AppHeader.module.css";

const LOGO="/hospeda-logo.jpg";

export const AppHeader=()=>{
  const location=useLocation();
  const {authState,logout}=useAuth();
  const items=[
    {to:"/",label:"Leads",icon:ListFilter},
    ...(authState.type==="authenticated"&&authState.user.role==="admin"?[
      {to:"/analytics",label:"Estadísticas",icon:BarChart3},
      {to:"/history",label:"Historial",icon:History},
      {to:"/templates",label:"Templates",icon:FileText},
      {to:"/trash",label:"Papelera",icon:Trash2},
      {to:"/settings",label:"Configuración",icon:Settings}
    ]:[]),
  ];
  return <header className={styles.header}>
    <Link to="/" className={styles.brand}><img src={LOGO} alt="Hospeda"/><div><strong>Hospeda Leads</strong><span>CRM comercial</span></div></Link>
    <nav>{items.map(item=>{const Icon=item.icon;const active=location.pathname===item.to;return <Link key={item.to} to={item.to} className={active?styles.active:""}><Icon size={16}/>{item.label}</Link>})}</nav>
    <div className={styles.user}><LiveModeSwitch/><ThemeModeSwitch/><span>{authState.type==="authenticated"?authState.user.displayName:""}</span><Button variant="ghost" size="icon-sm" onClick={()=>logout()} title="Salir"><LogOut size={17}/></Button></div>
  </header>
};