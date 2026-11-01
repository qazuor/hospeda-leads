import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getPipeline} from '../../endpoints/pipeline.schema';
import {useAuth} from '../../helpers/useAuth';
import {canModifyBusiness,canModifyManagement} from '../../helpers/crmPermissions';
import {CONTACT_DNC_REASON,contactChannelBlock,type MessageChannel} from '../../helpers/contactChannels';
import {useUserscriptContactBlock} from '../../helpers/useUserscriptStatus';
import {ChevronDown,Instagram,Mail,MessageCircle} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {UserscriptGateNotice} from '../UserscriptGateNotice';
import {Button} from '../Button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '../DropdownMenu';
import {Disclosure,DisclosureSummary} from '../Disclosure';
import {CrmDialog} from '../ui/CrmDialog';
import {ManualCommunicationForm} from '../ManualCommunicationForm';
import {PhoneCallPanel,useCallSession,type CallSession} from '../PhoneCallPanel';
import {HelpLink} from '../HelpLink';
import {SalesMaterialPicker,type PickedSalesMaterial} from '../SalesMaterialPicker';
import type {CommunicationView,ContactChannel} from './types';
import styles from './CommunicationView.module.css';

export {CONTACT_DNC_REASON};
const CHANNELS:readonly {value:MessageChannel;label:string;Icon:LucideIcon}[]=[{value:'whatsapp',label:'WhatsApp',Icon:MessageCircle},{value:'instagram',label:'Instagram',Icon:Instagram},{value:'email',label:'Email',Icon:Mail}];

/** The management call panel (only a management view can register a call here), with the same blocking reasons as before. */
function ManagementCall({view,leadId,callSession}:{view:CommunicationView;leadId:string;callSession:CallSession}){
 const {authState}=useAuth();
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'})});
 const detail=view.detail,opp=detail?.opportunities.find(o=>String(o.id)===leadId);
 if(!detail||!opp)return null;
 const blockedReason=!canModifyManagement(authState.type==='authenticated'?authState.user:undefined,opp,detail.account)?'Solo la persona responsable de esta gestión o un administrador puede iniciar el contacto.':stages.isPending?'Esperá a que se carguen las etapas de la gestión.':stages.error?'No pudimos revisar la etapa de la gestión. Reintentá la carga.':(stages.data?.stages.find(s=>s.name===opp.estado)?.classification??'open')!=='open'?'La gestión está cerrada: solo admite registrar respuestas recibidas, no llamadas nuevas.':detail.account.doNotContact?CONTACT_DNC_REASON:detail.account.archivedAt?'El negocio está archivado; un administrador debe desarchivarlo.':'';
 return <Disclosure><DisclosureSummary>Registrar una llamada</DisclosureSummary><PhoneCallPanel session={callSession} account={detail.account} contacts={detail.contacts} leadId={leadId} blockedReason={blockedReason} onFinished={callSession.reset}/></Disclosure>;
}

/**
 * «Registrar llamada u otro contacto»: on the business page a call goes through «Contactar» (it asks what the call is about);
 * on a management the call panel is right here. Social and other channels use the existing manual form. Nothing is sent.
 */
function RecordContactDialog({view,leadId,onContact,onClose,callSession}:{view:CommunicationView;leadId?:string;onContact?:(channel?:ContactChannel)=>void;onClose:()=>void;callSession:CallSession}){
 const detail=view.detail!;
 // `busy` keeps the dialog open while a call is being saved: closing it then could lose track of an uncertain result.
 return <CrmDialog opened onClose={()=>{if(!callSession.pending)onClose()}} busy={callSession.pending} title="Registrar llamada u otro contacto" description="El CRM registra lo que hiciste: no llama ni envía mensajes por redes.">
  <div className={styles.dialogBody}>
   {leadId?<ManagementCall view={view} leadId={leadId} callSession={callSession}/>:onContact&&<section className={styles.section} aria-label="Llamada"><p className={styles.note}>Para una llamada elegís sobre qué fue y anotás cómo salió.</p><Button variant="outline" style={{alignSelf:'flex-start'}} disabled={detail.account.doNotContact} disabledReason={CONTACT_DNC_REASON} onClick={()=>{onClose();onContact('call')}}>Registrar una llamada</Button></section>}
   <ManualCommunicationForm detail={detail} currentLeadId={leadId??null} userEmail={view.userEmail} isAdmin={view.admin}/>
  </div>
 </CrmDialog>;
}

