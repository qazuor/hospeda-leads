import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {CrmNativeSelect} from './ui/CrmNativeSelect';
import {MessageCircle,Mail,ArrowRight,Plus} from 'lucide-react';
import {CrmDialog} from './ui/CrmDialog';
import {CrmButton as Button} from './ui/CrmButton';
import {CrmSelect} from './ui/CrmSelect';
import {CommercialEditor,type EditorTarget} from './CommercialEditor';
import {ContactTemplateDialog} from './ContactTemplateDialog';
import {GeneralMessageStep} from './GeneralMessageStep';
import {PhoneCallPanel,useCallSession} from './PhoneCallPanel';
import {Checkbox} from './Checkbox';
import {PersonPhoneDncNotice} from './PersonPhoneDncWarning';
import {Input} from './Input';
import {ManualCommunicationForm} from './ManualCommunicationForm';
import {getPipeline} from '../endpoints/pipeline.schema';
import {getCommunication} from '../endpoints/communication.schema';
import {getSettings} from '../endpoints/settings_GET.schema';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import {useAuth} from '../helpers/useAuth';
import {canModifyBusiness,canModifyManagement} from '../helpers/crmPermissions';
import {stageLabel,userLabel} from '../helpers/crmLabels';
import {contactPurposeBlockReason,contactPurposeOptions,defaultContactPurpose,type ContactPurpose} from '../helpers/contactPurpose';
import {managementDisplayName,VOCAB} from '../content/vocabulary';
import styles from './Commercial.module.css';

const GENERAL='__general';
/**
 * The single "Contactar" dialog. "¿Sobre qué?" picks one open management or "Sin gestión (contacto general)"; the purpose only shows for the general case.
 * Then channel and recipient: a call is made right here (`PhoneCallPanel`), a message goes through its composer, social and other channels through the manual form.
 * Opening or choosing a channel records nothing; every contact ends in "¿Cómo salió?" → "¿Cómo sigue?" unless `onLog` (a task's own completion path) takes over.
 */
