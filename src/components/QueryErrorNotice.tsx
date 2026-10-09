import React,{useEffect,useRef} from 'react';
import {Button} from './Button';
import {crmReadError} from '../helpers/crmFeedback';
export function QueryErrorNotice({error,onRetry,busy=false,label='Reintentar'}:{error:Error;onRetry:()=>unknown;busy?:boolean;label?:string}){
 const lock=useRef(false);
 const retry=async()=>{if(lock.current||busy)return;lock.current=true;try{await onRetry()}finally{lock.current=false}};
 const latest=useRef(retry);latest.current=retry;
 useEffect(()=>{crmReadError(error.message,()=>latest.current())},[error]);
 return <div role="alert"><p>{error.message}</p><Button variant="outline" disabled={busy} onClick={()=>void retry()}>{busy?'Cargando…':label}</Button></div>;
}
