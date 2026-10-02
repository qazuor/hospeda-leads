import React from "react";
import { Radio } from "lucide-react";
import { Button } from "./Button";
import { useLiveMode } from "../helpers/liveMode";
import styles from "./LiveModeSwitch.module.css";

export const LiveModeSwitch=()=>{
  const {enabled,status,toggle,lastCheckedAt}=useLiveMode();
  const title=enabled
    ? status==="error"
      ? "Actualización automática activa, pero no se pudo comprobar la conexión"
      : "Actualización automática activa: los cambios de otros usuarios aparecen automáticamente"
    : "Actualización automática desactivada";
  return <Button
    type="button"
    variant="ghost"
    size="sm"
    onClick={toggle}
    className={styles.button}
    title={title+(lastCheckedAt?" · Último chequeo "+lastCheckedAt.toLocaleTimeString("es-AR"):"")}
    aria-pressed={enabled}
  >
    <span className={styles.indicator+" "+(enabled?styles.on:styles.off)+" "+(status==="error"?styles.error:"")}/>
    <Radio size={15}/>
    <span className={styles.label}>Actualizar</span>
  </Button>;
};