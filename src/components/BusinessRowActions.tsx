import React,{useLayoutEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {Archive,Eye,MessageCircle,LoaderCircle,Trash2} from 'lucide-react';
import {Button} from './Button';
import {Tooltip,TooltipTrigger,TooltipContent} from './Tooltip';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog';
import {BusinessContactDialog} from './BusinessContactDialog';
import {CommercialEditor} from './CommercialEditor';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {useAuth} from '../helpers/useAuth';
import {toast} from 'sonner';
import styles from './BusinessRowActions.module.css';
export function BusinessRowActions({accountId,name,canModify,admin,onOpen}:{accountId:string;name:string;canModify:boolean;admin:boolean;onOpen:()=>void}){
 const navigate=useNavigate();const [action,setAction]=useState<'contact'|'archive'|'delete_account'|null>(null);const {authState}=useAuth();
 const actionTrigger=useRef<HTMLButtonElement|null>(null);
 const restoreActionFocus=useRef(false);
 const detail=useQuery({queryKey:['commercial-detail',accountId],queryFn:()=>getCommercialDetail(accountId),enabled:!!action});
 const allowed=detail.data&&authState.type==='authenticated'&&!detail.data.account.archivedAt&&(authState.user.role==='admin'||detail.data.account.assignedUserEmail===authState.user.email);
 const close=()=>{restoreActionFocus.current=true;setAction(null);};
 useLayoutEffect(()=>{
  if(action||!restoreActionFocus.current)return;
  restoreActionFocus.current=false;
  if(actionTrigger.current?.isConnected)actionTrigger.current.focus({preventScroll:true});
 },[action]);
 const pending=!!action&&detail.isPending;
 const control=(label:string,icon:React.ReactNode,onClick:()=>void,disabled=false,help=label)=>{
  const reason=label==='Contactar'&&!canModify?'Solo el responsable del negocio o un administrador puede contactar.':action?'Cerrá la acción abierta para volver a usar este botón.':help;
  const button=<Button size="icon-sm" variant="ghost" className={styles.action} aria-label={label} disabled={disabled} disabledReason="" onClick={event=>{actionTrigger.current=event.currentTarget;onClick();}}>{icon}</Button>;
  return <Tooltip><TooltipTrigger asChild><span className={styles.trigger}>{button}</span></TooltipTrigger><TooltipContent>{disabled?reason:help}</TooltipContent></Tooltip>;
 };
 return <><div className={styles.actions} role="group" aria-label={'Acciones de '+name}>
  {control('Abrir',<Eye size={16} aria-hidden="true"/>,onOpen,!!action,action?'Cerrá la acción actual para abrir el negocio':'Abrir negocio')}
  {control('Contactar',pending&&action==='contact'?<LoaderCircle size={16} className={styles.spinner} aria-hidden="true"/>:<MessageCircle size={16} aria-hidden="true"/>,()=>setAction('contact'),!canModify||!!action,action?'Cerrá la acción actual para contactar':canModify?'Contactar: elegir gestión, canal y mensaje':'Solo el responsable o admin puede contactar desde este negocio')}
  {control('Archivar negocio',<Archive size={16} aria-hidden="true"/>,()=>setAction('archive'),!admin||!!action,action?'Cerrá la acción actual para archivar':admin?'Archivar: negocio válido que no se trabajará ahora. Conserva datos y tareas; solo admin puede recuperarlo.':'Solo un administrador puede archivar negocios')}
  {control('Enviar a Papelera',<Trash2 size={16} aria-hidden="true"/>,()=>setAction('delete_account'),!canModify||!!action,action?'Cerrá la acción actual para enviar a Papelera':canModify?'Enviar a Papelera: solo para registros inválidos o mal cargados. Conserva datos; solo admin puede restaurarlo.':'Solo el responsable o admin puede enviar este negocio a Papelera')}

 </div>
 {action&&(detail.isPending||detail.error||!allowed)?<Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent><DialogTitle>{action==='contact'?'Preparar contacto':action==='archive'?'Archivar negocio':'Enviar a Papelera'}</DialogTitle><DialogDescription>{name}</DialogDescription>{detail.isPending?<p role="status">{action==='contact'?'Cargando datos para contactar…':action==='archive'?'Cargando negocio para archivar…':'Cargando negocio para enviar a Papelera…'}</p>:detail.error?<><p role="alert">{detail.error.message}</p><Button disabled={detail.isFetching} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>detail.refetch()}>{detail.isFetching?'Cargando negocio…':'Reintentar'}</Button></>:<p role="alert">El negocio cambió de responsable o fue archivado. Actualizá el listado para revisar sus permisos.</p>}<Button variant="ghost" onClick={close}>Cancelar</Button></DialogContent></Dialog>:action==='contact'&&detail.data?<BusinessContactDialog detail={detail.data} onClose={close} returnFocusTo={actionTrigger.current}/>:action==='delete_account'&&detail.data?<CommercialEditor target={{kind:'delete_account'}} detail={detail.data} onClose={close} onSaved={()=>toast.success('Negocio enviado a Papelera',{action:admin?{label:'Ver Papelera',onClick:()=>navigate('/trash')}:undefined})}/>:action==='archive'&&detail.data?<CommercialEditor target={{kind:'archive'}} detail={detail.data} onClose={close} onSaved={()=>toast.success('Negocio archivado. Datos e historial conservados.',{duration:8000,action:{label:'Ver archivados',onClick:()=>{navigate('/archived');}}})}/>:null}
 </>;
}
