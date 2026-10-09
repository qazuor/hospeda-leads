import {templateCompatibility} from '../helpers/messageTemplatePolicy';
import {normalizeSearchText} from '../helpers/searchText';
import {canModifyManagement} from '../helpers/crmPermissions';
import { NativeSelect } from './NativeSelect';
import { Input } from './Input';
import { UnstyledButton } from '@mantine/core';
import {useUnsavedChanges} from './UnsavedChanges';
import React,{useEffect,useState,useRef} from 'react';import {useMutation,useQuery} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './Dialog';import {Button} from './Button';import {MessageComposer,messageLabels} from './MessageComposer';
import {getCommercialDetail} from '../endpoints/commercial.schema';import {getCommunication,postCommunication,type Message} from '../endpoints/communication.schema';
import {htmlToPlainText,renderMessageTemplate} from '../helpers/renderMessageTemplate';
import {useAuth} from '../helpers/useAuth';
import {Mail,MessageCircle,Search,ArrowRight} from 'lucide-react';
import styles from './ContactTemplateDialog.module.css';
type Template={id:string;channel:string;name:string;subject:string|null;body:string;vertical:string|null;commercialProfile:string|null};
export function ContactTemplateDialog({open,onOpenChange,channel,lead,templates,initialContactId,onLog,onAddChannel}:{open:boolean;onOpenChange:(v:boolean)=>void;channel:'email'|'whatsapp';lead:any|null;templates:Template[];initialContactId?:string;onLog?:(contactId:string,channel:string)=>void;onAddChannel?:()=>void}){
 const {authState}=useAuth();
 const [contactId,setContactId]=useState<string|null>(null),[message,setMessage]=useState<Message|null>(null),[search,setSearch]=useState('');
 const q=useQuery({queryKey:['commercial-detail','',String(lead?.id??'')],queryFn:()=>getCommercialDetail(undefined,String(lead.id)),enabled:open&&!!lead?.id});
 const history=useQuery({queryKey:['communication',String(lead?.id??'')],queryFn:()=>getCommunication(String(lead.id)),enabled:open&&!!lead?.id});
 useEffect(()=>{if(open){setContactId(initialContactId??null);setMessage(null);setSearch('')}},[open,channel,lead?.id,initialContactId]);
 const contacts=q.data?.contacts.filter(c=>!c.deletedAt)??[];const opp=q.data?.opportunities.find(o=>String(o.id)===String(lead?.id));const preferred=contacts.find(c=>String(c.id)===String(opp?.primaryContactId))||(contacts.length===1?contacts[0]:contacts.find(c=>c.isPrimary));const legacy=preferred?.sourceLeadId!=null&&String(preferred.sourceLeadId)===String(lead?.id)&&!opp?.opportunityName;
 const effective=contactId??(preferred&&!legacy?String(preferred.id):'');const person=contacts.find(c=>String(c.id)===effective);const recipient=effective?(channel==='email'?person?.email:person?.phone):(channel==='email'?lead?.email:lead?.telefono);
 const canPrepare=canModifyManagement(authState.type==='authenticated'?authState.user:undefined,opp,q.data?.account);
 const restriction=history.data?.restrictions.find(r=>!r.liftedAt&&['all',channel].includes(r.channel)&&((effective&&String(r.contactId)===effective)||(!r.contactId&&String(r.leadId)===String(lead?.id))));
 const blocked=q.data?.account.doNotContact||!!restriction;const recent=history.data?.recentMessages.find(m=>((effective?m.contactId===effective:!m.contactId&&m.leadId===String(lead?.id))||(m.channel===channel&&m.recipient===recipient))&&m.status!=='draft'&&m.status!=='cancelled'&&!!m.lastInteractionAt&&Date.now()-new Date(m.lastInteractionAt).getTime()<(history.data?.recentContactHours??72)*3600000);
 const applicable=templates.filter(t=>templateCompatibility(t,{channel,vertical:lead?.tipo,commercialProfile:lead?.commercialProfile})===null);
 const excluded=templates.filter(t=>t.channel===channel).length-applicable.length;
 const normalizedSearch=normalizeSearchText(search);
 const visible=applicable.filter(t=>normalizeSearchText([t.name,t.subject,t.vertical,t.commercialProfile,htmlToPlainText(t.body)].join(' ')).includes(normalizedSearch));
 const rendered=(source:string)=>renderMessageTemplate(source,{name:lead?.nombre,contact:person?.name,contact_name:person?.name,city:lead?.ciudad,type:lead?.tipo,subtype:lead?.subtipo,phone:person?.phone??lead?.telefono,email:person?.email??lead?.email,website:lead?.sitioWeb,sender:authState.type==='authenticated'?(authState.user.fullName||authState.user.displayName):'',sender_short:authState.type==='authenticated'?authState.user.displayName:''});
 const [dirty,setDirty]=useState(false);const [busy,setBusy]=useState(false);const guard=useUnsavedChanges(dirty,()=>onOpenChange(false));
 const preparing=useRef(false),requestKeys=useRef(new Map<string,string>());
 const prepare=useMutation({mutationFn:postCommunication,onSuccess:d=>setMessage(d)});
 const prepareMessage=async(templateId:string|null)=>{if(preparing.current)return;preparing.current=true;const key=JSON.stringify([lead.id,effective,channel,templateId]);if(!requestKeys.current.has(key))requestKeys.current.set(key,crypto.randomUUID());try{await prepare.mutateAsync({action:'prepare',id:requestKeys.current.get(key)!,leadId:String(lead.id),contactId:effective||null,channel,templateId});requestKeys.current.delete(key)}catch{}finally{preparing.current=false}};
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy&&!prepare.isPending)guard.requestClose()}}><DialogContent className={styles.dialog}>
 <DialogHeader className={styles.header}><div className={styles.heading}><span className={styles.channelIcon}>{channel==='email'?<Mail size={20}/>:<MessageCircle size={20}/>}</span><div><DialogTitle>{channel==='email'?'Preparar email':'Preparar WhatsApp'}</DialogTitle><DialogDescription>{lead?.nombre}</DialogDescription></div></div>{message&&<p className={styles.subtitle}>Editá el contenido, revisalo y confirmá la acción.</p>}</DialogHeader>
 <div className={styles.scrollBody}>
 {!message&&<>
 <section className={styles.recipientBox}><div className={styles.sectionHeading}><span className={styles.step}>1</span><h3>Destinatario</h3></div>
 <label className={styles.recipient}>Contacto<NativeSelect aria-label="Destinatario" value={effective} disabled={prepare.isPending||q.isPending} onChange={e=>setContactId(e.target.value)}><option value="">Canal general del negocio</option>{contacts.map(c=><option key={c.id} value={String(c.id)}>{c.name}{c.isPrimary?' · Principal':''}</option>)}</NativeSelect></label><p className={styles.recipientChannel}>{q.isPending?'Cargando contactos…':recipient||'Sin '+(channel==='email'?'email':'teléfono')+' cargado para este contacto'}</p><p className={styles.recipientHelp}>Usamos los datos del contacto elegido. Si no tiene nombre, el saludo queda sin nombre.</p>{!recipient&&onAddChannel&&<Button variant="outline" onClick={onAddChannel}>Agregar teléfono o email</Button>}</section>
 {blocked&&<p className={styles.warning} role="alert"><strong>No contactar</strong><span>{restriction?.reason||'Restricción del negocio'}</span></p>}
 {q.data&&!canPrepare&&<p role="alert">Solo el responsable de esta gestión o un administrador puede preparar mensajes. Tener una tarea asignada no otorga ese permiso.</p>}
 {recent&&<p className={styles.notice} role="status"><strong>Contacto reciente · {recent.recipientName||'Sin nombre informado'}</strong><span>{new Date(recent.lastInteractionAt!).toLocaleString('es-AR')} · {recent.channel} · {messageLabels[recent.status]??recent.status} · {recent.lastActorEmail}</span><span>Revisá esta interacción antes de iniciar otro contacto.</span></p>}
 <section className={styles.templates}><div className={styles.sectionHeading}><span className={styles.step}>2</span><h3>Elegí un mensaje modelo</h3><span className={styles.count}>{applicable.length}</span></div><p className={styles.recipientHelp}>Al elegirlo se prepara un borrador. Podés editarlo antes de usar el canal.</p><p className={styles.recipientHelp}>Vertical: {lead?.tipo?.trim()||'Sin definir · se muestran todas'}. Perfil: {lead?.commercialProfile?.trim()||'Sin definir · se muestran todos'}.{excluded>0&&` ${excluded} modelo${excluded===1?'':'s'} de este canal no coincide${excluded===1?'':'n'} con la vertical o el perfil.`}</p>
 <label className={styles.search}><Search size={16}/><Input aria-label="Buscar mensaje modelo" placeholder="Buscar por nombre, perfil o contenido…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
 <div className={styles.list} aria-busy={prepare.isPending}>{visible.map(t=><UnstyledButton type="button" key={t.id} disabled={!canPrepare||blocked||!recipient||prepare.isPending||!q.data||history.isPending||!!history.error} onClick={()=>void prepareMessage(String(t.id))}><div className={styles.templateTitle}><strong>{t.name}</strong><ArrowRight size={16}/></div><div className={styles.tags}><span>{t.vertical||'Todas las verticales'}</span><span>{t.commercialProfile||'Todos los perfiles'}</span></div>{channel==='email'&&t.subject&&<p className={styles.subject}>Asunto: {rendered(t.subject)}</p>}<p className={styles.excerpt}>{htmlToPlainText(rendered(t.body))}</p></UnstyledButton>)}</div>
 {!visible.length&&<p className={styles.empty}>{applicable.length?'No hay mensajes modelo que coincidan con la búsqueda.':'No hay mensajes modelo disponibles para este canal, vertical y perfil. Podés escribir un mensaje libre.'}</p>}
 <div className={styles.freeMessage}><span>¿Preferís escribir desde cero?</span><Button variant="outline" disabled={!canPrepare||blocked||!recipient||prepare.isPending||!q.data||history.isPending||!!history.error} onClick={()=>void prepareMessage(null)}>Escribir un mensaje nuevo</Button></div>
 {prepare.isPending&&<p className={styles.recipientHelp} role="status">Preparando borrador…</p>}</section></>}
 {message&&<MessageComposer key={message.id} initial={message} onChange={setMessage} onDirtyChange={setDirty} taskFlow={!!onLog} onBusyChange={setBusy}/>}
 {(prepare.error||q.error||history.error)&&<p className={styles.warning} role="alert">{prepare.error?.message||q.error?.message||history.error?.message}</p>}{(q.error||history.error)&&<Button variant="outline" onClick={()=>{void q.refetch();void history.refetch()}}>Reintentar carga de destinatarios y restricciones</Button>}
 </div>
 <DialogFooter className={styles.footer}>{onLog&&message&&!['draft','cancelled','submitting'].includes(message.status)&&<Button disabled={dirty||busy} onClick={()=>onLog(message.contactId??'',message.channel)}>Registrar qué pasó</Button>}{message?.status==='draft'&&<Button variant="ghost" disabled={dirty||busy} onClick={()=>setMessage(null)}>Cambiar destinatario o modelo</Button>}<Button variant="outline" disabled={busy||prepare.isPending} onClick={guard.requestClose}>Cerrar</Button></DialogFooter></DialogContent>{guard.confirmation}</Dialog>;
}
