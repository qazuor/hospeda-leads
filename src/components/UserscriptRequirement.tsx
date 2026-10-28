import {useEffect,useId} from 'react';
import {createPortal} from 'react-dom';
import {Link,useLocation} from 'react-router-dom';
import {toast} from 'sonner';
import {Download,LogOut,RefreshCw,ShieldAlert} from 'lucide-react';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';
import {LAYERS} from '../helpers/layers';
import {useAuth} from '../helpers/useAuth';
import {USERSCRIPT_URL,userscriptPrompt,type UserscriptPrompt} from '../helpers/userscriptGate';
import {recheckUserscript,useCurrentUserEmail,useUserscriptStatus} from '../helpers/useUserscriptStatus';
import {Button} from './Button';
import {isCoarsePointer} from './InstagramOpenChat';
import styles from './UserscriptRequirement.module.css';

/** One toast id, so a change of state updates the same warning instead of stacking a new one. */
export const USERSCRIPT_PROMPT_TOAST_ID='userscript-prompt';

/**
 * Owner review of spec 96 (28/10/2026): nobody, admins included, uses the CRM on a computer whose script is missing, outdated or
 * disconnected. Those states cover every page with a blocking screen until the script announces a good state (it lifts by itself);
 * the «User script» page stays usable because that is where the script is installed and its token created, and the user can log
 * out. When the CRM only could not verify the token, a warning toast offers «Verificar de nuevo» instead, so a server hiccup never
 * locks everyone out. Phones and tablets are never blocked, and automated browsers (Playwright sets `navigator.webdriver`) skip it so
 * the browser suite is not covered; the rule itself is covered by unit tests.
 */
export function UserscriptRequirement(){
 const status=useUserscriptStatus(),currentUserEmail=useCurrentUserEmail(),{pathname}=useLocation();
 const automated=typeof navigator!=='undefined'&&navigator.webdriver===true;
 const prompt=automated||pathname==='/userscript'?null:userscriptPrompt({mobile:isCoarsePointer(),status,latest:USERSCRIPT_VERSION,currentUserEmail});
 const warning=prompt&&!prompt.blocking?prompt:null,warningTitle=warning?.title??'',warningDescription=warning?.description??'';
 // The prompt is a new object every render: the toast is keyed on what it says.
 useEffect(()=>{
  if(!warningTitle){toast.dismiss(USERSCRIPT_PROMPT_TOAST_ID);return;}
  toast.warning(warningTitle,{id:USERSCRIPT_PROMPT_TOAST_ID,description:warningDescription,duration:Infinity,dismissible:false,closeButton:false,className:styles.toast,
   action:{label:'Verificar de nuevo',onClick:event=>{event.preventDefault();recheckUserscript();}}});
 },[warningTitle,warningDescription]);
 useEffect(()=>()=>{toast.dismiss(USERSCRIPT_PROMPT_TOAST_ID);},[]);
 return prompt?.blocking?<UserscriptBlocker prompt={prompt}/>:null;
}

/** The blocking screen: above dialogs, and everything else in the page is `inert` while it is shown. */
function UserscriptBlocker({prompt}:{prompt:UserscriptPrompt}){
 const {logout}=useAuth(),titleId=useId(),descriptionId=useId();
 useEffect(()=>{
  const others=[...document.body.children].filter(e=>!e.hasAttribute('data-userscript-blocker')&&!e.hasAttribute('inert'));
  others.forEach(e=>e.setAttribute('inert',''));
  return()=>others.forEach(e=>e.removeAttribute('inert'));
 },[]);
 return createPortal(<div className={styles.overlay} style={{zIndex:LAYERS.toast-1}} data-userscript-blocker="">
  <section className={styles.card} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
   <span className={styles.icon}><ShieldAlert size={28} aria-hidden="true"/></span>
   <h2 id={titleId}>{prompt.title}</h2>
   <p id={descriptionId}>{prompt.description}</p>
   <div className={styles.actions}>
    {prompt.kind==='connect'
     ?<><Button asChild><Link to="/userscript">Ir a User script</Link></Button><Button variant="outline" onClick={recheckUserscript}><RefreshCw size={16} aria-hidden="true"/>Verificar de nuevo</Button></>
     :<><Button asChild><a href={USERSCRIPT_URL} target="_blank" rel="noopener"><Download size={16} aria-hidden="true"/>{prompt.kind==='install'?'Instalar ahora':'Actualizar ahora'}</a></Button><Button variant="outline" onClick={()=>window.location.reload()}><RefreshCw size={16} aria-hidden="true"/>Ya lo instalé, recargar</Button></>}
   </div>
   <p className={styles.hint}>{prompt.kind==='connect'?'Creá un token en «User script» y pegalo en el panel de Hospeda dentro de WhatsApp Web.':'Tampermonkey abre la instalación en otra pestaña. Cuando termines, recargá esta página.'} <Link to="/userscript">Ver instrucciones</Link></p>
   <Button variant="ghost" size="sm" className={styles.logout} onClick={()=>void logout()}><LogOut size={15} aria-hidden="true"/>Cerrar sesión</Button>
  </section>
 </div>,document.body);
}
