import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './DropdownMenu';
import React,{useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {Archive,Eye,MessageCircle,LoaderCircle,Trash2,MoreHorizontal} from 'lucide-react';
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
 const detail=useQuery({queryKey:['commercial-detail',accountId],queryFn:()=>getCommercialDetail(accountId),enabled:!!action});
 const allowed=detail.data&&authState.type==='authenticated'&&!detail.data.account.archivedAt&&(authState.user.role==='admin'||detail.data.account.assignedUserEmail===authState.user.email);
 const close=()=>setAction(null);
 const pending=!!action&&detail.isPending;
 const control=(label:string,icon:React.ReactNode,onClick:()=>void,disabled=false,help=label)=><Tooltip><TooltipTrigger asChild><span className={styles.trigger} tabIndex={disabled?0:undefined}><Button size="icon-sm" variant="ghost" className={styles.action} aria-label={label} disabled={disabled} onClick={event=>{actionTrigger.current=event.currentTarget;onClick();}}>{icon}</Button></span></TooltipTrigger><TooltipContent>{help}</TooltipContent></Tooltip>;
 return <><div className={styles.actions} role="group" aria-label={'Acciones de '+name}>
  {control('Abrir',<Eye size={16} aria-hidden="true"/>,onOpen,!!action,'Abrir negocio')}
  {control('Contactar',pending&&action==='contact'?<LoaderCircle size={16} className={styles.spinner} aria-hidden="true"/>:<MessageCircle size={16} aria-hidden="true"/>,()=>setAction('contact'),!canModify||!!action,canModify?'Contactar: elegir gestión, canal y mensaje':'Solo el responsable o admin puede contactar desde este negocio')}
  {(admin||canModify)&&<DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" className={styles.action} aria-label={'Más acciones de '+name} disabled={!!action} onClick={event=>{actionTrigger.current=event.currentTarget;}}><MoreHorizontal size={16} aria-hidden="true"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{admin&&<DropdownMenuItem onSelect={()=>setAction('archive')}><Archive size={15} aria-hidden="true"/>Archivar negocio</DropdownMenuItem>}{canModify&&<DropdownMenuItem onSelect={()=>setAction('delete_account')}><Trash2 size={15} aria-hidden="true"/>Eliminar negocio</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}

 </div>
 {action&&(detail.isPending||detail.error||!allowed)?<Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent><DialogTitle>{action==='contact'?'Preparar contacto':action==='archive'?'Archivar negocio':'Eliminar negocio'}</DialogTitle><DialogDescription>{name}</DialogDescription>{detail.isPending?<p role="status">{action==='contact'?'Cargando datos para contactar…':'Cargando negocio para archivar…'}</p>:detail.error?<><p role="alert">{detail.error.message}</p><Button disabled={detail.isFetching} onClick={()=>detail.refetch()}>{detail.isFetching?'Cargando negocio…':'Reintentar'}</Button></>:<p role="alert">El negocio cambió de responsable o fue archivado. Actualizá el listado para revisar sus permisos.</p>}<Button variant="ghost" onClick={close}>Cancelar</Button></DialogContent></Dialog>:action==='contact'&&detail.data?<BusinessContactDialog detail={detail.data} onClose={close} returnFocusTo={actionTrigger.current}/>:action==='delete_account'&&detail.data?<CommercialEditor target={{kind:'delete_account'}} detail={detail.data} onClose={close} onSaved={()=>toast.success('Negocio enviado a Papelera',{action:admin?{label:'Ver Papelera',onClick:()=>navigate('/trash')}:undefined})}/>:action==='archive'&&detail.data?<CommercialEditor target={{kind:'archive'}} detail={detail.data} onClose={close} onSaved={()=>toast.success('Negocio archivado. Datos e historial conservados.',{duration:8000,action:{label:'Ver archivados',onClick:()=>{navigate('/archived');}}})}/>:null}
 </>;
}
