import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {CrmNativeSelect} from './ui/CrmNativeSelect';
import {MessageCircle,Mail,ArrowRight,Plus} from 'lucide-react';
import {CrmDialog} from './ui/CrmDialog';
import {CrmButton as Button} from './ui/CrmButton';
import {CrmSelect} from './ui/CrmSelect';
import {CommercialEditor,type EditorTarget} from './CommercialEditor';
import {ContactTemplateDialog} from './ContactTemplateDialog';
import {getPipeline} from '../endpoints/pipeline.schema';
import {getCommunication} from '../endpoints/communication.schema';
import {getSettings} from '../endpoints/settings_GET.schema';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import styles from './Commercial.module.css';

/** Creation stays explicit until the initial commercial stage has been agreed. */
export function BusinessContactDialog({detail,onClose,returnFocusTo,initialChannel,initialContactId,onLog}:{detail:CommercialDetail;onClose:()=>void;returnFocusTo?:HTMLElement|null;initialChannel?:'email'|'whatsapp';initialContactId?:string;onLog?:(contactId:string,channel:string)=>void}){
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'})});
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings});
 const history=useQuery({queryKey:['communication','account',detail.account.id],queryFn:()=>getCommunication('',detail.account.id)});
 const [chosen,setChosen]=useState(''),[channelChoice,setChannel]=useState<'email'|'whatsapp'|null>(initialChannel??null);
 const [created,setCreated]=useState(false);
 const [composing,setComposing]=useState(false),[editor,setEditor]=useState<EditorTarget|null>(null);
 const open=detail.opportunities.filter(o=>!o.deletedAt&&(stages.data?.stages.find(s=>s.name===o.estado)?.classification??'open')==='open');
 const effective=chosen||(open.length===1?String(open[0].id):'');
 const opportunity=open.find(o=>String(o.id)===effective);
 const recent=history.data?.recentMessages.find(m=>String(m.leadId)===effective);
 const channel=channelChoice??recent?.channel??(detail.account.telefono?'whatsapp':'email');
 const recipient=initialContactId??(recent?.channel===channel&&detail.contacts.some(c=>!c.deletedAt&&String(c.id)===recent.contactId)?recent.contactId!:'');
 if(editor)return <CommercialEditor target={editor} detail={detail} onSaved={id=>{if(editor.kind==='opportunity'){setChosen(id);setCreated(true)}}} onClose={()=>setEditor(null)}/>;
 if(composing&&opportunity)return <ContactTemplateDialog open channel={channel} initialContactId={recipient} lead={{...opportunity,nombre:detail.account.nombre,ciudad:detail.account.ciudad,email:detail.account.email,telefono:detail.account.telefono}} templates={settings.data?.templates??[]} onLog={onLog} onAddChannel={()=>{setComposing(false);setEditor({kind:'account',item:detail.account})}} onOpenChange={v=>{if(!v)setComposing(false)}}/>;
 return <CrmDialog opened onClose={onClose} title="Contactar" returnFocusTo={returnFocusTo}
  description={<>{detail.account.nombre} · Elegí la gestión y el canal. Después verificá el destinatario y revisá el mensaje.</>}>
  {stages.isPending||settings.isPending||history.isPending?<p role="status">Cargando gestiones y mensajes modelo…</p>:stages.error||settings.error||history.error?<><p role="alert">{stages.error?.message||settings.error?.message||history.error?.message}</p><Button onClick={()=>{void stages.refetch();void settings.refetch();void history.refetch()}}>Reintentar</Button></>:<div className={styles.section}>
   {created&&<p role="status">Gestión guardada. Elegí el canal para continuar. Todavía no se realizó un contacto.</p>}
   {!open.length?<><p>Sin gestiones abiertas. Para contactar, prepará y guardá una gestión. La persona y la propuesta son opcionales.</p><Button leftSection={<Plus size={18} aria-hidden="true"/>} onClick={()=>setEditor({kind:'opportunity'})}>Preparar gestión para contactar</Button></>:<>
    {open.length===1?<p>Gestión: <strong>{opportunity?.opportunityName||'Presentación de Hospeda'}</strong></p>:<CrmSelect label="Gestión abierta" placeholder="Elegí una gestión" value={effective||null} onChange={value=>setChosen(value??'')} data={open.map(o=>({value:String(o.id),label:(o.opportunityName||'Gestión #'+o.id)+' · '+(o.estado||'Sin etapa')}))}/>}
    <CrmNativeSelect label="Canal" value={channel} onChange={e=>setChannel(e.target.value as 'email'|'whatsapp')}
      leftSection={channel==='email'?<Mail size={18} aria-hidden="true"/>:<MessageCircle size={18} aria-hidden="true"/>}
      data={[{value:'whatsapp',label:'WhatsApp'},{value:'email',label:'Email'}]}/>
    {recent&&<p>Último canal usado en esta gestión: {recent.channel==='email'?'Email':'WhatsApp'} · {recent.recipient}. Podés cambiarlo antes de preparar el mensaje.</p>}
    <p>Podés usar el teléfono o email del negocio, sin cargar una persona. También podrás elegir una persona registrada.</p>
    <Button rightSection={<ArrowRight size={18} aria-hidden="true"/>} disabled={!opportunity||detail.account.doNotContact} onClick={()=>setComposing(true)}>Continuar con el mensaje</Button>
   </>}
   {detail.account.doNotContact&&<p role="alert">Este negocio pidió no recibir contactos. Revisá su restricción antes de continuar.</p>}
   <Button variant="default" onClick={()=>setEditor({kind:'account',item:detail.account})}>Agregar o editar teléfono o email</Button>
  </div>}
  <Button mt="md" variant="subtle" onClick={onClose}>Cancelar</Button>
 </CrmDialog>;
}
