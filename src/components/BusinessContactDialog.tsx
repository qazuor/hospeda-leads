import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {CrmNativeSelect} from './ui/CrmNativeSelect';
import {MessageCircle,Mail,ArrowRight,Plus,Instagram} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {CrmDialog} from './ui/CrmDialog';
import {CrmButton as Button} from './ui/CrmButton';
import {CrmSelect} from './ui/CrmSelect';
import {CommercialEditor,type EditorTarget} from './CommercialEditor';
import {ContactTemplateDialog} from './ContactTemplateDialog';
import {UserscriptGateNotice} from './UserscriptGateNotice';
import type {PickedSalesMaterial} from './SalesMaterialPicker';
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
import {CONTACT_ARCHIVED_REASON,CONTACT_DNC_REASON,CONTACT_PERMISSION_REASON,contactChannelBlock,type MessageChannel} from '../helpers/contactChannels';
import {useUserscriptContactBlock} from '../helpers/useUserscriptStatus';
import styles from './Commercial.module.css';

const GENERAL='__general';
type Channel=MessageChannel|'call'|'social'|'other';
export {INSTAGRAM_MISSING_REASON} from '../helpers/contactChannels';
const MESSAGE_CHANNELS:readonly {value:MessageChannel;label:string;Icon:LucideIcon}[]=[{value:'whatsapp',label:'WhatsApp',Icon:MessageCircle},{value:'instagram',label:'Instagram',Icon:Instagram},{value:'email',label:'Email',Icon:Mail}];
const OTHER_CHANNELS:readonly {value:'call'|'social'|'other';label:string}[]=[{value:'call',label:'Llamada'},{value:'social',label:'Red social'},{value:'other',label:'Otro canal'}];
const isMessageChannel=(c:Channel):c is MessageChannel=>c==='email'||c==='whatsapp'||c==='instagram';

/**
 * The single "Contactar" entry (spec 96 §2.3). WhatsApp, Instagram and Email go straight to the contact step (`ContactTemplateDialog`):
 * the compact channel choice, «Sobre» (auto-picked: the requested management, the only open one, or «Sin gestión» when none is open),
 * the purpose for «Sin gestión», the recipient and the templates on one screen. A call, a social network or another channel keep their
 * dialog («¿Sobre qué?», the purpose, `PhoneCallPanel` or the manual form) and their outcome chain (§2.7). `CommercialEditor` starts a
 * management or completes the contact data. Opening or choosing a channel records nothing.
 */
