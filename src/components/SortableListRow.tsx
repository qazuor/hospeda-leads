import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {GripVertical} from 'lucide-react';
import {UnstyledButton} from '@mantine/core';
import type {ReactNode} from 'react';
import shared from './SortableListRow.module.css';

export function SortableListRow({id,label,children,className,handleClassName,indicator,indicatorTestId='column-drop-indicator'}:{id:string;label:string;children:ReactNode;className:string;handleClassName:string;indicator?:'top'|'bottom';indicatorTestId?:string}){
 const sortable=useSortable({id});
 return <div ref={sortable.setNodeRef} style={{transform:CSS.Transform.toString(sortable.transform),transition:sortable.transition}} className={`${className}${sortable.isDragging?` ${shared.dragging}`:''}`}>
  {indicator&&<div className={`${shared.indicator} ${indicator==='top'?shared.top:shared.bottom}`} data-testid={indicatorTestId} aria-hidden="true"/>}
  <UnstyledButton ref={sortable.setActivatorNodeRef} className={handleClassName} aria-label={`Reordenar ${label}`} {...sortable.attributes} {...sortable.listeners}><GripVertical size={18}/></UnstyledButton>{children}
 </div>;
}
