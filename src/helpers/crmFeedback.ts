import {toast} from 'sonner';
export function crmSuccess(message:string,link?:{label:string;href:string},description?:string){
 return toast.success(message,{description,duration:8000,...(link?{action:{label:link.label,onClick:()=>window.dispatchEvent(new CustomEvent('crm:navigate',{detail:link.href}))}}:{})});
}
/** Retry is reserved for reads; uncertain sends are never retried by a toast. */
export function crmReadError(message:string,retry:()=>unknown){
 return toast.error(message,{action:{label:'Reintentar',onClick:()=>{void Promise.resolve().then(retry).catch(e=>toast.error(e instanceof Error?e.message:'No se pudo volver a cargar.'))}}});
}
