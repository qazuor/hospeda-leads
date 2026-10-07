import React,{useState} from 'react';
import {ArrowUp,ArrowDown,Columns3,ChevronDown,X} from 'lucide-react';
import {BUSINESS_COLUMNS,type ListPreferences} from '../helpers/businessListPreferences';
import {Button} from './Button';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import styles from './BusinessListOptions.module.css';
export function BusinessListOptions({value,onChange}:{value:ListPreferences;onChange:(v:ListPreferences)=>void}){
 const [open,setOpen]=useState(false);
 const change=(patch:Partial<ListPreferences>)=>onChange({...value,...patch});
 function move(index:number,offset:number){const columns=[...value.columns];[columns[index],columns[index+offset]]=[columns[index+offset],columns[index]];change({columns});}
 const keys=[...value.columns,...BUSINESS_COLUMNS.map(c=>c.key).filter(k=>!value.columns.includes(k))];
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline"><Columns3 size={16} aria-hidden="true"/>Columnas<ChevronDown size={14} aria-hidden="true"/></Button></PopoverTrigger>
 <PopoverContent align="end" className={styles.menu} aria-label="Columnas del listado">
  <div className={styles.heading}><div><strong>Columnas visibles</strong><p>Nombre siempre disponible. Si ocultás Acciones, abrí el negocio desde su nombre.</p></div><Button variant="ghost" size="icon-sm" aria-label="Cerrar columnas" onClick={()=>setOpen(false)}><X size={16}/></Button></div>
  <div className={styles.list}>{keys.map(key=>{const index=value.columns.indexOf(key);const label=BUSINESS_COLUMNS.find(c=>c.key===key)!.label;return <div key={key} className={styles.row}>
   <label className={styles.field}><input type="checkbox" checked={index>=0} disabled={key==='nombre'} onChange={()=>change({columns:index>=0?value.columns.filter(k=>k!==key):[...value.columns,key]})}/><span>{label}</span></label>
   {index>=0&&<div className={styles.controls}><Button size="icon-sm" variant="ghost" aria-label={'Subir '+label} disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={15}/></Button><Button size="icon-sm" variant="ghost" aria-label={'Bajar '+label} disabled={index===value.columns.length-1} onClick={()=>move(index,1)}><ArrowDown size={15}/></Button><select aria-label={'Fijar '+label} value={value.pins[key]??''} onChange={e=>{const pins={...value.pins};if(e.target.value)pins[key]=e.target.value as 'left'|'right';else delete pins[key];change({pins});}}><option value="">Sin fijar</option><option value="left">Izquierda</option><option value="right">Derecha</option></select></div>}
  </div>;})}</div>
  <p className={styles.help}>Arrastrá el borde del encabezado para ajustar el ancho. La fijación se aplica solo en tabla de escritorio.</p>
 </PopoverContent></Popover>;
}
