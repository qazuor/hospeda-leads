import React,{useState} from "react";
import { Radio,ChevronDown } from "lucide-react";
import { Button } from "./Button";
import { useLiveMode } from "../helpers/liveMode";
import { formatTime } from "../helpers/crmDates";
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuCheckboxItem} from "./DropdownMenu";
import styles from "./LiveModeSwitch.module.css";

export const LiveModeSwitch=()=>{
  const {enabled,status,setEnabled,lastCheckedAt,refresh}=useLiveMode();
  const [refreshing,setRefreshing]=useState(false);
  const title=enabled
    ? status==="error"
      ? "Actualización automática activa, pero no se pudo comprobar la conexión"
      : "Actualización automática activa: los cambios de otros usuarios aparecen automáticamente"
    : "Actualización automática desactivada";
  return <div className={styles.controls}><Button
    type="button"
    variant="ghost"
    size="sm"
    disabled={refreshing} disabledReason="La operación está en curso. Esperá a que termine para continuar."
    onClick={async()=>{setRefreshing(true);try{await refresh()}finally{setRefreshing(false)}}}
    className={styles.button}
    aria-label="Actualizar"
    title={"Actualizar datos ahora. "+title+(lastCheckedAt?" · Último chequeo "+formatTime(lastCheckedAt):"")}
  >
    <span className={styles.indicator+" "+(enabled?styles.on:styles.off)+" "+(status==="error"?styles.error:"")}/>
    <Radio size={15}/>
    <span className={styles.label}>{refreshing?"Actualizando…":"Actualizar"}</span>
  </Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Opciones de actualización"><ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuCheckboxItem checked={enabled} onCheckedChange={setEnabled}>Actualizar automáticamente</DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu></div>;
};