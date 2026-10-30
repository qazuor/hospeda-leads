import React from 'react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './Dialog';
import {Button} from './Button';
import {PasswordLoginForm} from './PasswordLoginForm';
import {useAuth} from '../helpers/useAuth';
import {authNavigation} from '../helpers/authSync';

export const SESSION_EXPIRED_DIALOG_TEXT='Tu sesión venció. Ingresá de nuevo para seguir; lo que escribiste se conserva.';
export const OTHER_ACCOUNT_TEXT='Si ingresás con otra cuenta, lo que escribiste se descarta.';
const keepOpen=(event:Event)=>event.preventDefault();

/** Re-login over the current page (another account clears every cache and reloads at home, so a previous user's draft is never saved under it) when the known user's session expires, so drafts and page state survive. Opened by useAuth's sessionExpired flag (deduped across every 401). */
export function SessionExpiredDialog(){
 const {authState,sessionExpired,onRelogin,logout}=useAuth();
 if(!sessionExpired||authState.type!=='authenticated')return null;
 return <Dialog open onOpenChange={()=>undefined}><DialogContent opaqueOverlay showCloseButton={false} onEscapeKeyDown={keepOpen} onInteractOutside={keepOpen}>
  <DialogHeader><DialogTitle>Volvé a ingresar</DialogTitle><DialogDescription>{SESSION_EXPIRED_DIALOG_TEXT} {OTHER_ACCOUNT_TEXT}</DialogDescription></DialogHeader>
  <PasswordLoginForm defaultEmail={authState.user.email} onSuccess={onRelogin}/>
  <Button variant="ghost" onClick={()=>{void logout().catch(()=>authNavigation.assign('/login'))}}>Salir sin guardar</Button>
 </DialogContent></Dialog>;
}
