import React,{useRef,useState} from 'react';
import { Tabs } from '@mantine/core';
interface RootProps extends Omit<React.ComponentProps<typeof Tabs>, 'onChange'> { onValueChange?: (value: string) => void }
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog';import {Button} from './Button';
import styles from './SectionTabs.module.css';
export const SectionTabs=({className,value,defaultValue,onValueChange,...props}:RootProps)=>{
 const [local,setLocal]=useState(defaultValue??''),[pending,setPending]=useState<string|null>(null);const root=useRef<HTMLDivElement>(null);
 const change=(next:string)=>{setLocal(next);onValueChange?.(next)};
 return <><Tabs {...props} ref={root} value={value??local} keepMounted={false} onChange={next=>{if(next===null)return;if(root.current?.querySelector('[data-unsaved="true"]'))setPending(next);else change(next)}} className={[styles.root,className].filter(Boolean).join(' ')}/>{pending&&<Dialog open onOpenChange={open=>{if(!open)setPending(null)}}><DialogContent><DialogTitle>Tenés un mensaje sin guardar</DialogTitle><DialogDescription>Volvé para guardar el borrador antes de cambiar de sección, o descartá los cambios.</DialogDescription><Button onClick={()=>setPending(null)}>Volver al mensaje</Button><Button variant="outline" onClick={()=>{change(pending);setPending(null)}}>Descartar y cambiar de sección</Button></DialogContent></Dialog>}</>;
};
export const SectionTab=({children,...props}:React.ComponentProps<typeof Tabs.Tab>)=><Tabs.Tab {...props} className={styles.tab}>{children}</Tabs.Tab>;
export const SectionTabList=({children,...props}:React.ComponentProps<typeof Tabs.List>)=><Tabs.List {...props} className={styles.list}>{children}</Tabs.List>;
export const SectionTabPanel=({children,...props}:React.ComponentProps<typeof Tabs.Panel>)=><Tabs.Panel {...props} className={styles.content}>{children}</Tabs.Panel>;
