import {toast} from 'sonner';
import {isNotRetryable} from './apiClient';
export function crmSuccess(message:string,link?:{label:string;href:string},description?:string){
 return toast.success(message,{description,duration:8000,...(link?{action:{label:link.label,onClick:()=>window.dispatchEvent(new CustomEvent('crm:navigate',{detail:link.href}))}}:{})});
}
/** Retry is reserved for reads; uncertain sends are never retried by a toast. 403/404 get no retry: repeating cannot succeed. */
export function crmReadError(error:string|Error,retry:()=>unknown){
 const message=typeof error==='string'?error:error.message;
 if(isNotRetryable(error))return toast.error(message);
 return toast.error(message,{action:{label:'Reintentar',onClick:()=>{void Promise.resolve().then(retry).catch(e=>toast.error(e instanceof Error?e.message:'No se pudo volver a cargar.'))}}});
}
