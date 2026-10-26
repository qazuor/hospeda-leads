import React from 'react';
import {TextInput} from '@mantine/core';
import {Link} from 'react-router-dom';
import {Button} from '../components/Button';
import {Badge} from '../components/Badge';
import {CrmDialog} from '../components/ui/CrmDialog';
import {compareSemver} from '../helpers/userscriptPure';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';
import {INSTALLED_ATTRIBUTE,INSTALLED_EVENT} from '../../userscript/src/announce';
/** Served by the same CRM origin, so the installed script updates itself from the instance that issued its tokens. */
export const USERSCRIPT_URL='/userscripts/hospeda-crm.user.js';
/** How long the page waits for the script to announce itself before reporting it as not detected. */
export const DETECT_TIMEOUT_MS=2000;
type Token={id:string;label:string;createdAt:string;lastUsedAt:string|null;lastVersion:string|null;revokedAt:string|null};
async function api(path:string,body?:unknown){const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||'No se pudo completar la operación.');return data;}
/**
 * The version the user script announced in this browser (it runs on every CRM page and only sets an attribute on <html>). Undefined while
 * waiting, null once it had time to and did not: not installed, disabled, or blocked by the browser.
 */
export function useInstalledUserscript():string|null|undefined{
 const read=()=>document.documentElement.getAttribute(INSTALLED_ATTRIBUTE);
 const [version,setVersion]=React.useState<string|null|undefined>(()=>read()??undefined);
 React.useEffect(()=>{const onAnnounce=()=>setVersion(read());document.addEventListener(INSTALLED_EVENT,onAnnounce);const timer=window.setTimeout(()=>setVersion(current=>current??read()??null),DETECT_TIMEOUT_MS);return()=>{document.removeEventListener(INSTALLED_EVENT,onAnnounce);window.clearTimeout(timer);};},[]);
 return version;
}
const outdated=(version:string|null|undefined)=>!!version&&compareSemver(version,USERSCRIPT_VERSION)<0;
function InstallStatus({installed}:{installed:string|null|undefined}){
 const label=!installed?'Instalar user script':outdated(installed)?'Actualizar user script':'Reinstalar user script';
 return <section aria-labelledby="userscript-status" style={{display:'flex',flexDirection:'column',gap:10,margin:'16px 0'}}>
  <h2 id="userscript-status" style={{margin:0}}>En este navegador</h2>
  <div role="status" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
   {installed===undefined?<span>Buscando el user script…</span>
   :installed===null?<><Badge variant="warning">No detectado</Badge><span>Si ya lo instalaste, revisá que Tampermonkey esté activo (en Chrome o Edge, con «Permitir scripts de usuario») y recargá esta página.</span></>
   :outdated(installed)?<><Badge variant="warning">Desactualizado</Badge><span>Tenés la versión {installed}; la actual es {USERSCRIPT_VERSION}.</span></>
   :<><Badge variant="success">Instalado</Badge><span>Versión {installed}, al día.</span></>}
  </div>
  <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><Button asChild variant={installed&&!outdated(installed)?'outline':'primary'}><a href={USERSCRIPT_URL} target="_blank" rel="noopener">{label}</a></Button><span>Tampermonkey abre la instalación. Después creá un token acá abajo y pegalo en el panel de Hospeda dentro de WhatsApp Web.</span></div>
 </section>;
}
export default function UserscriptPage(){
 const installed=useInstalledUserscript();
 const [tokens,setTokens]=React.useState<Token[]>([]),[label,setLabel]=React.useState(''),[shown,setShown]=React.useState(''),[busy,setBusy]=React.useState(false),[loading,setLoading]=React.useState(true),[error,setError]=React.useState(''),[revokeTarget,setRevokeTarget]=React.useState<Token|null>(null),[autoRegister,setAutoRegister]=React.useState(true);const lock=React.useRef(false);
 const load=React.useCallback(async()=>{setLoading(true);try{setError('');const data=await api('/_api/userscript/tokens');setTokens(data.tokens);setAutoRegister(data.autoRegister??true);}catch(e){setError(e instanceof Error?e.message:'No se pudo cargar.');}finally{setLoading(false);}},[]);React.useEffect(()=>{void load();},[load]);
 const toggleAuto=async(value:boolean)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=await api('/_api/userscript/preferences',{autoRegister:value});setAutoRegister(result.autoRegister);}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la preferencia.');}finally{lock.current=false;setBusy(false);}};
 const create=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const v=await api('/_api/userscript/tokens',{label});setShown(v.token);setLabel('');}catch(e){setError(e instanceof Error?e.message:'No se pudo crear el token.');}finally{lock.current=false;setBusy(false);}await load();};
 const revoke=async(id:string)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await api('/_api/userscript/tokens/revoke',{id});await load();setRevokeTarget(null);}catch(e){setError(e instanceof Error?e.message:'No se pudo revocar.');}finally{lock.current=false;setBusy(false);}};
 const usage=(t:Token)=>t.revokedAt?'Revocado':t.lastUsedAt?`Usado ${new Date(t.lastUsedAt).toLocaleString('es-AR')}${t.lastVersion?` · versión ${t.lastVersion}`:''}`:'Sin usar';
 return <main style={{maxWidth:900,margin:'24px auto',padding:20}}><h1>User script de WhatsApp</h1>
  <p>Registra en el CRM los mensajes de WhatsApp Web que elijas, después de revisarlos. <Link to="/guide?topic=whatsapp-userscript&article=install-userscript">Ver la guía paso a paso</Link>.</p>
  <section aria-labelledby="userscript-before"><h2 id="userscript-before">Antes de instalar</h2><ul>
   <li><strong>Chrome o Edge:</strong> instalá Tampermonkey. Desde la versión 138, hacé clic derecho en su ícono → «Administrar extensión» y activá «Permitir scripts de usuario». Si no aparece, activá el «Modo de desarrollador» en <code>chrome://extensions</code>. Sin eso el script no corre y no muestra ningún error.</li>
   <li><strong>Firefox:</strong> instalá Tampermonkey y aceptá sus permisos, incluido «Acceder a tus datos de todos los sitios web». No hace falta ningún otro paso; si el script no corre, revisá ese permiso en <code>about:addons</code> → Tampermonkey → Permisos.</li>
  </ul></section>
  <InstallStatus installed={installed}/>
  <h2>Tokens</h2>{!loading&&<label style={{display:"flex",gap:8,alignItems:"center",margin:"12px 0"}}><input type="checkbox" checked={autoRegister} disabled={busy} onChange={e=>void toggleAuto(e.currentTarget.checked)}/> Registrar solo los chats seguros</label>}{error&&<p role="alert">{error} <Button variant="outline" disabled={loading} onClick={()=>void load()}>Reintentar</Button></p>}{loading?<p role="status">Cargando tokens…</p>:<><div style={{display:'flex',gap:8,alignItems:'end'}}><TextInput label="Nombre del dispositivo" value={label} maxLength={80} onChange={e=>setLabel(e.currentTarget.value)}/><Button disabled={busy||!label.trim()} onClick={()=>void create()}>{busy?'Creando…':'Crear token'}</Button></div>{shown&&<section role="status"><p>Copialo ahora: no se vuelve a mostrar.</p><code>{shown}</code> <Button onClick={()=>void navigator.clipboard.writeText(shown)}>Copiar token</Button></section>}<ul>{tokens.map(t=><li key={t.id}>{t.label} · creado {new Date(t.createdAt).toLocaleDateString('es-AR')} · {usage(t)}{!t.revokedAt&&outdated(t.lastVersion)&&<> <Badge variant="warning">Desactualizado</Badge></>} {!t.revokedAt&&<Button variant="outline" disabled={busy} onClick={()=>setRevokeTarget(t)}>Revocar</Button>}</li>)}</ul></>}
  <CrmDialog opened={!!revokeTarget} onClose={()=>setRevokeTarget(null)} title="Revocar token" description="El user script dejará de conectarse con este token." busy={busy}><div style={{display:'flex',justifyContent:'flex-end',gap:8}}><Button variant="outline" disabled={busy} onClick={()=>setRevokeTarget(null)}>Cancelar</Button><Button disabled={busy} onClick={()=>{if(revokeTarget)void revoke(revokeTarget.id);}}>Revocar token</Button></div></CrmDialog></main>;
}
