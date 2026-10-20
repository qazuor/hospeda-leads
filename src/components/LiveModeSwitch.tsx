import React,{useState,useSyncExternalStore} from "react";
import { Radio,ChevronDown } from "lucide-react";
import { Button } from "./Button";
import { useLiveMode } from "../helpers/liveMode";
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuCheckboxItem} from "./DropdownMenu";
import styles from "./LiveModeSwitch.module.css";
import { CRM_TIME_ZONE } from "../helpers/workDates";

const subscribeOnline=(notify:()=>void)=>{window.addEventListener("online",notify);window.addEventListener("offline",notify);return()=>{window.removeEventListener("online",notify);window.removeEventListener("offline",notify)}};
/** Browser connectivity; `navigator.onLine===false` is reliable, `true` only means "maybe". */
export const useOnline=()=>useSyncExternalStore(subscribeOnline,()=>navigator.onLine,()=>true);

export const LiveModeSwitch=()=>{
  const {enabled,status,setEnabled,lastCheckedAt,refresh}=useLiveMode();
  const [refreshing,setRefreshing]=useState(false);
  const online=useOnline();
  const title=!online
    ? "Sin conexión a internet. Tus datos siguen acá; vas a poder guardar cuando vuelva la conexión"
    : enabled
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
    aria-label={online?"Actualizar":"Sin conexión. Actualizar"}
    title={"Actualizar datos ahora. "+title+(lastCheckedAt?" · Último chequeo "+lastCheckedAt.toLocaleTimeString("es-AR",{timeZone:CRM_TIME_ZONE}):"")}
  >
    <span className={styles.indicator+" "+(online&&enabled?styles.on:styles.off)+" "+(online&&status==="error"?styles.error:"")}/>
    <Radio size={15}/>
    <span className={styles.label}>{refreshing?"Actualizando…":online?"Actualizar":"Sin conexión"}</span>
  </Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Opciones de actualización"><ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuCheckboxItem checked={enabled} onCheckedChange={setEnabled}>Actualizar automáticamente</DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu></div>;
};