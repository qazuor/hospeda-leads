import { UnstyledButton } from '@mantine/core';
import React, { useMemo, useState } from "react";
import { Check, Filter, MinusCircle, PlusCircle, X } from "lucide-react";
import { Button } from "./Button";
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList
} from "./Command";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { ValueBadge, type BadgeCategory } from "./ValueBadge";
import styles from "./SmartMultiFilter.module.css";

export type SmartFilterState={include:string[];exclude:string[]};
export type SmartFilterOption={value:string;label:string};

export const emptySmartFilter=():SmartFilterState=>({include:[],exclude:[]});

export const SmartMultiFilter=({
  label,options,value,onChange,category="generic",className
}:{
  label:string;
  options:SmartFilterOption[];
  value:SmartFilterState;
  onChange:(next:SmartFilterState)=>void;
  category?:BadgeCategory;
  className?:string;
})=>{
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<"include"|"exclude">("include");
  const unique=useMemo(()=>{
    const seen=new Set<string>();
    return options.filter(option=>{
      if(!option.value||seen.has(option.value))return false;
      seen.add(option.value);
      return true;
    });
  },[options]);
  const count=value.include.length+value.exclude.length;
  const current=mode==="include"?value.include:value.exclude;
  const other=mode==="include"?value.exclude:value.include;
  const toggle=(option:string)=>{
    const selected=current.includes(option);
    const nextCurrent=selected?current.filter(x=>x!==option):[...current,option];
    const nextOther=other.filter(x=>x!==option);
    onChange(mode==="include"
      ? {include:nextCurrent,exclude:nextOther}
      : {include:nextOther,exclude:nextCurrent});
  };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <UnstyledButton type="button" className={styles.trigger+" "+(count?styles.active:"")+" "+(className??"")}>
        <Filter size={13}/>
        <span>{label}</span>
        {!!value.include.length&&<b className={styles.includeCount}>+{value.include.length}</b>}
        {!!value.exclude.length&&<b className={styles.excludeCount}>−{value.exclude.length}</b>}
      </UnstyledButton>
    </PopoverTrigger>
    <PopoverContent removeBackgroundAndPadding align="start" className={styles.popover}>
      <div className={styles.head}>
        <div><strong>{label}</strong><span>Incluidos = O · Excluidos se descartan</span></div>
        {count>0&&<Button variant="ghost" size="icon-sm" onClick={()=>onChange(emptySmartFilter())} title="Limpiar filtro"><X size={14}/></Button>}
      </div>
      <div className={styles.mode}>
        <UnstyledButton type="button" className={mode==="include"?styles.modeActive:""} onClick={()=>setMode("include")}><PlusCircle size={14}/>Incluir</UnstyledButton>
        <UnstyledButton type="button" className={mode==="exclude"?styles.modeExclude:""} onClick={()=>setMode("exclude")}><MinusCircle size={14}/>Excluir</UnstyledButton>
      </div>
      <Command>
        <CommandInput placeholder={"Buscar "+label.toLowerCase()+"…"}/>
        <CommandList className={styles.list}>
          <CommandEmpty>Sin resultados</CommandEmpty>
          {unique.map(option=>{
            const selected=current.includes(option.value);
            const opposite=other.includes(option.value);
            return <CommandItem key={option.value} value={option.label+" "+option.value} onSelect={()=>toggle(option.value)} className={styles.item}>
              <div className={styles.option}>
                <ValueBadge value={option.label} category={category}/>
                {opposite&&<small>{mode==="include"?"Actualmente excluido":"Actualmente incluido"}</small>}
              </div>
              {selected&&<Check size={15}/>}
            </CommandItem>;
          })}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
};