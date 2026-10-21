import React,{useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {keepPreviousData,useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import {Input} from './Input';
import {NativeSelect} from './NativeSelect';
import {Checkbox} from './Checkbox';
import {ValueBadge} from './ValueBadge';
import {PersonPhoneDncWarning} from './PersonPhoneDncWarning';
import {Disclosure,DisclosureSummary} from './Disclosure';
import {useUnsavedChanges} from './UnsavedChanges';
import {useAuth} from '../helpers/useAuth';
import {useDebounce} from '../helpers/useDebounce';
import {crmSuccess} from '../helpers/crmFeedback';
import {duplicateQuery,duplicateReasonLabel,duplicateWarning} from '../helpers/duplicateWarning';
import {VOCAB} from '../content/vocabulary';
import {getSettings} from '../endpoints/settings_GET.schema';
import {saveCommercial} from '../endpoints/commercial.schema';
import {checkBusinessDuplicates,DNC_DUPLICATE_MESSAGE} from '../endpoints/business_duplicate_check.schema';
import styles from './Commercial.module.css';

const empty={nombre:'',ciudad:'',telefono:'',email:'',tipo:'',subtipo:'',personName:'',personPhone:''};
const invalidated=['commercial','commercial-detail','leads','lead-stats','lead-journal','global-journal','analytics','trash-businesses','work','crm-search','business-duplicate-check'];

/**
 * "Nuevo negocio": one step with name, city and phone, an optional person (saved as Principal in the same transaction)
 * and a live duplicate warning. A duplicate of a No contactar business blocks saving. Never creates a management.
 */
export function BusinessQuickCreate({onClose,onSaved,toastLink=true}:{onClose:()=>void;onSaved?:(id:string)=>void;/** False when `onSaved` already opens the business. */toastLink?:boolean}){
 const {authState}=useAuth();
 const user=authState.type==='authenticated'?authState.user:undefined;
 const admin=user?.role==='admin';
 const qc=useQueryClient();
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings});
 const [draft,setDraft]=useState({...empty,assignedUserEmail:user?.email??''});
 const [acknowledged,setAcknowledged]=useState('');
 const [personAcknowledged,setPersonAcknowledged]=useState('');
 const [error,setError]=useState('');
 const submitting=useRef(false);
 const currentKey=JSON.stringify(duplicateQuery(draft));
 const queryKey=useDebounce(currentKey,400);
 const query=JSON.parse(queryKey) as ReturnType<typeof duplicateQuery>;
 const duplicates=useQuery({queryKey:['business-duplicate-check',queryKey],queryFn:({signal})=>checkBusinessDuplicates(query!,{signal}),enabled:!!query,staleTime:30000,placeholderData:keepPreviousData});
 // Never save on a stale or missing check: wait until the typed values were checked (a failed check does not block).
 const checking=currentKey!=='null'&&(currentKey!==queryKey||duplicates.isFetching);
 const {blocker,shown,hidden,dncWarning,personPhoneDnc}=duplicateWarning({candidates:query?duplicates.data?.candidates??[]:[]});
 const shownKey=shown.map(c=>c.id).join(','),personKey=personPhoneDnc.map(c=>c.id).join(',');
 const mutation=useMutation({mutationFn:saveCommercial,onSuccess:async result=>{
  await qc.cancelQueries({queryKey:['leads']});
  await Promise.all(invalidated.map(key=>qc.invalidateQueries({queryKey:[key],refetchType:'all'})));
  crmSuccess('Negocio creado',toastLink?{label:'Abrir negocio',href:'/accounts/'+result.id}:undefined,draft.personName.trim()?`${draft.personName.trim()} quedó como persona principal.`:undefined);
  onSaved?.(result.id);onClose();
 }});
 const guard=useUnsavedChanges(Object.entries(empty).some(([k,v])=>draft[k as keyof typeof empty]!==v),onClose,mutation.isPending);
 const set=(key:keyof typeof draft)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>{const value=e.target.value;setDraft(d=>({...d,[key]:value,...(key==='tipo'?{subtipo:''}:{})}));};
 const disabledReason=mutation.isPending?'Estamos creando el negocio. Esperá a que termine.':checking?'Revisando si ya existe…':blocker?DNC_DUPLICATE_MESSAGE:shown.length&&acknowledged!==shownKey?'Revisá los negocios parecidos: abrí el que corresponde o marcá «Ninguno de estos es mi negocio, crear igual».':personKey&&personAcknowledged!==personKey?'Leé el aviso del teléfono de la persona y marcá «Entendido» para seguir.':undefined;
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(submitting.current||disabledReason)return;submitting.current=true;setError('');
  const text=(v:string)=>v.trim()||null;
  try{
   await mutation.mutateAsync({action:'account_save',nombre:draft.nombre,ciudad:text(draft.ciudad),telefono:text(draft.telefono),email:text(draft.email),tipo:text(draft.tipo),subtipo:text(draft.subtipo),...(admin?{assignedUserEmail:draft.assignedUserEmail||null}:{}),...(draft.personName.trim()?{primaryContact:{name:draft.personName,phone:text(draft.personPhone)}}:{}),...(personKey&&personAcknowledged===personKey?{personPhoneDncAcknowledged:true}:{})});
  }catch(e){setError(e instanceof Error?e.message:'No se pudo crear el negocio.');}finally{submitting.current=false;}
 };
 const input=(key:keyof typeof draft,label:string,props:React.InputHTMLAttributes<HTMLInputElement>={})=><label key={key}>{label}<Input {...props} disabled={mutation.isPending} value={draft[key]} onChange={set(key)}/></label>;
 return <Dialog open onOpenChange={open=>{if(!open&&!mutation.isPending)guard.requestClose()}}><DialogContent className={styles.editor}>
  <DialogTitle>Nuevo negocio</DialogTitle>
  <DialogDescription>Con el nombre alcanza para crearlo. No crea una gestión: para ofrecerle algo, después usá Iniciar gestión.</DialogDescription>
  <form onSubmit={submit} className={styles.form} aria-busy={mutation.isPending}>
   <fieldset className={styles.formSection}><legend>Datos del negocio</legend>{input('nombre','Nombre',{required:true,autoFocus:true,placeholder:'Ej.: Cabañas del Río'})}{input('ciudad','Ciudad',{placeholder:'Ej.: Colón'})}{input('telefono','Teléfono / WhatsApp',{type:'tel',placeholder:'Ej.: 3447 412345'})}</fieldset>
   <fieldset className={styles.formSection}><legend>Persona con la que hablaste (opcional)</legend>{input('personName','Nombre de la persona',{required:!!draft.personPhone.trim(),placeholder:'Ej.: Ana'})}{input('personPhone','Teléfono de la persona',{type:'tel'})}<p>Queda como persona principal del negocio.</p></fieldset>
   <div className={styles.fullField} aria-live="polite" style={{display:'grid',gap:8}}>{checking&&<small className={styles.muted} role="status">Revisando si ya existe…</small>}{query&&(shown.length>0||(duplicates.isError&&!checking))&&<section aria-label="Negocios parecidos" style={{display:'grid',gap:8,padding:12,border:'1px solid '+(blocker?'var(--error)':'var(--border)'),borderRadius:10}}>
    {blocker&&<p role="alert" className={styles.error} style={{margin:0}}><strong>{DNC_DUPLICATE_MESSAGE}</strong></p>}
    {shown.length>0&&<div id="quick-create-duplicates"><strong>Puede que ya exista:</strong><ul style={{margin:'8px 0 0',paddingInlineStart:18,display:'grid',gap:8}}>{shown.map(c=><li key={c.id}><span style={{display:'inline-flex',flexWrap:'wrap',gap:6,alignItems:'center'}}><strong>{c.nombre}</strong>{c.ciudad?` · ${c.ciudad}`:''}{c.doNotContact&&<ValueBadge value="No contactar" category="status"/>}{c.archived&&<ValueBadge value="Archivado" category="status"/>}{c.canOpen&&<Link to={'/accounts/'+c.id} target="_blank" rel="noopener" aria-label={'Abrir '+c.nombre+' (en otra pestaña)'}>Abrir</Link>}</span><small className={styles.muted} style={{display:'block'}}>{[c.reasons.map(duplicateReasonLabel).join(' · '),'responsibleName' in c?`${VOCAB.businessOwner}: ${c.responsibleName||'sin asignar'}`:null].filter(Boolean).join(' · ')}</small></li>)}</ul>{hidden>0&&<small className={styles.muted}>Y {hidden} más parecidos.</small>}{dncWarning&&!blocker&&<p style={{margin:'8px 0 0'}}><strong>Si es el mismo, no lo contactes.</strong></p>}</div>}
    {duplicates.isError&&<small className={styles.muted}>No pudimos revisar si ya existe. Igual podés crearlo.</small>}
    {shown.length>0&&!blocker&&<label className={styles.checkbox}><Checkbox disabled={mutation.isPending} aria-describedby="quick-create-duplicates" checked={acknowledged===shownKey} onChange={e=>setAcknowledged(e.target.checked?shownKey:'')}/>Ninguno de estos es mi negocio, crear igual</label>}
   </section>}{query&&!blocker&&<PersonPhoneDncWarning matches={personPhoneDnc} acknowledged={!!personKey&&personAcknowledged===personKey} onAcknowledge={v=>setPersonAcknowledged(v?personKey:'')} disabled={mutation.isPending}/>}</div>
   <Disclosure className={styles.optionalFields}><DisclosureSummary>Más datos (opcional)</DisclosureSummary><div className={styles.formSection}>{input('email','Email del negocio',{type:'email'})}<label>Vertical<NativeSelect disabled={mutation.isPending} value={draft.tipo} onChange={set('tipo')}><option value="">Sin clasificar</option>{(settings.data?.types??[]).map(t=><option key={t}>{t}</option>)}</NativeSelect></label><label>Subtipo<NativeSelect disabled={mutation.isPending} value={draft.subtipo} onChange={set('subtipo')}><option value="">Sin asignar</option>{(settings.data?.subtypes??[]).filter(s=>s.typeName===draft.tipo).map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</NativeSelect></label>{admin&&<label>{VOCAB.businessOwner}<NativeSelect disabled={mutation.isPending} value={draft.assignedUserEmail} onChange={set('assignedUserEmail')}><option value="">Sin asignar</option>{(settings.data?.users??[]).map(u=><option key={u.email} value={u.email}>{u.displayName}</option>)}</NativeSelect></label>}</div></Disclosure>
   {!admin&&<p className={styles.muted}>Vas a quedar como {VOCAB.businessOwner.toLowerCase()}.</p>}
   {(error||mutation.error)&&<p role="alert" className={styles.error}>{error||mutation.error?.message}</p>}
   <div className={styles.actions}><Button variant="ghost" disabled={mutation.isPending} disabledReason="Estamos creando el negocio. Esperá a que termine." onClick={guard.requestClose}>Cancelar</Button><Button type="submit" disabled={!!disabledReason} disabledReason={disabledReason}>{mutation.isPending?'Creando negocio…':'Crear negocio'}</Button></div>
  </form>
 </DialogContent>{guard.confirmation}</Dialog>;
}
