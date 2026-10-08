import React from 'react';
import {Card,UnstyledButton} from '@mantine/core';
import {ArrowRight,AtSign,CalendarDays,Globe,MapPin,Phone,Tag,UserRound} from 'lucide-react';
import {Checkbox} from './Checkbox';
import {Skeleton} from './Skeleton';
import {Tooltip,TooltipContent,TooltipTrigger} from './Tooltip';
import {BUSINESS_COLUMNS} from '../helpers/businessListPreferences';
import type {OutputType} from '../endpoints/leads_GET.schema';
import styles from './BusinessCard.module.css';

type Business=OutputType['rows'][number];
const metadata=new Set(['assignedUserEmail','ciudad','tipo','subtipo','commercialProfile','medioContactoPreferido']);
const contactFields=new Set(['telefono','email','sitioWeb','urlGmap','perfilInstagram','perfilFacebook','perfilAirbnb','perfilBooking','perfilTurismoEntreRios']);
const icons:Record<string,typeof Tag>={assignedUserEmail:UserRound,ciudad:MapPin,tipo:Tag,subtipo:Tag,commercialProfile:Tag,medioContactoPreferido:Phone,telefono:Phone,email:AtSign,urlGmap:MapPin,fechaProximaAccion:ArrowRight,fechaCreacion:CalendarDays,fechaUltimoContacto:CalendarDays,createdAt:CalendarDays,updatedAt:CalendarDays};
const labels=new Map(BUSINESS_COLUMNS.map(column=>[column.key,column.label]));

export function BusinessCard({row,columns,selected,onSelect,onOpen,renderValue,describeValue,isEditable}:{
 row:Business;columns:string[];selected:boolean;onSelect:()=>void;onOpen:()=>void;
 renderValue:(key:string)=>React.ReactNode;describeValue:(key:string)=>string;isEditable:(key:string)=>boolean;
}){
 return <Card component="article" id={'business-'+row.accountId} data-business-id={row.accountId} className={styles.card} padding={14} radius="md" withBorder>
  <div className={styles.header}>
   <Checkbox aria-label={'Seleccionar '+row.nombre} disabled={row.canModify===false} checked={selected} onChange={onSelect}/>
   <h2 className={styles.heading}><UnstyledButton data-business-open className={styles.name} aria-label={'Abrir negocio '+row.nombre} onClick={onOpen}>{row.nombre}</UnstyledButton></h2>
   {columns.includes('actions')&&<div className={styles.actions}>{renderValue('actions')}</div>}
  </div>
  <p className={styles.summary}>{row.opportunityCount??0} gestiones · {row.contactCount??0} contactos · {row.commercialStatus==='client'?'Cliente':'Potencial cliente'}</p>
  <dl className={styles.fields}>
   {columns.filter(key=>key!=='nombre'&&key!=='actions').map(key=>{
    const label=labels.get(key)??key,compact=metadata.has(key),contact=contactFields.has(key),next=key==='fechaProximaAccion';
    const Icon=icons[key]??(contact?Globe:Tag),description=describeValue(key);
    return <div key={key} data-card-field={key} className={[styles.field,compact?styles.metadata:'',contact?styles.contact:'',next?styles.next:'',!compact?styles.wide:''].filter(Boolean).join(' ')}>
     <dt title={label}><Icon size={14} aria-hidden="true"/><span className={compact||contact?styles.srOnly:undefined}>{label}</span></dt>
     <dd>{isEditable(key)?renderValue(key):<Tooltip><TooltipTrigger asChild><div className={contact?styles.truncated:styles.readValue} tabIndex={0} aria-label={label+': '+description}>{renderValue(key)}</div></TooltipTrigger><TooltipContent className={styles.tooltip}>{label}: {description}</TooltipContent></Tooltip>}</dd>
    </div>;
   })}
  </dl>
 </Card>;
}

export function BusinessCardSkeleton({columns}:{columns:string[]}){
 return <Card component="article" className={styles.card} padding={14} radius="md" withBorder aria-hidden="true">
  <Skeleton className={styles.nameSkeleton}/><Skeleton className={styles.summarySkeleton}/>
  <div className={styles.fields}>{columns.filter(key=>key!=='nombre'&&key!=='actions').map(key=><Skeleton key={key} className={metadata.has(key)?styles.fieldSkeleton:styles.wideSkeleton}/>)}</div>
 </Card>;
}
