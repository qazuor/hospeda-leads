import {useState} from 'react';
import {Menu} from '@mantine/core';
import {BookmarkPlus,Pin} from 'lucide-react';
import {Button} from './Button';
import styles from './MoreViewsMenu.module.css';

export interface MoreView {key:string;name:string;group:'quick'|'team'|'personal'}
export function MoreViewsMenu({views,activeKey,onSelect,onPin,onEdit,disabled=false,disabledReason='Esperá a que se carguen las vistas y la configuración de la barra.'}:{views:MoreView[];activeKey:string;onSelect:(key:string)=>void;onPin:(key:string)=>void;onEdit:()=>void;disabled?:boolean;disabledReason?:string}) {
 const [opened,setOpened]=useState(false),active=views.find(view=>view.key===activeKey),groups:[MoreView['group'],string][]=[['quick','Vistas rápidas'],['team','Del equipo'],['personal','Tus vistas']];
 return <Menu opened={opened} onChange={setOpened} position="bottom-end" withinPortal><Menu.Target><Button disabled={disabled} disabledReason={disabledReason} aria-label={`Abrir más vistas${active?` · ${active.name}`:''}${views.length?`, ${views.length} sin fijar`:''}`} aria-pressed={!!active} className={active?styles.active:styles.trigger}><span className={styles.desktop}>Más vistas{active?` · ${active.name}`:''}</span><span className={styles.mobile}>Más</span>{views.length>0&&<span className={styles.count}>{views.length}</span>}</Button></Menu.Target><Menu.Dropdown>{groups.map(([group,label])=>{const rows=views.filter(view=>view.group===group);return rows.length?<div key={group}><Menu.Label>{label}</Menu.Label>{rows.map(view=><div className={styles.item} key={view.key}><Menu.Item onClick={()=>{onSelect(view.key);setOpened(false);}}>{view.name}</Menu.Item><button type="button" className={styles.pin} aria-label={`Fijar ${view.name} en la barra`} disabled={disabled} title={disabled?disabledReason:undefined} onClick={()=>{onPin(view.key);setOpened(false);}}><Pin size={16}/></button></div>)}</div>:null;})}<Menu.Divider/><Menu.Item disabled={disabled} title={disabled?disabledReason:undefined} leftSection={<BookmarkPlus size={16}/>} onClick={()=>{onEdit();setOpened(false);}}>Elegir vistas de la barra…</Menu.Item></Menu.Dropdown></Menu>;
}
