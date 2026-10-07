import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import {CommercialEditor,type EditorTarget} from './CommercialEditor';
import {ContactTemplateDialog} from './ContactTemplateDialog';
import {getPipeline} from '../endpoints/pipeline.schema';
import {getCommunication} from '../endpoints/communication.schema';
import {getSettings} from '../endpoints/settings_GET.schema';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import styles from './Commercial.module.css';

/** Creation stays explicit until the initial commercial stage has been agreed. */
export function BusinessContactDialog({detail,onClose}:{detail:CommercialDetail;onClose:()=>void}){
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'})});
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings});
 const history=useQuery({queryKey:['communication','account',detail.account.id],queryFn:()=>getCommunication('',detail.account.id)});
 const [chosen,setChosen]=useState(''),[channelChoice,setChannel]=useState<'email'|'whatsapp'|null>(null);
 const [created,setCreated]=useState(false);
 const [composing,setComposing]=useState(false),[editor,setEditor]=useState<EditorTarget|null>(null);
 const open=detail.opportunities.filter(o=>!o.deletedAt&&(stages.data?.stages.find(s=>s.name===o.estado)?.classification??'open')==='open');
 const effective=chosen||(open.length===1?String(open[0].id):'');
 const opportunity=open.find(o=>String(o.id)===effective);
 const recent=history.data?.recentMessages.find(m=>String(m.leadId)===effective);
 const channel=channelChoice??recent?.channel??(detail.account.telefono?'whatsapp':'email');
 const recipient=recent?.channel===channel&&detail.contacts.some(c=>!c.deletedAt&&String(c.id)===recent.contactId)?recent.contactId!:'';
 if(editor)return <CommercialEditor target={editor} detail={detail} onSaved={id=>{if(editor.kind==='opportunity'){setChosen(id);setCreated(true)}}} onClose={()=>setEditor(null)}/>;
 if(composing&&opportunity)return <ContactTemplateDialog open channel={channel} initialContactId={recipient} lead={{...opportunity,nombre:detail.account.nombre,ciudad:detail.account.ciudad,email:detail.account.email,telefono:detail.account.telefono}} templates={settings.data?.templates??[]} onAddChannel={()=>{setComposing(false);setEditor({kind:'account',item:detail.account})}} onOpenChange={v=>{if(!v)setComposing(false)}}/>;
 return <Dialog open onOpenChange={v=>{if(!v)onClose()}}><DialogContent className={styles.editor}>
  <DialogTitle>Contactar</DialogTitle><DialogDescription>{detail.account.nombre} · Elegí la gestión y el canal. Después verificá el destinatario y revisá el mensaje.</DialogDescription>
  {stages.isPending||settings.isPending||history.isPending?<p role="status">Cargando gestiones y mensajes modelo…</p>:stages.error||settings.error||history.error?<><p role="alert">{stages.error?.message||settings.error?.message||history.error?.message}</p><Button onClick={()=>{void stages.refetch();void settings.refetch();void history.refetch()}}>Reintentar</Button></>:<div className={styles.section}>
   {created&&<p role="status">Gestión guardada. Elegí el canal para continuar. Todavía no se realizó un contacto.</p>}
   {!open.length?<><p>Sin gestiones abiertas. Para contactar, prepará y guardá una gestión. La persona y la propuesta son opcionales.</p><Button onClick={()=>setEditor({kind:'opportunity'})}>Preparar gestión para contactar</Button></>:<>
    {open.length===1?<p>Gestión: <strong>{opportunity?.opportunityName||'Presentación de Hospeda'}</strong></p>:<label className={styles.contactChoice}>Gestión abierta<select value={effective} onChange={e=>setChosen(e.target.value)}><option value="">Elegí una gestión</option>{open.map(o=><option key={o.id} value={o.id}>{o.opportunityName||'Gestión #'+o.id} · {o.estado||'Sin etapa'}</option>)}</select></label>}
    <label className={styles.contactChoice}>Canal<select value={channel} onChange={e=>setChannel(e.target.value as 'email'|'whatsapp')}><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
    {recent&&<p>Último canal usado en esta gestión: {recent.channel==='email'?'Email':'WhatsApp'} · {recent.recipient}. Podés cambiarlo antes de preparar el mensaje.</p>}
    <p>Podés usar el teléfono o email del negocio, sin cargar una persona. También podrás elegir una persona registrada.</p>
    <Button disabled={!opportunity||detail.account.doNotContact} onClick={()=>setComposing(true)}>Continuar con el mensaje</Button>
   </>}
   {detail.account.doNotContact&&<p role="alert">Este negocio pidió no recibir contactos. Revisá su restricción antes de continuar.</p>}
   <Button variant="outline" onClick={()=>setEditor({kind:'account',item:detail.account})}>Agregar o editar teléfono o email</Button>
  </div>}
  <Button variant="ghost" onClick={onClose}>Cancelar</Button>
 </DialogContent></Dialog>;
}