export function BusinessContactDialog({detail,onClose,returnFocusTo,initialChannel,initialContactId,initialLeadId,initialMaterial,onLog,floatingComposer=false,onFloatingClose,onFloatingOpen}:{detail:CommercialDetail;/** «Enviar material» (spec 89 §8.2): added to the message once its draft is ready. Only email and WhatsApp carry it. */initialMaterial?:PickedSalesMaterial;onClose:()=>void;returnFocusTo?:HTMLElement|null;initialChannel?:Channel;initialContactId?:string;/** Preselects «¿Sobre qué?» when that management is open; otherwise the usual default applies. */initialLeadId?:string;onLog?:(contactId:string,channel:string)=>void;floatingComposer?:boolean;onFloatingClose?:(floating:boolean)=>void;/** The management of the floating composer; undefined for «Sin gestión». */onFloatingOpen?:(leadId?:string)=>void}){
 const {authState}=useAuth();const user=authState.type==='authenticated'?authState.user:undefined;
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'})});
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings});
 const history=useQuery({queryKey:['communication','account',detail.account.id],queryFn:()=>getCommunication('',detail.account.id)});
 const gate=useUserscriptContactBlock();
 const [chosen,setChosen]=useState(''),[changingSobre,setChangingSobre]=useState(false),[channelChoice,setChannel]=useState<Channel|null>(initialChannel??null);
 const [purpose,setPurpose]=useState<ContactPurpose>(defaultContactPurpose(detail.account.status)),[otherPurpose,setOtherPurpose]=useState(''),[confirmedClient,setConfirmedClient]=useState(false),[changingPurpose,setChangingPurpose]=useState(false);
 const [created,setCreated]=useState(false),callSession=useCallSession();
 const [manualContact,setManualContact]=useState(false),[editor,setEditor]=useState<EditorTarget|null>(null);
 const loading=stages.isPending||settings.isPending||history.isPending,loadError=stages.error||settings.error||history.error;
 const open=detail.opportunities.filter(o=>!o.deletedAt&&(stages.data?.stages.find(s=>s.name===o.estado)?.classification??'open')==='open');
 const sobre=chosen||(initialLeadId&&open.some(o=>String(o.id)===initialLeadId)?initialLeadId:!open.length?GENERAL:open.length===1?String(open[0].id):'');
 const general=sobre===GENERAL;
 const opportunity=general?undefined:open.find(o=>String(o.id)===sobre);
 const effective=opportunity?String(opportunity.id):'';
 const archived=!!detail.account.archivedAt||detail.account.status==='archived';
 const canBusiness=canModifyBusiness(user,detail.account);
 const managementPermissionReason='Solo la persona responsable de esta gestión o un administrador puede preparar su mensaje.';
 const businessContactReason=detail.account.doNotContact?CONTACT_DNC_REASON:!canBusiness?CONTACT_PERMISSION_REASON:archived?CONTACT_ARCHIVED_REASON:'';
 const managementContactReason=detail.account.doNotContact?CONTACT_DNC_REASON:!canModifyManagement(user,opportunity,detail.account)?managementPermissionReason:archived?CONTACT_ARCHIVED_REASON:'';
 const generalPurpose={purpose,otherPurpose};
 const contactReason=(general?businessContactReason||contactPurposeBlockReason({purpose,otherPurpose,isClient:detail.account.isClient,confirmedClient}):opportunity?managementContactReason:'Elegí sobre qué es el contacto.');
 const recentCandidate=history.data?.recentMessages.find(m=>String(m.leadId)===effective&&(m.channel==='email'||m.channel==='whatsapp'));
 const recent=recentCandidate&&(recentCandidate.channel==='email'||recentCandidate.channel==='whatsapp')&&(!channelChoice||channelChoice===recentCandidate.channel)?recentCandidate:null;
 const activeContacts=detail.contacts.filter(c=>!c.deletedAt);
 const channel:Channel=channelChoice??(recent?.channel==='email'||recent?.channel==='whatsapp'?recent.channel:null)??(detail.account.telefono?.trim()||detail.account.whatsapp?.trim()||activeContacts.some(c=>c.phone?.trim())?'whatsapp':'email');
 const manualChannel=channel==='social'||channel==='other';
 // «Enviar material» only travels by WhatsApp or Email (spec 89 §8.2).
 const offered=MESSAGE_CHANNELS.filter(c=>!initialMaterial||c.value!=='instagram');
 const canContact=canBusiness||open.some(o=>canModifyManagement(user,o,detail.account));
 const channelBlock=(c:MessageChannel,withGate=true)=>contactChannelBlock({channel:c,account:detail.account,contacts:activeContacts,canContact,gateReason:withGate?gate.reason:''});
 // Only undefined means "no request" (report item 1.4): '' is an explicit choice of the business general channel.
 const recipient=initialContactId??(activeContacts.length===1&&recent?.channel===channel&&activeContacts.some(c=>String(c.id)===recent.contactId)?recent.contactId!:undefined);
 const purposeLabel=contactPurposeOptions(detail.account.status).find(o=>o.value===purpose)?.label??purpose;
 const sobreSelect=<CrmSelect label="¿Sobre qué?" placeholder="Elegí sobre qué es el contacto" value={sobre||null} onChange={value=>{setChosen(value??'');setChangingSobre(false);callSession.reset();setManualContact(false)}} data={[...open.map(o=>({value:String(o.id),label:'Una gestión: '+managementDisplayName(o)+' · '+stageLabel(o.estado)})),{value:GENERAL,label:'Sin gestión (contacto general)'}]}/>;
 const startManagement=<Button size="sm" variant="outline" disabled={!canBusiness||archived} disabledReason={!canBusiness?CONTACT_PERMISSION_REASON:CONTACT_ARCHIVED_REASON} leftSection={<Plus size={16} aria-hidden="true"/>} onClick={()=>setEditor({kind:'opportunity'})}>Iniciar gestión</Button>;
 // «Sobre» in one line; the select only when there is no single answer or the seller asks to change it.
 const sobrePicker=!open.length?<p className={styles.muted}>Sobre: <strong>Sin gestión (contacto general)</strong> {startManagement}</p>:changingSobre||!sobre?sobreSelect:<p className={styles.muted}>Sobre: <strong>{opportunity?managementDisplayName(opportunity)+' · '+stageLabel(opportunity.estado):'Sin gestión (contacto general)'}</strong> <Button size="sm" variant="subtle" onClick={()=>setChangingSobre(true)}>Cambiar</Button></p>;
 const purposePicker=general&&<>
  {changingPurpose?<CrmNativeSelect label="Propósito del contacto" value={purpose} onChange={e=>{setPurpose(e.target.value as ContactPurpose);setConfirmedClient(false);setChangingPurpose(false)}} data={contactPurposeOptions(detail.account.status)}/>:<p className={styles.muted}>Propósito: <strong>{purposeLabel}</strong> <Button size="sm" variant="subtle" onClick={()=>setChangingPurpose(true)}>Cambiar</Button></p>}
  {purpose==='other'&&<label>Aclaración del propósito<Input value={otherPurpose} onChange={e=>setOtherPurpose(e.target.value)}/></label>}
  {purpose==='care'&&!detail.account.isClient&&<label><Checkbox checked={confirmedClient} onChange={e=>setConfirmedClient(e.target.checked)}/> Si registrás el contacto como realizado, se marcará Es cliente. ¿Continuar?</label>}
 </>;
 const editContactData=<Button size="sm" variant="subtle" disabled={!canBusiness} disabledReason={CONTACT_PERMISSION_REASON} onClick={()=>setEditor({kind:'account',item:detail.account})}>Agregar o editar datos de contacto</Button>;

 if(editor)return <CommercialEditor target={editor} detail={detail} onSaved={id=>{if(editor.kind==='opportunity'){setChosen(id);setCreated(true)}}} onClose={()=>setEditor(null)}/>;
 if(manualContact&&manualChannel&&(opportunity||general))return <CrmDialog opened onClose={()=>setManualContact(false)} title={channel==='social'?'Registrar contacto por red social':'Registrar contacto por otro canal'} description={<>{detail.account.nombre} · {opportunity?managementDisplayName(opportunity):'sin gestión'} · se guardará el resultado que registres, sin inferir envío o respuesta.</>}>
  <ManualCommunicationForm key={channel+sobre} detail={opportunity?detail:{...detail,opportunities:[]}} currentLeadId={opportunity?String(opportunity.id):null} userEmail={user?.email??''} isAdmin={user?.role==='admin'} embedded fixedContext initialChannel={channel} initialContactId={initialContactId} fixedPurpose={general?generalPurpose:undefined} chainOutcome={!onLog} onFinished={onClose}/>
  <Button mt="md" variant="outline" onClick={()=>setManualContact(false)}>Volver</Button>
 </CrmDialog>;
 if(!isMessageChannel(channel)){
  const title=channel==='call'?'Registrar una llamada':channel==='social'?'Contacto por red social':'Contacto por otro canal';
  return <CrmDialog opened onClose={onClose} title={title} returnFocusTo={returnFocusTo} description={<>{detail.account.nombre} · Elegí sobre qué es el contacto. {VOCAB.businessOwner}: <strong>{userLabel(detail.users,detail.account.assignedUserEmail)}</strong></>}>
   {loading?<p role="status">Cargando gestiones…</p>:loadError?<><p role="alert">{loadError.message}</p><Button onClick={()=>{void stages.refetch();void settings.refetch();void history.refetch()}}>Reintentar</Button></>:<div className={styles.section}>
    {created&&<p role="status">Gestión guardada. Todavía no se realizó un contacto.</p>}
    {open.length?sobreSelect:<p className={styles.muted}>Sin gestiones abiertas: el contacto queda sin gestión. {startManagement}</p>}
    {purposePicker}
    {channel==='call'?(contactReason&&sobre?<p role="status">{contactReason}</p>:sobre?<PhoneCallPanel key={sobre} session={callSession} account={detail.account} contacts={detail.contacts} leadId={effective||null} purpose={general?generalPurpose:null} blockedReason={contactReason} initialContactId={initialContactId} onLog={onLog} onFinished={onClose}/>:<p>Elegí sobre qué es el contacto para ver el teléfono.</p>):<>
     <p>Se creará un intento pendiente. El CRM no enviará el mensaje; al terminar, registrá si se realizó o quedó sin contacto.</p>
     <Button rightSection={<ArrowRight size={18} aria-hidden="true"/>} disabled={!!contactReason} disabledReason={contactReason} onClick={()=>setManualContact(true)}>{channel==='social'?'Continuar con red social':'Continuar con otro canal'}</Button>
    </>}
    {channel==='call'&&<PersonPhoneDncNotice businesses={activeContacts.find(c=>initialContactId&&String(c.id)===initialContactId)?.dncPhoneBusinesses}/>}
    {detail.account.doNotContact&&<p role="alert">Este negocio pidió no recibir contactos. Revisá su restricción antes de continuar.</p>}
    {!initialChannel&&<Button size="sm" variant="ghost" onClick={()=>{setChannel(null);callSession.reset()}}>Volver a WhatsApp, Instagram o Email</Button>}
   </div>}
   <Button mt="md" variant="subtle" onClick={onClose}>Cancelar</Button>
  </CrmDialog>;
 }
 const dataBlock=channelBlock(channel,false);
 // Statuses and the script gate stay in view; the choices below collapse behind «Cambiar» in the composer once they are resolved.
 const notices=(initialMaterial||created||(!initialChannel&&gate.reason))&&<div className={styles.section}>
  {initialMaterial&&<p role="status">Material a enviar: «{initialMaterial.title}». Se agrega al mensaje de email o WhatsApp cuando prepares el borrador; no se manda nada hasta que lo confirmes.</p>}
  {created&&<p role="status">Gestión guardada. Elegí el mensaje para continuar. Todavía no se realizó un contacto.</p>}
  {!initialChannel&&<UserscriptGateNotice gate={gate}/>}
 </div>;
 const pickers=<div className={styles.section}>
  {!initialChannel&&<div role="group" aria-label="Canal" className={styles.actions}>{offered.map(({value,label,Icon})=>{const reason=channelBlock(value);return <Button key={value} size="sm" variant={channel===value?'filled':'outline'} aria-pressed={channel===value} disabled={!!reason} disabledReason={reason} leftSection={<Icon size={16} aria-hidden="true"/>} onClick={()=>setChannel(value)}>{label}</Button>})}</div>}
  {!initialChannel&&!initialMaterial&&<p className={styles.muted}>Otro: {OTHER_CHANNELS.map(({value,label},i)=><React.Fragment key={value}>{i>0&&' · '}<Button size="sm" variant="subtle" onClick={()=>setChannel(value)}>{label}</Button></React.Fragment>)}</p>}
  {loading?<p role="status">Cargando gestiones y mensajes modelo…</p>:loadError?<><p role="alert">{loadError.message}</p><Button variant="outline" onClick={()=>{void stages.refetch();void settings.refetch();void history.refetch()}}>Reintentar</Button></>:<>
   {sobrePicker}
   {purposePicker}
   {recent&&<p className={styles.muted}>Último canal usado en esta gestión: {recent.channel==='email'?'Email':'WhatsApp'} · {recent.recipient}.</p>}
  </>}
  {dataBlock&&editContactData}
 </div>;
 const scopeReady=!loading&&!loadError;
 return <ContactTemplateDialog open presentation={floatingComposer?'floating':'dialog'} returnFocusTo={returnFocusTo} channel={channel} initialContactId={recipient}
  lead={scopeReady&&opportunity?{...opportunity,nombre:detail.account.nombre,ciudad:detail.account.ciudad,email:detail.account.email,telefono:detail.account.telefono}:null}
  general={scopeReady&&general?{accountId:String(detail.account.id),purpose,otherPurpose}:undefined}
  pickers={pickers} contextNotices={notices} contextRequired={!sobre||(general&&!!contactPurposeBlockReason({purpose,otherPurpose,isClient:detail.account.isClient,confirmedClient}))||!!dataBlock} blockReason={loading?'Cargando gestiones y mensajes modelo…':contactReason||dataBlock}
  templates={settings.data?.templates??[]} initialMaterialId={initialMaterial?.id} onLog={onLog} onFinished={onClose}
  onAddChannel={canBusiness?()=>setEditor({kind:'account',item:detail.account}):undefined}
  onOpenChange={v=>{if(!v)onClose()}} onFloatingClose={floating=>{onFloatingClose?.(floating);if(!floating)onClose()}} onFloatingOpen={()=>onFloatingOpen?.(opportunity?String(opportunity.id):undefined)}/>;
}
