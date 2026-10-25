import {BookmarkPlus,Check} from 'lucide-react';
import {UnstyledButton} from '@mantine/core';
import {useState} from 'react';
import {Button} from './Button';
import {MoreViewsMenu} from './MoreViewsMenu';
import {PinnedViewsPanel} from './PinnedViewsPanel';
import {useViewPins} from '../hooks/useViewPins';
import {personalViewKey,quickViewKey,resolveViewPins} from '../helpers/viewPins';
import styles from './ManagementViewTabs.module.css';
export interface ManagementSavedView{id:string;name:string}
export interface ManagementViewTabsProps{active:string;savedViews:ManagementSavedView[];onSelect:(key:string)=>void;onDelete:(name:string)=>void;onSave:()=>void;viewsLoaded?:boolean}
const quickViews=[['all','Todos'],['mine','Mis gestiones'],['today','Para hoy'],['overdue','Vencidos'],['unassigned','Sin responsable'],['noNext','Sin próxima acción']];
/** Scrollable management view row with personal pins and an always visible overflow menu. */
export function ManagementViewTabs({active,savedViews,onSelect,onDelete,onSave,viewsLoaded=true}:ManagementViewTabsProps){
 const [panelOpen,setPanelOpen]=useState(false),pins=useViewPins();
 const available=[...quickViews.map(([id,name])=>({key:quickViewKey(id),name,kind:'Rápida',type:'quick' as const,id})),...savedViews.map(view=>({key:personalViewKey(view.id),name:view.name,kind:'Tuya',type:'personal' as const,id:view.id}))];
 const resolved=resolveViewPins(available,pins.isLoading||pins.isError?null:pins.config('opportunity'),quickViewKey('all'));
 const activeKey=active.startsWith('saved:')?personalViewKey(active.slice(6)):quickViewKey(active);
 const controlsDisabled=!viewsLoaded||pins.isLoading||pins.isError;
 return <div className={styles.row} role="group" aria-label="Vistas de gestiones"><div className={styles.scroll}>{resolved.pinned.map(view=>view.type==='quick'?<UnstyledButton key={view.key} aria-pressed={activeKey===view.key} onClick={()=>onSelect(view.id)}>{activeKey===view.key&&<Check size={13}/ >}{view.name}</UnstyledButton>:<span className={styles.saved} key={view.key}><UnstyledButton aria-pressed={activeKey===view.key} onClick={()=>onSelect('saved:'+view.id)}>{activeKey===view.key&&<Check size={13}/ >}{view.name}</UnstyledButton><UnstyledButton aria-label={'Eliminar vista '+view.name} onClick={()=>onDelete(view.name)}>×</UnstyledButton></span>)}</div><MoreViewsMenu views={resolved.unpinned.map(view=>({key:view.key,name:view.name,group:view.type==='quick'?'quick' as const:'personal' as const}))} activeKey={activeKey} onSelect={key=>{const view=available.find(item=>item.key===key);if(view)onSelect(view.type==='personal'?'saved:'+view.id:view.id);}} onPin={key=>void pins.pin('opportunity',key,resolved.pinned.map(view=>view.key))} onEdit={()=>setPanelOpen(true)} disabled={controlsDisabled||pins.isPending}/><Button variant="ghost" size="sm" aria-label="Guardar vista" onClick={onSave}><BookmarkPlus size={15}/><span className={styles.saveText}>Guardar vista</span></Button><PinnedViewsPanel open={panelOpen} onClose={()=>setPanelOpen(false)} entity="opportunity" views={available.map(({key,name,kind})=>({key,name,kind}))} config={pins.config('opportunity')} externalBusy={pins.isPending} onSave={async config=>{await pins.save('opportunity',config);}} onReset={async()=>{await pins.reset('opportunity');}}/></div>
}
