import React,{useState} from 'react';
import {Card,UnstyledButton} from '@mantine/core';
import {ArrowRight,AtSign,CalendarDays,Globe,MapPin,Phone,Tag,UserRound} from 'lucide-react';
import {Button} from './Button';
import {Checkbox} from './Checkbox';
import {Skeleton} from './Skeleton';
import {Tooltip,TooltipContent,TooltipTrigger} from './Tooltip';
import {BUSINESS_COLUMNS} from '../helpers/businessListPreferences';
import {plural} from '../content/vocabulary';
import type {OutputType} from '../endpoints/leads_GET.schema';
import styles from './BusinessCard.module.css';

type Business=OutputType['rows'][number];
const metadata=new Set(['assignedUserEmail','ciudad','tipo','subtipo','commercialProfile','medioContactoPreferido']);
const contactFields=new Set(['telefono','email','contactPhone','contactEmail','whatsapp','sitioWeb','urlGmap','perfilInstagram','perfilFacebook','perfilAirbnb','perfilBooking','perfilTurismoEntreRios']);
const icons:Record<string,typeof Tag>={assignedUserEmail:UserRound,ciudad:MapPin,tipo:Tag,subtipo:Tag,commercialProfile:Tag,medioContactoPreferido:Phone,telefono:Phone,contactPhone:Phone,email:AtSign,contactEmail:AtSign,whatsapp:Phone,urlGmap:MapPin,fechaProximaAccion:ArrowRight,fechaCreacion:CalendarDays,fechaUltimoContacto:CalendarDays,createdAt:CalendarDays,updatedAt:CalendarDays};
/** Fields a seller needs at a glance on a phone; the rest sit behind "Ver más datos". */
const primary=new Set(['ciudad','businessStatus','estado','fechaProximaAccion','telefono','whatsapp']);
/** "1 gestión · 1 persona · Cliente"; `always` keeps zero counts (table cell), otherwise zero parts are omitted (card). */
export function businessCountsSummary(row:{opportunityCount?:number|null;contactCount?:number|null;commercialStatus?:string|null},always=false):string{
 return [always||row.opportunityCount?plural(row.opportunityCount??0,'gestión','gestiones'):null,always||row.contactCount?plural(row.contactCount??0,'persona','personas'):null,row.commercialStatus==='client'?'Cliente':'Potencial cliente'].filter(Boolean).join(' · ');
}
const labels=new Map(BUSINESS_COLUMNS.map(column=>[column.key,column.label]));

function hasCardValue(row:Business,key:string){
 const value=row.opportunityCount!==1&&row.opportunityValues?.[key]?.length?row.opportunityValues[key]:row[key as keyof Business];
 // False and zero are meaningful values; only absent data is omitted.
 return value!==null&&value!==undefined&&(typeof value!=='string'||value.trim()!=='')&&(!Array.isArray(value)||value.some(item=>item!==null&&item!==undefined&&String(item).trim()!==''));
}

export function BusinessCard({row,columns,selected,onSelect,onOpen,renderValue,describeValue,isEditable}:{
 row:Business;columns:string[];selected:boolean;onSelect:()=>void;onOpen:()=>void;
 renderValue:(key:string)=>React.ReactNode;describeValue:(key:string)=>string;isEditable:(key:string)=>boolean;
}){
 const [expanded,setExpanded]=useState(false);const visible=columns.filter(key=>key!=='nombre'&&key!=='actions'&&hasCardValue(row,key)),hasSecondary=visible.some(key=>!primary.has(key));
 return <Card component="article" id={'business-'+row.accountId} data-expanded={expanded} data-business-id={row.accountId} className={styles.card} padding={14} radius="md" withBorder>
  <div className={styles.header}>
   <label className={styles.select}><Checkbox aria-label={'Seleccionar '+row.nombre} disabled={row.canModify===false} disabledReason="Solo la persona responsable del negocio o un administrador puede modificarlo." checked={selected} onChange={onSelect}/></label>
   <h2 className={styles.heading}><UnstyledButton data-business-open className={styles.name} aria-label={'Abrir negocio '+row.nombre} onClick={onOpen}>{row.nombre}</UnstyledButton></h2>
   {columns.includes('actions')&&<div className={styles.actions}>{renderValue('actions')}</div>}
  </div>
  <p className={styles.summary}>{businessCountsSummary(row)}</p>
  <dl className={styles.fields}>
   {visible.map(key=>{
    const label=labels.get(key)??key,compact=metadata.has(key),contact=contactFields.has(key),next=key==='fechaProximaAccion';
    const Icon=icons[key]??(contact?Globe:Tag),description=describeValue(key);
    return <div key={key} data-card-field={key} className={[styles.field,compact?styles.metadata:'',contact?styles.contact:'',next?styles.next:'',primary.has(key)?'':styles.secondary,!compact?styles.wide:''].filter(Boolean).join(' ')}>
     <dt title={label}><Icon size={14} aria-hidden="true"/><span className={compact||contact?styles.srOnly:undefined}>{label}</span></dt>
     <dd>{isEditable(key)?renderValue(key):<Tooltip><TooltipTrigger asChild><div className={contact?styles.truncated:styles.readValue} tabIndex={0} aria-label={label+': '+description}>{renderValue(key)}</div></TooltipTrigger><TooltipContent className={styles.tooltip}>{label}: {description}</TooltipContent></Tooltip>}</dd>
    </div>;
   })}
  </dl>
  {hasSecondary&&<Button size="sm" variant="ghost" className={styles.toggle} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Ver menos datos':'Ver más datos'}</Button>}
 </Card>;
}

export function BusinessCardSkeleton({columns}:{columns:string[]}){
 return <Card component="article" className={styles.card} padding={14} radius="md" withBorder aria-hidden="true">
  <Skeleton className={styles.nameSkeleton}/><Skeleton className={styles.summarySkeleton}/>
  <div className={styles.fields}>{columns.filter(key=>key!=='nombre'&&key!=='actions').map(key=><Skeleton key={key} className={metadata.has(key)?styles.fieldSkeleton:styles.wideSkeleton}/>)}</div>
 </Card>;
}
