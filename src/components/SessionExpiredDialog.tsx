import React from 'react';
import {useNavigate} from 'react-router-dom';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './Dialog';
import {Button} from './Button';
import {PasswordLoginForm} from './PasswordLoginForm';
import {useAuth} from '../helpers/useAuth';

export const SESSION_EXPIRED_DIALOG_TEXT='Tu sesión venció. Ingresá de nuevo para seguir; lo que escribiste se conserva.';
const keepOpen=(event:Event)=>event.preventDefault();

/** Re-login over the current page (another user starts over at home, so a previous user's draft is never saved under the new one) when the known user's session expires, so drafts and page state survive. Opened by useAuth's sessionExpired flag (deduped across every 401). */
export function SessionExpiredDialog(){
 const {authState,sessionExpired,onRelogin,logout}=useAuth();const navigate=useNavigate();
 if(!sessionExpired||authState.type!=='authenticated')return null;
 return <Dialog open onOpenChange={()=>undefined}><DialogContent showCloseButton={false} onEscapeKeyDown={keepOpen} onInteractOutside={keepOpen}>
  <DialogHeader><DialogTitle>Volvé a ingresar</DialogTitle><DialogDescription>{SESSION_EXPIRED_DIALOG_TEXT}</DialogDescription></DialogHeader>
  <PasswordLoginForm defaultEmail={authState.user.email} onSuccess={user=>{const sameUser=user.id===authState.user.id;onRelogin(user);if(!sameUser)navigate('/')}}/>
  <Button variant="ghost" onClick={()=>{void logout().catch(()=>window.location.assign('/login'))}}>Salir sin guardar</Button>
 </DialogContent></Dialog>;
}
