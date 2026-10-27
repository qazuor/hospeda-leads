import {useRef,useState} from 'react';
import {UnstyledButton} from '@mantine/core';
import {DndContext,MouseSensor,TouchSensor,KeyboardSensor,DragOverlay,useSensor,useSensors,type DragEndEvent} from '@dnd-kit/core';
import {SortableContext,verticalListSortingStrategy,sortableKeyboardCoordinates} from '@dnd-kit/sortable';
import {restrictToVerticalAxis} from '@dnd-kit/modifiers';
import {Columns3} from 'lucide-react';
import {HelpLink} from './HelpLink';
import {Button} from './Button';import {Checkbox} from './Checkbox';import {Popover,PopoverContent,PopoverTrigger} from './Popover';import {SortableListRow} from './SortableListRow';import {dropIndicatorPosition,reorderItems,restrictToList} from './sortableList';import styles from './ColumnPicker.module.css';
export type TableColumnOption={key:string;label:string};
export function ColumnPicker({columns,visible,onChange}:{columns:TableColumnOption[];visible:string[];onChange:(next:string[])=>void}){
 const list=useRef<HTMLDivElement>(null),[active,setActive]=useState<string|null>(null),[over,setOver]=useState<string|null>(null);
 const sensors=useSensors(useSensor(MouseSensor,{activationConstraint:{distance:4}}),useSensor(TouchSensor,{activationConstraint:{delay:150,tolerance:5}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 const toggle=(key:string)=>{if(visible.includes(key)){if(visible.length>1)onChange(visible.filter(item=>item!==key));}else onChange([...visible,key]);};
 const reorder=(event:DragEndEvent)=>{if(event.over)onChange(reorderItems(visible,String(event.active.id),String(event.over.id)));setActive(null);setOver(null);};
 const names=new Map(columns.map(col=>[col.key,col.label])),indicator=dropIndicatorPosition(visible,active??'',over);
 const showAll=()=>onChange([...visible,...columns.map(col=>col.key).filter(key=>!visible.includes(key))]);
 const original=columns.map(col=>col.key).filter(key=>visible.includes(key)),inOriginalOrder=original.every((key,index)=>visible[index]===key),restoreOrder=()=>onChange(original);
 const basic=()=>onChange([...visible.filter(key=>columns.slice(0,8).some(col=>col.key===key)),...columns.slice(0,8).map(col=>col.key).filter(key=>!visible.includes(key))]);
 return <Popover><PopoverTrigger asChild><Button variant="outline"><Columns3 size={16}/>Columnas</Button></PopoverTrigger><PopoverContent align="end" className={styles.popover}>
  <div className={styles.title}><strong>Columnas visibles <HelpLink topic="columns"/></strong><span>{visible.length} de {columns.length}</span></div><div className={styles.actions}><UnstyledButton onClick={showAll}>Mostrar todas</UnstyledButton><UnstyledButton onClick={basic}>Vista básica</UnstyledButton><UnstyledButton onClick={restoreOrder} disabled={inOriginalOrder} title={inOriginalOrder?'Las columnas ya están en el orden original.':'Vuelve al orden original sin mostrar ni ocultar columnas.'}>Orden original</UnstyledButton></div>
  <div className={styles.list} ref={list}><h3>En la tabla · arrastrá para ordenar</h3><DndContext sensors={sensors} modifiers={[restrictToVerticalAxis,restrictToList(()=>list.current)]} onDragStart={event=>setActive(String(event.active.id))} onDragOver={event=>setOver(event.over?String(event.over.id):null)} onDragEnd={reorder} onDragCancel={()=>{setActive(null);setOver(null);}}><SortableContext items={visible} strategy={verticalListSortingStrategy}>{visible.map(key=>{const col=columns.find(item=>item.key===key);if(!col)return null;return <SortableListRow key={key} id={key} label={col.label} className={styles.row} handleClassName={styles.handle} indicator={indicator?.key===key?indicator.position:undefined}><label><Checkbox checked onChange={()=>toggle(key)}/><span>{col.label}</span></label></SortableListRow>;})}</SortableContext><DragOverlay>{active?<div className={styles.overlay}>{names.get(active)}</div>:null}</DragOverlay></DndContext>
  <h3>Ocultas</h3>{columns.filter(col=>!visible.includes(col.key)).map(col=><label key={col.key}><Checkbox checked={false} onChange={()=>toggle(col.key)}/><span>{col.label}</span></label>)}</div>
 </PopoverContent></Popover>;
}
