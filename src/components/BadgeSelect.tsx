import { UnstyledButton } from '@mantine/core';
import React, { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./Command";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { ValueBadge, type BadgeCategory } from "./ValueBadge";
import styles from "./BadgeSelect.module.css";
import {DisabledTooltip} from './Tooltip';

export const BadgeSelect=({
  value,options,onChange,category="generic",placeholder="Seleccionar…",emptyLabel="Sin asignar",
  searchable=true,disabled=false,disabledReason="Solo el responsable autorizado del negocio o un administrador puede modificar este dato.",className,assignWhenEmpty=false
}:{
  value:string;
  options:string[];
  onChange:(value:string)=>void;
  category?:BadgeCategory;
  placeholder?:string;
  emptyLabel?:string;
  searchable?:boolean;
  disabled?:boolean;
  disabledReason?:string;
  className?:string;
  assignWhenEmpty?:boolean;
})=>{
  const [open,setOpen]=useState(false);
  const unique=useMemo(()=>Array.from(new Set(options.filter(Boolean))),[options]);
  return <Popover open={open} onOpenChange={setOpen}>
    <DisabledTooltip disabled={disabled} reason={disabledReason} style={{width:'100%'}}><PopoverTrigger asChild>
      <UnstyledButton
        type="button"
        disabled={disabled}
        onClick={e=>e.stopPropagation()}
        onDoubleClick={e=>e.stopPropagation()}
        className={styles.trigger+" "+(!value&&assignWhenEmpty?styles.emptyTrigger:"")+" "+(className??"")}
        title={value||placeholder}
      >
        <span className={styles.value}>
          {value
            ? <ValueBadge value={value} category={category}/>
            : assignWhenEmpty
              ? <span className={styles.assignPrompt}>Asignar</span>
              : <span className={styles.placeholder}>{placeholder}</span>}
        </span>
        {(!assignWhenEmpty||value)&&<ChevronsUpDown className={styles.chevrons} size={14}/>}
      </UnstyledButton>
    </PopoverTrigger></DisabledTooltip>
    <PopoverContent removeBackgroundAndPadding align="start" className={styles.popover}>
      <Command>
        {searchable&&<CommandInput placeholder="Buscar…"/>}
        <CommandList>
          <CommandEmpty>Sin resultados</CommandEmpty>
          <CommandItem value="__empty__" onSelect={()=>{onChange("");setOpen(false)}} className={styles.item}>
            <span className={styles.emptyOption}>{emptyLabel}</span>{!value&&<Check size={14}/>}
          </CommandItem>
          {unique.map(option=><CommandItem key={option} value={option} onSelect={()=>{onChange(option);setOpen(false)}} className={styles.item}>
            <ValueBadge value={option} category={category}/>{value===option&&<Check size={14}/>}
          </CommandItem>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
};
