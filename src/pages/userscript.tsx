import {HelpLink} from '../components/HelpLink';
import React from 'react';
import {TextInput} from '@mantine/core';
import {Link} from 'react-router-dom';
import {AlertCircle,Check,ChevronRight,CircleHelp,Download,ExternalLink,KeyRound,MessageCircle,ShieldCheck,Workflow} from 'lucide-react';
import {Button} from '../components/Button';
import {Badge} from '../components/Badge';
import {CrmDialog} from '../components/ui/CrmDialog';
import {compareSemver} from '../helpers/userscriptPure';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';
import {DETECT_TIMEOUT_MS,recheckUserscript,useCurrentUserEmail,useUserscriptStatus} from '../helpers/useUserscriptStatus';
import {userscriptOtherUserReason,type UserscriptStatus} from '../helpers/userscriptGate';
import styles from './userscript.module.css';
/** Served by the same CRM origin, so the installed script updates itself from the instance that issued its tokens. */
export const USERSCRIPT_URL='/userscripts/hospeda-crm.user.js';
/** How long the page waits for the script to announce itself before reporting it as not detected. */
export {DETECT_TIMEOUT_MS};
type Token={id:string;label:string;createdAt:string;lastUsedAt:string|null;lastVersion:string|null;revokedAt:string|null};
async function api(path:string,body?:unknown){const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||'No se pudo completar la operación.');return data;}
const outdated=(version:string|null|undefined)=>!!version&&compareSemver(version,USERSCRIPT_VERSION)<0;
/** Spec 96 §3.4: what the script says about its token in this browser. Only the state reaches the page, never the token. */
const connectionLabels:Record<string,string>={connected:'Conectado','missing-token':'Falta el token',rejected:'Token rechazado',outdated:'Versión rechazada por el CRM',unknown:'Sin verificar'};
function ConnectionLine({status}:{status:UserscriptStatus}){
 const me=useCurrentUserEmail();
 if(!status.version)return null;
 const other=status.connection==='connected'&&!!status.user&&!!me&&status.user.trim().toLowerCase()!==me.trim().toLowerCase();
 if(other)return <div className={styles.statusLine} role="status" aria-label="Conexión"><strong>Conexión</strong><Badge variant="warning">Otra cuenta</Badge><span>{userscriptOtherUserReason({email:status.user!})}</span></div>;
 const label=status.connection==='connected'&&status.user?'Conectado':status.connection?connectionLabels[status.connection]??'Sin verificar':status.connection===undefined?null:'Sin verificar';
 if(!label)return <div className={styles.statusLine} role="status" aria-label="Conexión"><span className={styles.spinner}/><span>Verificando la conexión…</span></div>;
 return <div className={styles.statusLine} role="status" aria-label="Conexión"><strong>Conexión</strong><Badge variant={label==='Conectado'?'success':'warning'}>{label}</Badge>{label==='Conectado'&&status.user&&<span>Con la cuenta {status.user}.</span>}{label==='Sin verificar'&&<Button variant="outline" onClick={recheckUserscript}>Verificar de nuevo</Button>}</div>;
}
function InstallStatus({status}:{status:UserscriptStatus}){
 const installed=status.version;
 const label=!installed?'Instalar user script':outdated(installed)?'Actualizar user script':'Reinstalar user script';
 return <section className={styles.panel} aria-labelledby="userscript-status">
  <div className={styles.sectionTitle}><span className={styles.icon}><Workflow size={18}/></span><div><span className={styles.kicker}>ESTADO</span><h2 id="userscript-status">En este navegador</h2></div></div>
  <div className={styles.statusLine} role="status">
   {installed===undefined?<><span className={styles.spinner}/><span>Buscando el user script…</span></>
   :installed===null?<><Badge variant="warning">No detectado</Badge><span>Si ya lo instalaste, revisá que Tampermonkey esté activo (en Chrome o Edge, con «Permitir scripts de usuario») y recargá esta página.</span></>
   :outdated(installed)?<><Badge variant="warning">Desactualizado</Badge><span>Tenés la versión {installed}; la actual es {USERSCRIPT_VERSION}.</span></>
   :<><Badge variant="success">Instalado</Badge><span>Versión {installed}, al día.</span></>}
  </div>
  <ConnectionLine status={status}/>
  <p className={styles.note}>Para contactar por WhatsApp o Instagram desde la computadora, el script tiene que estar instalado, al día y conectado con tu cuenta.</p>
  <div className={styles.installAction}><Button asChild variant={installed&&!outdated(installed)?'outline':'primary'}><a href={USERSCRIPT_URL} target="_blank" rel="noopener"><Download size={16}/>{label}<ExternalLink size={14}/></a></Button><p>Tampermonkey abre la instalación. Después creá un token y pegalo en el panel de Hospeda dentro de WhatsApp Web. Desde la versión 1.4.0 el script también trabaja en Instagram: al actualizar, Tampermonkey te pide aprobar instagram.com una sola vez.</p></div>
  <div className={styles.version}><span>Versión actual</span><strong>{USERSCRIPT_VERSION}</strong></div>
 </section>;
}
export default function UserscriptPage(){
 const status=useUserscriptStatus();
 const [tokens,setTokens]=React.useState<Token[]>([]),[label,setLabel]=React.useState(''),[shown,setShown]=React.useState(''),[busy,setBusy]=React.useState(false),[loading,setLoading]=React.useState(true),[error,setError]=React.useState(''),[revokeTarget,setRevokeTarget]=React.useState<Token|null>(null),[autoRegister,setAutoRegister]=React.useState(true);const lock=React.useRef(false);
 const load=React.useCallback(async()=>{setLoading(true);try{setError('');const data=await api('/_api/userscript/tokens');setTokens(data.tokens);setAutoRegister(data.autoRegister??true);}catch(e){setError(e instanceof Error?e.message:'No se pudo cargar.');}finally{setLoading(false);}},[]);React.useEffect(()=>{void load();},[load]);
 const toggleAuto=async(value:boolean)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=await api('/_api/userscript/preferences',{autoRegister:value});setAutoRegister(result.autoRegister);}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la preferencia.');}finally{lock.current=false;setBusy(false);}};
 const create=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const v=await api('/_api/userscript/tokens',{label});setShown(v.token);setLabel('');}catch(e){setError(e instanceof Error?e.message:'No se pudo crear el token.');}finally{lock.current=false;setBusy(false);}await load();};
 const revoke=async(id:string)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await api('/_api/userscript/tokens/revoke',{id});await load();setRevokeTarget(null);}catch(e){setError(e instanceof Error?e.message:'No se pudo revocar.');}finally{lock.current=false;setBusy(false);}};
 const usage=(t:Token)=>t.revokedAt?'Revocado':t.lastUsedAt?`Usado ${new Date(t.lastUsedAt).toLocaleString('es-AR')}${t.lastVersion?` · versión ${t.lastVersion}`:''}`:'Sin usar';
 return <main className={styles.shell}>
  <header className={styles.pageHeader}><div><span className={styles.eyebrow}>HERRAMIENTAS</span><h1 aria-label="User script de WhatsApp" style={{display:"flex",alignItems:"center",gap:5,width:"max-content",maxWidth:"100%"}}>User script de WhatsApp<HelpLink topic="userscript"/></h1><p>Revisá los mensajes de WhatsApp Web que elijas y registralos en el CRM desde el panel. <Link to="/guide?topic=whatsapp-userscript&article=install-userscript">Ver la guía paso a paso <ChevronRight size={14}/></Link></p></div></header>
  <div className={styles.mainGrid}>
   <div className={styles.primaryColumn}>
    <InstallStatus status={status}/>
    <section className={styles.panel} aria-labelledby="userscript-tokens"><div className={styles.sectionTitle}><span className={styles.icon}><KeyRound size={18}/></span><div><span className={styles.kicker}>CONEXIÓN</span><h2 id="userscript-tokens">Tokens de este usuario</h2></div></div><p className={styles.intro}>Creá un token por computadora para conectar el panel de WhatsApp con tu cuenta.</p>
     {!loading&&<label className={styles.preference}><input type="checkbox" checked={autoRegister} disabled={busy} onChange={e=>void toggleAuto(e.currentTarget.checked)}/><span><strong>Registrar solo los chats seguros</strong><small>Cuando está habilitado, los chats elegibles pueden registrarse automáticamente.</small></span></label>}
     {error&&<p className={styles.error} role="alert"><AlertCircle size={17}/>{error}<Button variant="outline" disabled={loading} onClick={()=>void load()}>Reintentar</Button></p>}
     {loading?<p className={styles.loading} role="status">Cargando tokens…</p>:<><div className={styles.createToken}><TextInput label="Nombre del dispositivo" placeholder="Por ejemplo, Notebook oficina" value={label} maxLength={80} onChange={e=>setLabel(e.currentTarget.value)}/><Button disabled={busy||!label.trim()} onClick={()=>void create()}>{busy?'Creando…':'Crear token'}</Button></div>
      {shown&&<section className={styles.tokenReveal} role="status"><div><strong>Copialo ahora</strong><p>El token no se vuelve a mostrar.</p></div><code>{shown}</code><Button onClick={()=>void navigator.clipboard.writeText(shown)}>Copiar token</Button></section>}
      {tokens.length?<ul className={styles.tokenList}>{tokens.map(t=><li key={t.id}><span className={styles.tokenIcon}><KeyRound size={16}/></span><div className={styles.tokenInfo}><strong>{t.label}</strong><span>Creado {new Date(t.createdAt).toLocaleDateString('es-AR')} · {usage(t)}</span></div>{!t.revokedAt&&outdated(t.lastVersion)&&<Badge variant="warning">Desactualizado</Badge>}{!t.revokedAt&&<Button variant="outline" disabled={busy} onClick={()=>setRevokeTarget(t)}>Revocar</Button>}</li>)}</ul>:<p className={styles.empty}>Todavía no hay tokens. Creá uno para conectar esta computadora.</p>}
     </>}
    </section>
   </div>
   <aside className={styles.sideColumn}>
    <section className={styles.panel} aria-labelledby="userscript-before"><div className={styles.sectionTitle}><span className={styles.icon}><ShieldCheck size={18}/></span><div><span className={styles.kicker}>REQUISITOS</span><h2 id="userscript-before">Antes de instalar</h2></div></div><ul className={styles.requirements}><li><strong>Chrome o Edge</strong><span>Instalá Tampermonkey. Desde la versión 138, hacé clic derecho en su ícono → «Administrar extensión» y activá «Permitir scripts de usuario». Si no aparece, activá el «Modo de desarrollador» en <code>chrome://extensions</code>. Sin eso el script no corre y no muestra ningún error.</span></li><li><strong>Firefox</strong><span>Instalá Tampermonkey y aceptá sus permisos, incluido «Acceder a tus datos de todos los sitios web». No hace falta ningún otro paso; si el script no corre, revisá ese permiso en <code>about:addons</code> → Tampermonkey → Permisos.</span></li></ul></section>
    <section className={styles.panel} aria-labelledby="userscript-usage"><div className={styles.sectionTitle}><span className={styles.icon}><MessageCircle size={18}/></span><div><span className={styles.kicker}>EN WHATSAPP WEB</span><h2 id="userscript-usage">Cómo se usa</h2></div></div><ol className={styles.steps}><li><span>1</span><p>Instalá el script y creá un token para esta computadora.</p></li><li><span>2</span><p>En WhatsApp Web, abrí el panel de Hospeda y pegá el token en «Ajustes».</p></li><li><span>3</span><p>Conectate y abrí un chat individual. El panel muestra el negocio asociado.</p></li></ol><p className={styles.note}><Check size={15}/> El script no manda mensajes ni modifica contactos o etiquetas.</p><p className={styles.note} data-testid="userscript-instagram"><Check size={15}/> En Instagram, después de «Abrir Instagram», el script toca «Enviar mensaje» y escribe el mensaje preparado en el chat de ese perfil, sin pedir permiso para el portapapeles. No lo envía: lo revisás y lo mandás vos.</p></section>
    <section className={styles.panel} aria-labelledby="userscript-help"><div className={styles.sectionTitle}><span className={styles.icon}><CircleHelp size={18}/></span><div><span className={styles.kicker}>AYUDA</span><h2 id="userscript-help">Si algo no funciona</h2></div></div><ul className={styles.troubleshooting}><li><strong>No aparece el botón:</strong> confirmá que Tampermonkey y «Hospeda CRM» estén activos. En Chrome o Edge revisá «Permitir scripts de usuario» y recargá WhatsApp Web.</li><li><strong>Falta el token o fue revocado:</strong> creá uno nuevo acá y cargalo en «Ajustes» del panel.</li><li><strong>Hay una versión nueva:</strong> tocá «Actualizar» en el aviso de Tampermonkey y recargá WhatsApp Web.</li><li><strong>No puede consultar o leer el chat:</strong> revisá tu conexión. Si sigue, registrá desde el CRM y compartí el diagnóstico del chat con el administrador.</li></ul><Link className={styles.helpLink} to="/guide?topic=whatsapp-userscript&article=whatsapp-problems">Ver todos los problemas y soluciones <ChevronRight size={15}/></Link></section>
   </aside>
  </div>
  <CrmDialog opened={!!revokeTarget} onClose={()=>setRevokeTarget(null)} title="Revocar token" description="El user script dejará de conectarse con este token." busy={busy}><div className={styles.dialogActions}><Button variant="outline" disabled={busy} onClick={()=>setRevokeTarget(null)}>Cancelar</Button><Button disabled={busy} onClick={()=>{if(revokeTarget)void revoke(revokeTarget.id);}}>Revocar token</Button></div></CrmDialog>
 </main>;
}
