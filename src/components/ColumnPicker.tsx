import React from "react";
import { Columns3 } from "lucide-react";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import styles from "./ColumnPicker.module.css";

export type TableColumnOption = { key:string; label:string };

export const ColumnPicker=({
  columns,visible,onChange
}:{
  columns:TableColumnOption[];
  visible:string[];
  onChange:(next:string[])=>void;
})=>{
  const toggle=(key:string)=>{
    if(visible.includes(key)){
      if(visible.length===1)return;
      onChange(visible.filter(x=>x!==key));
    }else{
      onChange([...visible,key]);
    }
  };
  return <Popover>
    <PopoverTrigger asChild><Button variant="outline"><Columns3 size={16}/>Columnas</Button></PopoverTrigger>
    <PopoverContent align="end" className={styles.popover}>
      <div className={styles.title}><strong>Columnas visibles</strong><span>{visible.length} de {columns.length}</span></div>
      <div className={styles.actions}><button onClick={()=>onChange(columns.map(x=>x.key))}>Mostrar todas</button><button onClick={()=>onChange(columns.slice(0,8).map(x=>x.key))}>Vista básica</button></div>
      <div className={styles.list}>
        {columns.map(col=><label key={col.key}><Checkbox checked={visible.includes(col.key)} onChange={()=>toggle(col.key)}/><span>{col.label}</span></label>)}
      </div>
    </PopoverContent>
  </Popover>;
};