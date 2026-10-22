import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import type {BusinessColumnGroup} from '../helpers/businessColumnGroups';
import {businessColumnGroupVisibleCount} from '../helpers/businessColumnGroups';
import styles from './BusinessColumnGroupCell.module.css';

export function BusinessColumnGroupCell({group,labelFor,describeMember,renderMember,compact=true}:{group:BusinessColumnGroup;labelFor:(key:string)=>string;describeMember:(key:string)=>string;renderMember:(key:string)=>ReactNode;compact?:boolean}){
 const visibleCount=compact?businessColumnGroupVisibleCount(group):group.members.length,visible=group.members.slice(0,visibleCount),hidden=compact?group.members.length-visibleCount:0;
 const [popoverOpen,setPopoverOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),firstPopoverMember=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!popoverOpen)return;const frame=requestAnimationFrame(()=>firstPopoverMember.current?.focus());return()=>cancelAnimationFrame(frame);},[popoverOpen]);
 const member=(key:string,focusable=false)=><div className={styles.member} key={key} ref={focusable&&key===group.members[0]?firstPopoverMember:undefined} tabIndex={focusable?0:undefined}><span className={styles.label}>{labelFor(key)}</span><div title={describeMember(key)}>{renderMember(key)}</div></div>;
 return <div className={styles.cell} data-group-cell="">{visible.map(key=>member(key))}{hidden>0&&<Popover open={popoverOpen} onOpenChange={setPopoverOpen}><PopoverTrigger asChild><button ref={trigger} type="button" className={styles.more} aria-label={`Ver los ${hidden} datos más de ${group.name}`} onClick={event=>event.stopPropagation()}>+{hidden} más</button></PopoverTrigger><PopoverContent aria-label={`Datos de ${group.name}`} className={styles.popover} onEscapeKeyDown={()=>requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}))}><div className={styles.popoverMembers} data-group-popover="">{group.members.map(key=>member(key,true))}</div></PopoverContent></Popover>}</div>;
}
