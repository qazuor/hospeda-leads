import React,{useState} from 'react';
import {Check,ChevronsUpDown} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import {Command,CommandInput,CommandList,CommandEmpty,CommandItem} from './Command';
import {Button} from './Button';
import type {ResourceDocument} from '../endpoints/resources.schema';
import styles from './Communication.module.css';

export function LibraryResourceSelect({documents,value,onChange,loading,disabled}:{documents:ResourceDocument[];value:string;onChange:(id:string)=>void;loading:boolean;disabled:boolean}){
 const [open,setOpen]=useState(false);
 const approved=documents.filter(d=>d.status==='approved');
 const selected=approved.find(d=>d.id===value);
 return <div className={styles.libraryPicker}><span>Documento de biblioteca</span><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox" aria-label="Documento de biblioteca" aria-expanded={open} disabled={disabled||loading} className={styles.libraryTrigger}><span>{loading?'Cargando biblioteca…':selected?.title??'Elegir documento de Configuración…'}</span><ChevronsUpDown size={16}/></Button></PopoverTrigger><PopoverContent align="start" className={styles.libraryOptions}><Command><CommandInput aria-label="Buscar documento en biblioteca" placeholder="Buscar documento…"/><CommandList><CommandEmpty>{approved.length?'No hay documentos que coincidan.':'No hay documentos aprobados en la biblioteca.'}</CommandEmpty>{approved.map(d=><CommandItem key={d.id} value={d.id} keywords={[d.title,d.type]} onSelect={()=>{onChange(d.id);setOpen(false)}}><Check size={14} style={{visibility:d.id===value?'visible':'hidden'}}/><span>{d.title}<small>{d.type} · v{d.versions[0]?.version}</small></span></CommandItem>)}</CommandList></Command></PopoverContent></Popover><p className={styles.muted}>Seleccioná un documento aprobado para vincularlo al negocio, sin copiar el archivo.</p></div>;
}
