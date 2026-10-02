import React,{useEffect,useState} from 'react';import {useMutation,useQuery} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './Dialog';import {Button} from './Button';import {MessageComposer,messageLabels} from './MessageComposer';
import {getCommercialDetail} from '../endpoints/commercial.schema';import {getCommunication,postCommunication,type Message} from '../endpoints/communication.schema';
import styles from './ContactTemplateDialog.module.css';
type Template={id:string;channel:string;name:string;subject:string|null;body:string;vertical:string|null;commercialProfile:string|null};
export function ContactTemplateDialog({open,onOpenChange,channel,lead,templates}:{open:boolean;onOpenChange:(v:boolean)=>void;channel:'email'|'whatsapp';lead:any|null;templates:Template[]}){
 const [contactId,setContactId]=useState<string|null>(null),[message,setMessage]=useState<Message|null>(null);
 const q=useQuery({queryKey:['commercial-detail','',String(lead?.id??'')],queryFn:()=>getCommercialDetail(undefined,String(lead.id)),enabled:open&&!!lead?.id});
 const history=useQuery({queryKey:['communication',String(lead?.id??'')],queryFn:()=>getCommunication(String(lead.id)),enabled:open&&!!lead?.id});
 useEffect(()=>{if(open){setContactId(null);setMessage(null)}},[open,channel,lead?.id]);
 const contacts=q.data?.contacts.filter(c=>!c.deletedAt)??[];const opp=q.data?.opportunities.find(o=>String(o.id)===String(lead?.id));const preferred=contacts.find(c=>String(c.id)===String(opp?.primaryContactId))||(contacts.length===1?contacts[0]:contacts.find(c=>c.isPrimary));const legacy=preferred?.sourceLeadId!=null&&String(preferred.sourceLeadId)===String(lead?.id)&&!opp?.opportunityName;
 const effective=contactId??(preferred&&!legacy?String(preferred.id):'');const person=contacts.find(c=>String(c.id)===effective);const recipient=effective?(channel==='email'?person?.email:person?.phone):(channel==='email'?lead?.email:lead?.telefono);
 const restriction=history.data?.restrictions.find(r=>!r.liftedAt&&['all',channel].includes(r.channel)&&((effective&&String(r.contactId)===effective)||(!r.contactId&&String(r.leadId)===String(lead?.id))));
 const blocked=q.data?.account.doNotContact||!!restriction;const recent=history.data?.recentMessages.find(m=>m.recipient===recipient&&m.status!=='draft'&&m.status!=='cancelled'&&Date.now()-new Date(m.updatedAt).getTime()<(history.data?.recentContactHours??72)*3600000);
 const applicable=templates.filter(t=>(!t.vertical||t.vertical===lead?.tipo)&&(!lead?.commercialProfile?.trim()||!t.commercialProfile||t.commercialProfile===lead.commercialProfile)&&!(channel==='whatsapp'&&lead?.commercialProfile==='Referente'));
 const prepare=useMutation({mutationFn:postCommunication,onSuccess:d=>setMessage(d)});
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={styles.dialog}><DialogHeader><DialogTitle>{channel==='email'?'Preparar email':'Preparar WhatsApp'}</DialogTitle><DialogDescription>{lead?.nombre}</DialogDescription></DialogHeader>
 {!message&&<><label className={styles.recipient}>Destinatario<select aria-label="Destinatario" value={effective} onChange={e=>setContactId(e.target.value)}><option value="">Contacto original de la oportunidad</option>{contacts.map(c=><option key={c.id} value={String(c.id)}>{c.name}{c.isPrimary?' · Principal':''}</option>)}</select></label><p className={styles.recipientChannel}>{recipient||'Sin canal cargado'}</p><p className={styles.recipientHelp}>Si no hay nombre, la variable de contacto queda vacía. Elegí un template o prepará un mensaje libre.</p>
 {blocked&&<p role="alert">No contactar: {restriction?.reason||'Restricción del negocio'}</p>}
 {recent&&<p role="status">Contacto reciente: {new Date(recent.updatedAt).toLocaleString('es-AR')} · {recent.channel} · {messageLabels[recent.status]??recent.status} · {recent.ownerEmail}. Revisá antes de iniciar otro contacto.</p>}
 <div className={styles.list}>{applicable.map(t=><button key={t.id} disabled={blocked||!recipient||prepare.isPending||!q.data} onClick={()=>prepare.mutate({action:'prepare',id:crypto.randomUUID(),leadId:String(lead.id),contactId:effective||null,channel,templateId:String(t.id)})}><strong>{t.name}</strong></button>)}</div>
 <Button variant="outline" disabled={blocked||!recipient||prepare.isPending||!q.data} onClick={()=>prepare.mutate({action:'prepare',id:crypto.randomUUID(),leadId:String(lead.id),contactId:effective||null,channel,templateId:null})}>Preparar sin template</Button></>}
 {message&&<><MessageComposer key={message.id} initial={message} onChange={setMessage}/>{message.status==='draft'&&<Button variant="outline" onClick={()=>setMessage(null)}>Cambiar destinatario o template</Button>}</>}
 {(prepare.error||q.error||history.error)&&<p role="alert">{prepare.error?.message||q.error?.message||history.error?.message}</p>}
 <DialogFooter><Button variant="ghost" onClick={()=>onOpenChange(false)}>Cerrar</Button></DialogFooter></DialogContent></Dialog>;
}