/** One «Registrar ▾» option; a disabled one keeps saying why under its label (spec 91 §6). */
function RecordItem({label,reason,onSelect}:{label:string;reason?:string;onSelect:()=>void}){
 return <DropdownMenuItem disabled={!!reason} onSelect={onSelect}><span className={styles.menuItem}><span>{label}</span>{reason&&<small>{reason}</small>}</span></DropdownMenuItem>;
}

/**
 * Action bar of «Comunicación», spec 91 §6 and spec 96 §2.2, on one line: «WhatsApp», «Instagram» and «Email» (each opens the contact
 * step with that channel; disabled with the first reason that applies, the user script gate last), «Registrar ▾» (a menu with
 * «Llamada u otro contacto» and «Respuesta sin mensaje», the response dialog without a received message) and «Enviar
 * material» with its help link. Same gating as before: read-only views keep only the response option, an archived business
 * keeps it for admins only, and a disabled action says why. `onSendMaterial` adds «Enviar material» (spec 89 §8.2).
 */
export function CommunicationActionBar({view,leadId,onContact,onSendMaterial}:{view:CommunicationView;leadId?:string;onContact?:(channel?:ContactChannel)=>void;onSendMaterial?:(material:PickedSalesMaterial)=>void}){
 const [recording,setRecording]=useState(false),[materialPicker,setMaterialPicker]=useState(false);
 // The call session outlives the dialog: its attempt key makes a retry after an uncertain save idempotent (manual_start).
 const callSession=useCallSession();
 const account=view.detail?.account,{authState}=useAuth(),gate=useUserscriptContactBlock();
 const user=authState.type==='authenticated'?authState.user:undefined;
 // Same rule as the general case of TaskContactDialog: the business, or at least one of its managements, can be written by this user.
 const canContact=!!view.detail&&(canModifyBusiness(user,view.detail.account)||view.detail.opportunities.some(o=>!o.deletedAt&&canModifyManagement(user,o,view.detail!.account)));
 const channelReason=(channel:MessageChannel)=>contactChannelBlock({channel,account,contacts:view.detail?.contacts??[],canContact,gateReason:gate.reason});
 const showContact=!view.readOnly&&!!onContact,showRecord=!view.readOnly,showResponse=!view.archivedReadOnly,showMaterial=!view.readOnly&&!!onSendMaterial&&!!account;
 const sendMaterialBlock=account?.doNotContact?'El negocio está marcado No contactar: no se le manda material.':account?.archivedAt?'El negocio está archivado; un administrador debe desarchivarlo.':!view.canWrite?'Solo el responsable o un administrador puede contactar a este negocio.':'';
 if(!showContact&&!showRecord&&!showResponse&&!showMaterial)return null;
 return <><div className={styles.actionBar} role="group" aria-label="Acciones de comunicación">
  {showContact&&CHANNELS.map(({value,label,Icon})=>{const reason=channelReason(value);return <Button key={value} variant={value==='whatsapp'?'primary':'outline'} disabled={!!reason} disabledReason={reason} onClick={()=>onContact?.(value)}><Icon size={16} aria-hidden="true"/>{label}</Button>})}
  {(showRecord||showResponse)&&<DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">Registrar<ChevronDown size={16} aria-hidden="true"/></Button></DropdownMenuTrigger><DropdownMenuContent>
   {showRecord&&<RecordItem label="Llamada u otro contacto" reason={view.detail?undefined:'Estamos cargando los datos del negocio.'} onSelect={()=>setRecording(true)}/>}
   {showResponse&&<RecordItem label="Respuesta sin mensaje" onSelect={()=>view.openResponse(null)}/>}
  </DropdownMenuContent></DropdownMenu>}
  {showMaterial&&<><Button variant="outline" disabled={!!sendMaterialBlock} disabledReason={sendMaterialBlock} onClick={()=>setMaterialPicker(true)}>Enviar material</Button><HelpLink topic="salesMaterial" hint="sendMaterial"/><SalesMaterialPicker opened={materialPicker} title="Enviar material" context={{accountId:String(account!.id),leadId:leadId??null}} onClose={()=>setMaterialPicker(false)} onPick={x=>{setMaterialPicker(false);onSendMaterial?.(x)}}/></>}
  {recording&&view.detail&&<RecordContactDialog view={view} leadId={leadId} onContact={onContact} callSession={callSession} onClose={()=>setRecording(false)}/>}
 </div>{showContact&&<UserscriptGateNotice gate={gate}/>}</>;
}
