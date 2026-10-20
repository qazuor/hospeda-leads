import {toast} from 'sonner';
import {CrmApiError,isNotRetryable} from './apiClient';
export function crmSuccess(message:string,link?:{label:string;href:string},description?:string){
 return toast.success(message,{description,duration:8000,...(link?{action:{label:link.label,onClick:()=>window.dispatchEvent(new CustomEvent('crm:navigate',{detail:link.href}))}}:{})});
}
/** Retry is reserved for reads; uncertain sends are never retried by a toast. 403/404 get no retry: repeating cannot succeed. 401 gets one shared toast: the re-login dialog is the way out. */
export function crmReadError(error:string|Error,retry:()=>unknown){
 const message=typeof error==='string'?error:error.message;
 if(error instanceof CrmApiError&&error.status===401)return toast.error(message,{id:'crm-session-expired'});
 if(isNotRetryable(error))return toast.error(message);
 return toast.error(message,{action:{label:'Reintentar',onClick:()=>{void Promise.resolve().then(retry).catch(e=>toast.error(e instanceof Error?e.message:'No se pudo volver a cargar.'))}}});
}
