import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {GripVertical} from 'lucide-react';
import {UnstyledButton} from '@mantine/core';
import {Button} from './Button';
import type {PinnedView} from './PinnedViewsPanel';
import styles from './PinnedViewsPanel.module.css';

export function SortableViewRow({view,unpinnable,onToggle,indicator}:{view:PinnedView;unpinnable:boolean;onToggle?:()=>void;indicator?:'top'|'bottom'}) {
 const sortable=useSortable({id:view.key});
 return <div className={styles.rowWrap}>
  <div ref={sortable.setNodeRef} style={{transform:CSS.Transform.toString(sortable.transform),transition:sortable.transition}} className={`${styles.row} ${sortable.isDragging?styles.dragging:''}`}>
   {indicator&&<div className={`${styles.dropIndicator} ${indicator==='top'?styles.dropTop:styles.dropBottom}`} data-testid="pin-drop-indicator" aria-hidden="true"/>}
   <UnstyledButton ref={sortable.setActivatorNodeRef} className={styles.handle} aria-label={`Reordenar ${view.name}`} {...sortable.attributes} {...sortable.listeners}><GripVertical size={18}/></UnstyledButton>
   <span className={styles.name}>{view.name}</span><small className={styles.kind}>{view.kind}</small>{onToggle&&<Button variant="ghost" size="sm" onClick={onToggle}>{unpinnable?'Desfijar':'Fijar'}</Button>}
  </div>
 </div>;
}
