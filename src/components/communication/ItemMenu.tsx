import {Ellipsis} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '../DropdownMenu';
import styles from './CommunicationView.module.css';

/** One secondary action of a conversation item. The host renders what it opens (form or dialog) outside the menu. */
export type ItemAction={readonly label:string;readonly onSelect:()=>void};

/**
 * Spec 91 §3: the «⋯» menu of a conversation item with its secondary actions (correct, void, email design). It shows on
 * hover or focus on pointer devices and always on touch and narrow screens (CSS). Nothing renders without actions.
 */
export function ItemMenu({label,actions}:{label:string;actions:readonly ItemAction[]}){
 if(!actions.length)return null;
 return <DropdownMenu>
  <DropdownMenuTrigger className={styles.menuButton} aria-label={'Más acciones · '+label}><Ellipsis size={18} aria-hidden="true"/></DropdownMenuTrigger>
  <DropdownMenuContent align="end">{actions.map(action=><DropdownMenuItem key={action.label} onSelect={action.onSelect}>{action.label}</DropdownMenuItem>)}</DropdownMenuContent>
 </DropdownMenu>;
}
