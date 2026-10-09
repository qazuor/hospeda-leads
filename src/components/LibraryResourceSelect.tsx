import React,{useState} from 'react';
import {Check,ChevronsUpDown} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import {Command,CommandInput,CommandList,CommandEmpty,CommandItem} from './Command';
import {Button} from './Button';
import {canPreviewDocument} from './DocumentPreviewDialog';
import type {ResourceDocument,ResourceVersion} from '../endpoints/resources.schema';
import styles from './Communication.module.css';
import {MaterialThumbnail} from './MaterialThumbnail';

export function LibraryResourceSelect({documents,value,onChange,loading,disabled,onPreview}:{documents:ResourceDocument[];value:string;onChange:(id:string)=>void;loading:boolean;disabled:boolean;onPreview?:(version:ResourceVersion)=>void}){
 const [open,setOpen]=useState(false);
 const approved=documents.filter(d=>d.status==='approved');
 const selected=approved.find(d=>d.id===value);
 const version=selected?.versions[0];
 return <div className={styles.libraryPicker}><span>Documento de biblioteca</span><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox" aria-label="Documento de biblioteca" aria-expanded={open} disabled={disabled||loading} className={styles.libraryTrigger}><span>{loading?'Cargando biblioteca…':selected?.title??'Elegir documento de Configuración…'}</span><ChevronsUpDown size={16}/></Button></PopoverTrigger><PopoverContent matchTargetWidth align="start" className={styles.libraryOptions}><Command label="Buscar documento en biblioteca"><CommandInput aria-label="Buscar documento en biblioteca" placeholder="Buscar documento…"/><CommandList><CommandEmpty>{approved.length?'No hay documentos que coincidan.':'No hay documentos aprobados en la biblioteca.'}</CommandEmpty>{approved.map(d=><CommandItem key={d.id} value={d.id} keywords={[d.title,d.type]} onSelect={()=>{onChange(d.id);setOpen(false)}}><Check size={14} style={{visibility:d.id===value?'visible':'hidden'}}/><span>{d.title}<small>{d.type} · v{d.versions[0]?.version}</small></span></CommandItem>)}</CommandList></Command></PopoverContent></Popover>{selected&&version&&<section className={styles.selectedMaterial} aria-label="Material seleccionado"><MaterialThumbnail key={version.id} version={version}/><strong>{selected.title}</strong><span>{version.fileName||'Vínculo externo'} · versión {version.version}</span><div className={styles.actions}>{canPreviewDocument(version)&&onPreview?<Button variant="outline" disabled={disabled} onClick={()=>onPreview(version)}>Previsualizar material seleccionado</Button>:<Button asChild variant="outline"><a href={'/_api/resources/download?versionId='+version.id} target="_blank" rel="noopener noreferrer">{version.url?'Abrir material seleccionado':'Descargar material seleccionado'}</a></Button>}</div><p className={styles.muted}>Elegir o previsualizar no vincula ni envía el material.</p></section>}<p className={styles.muted}>Seleccioná un documento aprobado para vincularlo al negocio, sin copiar el archivo.</p></div>;
}