export function BusinessContactDialog({detail,onClose,returnFocusTo,initialChannel,initialContactId,onLog}:{detail:CommercialDetail;onClose:()=>void;returnFocusTo?:HTMLElement|null;initialChannel?:'email'|'whatsapp'|'call'|'social'|'other';initialContactId?:string;onLog?:(contactId:string,channel:string)=>void}){
 const {authState}=useAuth();const user=authState.type==='authenticated'?authState.user:undefined;
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'})});
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings});
 const history=useQuery({queryKey:['communication','account',detail.account.id],queryFn:()=>getCommunication('',detail.account.id)});
 const [chosen,setChosen]=useState(''),[channelChoice,setChannel]=useState<'email'|'whatsapp'|'call'|'social'|'other'|null>(initialChannel??null);
 const [purpose,setPurpose]=useState<ContactPurpose>(defaultContactPurpose(detail.account.status)),[otherPurpose,setOtherPurpose]=useState(''),[confirmedClient,setConfirmedClient]=useState(false);
 const [created,setCreated]=useState(false),callSession=useCallSession();
 const [composing,setComposing]=useState(false),[manualContact,setManualContact]=useState(false),[generalMessage,setGeneralMessage]=useState(false),[editor,setEditor]=useState<EditorTarget|null>(null);
 const open=detail.opportunities.filter(o=>!o.deletedAt&&(stages.data?.stages.find(s=>s.name===o.estado)?.classification??'open')==='open');
 const sobre=chosen||(!open.length?GENERAL:open.length===1?String(open[0].id):'');
 const general=sobre===GENERAL;
 const opportunity=general?undefined:open.find(o=>String(o.id)===sobre);
 const effective=opportunity?String(opportunity.id):'';
 const businessOwner=userLabel(detail.users,detail.account.assignedUserEmail);
 const managementOwner=userLabel(detail.users,opportunity?.assignedUserEmail);
 const archived=!!detail.account.archivedAt||detail.account.status==='archived';
 const businessPermissionReason='Solo la persona responsable del negocio o un administrador puede modificarlo.';
 const managementPermissionReason='Solo la persona responsable de esta gestión o un administrador puede preparar su mensaje.';
 const noContactReason='El negocio está marcado No contactar; un administrador debe levantar ese bloqueo antes de preparar un contacto.';
 const archivedReason='El negocio está archivado; un administrador debe desarchivarlo antes de continuar.';
 const businessContactReason=detail.account.doNotContact&&user?.role!=='admin'?noContactReason:!canModifyBusiness(user,detail.account)?businessPermissionReason:detail.account.doNotContact?noContactReason:archived?archivedReason:'';
 const managementContactReason=detail.account.doNotContact&&user?.role!=='admin'?noContactReason:!canModifyManagement(user,opportunity,detail.account)?managementPermissionReason:detail.account.doNotContact?noContactReason:archived?archivedReason:'';
 const generalPurpose={purpose,otherPurpose};
 const contactReason=(general?businessContactReason||contactPurposeBlockReason({purpose,otherPurpose,isClient:detail.account.isClient,confirmedClient}):opportunity?managementContactReason:'Elegí sobre qué es el contacto.');
 const recentCandidate=history.data?.recentMessages.find(m=>String(m.leadId)===effective&&(m.channel==='email'||m.channel==='whatsapp'));
 const recent=recentCandidate&&(recentCandidate.channel==='email'||recentCandidate.channel==='whatsapp')&&(!channelChoice||channelChoice===recentCandidate.channel)?recentCandidate:null;
 const activeContacts=detail.contacts.filter(c=>!c.deletedAt);
 const channel=channelChoice??(recent?.channel==='email'||recent?.channel==='whatsapp'?recent.channel:null)??(detail.account.telefono?.trim()||activeContacts.some(c=>c.phone?.trim())?'whatsapp':'email');
 const manualChannel=channel==='social'||channel==='other';
 // Only undefined means "no request" (report item 1.4): '' is an explicit choice of the business general channel.
 const recipient=initialContactId??(activeContacts.length===1&&recent?.channel===channel&&activeContacts.some(c=>String(c.id)===recent.contactId)?recent.contactId!:undefined);
 const resetSteps=()=>{setManualContact(false);setComposing(false);setGeneralMessage(false)};
 if(editor)return <CommercialEditor target={editor} detail={detail} onSaved={id=>{if(editor.kind==='opportunity'){setChosen(id);setCreated(true)}}} onClose={()=>setEditor(null)}/>;
 if(manualContact&&manualChannel&&(opportunity||general))return <CrmDialog opened onClose={()=>setManualContact(false)} title={channel==='social'?'Registrar contacto por red social':'Registrar contacto por otro canal'} description={<>{detail.account.nombre} · {opportunity?managementDisplayName(opportunity):'sin gestión'} · se guardará el resultado que registres, sin inferir envío o respuesta.</>}>
  <ManualCommunicationForm key={channel+sobre} detail={opportunity?detail:{...detail,opportunities:[]}} currentLeadId={opportunity?String(opportunity.id):null} userEmail={user?.email??''} isAdmin={user?.role==='admin'} embedded fixedContext initialChannel={channel} initialContactId={initialContactId} fixedPurpose={general?generalPurpose:undefined} chainOutcome={!onLog} onFinished={onClose}/>
  <Button mt="md" variant="outline" onClick={()=>setManualContact(false)}>Volver a elegir canal</Button>
 </CrmDialog>;
 if(composing&&opportunity&&(channel==='email'||channel==='whatsapp'))return <ContactTemplateDialog open channel={channel} initialContactId={recipient} lead={{...opportunity,nombre:detail.account.nombre,ciudad:detail.account.ciudad,email:detail.account.email,telefono:detail.account.telefono}} templates={settings.data?.templates??[]} onLog={onLog} onFinished={onClose} onAddChannel={canModifyBusiness(user,detail.account)?()=>{setComposing(false);setEditor({kind:'account',item:detail.account})}:undefined} onOpenChange={v=>{if(!v)setComposing(false)}}/>;
 if(generalMessage&&general&&(channel==='email'||channel==='whatsapp'))return <GeneralMessageStep detail={detail} templates={settings.data?.templates??[]} channel={channel} purpose={generalPurpose} onClose={()=>setGeneralMessage(false)} onFinished={onClose} onLog={onLog}/>;
 return <CrmDialog opened onClose={onClose} title="Contactar" returnFocusTo={returnFocusTo}
  description={<>{detail.account.nombre} · Elegí sobre qué es el contacto y el canal. Después verificá el destinatario y revisá el mensaje.<br/>{VOCAB.businessOwner}: <strong>{businessOwner}</strong>{opportunity&&<> · {VOCAB.managementOwner}: <strong>{managementOwner}</strong></>}</>}>
  {stages.isPending||settings.isPending||history.isPending?<p role="status">Cargando gestiones y mensajes modelo…</p>:stages.error||settings.error||history.error?<><p role="alert">{stages.error?.message||settings.error?.message||history.error?.message}</p><Button onClick={()=>{void stages.refetch();void settings.refetch();void history.refetch()}}>Reintentar</Button></>:<div className={styles.section}>
   {created&&<p role="status">Gestión guardada. Elegí el canal para continuar. Todavía no se realizó un contacto.</p>}
   {!open.length?<><p>Sin gestiones abiertas. Podés contactar al negocio sin gestión o iniciar una gestión. Al guardarla vas a volver acá para elegir el canal y preparar el mensaje; todavía no se contacta al comercio.</p>{archived&&<p role="status">Un administrador debe desarchivar este negocio antes de contactar o iniciar una gestión.</p>}<Button variant="outline" disabled={!canModifyBusiness(user,detail.account)||archived} disabledReason={!canModifyBusiness(user,detail.account)?businessPermissionReason:archivedReason} leftSection={<Plus size={18} aria-hidden="true"/>} onClick={()=>setEditor({kind:'opportunity'})}>Iniciar gestión y continuar</Button>{!canModifyBusiness(user,detail.account)&&<p>El responsable del negocio o un administrador puede preparar una gestión.</p>}</>:<CrmSelect label="¿Sobre qué?" placeholder="Elegí sobre qué es el contacto" value={sobre||null} onChange={value=>{setChosen(value??'');callSession.reset();resetSteps()}} data={[...open.map(o=>({value:String(o.id),label:'Una gestión: '+managementDisplayName(o)+' · '+stageLabel(o.estado)})),{value:GENERAL,label:'Sin gestión (contacto general)'}]}/>}
   {general&&<>
    <CrmNativeSelect label="Propósito del contacto" value={purpose} onChange={e=>{setPurpose(e.target.value as ContactPurpose);setConfirmedClient(false)}} data={contactPurposeOptions(detail.account.status)}/>
    {purpose==='other'&&<label>Aclaración del propósito<Input value={otherPurpose} onChange={e=>setOtherPurpose(e.target.value)}/></label>}
    {purpose==='care'&&!detail.account.isClient&&<label><Checkbox checked={confirmedClient} onChange={e=>setConfirmedClient(e.target.checked)}/> Si registrás el contacto como realizado, se marcará Es cliente. ¿Continuar?</label>}
   </>}
   {opportunity&&<p>{VOCAB.managementOwner}: <strong>{managementOwner}</strong></p>}
   <CrmNativeSelect label="Canal" value={channel} onChange={e=>{setChannel(e.target.value as typeof channel);resetSteps()}}
     leftSection={channel==='email'?<Mail size={18} aria-hidden="true"/>:channel==='whatsapp'?<MessageCircle size={18} aria-hidden="true"/>:undefined}
     data={[{value:'whatsapp',label:'WhatsApp'},{value:'email',label:'Email · Brevo'},{value:'call',label:'Llamada'},{value:'social',label:'Red social'},{value:'other',label:'Otro canal'}]}/>
   {recent&&<p>Último canal usado en esta gestión: {recent.channel==='email'?'Email':'WhatsApp'} · {recent.recipient}. Podés cambiarlo antes de preparar el mensaje.</p>}
   {channel==='call'?(contactReason&&sobre?<p role="status">{contactReason}</p>:sobre?<PhoneCallPanel key={sobre} session={callSession} account={detail.account} contacts={detail.contacts} leadId={effective||null} purpose={general?generalPurpose:null} blockedReason={contactReason} initialContactId={initialContactId} onLog={onLog} onFinished={onClose}/>:<p>Elegí sobre qué es el contacto para ver el teléfono.</p>):<>
    {!manualChannel&&<p>Si una persona del negocio tiene el teléfono o email, la elegimos para el mensaje; si no, usamos el del negocio. En el paso siguiente podés cambiarla.</p>}
    {manualChannel&&<p>Se creará un intento pendiente. El CRM no enviará el mensaje; al terminar, registrá si se realizó o quedó sin contacto.</p>}
    <Button rightSection={<ArrowRight size={18} aria-hidden="true"/>} disabled={!!contactReason} disabledReason={contactReason} onClick={()=>manualChannel?setManualContact(true):general?setGeneralMessage(true):setComposing(true)}>{manualChannel?(channel==='social'?'Continuar con red social':'Continuar con otro canal'):'Continuar con el mensaje'}</Button>
   </>}
   {channel!=='call'&&channel!=='email'&&<PersonPhoneDncNotice businesses={activeContacts.find(c=>initialContactId&&String(c.id)===initialContactId)?.dncPhoneBusinesses}/>}
   {archived&&<p role="status">Un administrador debe desarchivar este negocio antes de iniciar un contacto.</p>}
   {opportunity&&!canModifyManagement(user,opportunity,detail.account)&&<p>Solo el responsable de esta gestión o un administrador puede preparar sus mensajes.</p>}
   {detail.account.doNotContact&&<p role="alert">Este negocio pidió no recibir contactos. Revisá su restricción antes de continuar.</p>}
   <Button variant="default" disabled={!canModifyBusiness(user,detail.account)} disabledReason={businessPermissionReason} onClick={()=>setEditor({kind:'account',item:detail.account})}>Agregar o editar teléfono o email</Button>
  </div>}
  <Button mt="md" variant="subtle" onClick={onClose}>Cancelar</Button>
 </CrmDialog>;
}
