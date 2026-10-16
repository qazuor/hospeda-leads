import { Checkbox } from './Checkbox';
import { NativeSelect } from './NativeSelect';
import React,{useState} from 'react';
import {Columns3,ChevronDown,GripVertical,X} from 'lucide-react';
import {availableListPreferences,BUSINESS_COLUMNS,type ListPreferences} from '../helpers/businessListPreferences';
import {Button} from './Button';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle,DialogTrigger} from './Dialog';
import styles from './BusinessListOptions.module.css';
export function BusinessListOptions({value,onChange}:{value:ListPreferences;onChange:(v:ListPreferences)=>void}){
 const [open,setOpen]=useState(false);
 const [draggingKey,setDraggingKey]=useState<string|null>(null);
 const dragPointer=React.useRef<number|null>(null);
 const dragCandidate=React.useRef<{pointerId:number;key:string;x:number;y:number}|null>(null);
 const dragged=React.useRef(false);
 const change=(patch:Partial<ListPreferences>)=>onChange(availableListPreferences({...value,...patch}));
 const canMove=(index:number,offset:number)=>{const target=value.columns[index+offset];return !!target&&(value.pins[value.columns[index]]??'center')===(value.pins[target]??'center');};
 function move(index:number,offset:number){if(!canMove(index,offset))return;const columns=[...value.columns];[columns[index],columns[index+offset]]=[columns[index+offset],columns[index]];change({columns});}
 function moveTo(draggedKey:string,targetKey:string,after:boolean){
  if(draggedKey===targetKey)return;
  const from=value.columns.indexOf(draggedKey),target=value.columns.indexOf(targetKey);
  if(from<0||target<0||(value.pins[draggedKey]??'center')!==(value.pins[targetKey]??'center'))return;
  const columns=[...value.columns];columns.splice(from,1);
  const destination=target+(after?1:0)-(from<target?1:0);
  columns.splice(destination,0,draggedKey);change({columns});
 }
 function onPointerDown(event:React.PointerEvent<HTMLDivElement>){
  const row=(event.target as HTMLElement).closest<HTMLElement>('[data-column-key]');
  const key=row?.dataset.columnKey;
  if(!key||!value.columns.includes(key))return;
  dragged.current=false;dragPointer.current=event.pointerId;dragCandidate.current={pointerId:event.pointerId,key,x:event.clientX,y:event.clientY};
 }
 function onPointerMove(event:React.PointerEvent<HTMLDivElement>){
  const candidate=dragCandidate.current;
  if(!candidate||candidate.pointerId!==event.pointerId)return;
  if(!draggingKey){
   if(Math.hypot(event.clientX-candidate.x,event.clientY-candidate.y)<6)return;
   event.preventDefault();dragged.current=true;setDraggingKey(candidate.key);event.currentTarget.setPointerCapture(event.pointerId);
  }
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-column-key]');
  const targetKey=target?.dataset.columnKey;
  if(!target||!targetKey||targetKey===candidate.key)return;
  const rect=target.getBoundingClientRect();moveTo(candidate.key,targetKey,event.clientY>=rect.top+rect.height/2);
 }
 function endPointer(event:React.PointerEvent<HTMLDivElement>){
  if(dragPointer.current!==event.pointerId)return;
  dragPointer.current=null;dragCandidate.current=null;setDraggingKey(null);
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  if(dragged.current)setTimeout(()=>{dragged.current=false;},0);
 }
 function suppressDragClick(event:React.MouseEvent<HTMLDivElement>){if(!dragged.current)return;event.preventDefault();event.stopPropagation();dragged.current=false;}
 const keys=[...value.columns,...BUSINESS_COLUMNS.map(c=>c.key).filter(k=>!value.columns.includes(k))];
 return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline"><Columns3 size={16} aria-hidden="true"/>Columnas<ChevronDown size={14} aria-hidden="true"/></Button></DialogTrigger>
 <DialogContent className={styles.dialog} showCloseButton={false}><div className={styles.heading}><div><DialogTitle className={styles.dialogTitle}>Columnas del listado</DialogTitle><DialogDescription className={styles.dialogDescription}>Nombre siempre disponible. Si ocultás Acciones, abrí el negocio desde su nombre.</DialogDescription></div><DialogClose asChild><Button variant="ghost" size="icon-sm" aria-label="Cerrar columnas"><X size={16}/></Button></DialogClose></div>
  <div className={styles.list} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer} onClickCapture={suppressDragClick}>{keys.map(key=>{const index=value.columns.indexOf(key);const label=BUSINESS_COLUMNS.find(c=>c.key===key)!.label;return <div key={key} data-column-key={index>=0?key:undefined} className={`${styles.row} ${draggingKey===key?styles.dragging:''}`}>
   <label className={styles.field}><Checkbox  checked={index>=0} disabled={key==='nombre'} disabledReason="La columna Nombre es obligatoria para identificar cada negocio." onChange={()=>change({columns:index>=0?value.columns.filter(k=>k!==key):[...value.columns,key]})}/><span>{label}</span></label>
   {index>=0&&<div className={styles.controls}><Button type="button" size="icon-sm" variant="ghost" className={styles.dragHandle} aria-label={'Reordenar '+label} title="Arrastrar para ordenar" data-column-drag-handle={key} onKeyDown={event=>{if(event.key==='ArrowUp'){event.preventDefault();move(index,-1);}else if(event.key==='ArrowDown'){event.preventDefault();move(index,1);}}}><GripVertical size={16} aria-hidden="true"/></Button><NativeSelect aria-label={'Fijar '+label} value={value.pins[key]??''} onChange={e=>{const pins={...value.pins};if(e.target.value)pins[key]=e.target.value as 'left'|'right';else delete pins[key];change({pins});}}><option value="">Sin fijar</option><option value="left">Izquierda</option><option value="right">Derecha</option></NativeSelect></div>}
  </div>;})}</div>
  <p className={styles.help}>Arrastrá una fila para ordenar; con teclado, usá ↑ y ↓ desde el control de puntos. Las columnas se mueven dentro de su grupo: izquierda, sin fijar o derecha. La fijación se aplica solo en tabla de escritorio.</p>
 </DialogContent></Dialog>;
}
