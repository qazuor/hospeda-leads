import {useEffect} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {toast} from 'sonner';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';
import {USERSCRIPT_URL,userscriptPrompt} from '../helpers/userscriptGate';
import {useHasOpenDialog} from '../helpers/useDialogLayer';
import {useCurrentUserEmail,useUserscriptStatus} from '../helpers/useUserscriptStatus';
import {isCoarsePointer} from './InstagramOpenChat';
import styles from './UserscriptPromptToast.module.css';

/** One toast id, so a change of state updates the same prompt instead of stacking a new one. */
export const USERSCRIPT_PROMPT_TOAST_ID='userscript-prompt';

/**
 * Owner review of spec 96 (28/10/2026): while the script on this computer is outdated or disconnected, a warning toast stays on screen
 * on every page (like the update prompt inside WhatsApp Web) until the problem is fixed. It cannot be closed or swiped away, its action
 * does not close it, and it is hidden on the «User script» page (which already explains the same thing) and while a dialog is open.
 */
export function UserscriptPromptToast(){
 const status=useUserscriptStatus(),currentUserEmail=useCurrentUserEmail(),navigate=useNavigate(),{pathname}=useLocation();
 const prompt=userscriptPrompt({mobile:isCoarsePointer(),status,latest:USERSCRIPT_VERSION,currentUserEmail});
 // With a dialog open the toaster moves to the top centre, over the dialog's title: the prompt waits until the dialog closes.
 const dialogOpen=useHasOpenDialog();
 const visible=!!prompt&&pathname!=='/userscript'&&!dialogOpen,kind=prompt?.kind,title=prompt?.title??'',description=prompt?.description??'';
 // Keyed on the prompt's values (a new object every render), so the toast is only updated when what it says changes.
 useEffect(()=>{
  if(!visible){toast.dismiss(USERSCRIPT_PROMPT_TOAST_ID);return;}
  toast.warning(title,{id:USERSCRIPT_PROMPT_TOAST_ID,description,duration:Infinity,dismissible:false,closeButton:false,className:styles.prompt,
   action:kind==='update'
    ?{label:'Actualizar ahora',onClick:event=>{event.preventDefault();window.open(USERSCRIPT_URL,'_blank','noopener');}}
    :{label:'Ir a User script',onClick:event=>{event.preventDefault();navigate('/userscript');}}});
 },[visible,kind,title,description,navigate]);
 useEffect(()=>()=>{toast.dismiss(USERSCRIPT_PROMPT_TOAST_ID);},[]);
 return null;
}
