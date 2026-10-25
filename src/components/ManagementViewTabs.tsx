import {BookmarkPlus,Check} from 'lucide-react';
import {UnstyledButton} from '@mantine/core';
import {Button} from './Button';
import styles from './ManagementViewTabs.module.css';
export interface ManagementSavedView{ name:string }
export interface ManagementViewTabsProps{active:string;savedViews:ManagementSavedView[];onSelect:(key:string)=>void;onDelete:(name:string)=>void;onSave:()=>void}
/** One scrollable row for management quick views and saved views. */
export function ManagementViewTabs({active,savedViews,onSelect,onDelete,onSave}:ManagementViewTabsProps){const views=[['all','Todos'],['mine','Mis gestiones'],['today','Para hoy'],['overdue','Vencidos'],['unassigned','Sin responsable'],['noNext','Sin próxima acción']];return <div className={styles.row} role="group" aria-label="Vistas de gestiones"><div className={styles.scroll}>{views.map(([key,label])=><UnstyledButton key={key} aria-pressed={active===key} onClick={()=>onSelect(key)}>{active===key&&<Check size={13}/ >}{label}</UnstyledButton>)}{savedViews.map(view=><span className={styles.saved} key={view.name}><UnstyledButton aria-pressed={active==='saved:'+view.name} onClick={()=>onSelect('saved:'+view.name)}>{active==='saved:'+view.name&&<Check size={13}/ >}{view.name}</UnstyledButton><UnstyledButton aria-label={'Eliminar vista '+view.name} onClick={()=>onDelete(view.name)}>×</UnstyledButton></span>)}</div><Button variant="ghost" size="sm" aria-label="Guardar vista" onClick={onSave}><BookmarkPlus size={15}/><span className={styles.saveText}>Guardar vista</span></Button></div>}
