import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {CrmNativeSelect} from './ui/CrmNativeSelect';
import {MessageCircle,Mail,ArrowRight,Plus} from 'lucide-react';
import {CrmDialog} from './ui/CrmDialog';
import {CrmButton as Button} from './ui/CrmButton';
import {CrmSelect} from './ui/CrmSelect';
import {CommercialEditor,type EditorTarget} from './CommercialEditor';
import {ContactTemplateDialog} from './ContactTemplateDialog';
import {GeneralContactDialog} from './GeneralContactDialog';
import {ManualCommunicationForm} from './ManualCommunicationForm';
import {getPipeline} from '../endpoints/pipeline.schema';
import {getCommunication} from '../endpoints/communication.schema';
import {getSettings} from '../endpoints/settings_GET.schema';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import {useAuth} from '../helpers/useAuth';
import {canModifyBusiness,canModifyManagement} from '../helpers/crmPermissions';
import {stageLabel} from '../helpers/crmLabels';
import styles from './Commercial.module.css';

/** Creation stays explicit until the initial commercial stage has been agreed. */
export function BusinessContactDialog({detail,onClose,returnFocusTo,initialChannel,initialContactId,onLog}:{detail:CommercialDetail;onClose:()=>void;returnFocusTo?:HTMLElement|null;initialChannel?:'email'|'whatsapp'|'call'|'social'|'other';initialContactId?:string;onLog?:(contactId:string,channel:string)=>void}){
 const {authState}=useAuth();const user=authState.type==='authenticated'?authState.user:undefined;
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'})});
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings});
 const history=useQuery({queryKey:['communication','account',detail.account.id],queryFn:()=>getCommunication('',detail.account.id)});
 const [chosen,setChosen]=useState(''),[channelChoice,setChannel]=useState<'email'|'whatsapp'|'call'|'social'|'other'|null>(initialChannel??null);
 const [created,setCreated]=useState(false);
 const [composing,setComposing]=useState(false),[manualContact,setManualContact]=useState(false),[generalContact,setGeneralContact]=useState(false),[editor,setEditor]=useState<EditorTarget|null>(null);
 const open=detail.opportunities.filter(o=>!o.deletedAt&&(stages.data?.stages.find(s=>s.name===o.estado)?.classification??'open')==='open');
 const effective=chosen||(open.length===1?String(open[0].id):'');
 const opportunity=open.find(o=>String(o.id)===effective);
 const businessOwner=detail.users?.find(u=>u.email===detail.account.assignedUserEmail)?.displayName||detail.account.assignedUserEmail||'Sin asignar';
 const managementOwner=detail.users?.find(u=>u.email===opportunity?.assignedUserEmail)?.displayName||opportunity?.assignedUserEmail||'Sin asignar';
 const archived=!!detail.account.archivedAt||detail.account.status==='archived';
 const businessPermissionReason='Solo la persona responsable del negocio o un administrador puede modificarlo.';
 const managementPermissionReason='Solo la persona responsable de esta gestión o un administrador puede preparar su mensaje.';
 const noContactReason='El negocio está marcado No contactar; un administrador debe levantar ese bloqueo antes de preparar un contacto.';
 const archivedReason='El negocio está archivado; un administrador debe desarchivarlo antes de continuar.';
 const businessContactReason=!canModifyBusiness(user,detail.account)?businessPermissionReason:detail.account.doNotContact?noContactReason:archived?archivedReason:'';
 const managementContactReason=!canModifyManagement(user,opportunity,detail.account)?managementPermissionReason:detail.account.doNotContact?noContactReason:archived?archivedReason:'';
 const recentCandidate=history.data?.recentMessages.find(m=>String(m.leadId)===effective&&(m.channel==='email'||m.channel==='whatsapp'));
 const recent=recentCandidate&&(recentCandidate.channel==='email'||recentCandidate.channel==='whatsapp')&&(!channelChoice||channelChoice===recentCandidate.channel)?recentCandidate:null;
 const activeContacts=detail.contacts.filter(c=>!c.deletedAt);
 const channel=channelChoice??(recent?.channel==='email'||recent?.channel==='whatsapp'?recent.channel:null)??(detail.account.telefono?.trim()||activeContacts.some(c=>c.phone?.trim())?'whatsapp':'email');
 const manualChannel=channel==='call'||channel==='social'||channel==='other';
 // An empty recipient must reach the next step as "no request", so it can preselect the person who has the data (report item 1.4).
 const recipient=initialContactId||(activeContacts.length===1&&recent?.channel===channel&&activeContacts.some(c=>String(c.id)===recent.contactId)?recent.contactId!:undefined);
 if(editor)return <CommercialEditor target={editor} detail={detail} onSaved={id=>{if(editor.kind==='opportunity'){setChosen(id);setCreated(true)}}} onClose={()=>setEditor(null)}/>;
 if(manualContact&&opportunity&&manualChannel)return <CrmDialog opened onClose={()=>setManualContact(false)} title={channel==='call'?'Registrar llamada':channel==='social'?'Registrar contacto por red social':'Registrar contacto por otro canal'} description={<>{detail.account.nombre} · {opportunity.opportunityName||'Gestión comercial'} · se guardará el resultado que registres, sin inferir envío o respuesta.</>}>
  <ManualCommunicationForm key={channel} detail={detail} currentLeadId={String(opportunity.id)} userEmail={user?.email??''} isAdmin={user?.role==='admin'} embedded fixedContext initialChannel={channel} initialContactId={initialContactId}/>
  <Button mt="md" variant="outline" onClick={()=>setManualContact(false)}>Volver a elegir canal</Button>
 </CrmDialog>;
 if(composing&&opportunity&&(channel==='email'||channel==='whatsapp'))return <ContactTemplateDialog open channel={channel} initialContactId={recipient} lead={{...opportunity,nombre:detail.account.nombre,ciudad:detail.account.ciudad,email:detail.account.email,telefono:detail.account.telefono}} templates={settings.data?.templates??[]} onLog={onLog} onAddChannel={canModifyBusiness(user,detail.account)?()=>{setComposing(false);setEditor({kind:'account',item:detail.account})}:undefined} onOpenChange={v=>{if(!v)setComposing(false)}}/>;
 if(generalContact)return <GeneralContactDialog detail={detail} templates={settings.data?.templates??[]} onClose={()=>setGeneralContact(false)}/>;
 return <CrmDialog opened onClose={onClose} title="Contactar" returnFocusTo={returnFocusTo}
  description={<>{detail.account.nombre} · Elegí la gestión y el canal. Después verificá el destinatario y revisá el mensaje.<br/>Relación del negocio: <strong>{businessOwner}</strong>{opportunity&&<> · Responsable de esta gestión: <strong>{managementOwner}</strong></>}</>}>
  {stages.isPending||settings.isPending||history.isPending?<p role="status">Cargando gestiones y mensajes modelo…</p>:stages.error||settings.error||history.error?<><p role="alert">{stages.error?.message||settings.error?.message||history.error?.message}</p><Button onClick={()=>{void stages.refetch();void settings.refetch();void history.refetch()}}>Reintentar</Button></>:<div className={styles.section}>
   {created&&<p role="status">Gestión guardada. Elegí el canal para continuar. Todavía no se realizó un contacto.</p>}
   {!open.length?<><p>Sin gestiones abiertas. Podés hacer un contacto general o iniciar una gestión. Al guardarla vas a volver acá para elegir el canal y preparar el mensaje; todavía no se contacta al comercio.</p>{archived&&<p role="status">Un administrador debe desarchivar este negocio antes de contactar o iniciar una gestión.</p>}<Button variant="outline" disabled={!canModifyBusiness(user,detail.account)||detail.account.doNotContact||!!detail.account.archivedAt} disabledReason={businessContactReason} onClick={()=>setGeneralContact(true)}>Contactar en general</Button><Button disabled={!canModifyBusiness(user,detail.account)||archived} disabledReason={!canModifyBusiness(user,detail.account)?businessPermissionReason:archivedReason} leftSection={<Plus size={18} aria-hidden="true"/>} onClick={()=>setEditor({kind:'opportunity'})}>Iniciar gestión y continuar</Button>{!canModifyBusiness(user,detail.account)&&<p>El responsable del negocio o un administrador puede preparar una gestión.</p>}</>:<>
    {open.length===1?<p>Gestión: <strong>{opportunity?.opportunityName||'Presentación de Hospeda'}</strong></p>:<CrmSelect label="Gestión abierta" placeholder="Elegí una gestión" value={effective||null} onChange={value=>setChosen(value??'')} data={open.map(o=>({value:String(o.id),label:(o.opportunityName||'Gestión #'+o.id)+' · '+stageLabel(o.estado)}))}/>}
    {opportunity&&<p>Responsable de esta gestión: <strong>{managementOwner}</strong></p>}
    <CrmNativeSelect label="Canal" value={channel} onChange={e=>{setChannel(e.target.value as typeof channel);setManualContact(false);setComposing(false)}}
      leftSection={channel==='email'?<Mail size={18} aria-hidden="true"/>:channel==='whatsapp'?<MessageCircle size={18} aria-hidden="true"/>:undefined}
      data={[{value:'whatsapp',label:'WhatsApp'},{value:'email',label:'Email · Brevo'},{value:'call',label:'Llamada'},{value:'social',label:'Red social'},{value:'other',label:'Otro canal'}]}/>
    {recent&&<p>Último canal usado en esta gestión: {recent.channel==='email'?'Email':'WhatsApp'} · {recent.recipient}. Podés cambiarlo antes de preparar el mensaje.</p>}
    <p>Si una persona del negocio tiene el teléfono o email, la elegimos para el mensaje; si no, usamos el del negocio. En el paso siguiente podés cambiarla.</p>
    {manualChannel?<><p>{channel==='call'?'La llamada se registra con su resultado y un resumen.': 'Se creará un intento pendiente. El CRM no enviará el mensaje; al terminar, registrá si se realizó o quedó sin contacto.'}</p><Button rightSection={<ArrowRight size={18} aria-hidden="true"/>} disabled={!canModifyManagement(user,opportunity,detail.account)||detail.account.doNotContact||archived} disabledReason={managementContactReason} onClick={()=>setManualContact(true)}>{channel==='call'?'Registrar llamada':channel==='social'?'Continuar con red social':'Continuar con otro canal'}</Button></>:<Button rightSection={<ArrowRight size={18} aria-hidden="true"/>} disabled={!canModifyManagement(user,opportunity,detail.account)||detail.account.doNotContact||archived} disabledReason={managementContactReason} onClick={()=>setComposing(true)}>Continuar con el mensaje</Button>}
    {archived&&<p role="status">Un administrador debe desarchivar este negocio antes de iniciar un contacto.</p>}
    <Button variant="outline" disabled={!canModifyBusiness(user,detail.account)||detail.account.doNotContact||!!detail.account.archivedAt} disabledReason={businessContactReason} onClick={()=>setGeneralContact(true)}>Contactar en general</Button>
    {opportunity&&!canModifyManagement(user,opportunity,detail.account)&&<p>Solo el responsable de esta gestión o un administrador puede preparar sus mensajes.</p>}
   </>}
   {detail.account.doNotContact&&<p role="alert">Este negocio pidió no recibir contactos. Revisá su restricción antes de continuar.</p>}
   <Button variant="default" disabled={!canModifyBusiness(user,detail.account)} disabledReason={businessPermissionReason} onClick={()=>setEditor({kind:'account',item:detail.account})}>Agregar o editar teléfono o email</Button>
  </div>}
  <Button mt="md" variant="subtle" onClick={onClose}>Cancelar</Button>
 </CrmDialog>;
}
