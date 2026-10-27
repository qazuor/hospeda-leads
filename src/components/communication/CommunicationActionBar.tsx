import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getPipeline} from '../../endpoints/pipeline.schema';
import {useAuth} from '../../helpers/useAuth';
import {canModifyManagement} from '../../helpers/crmPermissions';
import {Button} from '../Button';
import {Disclosure,DisclosureSummary} from '../Disclosure';
import {CrmDialog} from '../ui/CrmDialog';
import {ManualCommunicationForm} from '../ManualCommunicationForm';
import {PhoneCallPanel,useCallSession,type CallSession} from '../PhoneCallPanel';
import type {CommunicationView,ContactChannel} from './types';
import styles from './CommunicationView.module.css';

export const CONTACT_DNC_REASON='El negocio está marcado No contactar; un administrador debe levantar ese bloqueo.';

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

/**
 * Action bar of «Comunicación»: «Contactar» (the existing composer), «Registrar llamada u otro contacto» and «Registrar
 * respuesta sin mensaje» (the response dialog without a received message). Same gating as before: read-only views keep
 * only the response action, an archived business keeps it for admins only, and a disabled action says why.
 */
export function CommunicationActionBar({view,leadId,onContact}:{view:CommunicationView;leadId?:string;onContact?:(channel?:ContactChannel)=>void}){
 const [recording,setRecording]=useState(false);
 // The call session outlives the dialog: its attempt key makes a retry after an uncertain save idempotent (manual_start).
 const callSession=useCallSession();
 const account=view.detail?.account;
 const showContact=!view.readOnly&&!!onContact,showRecord=!view.readOnly,showResponse=!view.archivedReadOnly;
 if(!showContact&&!showRecord&&!showResponse)return null;
 return <div className={styles.actionBar} role="group" aria-label="Acciones de comunicación">
  {showContact&&<Button disabled={!account||account.doNotContact} disabledReason={!account?'Estamos cargando los datos del negocio.':CONTACT_DNC_REASON} onClick={()=>onContact?.()}>Contactar</Button>}
  {showRecord&&<Button variant="outline" disabled={!view.detail} disabledReason="Estamos cargando los datos del negocio." onClick={()=>setRecording(true)}>Registrar llamada u otro contacto</Button>}
  {showResponse&&<Button variant="outline" onClick={()=>view.openResponse(null)}>Registrar respuesta sin mensaje</Button>}
  {recording&&view.detail&&<RecordContactDialog view={view} leadId={leadId} onContact={onContact} callSession={callSession} onClose={()=>setRecording(false)}/>}
 </div>;
}
