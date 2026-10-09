import {useGuardedMutation} from '../helpers/useGuardedMutation';
import { Input } from './Input';
import React,{useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {postPipeline} from '../endpoints/pipeline.schema';
import {useAuth} from '../helpers/useAuth';
import {Button} from './Button';
import styles from './Commercial.module.css';
export function ContactPolicy({accountId,blocked,readOnly=false}:{accountId:string;blocked:boolean;readOnly?:boolean}){
 const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';const [edit,setEdit]=useState(false),[reason,setReason]=useState('');const qc=useQueryClient();const m=useGuardedMutation({mutationFn:postPipeline,onSuccess:async()=>{await qc.invalidateQueries();setEdit(false);setReason('');}});
 return <section className={blocked||edit?styles.panel:styles.policyLine}><div className={styles.heading}><strong>{blocked?"No contactar":"Contacto permitido"}</strong>{admin&&!readOnly&&<Button variant="outline" size="sm" disabled={m.isPending} onClick={()=>setEdit(v=>!v)}>{blocked?'Habilitar recontacto':'Marcar No contactar'}</Button>}</div>{blocked&&<p role="alert">No contactar: los seguimientos y mensajes están bloqueados.</p>}{edit&&<form className={styles.form} onSubmit={e=>{e.preventDefault();m.mutate({action:'contact_policy',accountId,blocked:!blocked,reason});}}><fieldset disabled={m.isPending} style={{display:"contents"}}><label>Motivo del cambio<Input required maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>{m.error&&<p role="alert">{m.error.message}</p>}<Button type="submit" disabled={m.isPending}>{m.isPending?'Guardando…':'Guardar política'}</Button></fieldset></form>}</section>;
}
