import React,{useLayoutEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {Archive,MoreHorizontal,Eye,MessageCircle,LoaderCircle,Trash2} from 'lucide-react';
import {Button} from './Button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger} from './DropdownMenu';
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
 const busyReason='Cerrá la acción abierta para volver a usar este botón.';
 const contactReason=action?busyReason:'Solo el responsable del negocio o un administrador puede contactar.';
 const trashReason='Solo el responsable del negocio o un administrador puede enviarlo a Papelera.';
 // Sellers without modify rights would get a menu with only a disabled item: disable the trigger instead.
 const menuEmpty=!admin&&!canModify;
 const pick=(next:'contact')=>(event:React.MouseEvent<HTMLButtonElement>)=>{actionTrigger.current=event.currentTarget;setAction(next);};
 return <><div className={styles.actions} role="group" aria-label={'Acciones de '+name}>
  <Button size="sm" variant="outline" className={styles.action} disabled={!!action} disabledReason={busyReason} title="Abrir negocio" onClick={event=>{actionTrigger.current=event.currentTarget;onOpen();}}><Eye size={15} aria-hidden="true"/>Abrir</Button>
  <Button size="sm" variant="outline" className={styles.action} disabled={!canModify||!!action} disabledReason={contactReason} title="Contactar: elegir gestión, canal y mensaje" onClick={pick('contact')}>{pending&&action==='contact'?<LoaderCircle size={15} className={styles.spinner} aria-hidden="true"/>:<MessageCircle size={15} aria-hidden="true"/>}Contactar</Button>
  <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className={styles.more} aria-label={'Más acciones de '+name} data-row-more title="Más acciones" disabled={!!action||menuEmpty} disabledReason={action?busyReason:trashReason} onClick={event=>{actionTrigger.current=event.currentTarget;}}><MoreHorizontal size={18} aria-hidden="true"/></Button></DropdownMenuTrigger>
   <DropdownMenuContent align="end">
    {admin&&<><DropdownMenuItem onClick={()=>setAction('archive')} title="Negocio válido que no se trabajará ahora. Conserva datos y tareas; solo un administrador puede recuperarlo."><Archive size={15} aria-hidden="true"/>Archivar negocio…</DropdownMenuItem><DropdownMenuSeparator/></>}
    {!canModify&&<DropdownMenuLabel>{trashReason}</DropdownMenuLabel>}<DropdownMenuItem className={styles.danger} disabled={!canModify} onClick={()=>setAction('delete_account')} title={canModify?'Solo para registros inválidos o mal cargados. Conserva datos; solo un administrador puede restaurarlo.':trashReason}><Trash2 size={15} aria-hidden="true"/>Enviar a Papelera…</DropdownMenuItem>
   </DropdownMenuContent></DropdownMenu>
 </div>
 {action&&(detail.isPending||detail.error||!allowed)?<Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent><DialogTitle>{action==='contact'?'Preparar contacto':action==='archive'?'Archivar negocio':'Enviar a Papelera'}</DialogTitle><DialogDescription>{name}</DialogDescription>{detail.isPending?<p role="status">{action==='contact'?'Cargando datos para contactar…':action==='archive'?'Cargando negocio para archivar…':'Cargando negocio para enviar a Papelera…'}</p>:detail.error?<><p role="alert">{detail.error.message}</p><Button disabled={detail.isFetching} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>detail.refetch()}>{detail.isFetching?'Cargando negocio…':'Reintentar'}</Button></>:<p role="alert">El negocio cambió de responsable o fue archivado. Actualizá el listado para revisar sus permisos.</p>}<Button variant="ghost" onClick={close}>Cancelar</Button></DialogContent></Dialog>:action==='contact'&&detail.data?<BusinessContactDialog detail={detail.data} onClose={close} returnFocusTo={actionTrigger.current}/>:action==='delete_account'&&detail.data?<CommercialEditor target={{kind:'delete_account'}} detail={detail.data} onClose={close} onSaved={()=>toast.success('Negocio enviado a Papelera',{action:admin?{label:'Ver Papelera',onClick:()=>navigate('/trash')}:undefined})}/>:action==='archive'&&detail.data?<CommercialEditor target={{kind:'archive'}} detail={detail.data} onClose={close} onSaved={()=>toast.success('Negocio archivado. Datos e historial conservados.',{duration:8000,action:{label:'Ver archivados',onClick:()=>{navigate('/archived');}}})}/>:null}
 </>;
}
