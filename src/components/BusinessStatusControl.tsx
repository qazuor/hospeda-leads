import {useEffect,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {CrmNativeSelect} from './ui/CrmNativeSelect';
import {CrmDateInput} from './ui/CrmDateInput';
import {Button} from './Button';
import {saveCommercial,type Account} from '../endpoints/commercial.schema';
import {businessStatusLabels,type BusinessStatus} from '../helpers/businessStatus';
import {calendarDay} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import {crmSuccess} from '../helpers/crmFeedback';
import styles from './Commercial.module.css';

const editable:BusinessStatus[]=['reviewed','no_follow_up_scheduled','recontact'];
export function BusinessStatusControl({account,readOnly}:{account:Account;readOnly:boolean}){
 const client=useQueryClient();
 const savedRecontactDay=calendarDay(account.recontactAt);
 const [status,setStatus]=useState<BusinessStatus>(account.status??'new');
 const [recontactAt,setRecontactAt]=useState(savedRecontactDay);
 const [error,setError]=useState('');
 useEffect(()=>{setStatus(account.status??'new');setRecontactAt(savedRecontactDay);},[account.status,savedRecontactDay]);
 const mutation=useMutation({mutationFn:saveCommercial,onSuccess:async()=>{setError('');crmSuccess('Estado del negocio actualizado');await client.invalidateQueries();},onError:e=>setError(e.message)});
 const choices=account.status==='new'?['reviewed' as const]:editable;
 const save=()=>mutation.mutate({action:'business_status',accountId:String(account.id),status,recontactAt:status==='recontact'?(recontactAt||null):null,reason:''});
 const statusLabel=account.status?businessStatusLabels[account.status]:"Pendiente de migración";
 return <section className={styles.stateCard} aria-label="Estado del negocio">
  <div><strong>Estado del negocio</strong><span className={styles.stateBadge}>{statusLabel}</span>{account.status==='recontact'&&savedRecontactDay&&<span className={styles.muted}> · Fecha de referencia: {formatDate(savedRecontactDay)}</span>}</div>
  {!readOnly&&!['archived','in_management'].includes(account.status??'')&&<div className={styles.stateControls}>
   <label>Actualizar estado<CrmNativeSelect value={status} disabled={mutation.isPending} onChange={e=>{setStatus(e.target.value as BusinessStatus);setError('')}}>{choices.map(value=><option key={value} value={value}>{businessStatusLabels[value]}</option>)}</CrmNativeSelect></label>
   {status==='recontact'&&<label>Fecha opcional<CrmDateInput disabled={mutation.isPending} value={recontactAt} onValueChange={setRecontactAt}/></label>}
   {(status!==account.status||(status==='recontact'&&recontactAt!==savedRecontactDay))&&<Button size="sm" disabled={mutation.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={save}>{mutation.isPending?'Guardando…':'Guardar'}</Button>}
  </div>}
  {account.status==='in_management'&&<p className={styles.muted}>Se actualiza automáticamente mientras haya gestiones abiertas.</p>}
  {account.status==='archived'&&<p className={styles.muted}>Para volver a trabajar el negocio, un administrador debe desarchivarlo.</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </section>;
}
