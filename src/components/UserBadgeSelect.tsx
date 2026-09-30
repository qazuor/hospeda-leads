import React, { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./Command";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { ValueBadge } from "./ValueBadge";
import styles from "./UserBadgeSelect.module.css";

type UserOption={id:number;email:string;displayName:string;role:"admin"|"user"};

export const UserBadgeSelect=({
  value,users,onChange,placeholder="Seleccionar usuario…",emptyLabel="Sin asignar",assignWhenEmpty=false,className
}:{
  value:string;
  users:UserOption[];
  onChange:(email:string)=>void;
  placeholder?:string;
  emptyLabel?:string;
  assignWhenEmpty?:boolean;
  className?:string;
})=>{
  const [open,setOpen]=useState(false);
  const options=useMemo(()=>users.map(user=>({...user,label:user.displayName||user.email})),[users]);
  const selected=options.find(user=>user.email===value);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button
        type="button"
        onClick={e=>e.stopPropagation()}
        onDoubleClick={e=>e.stopPropagation()}
        className={styles.trigger+" "+(!value&&assignWhenEmpty?styles.emptyTrigger:"")+" "+(className??"")}
        title={selected?.label||placeholder}
      >
        <span className={styles.value}>
          {selected
            ? <ValueBadge value={selected.label} category="person"/>
            : assignWhenEmpty
              ? <span className={styles.assignPrompt}>Asignar</span>
              : <span className={styles.placeholder}>{placeholder}</span>}
        </span>
        {(!assignWhenEmpty||value)&&<ChevronsUpDown className={styles.chevrons} size={14}/>}
      </button>
    </PopoverTrigger>
    <PopoverContent removeBackgroundAndPadding align="start" className={styles.popover}>
      <Command>
        <CommandInput placeholder="Buscar usuario…"/>
        <CommandList>
          <CommandEmpty>Sin resultados</CommandEmpty>
          <CommandItem value="__empty__" onSelect={()=>{onChange("");setOpen(false)}} className={styles.item}>
            <span className={styles.emptyOption}>{emptyLabel}</span>{!value&&<Check size={14}/>}
          </CommandItem>
          {options.map(user=><CommandItem key={user.id} value={user.label+" "+user.email} onSelect={()=>{onChange(user.email);setOpen(false)}} className={styles.item}>
            <div><ValueBadge value={user.label} category="person"/><small>{user.email}</small></div>
            {value===user.email&&<Check size={14}/>}
          </CommandItem>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
};