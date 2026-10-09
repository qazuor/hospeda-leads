import {CrmDateInput} from './ui/CrmDateInput';
import { UnstyledButton } from '@mantine/core';
import React from "react";
import { CalendarClock, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { nextActionInfo, toDateInput } from "../helpers/crmDates";
import styles from "./NextActionPicker.module.css";

const addDays=(days:number)=>{
  const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);
  return toDateInput(d);
};

export function NextActionPicker({value,onChange,compact=false,disabled=false}:{value:unknown;onChange:(value:string)=>void;compact?:boolean;disabled?:boolean}){
  const normalized=toDateInput(value);
  const info=nextActionInfo(value);
  return <Popover>
    <PopoverTrigger asChild>
      <UnstyledButton type="button" disabled={disabled} title={info.title} className={styles.trigger+" "+styles[info.tone]+" "+(compact?styles.compact:"")}>
        <CalendarClock size={compact?13:15}/><span>{info.label}</span>
      </UnstyledButton>
    </PopoverTrigger>
    <PopoverContent align="start" className={styles.popover}>
      <strong>Próxima acción</strong>
      <CrmDateInput  value={normalized} onValueChange={e=>onChange(e)}/>
      <div className={styles.shortcuts}>
        <Button size="sm" variant="outline" onClick={()=>onChange(addDays(0))}>Hoy</Button>
        <Button size="sm" variant="outline" onClick={()=>onChange(addDays(1))}>Mañana</Button>
        <Button size="sm" variant="outline" onClick={()=>onChange(addDays(3))}>+3 días</Button>
        <Button size="sm" variant="outline" onClick={()=>onChange(addDays(7))}>+7 días</Button>
        <Button size="sm" variant="outline" onClick={()=>onChange(addDays(30))}>+30 días</Button>
      </div>
      {normalized&&<Button size="sm" variant="ghost" onClick={()=>onChange("")}><Trash2 size={13}/>Quitar fecha</Button>}
    </PopoverContent>
  </Popover>;
}