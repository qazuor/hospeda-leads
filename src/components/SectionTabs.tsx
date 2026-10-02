import React,{useRef,useState} from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog';import {Button} from './Button';
import styles from './SectionTabs.module.css';
export const SectionTabs=({className,value,defaultValue,onValueChange,...props}:React.ComponentProps<typeof Tabs.Root>)=>{
 const [local,setLocal]=useState(defaultValue??''),[pending,setPending]=useState<string|null>(null);const root=useRef<HTMLDivElement>(null);
 const change=(next:string)=>{setLocal(next);onValueChange?.(next)};
 return <><Tabs.Root {...props} ref={root} value={value??local} onValueChange={next=>{if(root.current?.querySelector('[data-unsaved="true"]'))setPending(next);else change(next)}} className={[styles.root,className].filter(Boolean).join(' ')}/>{pending&&<Dialog open onOpenChange={open=>{if(!open)setPending(null)}}><DialogContent><DialogTitle>Tenés un mensaje sin guardar</DialogTitle><DialogDescription>Volvé para guardar el borrador antes de cambiar de sección, o descartá los cambios.</DialogDescription><Button onClick={()=>setPending(null)}>Volver al mensaje</Button><Button variant="outline" onClick={()=>{change(pending);setPending(null)}}>Descartar y cambiar de sección</Button></DialogContent></Dialog>}</>;
};
export const SectionTab=({children,...props}:React.ComponentProps<typeof Tabs.Trigger>)=><Tabs.Trigger {...props} className={styles.tab}>{children}</Tabs.Trigger>;
export const SectionTabList=({children,...props}:React.ComponentProps<typeof Tabs.List>)=><Tabs.List {...props} className={styles.list}>{children}</Tabs.List>;
export const SectionTabPanel=({children,...props}:React.ComponentProps<typeof Tabs.Content>)=><Tabs.Content {...props} className={styles.content}>{children}</Tabs.Content>;
