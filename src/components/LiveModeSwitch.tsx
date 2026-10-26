import React,{useSyncExternalStore} from "react";
import { Radio } from "lucide-react";
import { useLiveMode } from "../helpers/liveMode";
import styles from "./LiveModeSwitch.module.css";
import { CRM_TIME_ZONE } from "../helpers/workDates";
import { Tooltip } from '@mantine/core';

const subscribeOnline=(notify:()=>void)=>{window.addEventListener("online",notify);window.addEventListener("offline",notify);return()=>{window.removeEventListener("online",notify);window.removeEventListener("offline",notify)}};
/** Browser connectivity; `navigator.onLine===false` is reliable, `true` only means "maybe". */
export const useOnline=()=>useSyncExternalStore(subscribeOnline,()=>navigator.onLine,()=>true);

export const LiveModeSwitch=()=>{
  const {enabled,status,checkingNow,lastCheckedAt}=useLiveMode();
  const online=useOnline();
  const state=!online||!enabled||status==='error'?'error':status==='checking'||checkingNow?'refreshing':'live';
  const label=state==='error'?'En vivo · Sin conexión':state==='refreshing'?'En vivo · Actualizando':'En vivo';
  const checked=lastCheckedAt?lastCheckedAt.toLocaleString('es-AR',{timeZone:CRM_TIME_ZONE}):'Todavía no hubo una actualización correcta';
  const message=`${state==='error'?'No está funcionando':state==='refreshing'?'Actualizando ahora':'Actualización en vivo activa'} · Última actualización correcta: ${checked}`;
  return <Tooltip label={message} position="right"><div className={styles.controls} title={message} aria-label={message}>
    <span className={`${styles.indicator} ${styles[state]}`} aria-hidden="true"/><Radio size={15}/><span className={styles.label}>{label}</span>
  </div></Tooltip>;
};
