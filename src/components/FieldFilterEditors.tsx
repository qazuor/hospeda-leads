import {CrmDateInput} from './ui/CrmDateInput';
import { NativeSelect } from './NativeSelect';
import { UnstyledButton } from '@mantine/core';
import React, { useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import styles from "./FieldFilterEditors.module.css";

export type TextFilterMode="none"|"contains"|"not_contains"|"equals"|"not_equals"|"empty"|"not_empty";
export type TextFilterState={mode:TextFilterMode;value:string};
export type DateFilterState={presence:"all"|"with"|"without";from:string;to:string};
export type IdFilterState={exact:string;min:string;max:string};

export const emptyTextFilter=():TextFilterState=>({mode:"none",value:""});
export const emptyDateFilter=():DateFilterState=>({presence:"all",from:"",to:""});
export const emptyIdFilter=():IdFilterState=>({exact:"",min:"",max:""});

const textModeLabel:Record<TextFilterMode,string>={
  none:"Sin filtro",
  contains:"Contiene",
  not_contains:"No contiene",
  equals:"Es exactamente",
  not_equals:"No es",
  empty:"Está vacío",
  not_empty:"Tiene valor"
};

export const TextFilterEditor=({
  value,onChange,placeholder="Texto…"
}:{
  value:TextFilterState;
  onChange:(next:TextFilterState)=>void;
  placeholder?:string;
})=>{
  const needsValue=["contains","not_contains","equals","not_equals"].includes(value.mode);
  return <div className={styles.stack}>
    <NativeSelect value={value.mode} onChange={e=>onChange({mode:e.target.value as TextFilterMode,value:value.value})}>
      {Object.entries(textModeLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}
    </NativeSelect>
    {needsValue&&<Input value={value.value} onChange={e=>onChange({...value,value:e.target.value})} placeholder={placeholder}/>}
    {value.mode!=="none"&&<Button variant="ghost" size="sm" onClick={()=>onChange(emptyTextFilter())}><X size={13}/>Limpiar</Button>}
  </div>;
};

export const DateFilterEditor=({
  value,onChange
}:{
  value:DateFilterState;
  onChange:(next:DateFilterState)=>void;
})=>{
  return <div className={styles.stack}>
    <NativeSelect value={value.presence} onChange={e=>onChange({...value,presence:e.target.value as DateFilterState["presence"]})}>
      <option value="all">Cualquier valor</option>
      <option value="with">Con fecha</option>
      <option value="without">Sin fecha</option>
    </NativeSelect>
    {value.presence!=="without"&&<>
      <label>Desde<CrmDateInput  value={value.from} onValueChange={e=>onChange({...value,from:e})}/></label>
      <label>Hasta<CrmDateInput  value={value.to} onValueChange={e=>onChange({...value,to:e})}/></label>
    </>}
    {(value.presence!=="all"||value.from||value.to)&&<Button variant="ghost" size="sm" onClick={()=>onChange(emptyDateFilter())}><X size={13}/>Limpiar</Button>}
  </div>;
};

export const IdFilterEditor=({
  value,onChange
}:{
  value:IdFilterState;
  onChange:(next:IdFilterState)=>void;
})=>{
  return <div className={styles.stack}>
    <label>ID exacto<Input inputMode="numeric" value={value.exact} onChange={e=>onChange({...value,exact:e.target.value})}/></label>
    {!value.exact&&<div className={styles.twoCols}>
      <label>Desde<Input inputMode="numeric" value={value.min} onChange={e=>onChange({...value,min:e.target.value})}/></label>
      <label>Hasta<Input inputMode="numeric" value={value.max} onChange={e=>onChange({...value,max:e.target.value})}/></label>
    </div>}
    {(value.exact||value.min||value.max)&&<Button variant="ghost" size="sm" onClick={()=>onChange(emptyIdFilter())}><X size={13}/>Limpiar</Button>}
  </div>;
};

export const BooleanFilterEditor=({
  value,onChange,labelTrue="Sí",labelFalse="No"
}:{
  value:"all"|"true"|"false";
  onChange:(next:"all"|"true"|"false")=>void;
  labelTrue?:string;
  labelFalse?:string;
})=><div className={styles.stack}>
  <NativeSelect value={value} onChange={e=>onChange(e.target.value as "all"|"true"|"false")}>
    <option value="all">Todos</option>
    <option value="true">{labelTrue}</option>
    <option value="false">{labelFalse}</option>
  </NativeSelect>
</div>;

export const TextFilterPopover=({
  label,value,onChange
}:{
  label:string;
  value:TextFilterState;
  onChange:(next:TextFilterState)=>void;
})=>{
  const [open,setOpen]=useState(false);
  const active=value.mode!=="none";
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <UnstyledButton type="button" className={styles.trigger+" "+(active?styles.active:"")}>
        <Filter size={13}/><span>{label}</span>{active&&<b>1</b>}
      </UnstyledButton>
    </PopoverTrigger>
    <PopoverContent align="start" className={styles.popover}>
      <strong className={styles.title}>{label}</strong>
      <TextFilterEditor value={value} onChange={onChange} placeholder={"Buscar en "+label.toLowerCase()+"…"}/>
    </PopoverContent>
  </Popover>;
};

export const describeTextFilter=(filter:TextFilterState)=>{
  if(filter.mode==="none")return "";
  if(filter.mode==="empty")return "vacío";
  if(filter.mode==="not_empty")return "con valor";
  return textModeLabel[filter.mode]+(filter.value?": "+filter.value:"");
};