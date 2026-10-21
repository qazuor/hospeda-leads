import React,{useEffect,useRef} from 'react';
import {Link} from 'react-router-dom';
import {Button} from './Button';
import {crmReadError} from '../helpers/crmFeedback';
import {CrmApiError,isNotRetryable} from '../helpers/apiClient';
const backLabels={'/accounts':'Volver a Negocios','/my-day':'Volver a Hoy'} as const;
/** 403/404 cannot be fixed by retrying, so they offer a way back instead of "Reintentar". 401 offers nothing here: the session-expired dialog handles re-login. */
export function QueryErrorNotice({error,onRetry,busy=false,label='Reintentar',backTo='/accounts'}:{error:Error;onRetry:()=>unknown;busy?:boolean;label?:string;backTo?:keyof typeof backLabels}){
 const lock=useRef(false);
 const retry=async()=>{if(lock.current||busy)return;lock.current=true;try{await onRetry()}finally{lock.current=false}};
 const latest=useRef(retry);latest.current=retry;
 useEffect(()=>{crmReadError(error,()=>latest.current())},[error]);
 return <div role="alert"><p>{error.message}</p>{error instanceof CrmApiError&&error.status===401?null:isNotRetryable(error)?<Button variant="outline" asChild><Link to={backTo}>{backLabels[backTo]}</Link></Button>:<Button variant="outline" disabled={busy} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>{void retry().catch(()=>undefined)}}>{busy?'Cargando…':label}</Button>}</div>;
}
