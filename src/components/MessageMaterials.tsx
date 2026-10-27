import {useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {revokeSalesMaterialShare,type MessageMaterial} from '../endpoints/salesMaterials.schema';
import {formatBytes} from '../helpers/salesMaterialTypes';
import {formatDateTime} from '../helpers/crmDates';
import {messageLabels} from '../helpers/messageLabels';
import {crmSuccess} from '../helpers/crmFeedback';
import {Badge} from './Badge';
import {Button} from './Button';
import {Checkbox} from './Checkbox';
import {Input} from './Input';
import {HelpLink} from './HelpLink';
import {CrmDialog} from './ui/CrmDialog';
import {DialogFooter} from './Dialog';
import styles from './SalesMaterial.module.css';

const BUSY='La operación está en curso. Esperá a que termine para continuar.';
/** Message statuses that confirm the message left the CRM (provider acceptance, manual confirmation or a registered reply). Opening WhatsApp, a failure or an uncertain result is not evidence of sending. */
export const MATERIAL_SENT_STATUSES:readonly string[]=['accepted','delivery_confirmed','manual_sent','replied','rejected'];
/**
 * Who sees «Revocar enlace» (mirrors the server, spec 89 §10): an admin, the author of the send, the responsible of the business or of the management.
 * Revoking lowers exposure, so No contactar or a read-only page does not hide it.
 */
export function canRevokeMaterialLink({admin,userEmail,authorEmail,businessOwnerEmail,managementOwnerEmail}:{admin:boolean;userEmail:string|null|undefined;authorEmail:string;businessOwnerEmail?:string|null;managementOwnerEmail?:string|null}):boolean{
 return admin||(!!userEmail&&(authorEmail===userEmail||businessOwnerEmail===userEmail||managementOwnerEmail===userEmail));
}
const size=(m:MessageMaterial)=>m.source==='url'?'Enlace externo':`${m.fileName??'Archivo'}${m.byteSize?' · '+formatBytes({bytes:m.byteSize}):''}`;
/**
 * The materials of a draft (spec 89 §8.2): «Quitar» and, in email, «Adjuntar el archivo», disabled with the server's reason (limit, external link).
 * `blockedReason` disables every change (for example while the text has unsaved edits); the parent runs the actions and shows their errors.
 */
export function DraftMaterials({materials,channel,busy,blockedReason,onRemove,onAttach}:{materials:readonly MessageMaterial[];channel:'email'|'whatsapp';busy:boolean;blockedReason:string;onRemove:(m:MessageMaterial)=>void;onAttach:(m:MessageMaterial,attach:boolean)=>void}){
 if(!materials.length)return null;
 return <ul className={styles.materialList} aria-label="Material incluido">{materials.map(m=><li key={m.shareId} className={styles.materialItem}>
  <strong>{m.title}</strong><span className={styles.meta}>{size(m)} · el enlace va en el texto</span>
  {!m.available&&<p className={styles.warning} role="alert">Este material ya no está disponible. Quitalo del mensaje para poder enviarlo.</p>}
  {channel==='email'&&<label className={styles.inline} title={m.attach?undefined:m.attachBlockedReason??undefined}><Checkbox checked={m.attach} disabled={busy||!!blockedReason||(!m.attach&&!!m.attachBlockedReason)} onChange={e=>onAttach(m,e.currentTarget.checked)}/>Adjuntar el archivo</label>}
  {channel==='email'&&!m.attach&&m.attachBlockedReason&&<p className={styles.hint}>{m.attachBlockedReason}</p>}
  <div className={styles.actions}><Button size="sm" variant="outline" disabled={busy||!!blockedReason} disabledReason={busy?BUSY:blockedReason} onClick={()=>onRemove(m)}>Quitar</Button></div>
 </li>)}</ul>;
}
/** Read-only list for the review step: what goes with the message and what is attached. */
export function MaterialSummary({materials}:{materials:readonly MessageMaterial[]}){
 if(!materials.length)return null;
 return <div className={styles.materialSection}><div className={styles.materialHeading}><h4>Material de venta</h4></div><ul className={styles.materialList}>{materials.map(m=><li key={m.shareId} className={styles.materialItem}><strong>{m.title}</strong><span className={styles.meta}>{size(m)}{m.attach?' · se adjunta el archivo':' · solo el enlace'}</span></li>)}</ul></div>;
}
/**
 * Record of the materials sent with a message (spec 89 §8.4): title, version sent, attachment, author, date and channel of the message, link state,
 * the technical access record (never proof that the client saw it) and «Revocar enlace» with a reason. The message status keeps its own meaning:
 * unless it confirms the send ({@link MATERIAL_SENT_STATUSES}), the version is «incluida en el mensaje» and the send is shown as not confirmed.
 */
export function SentMaterials({materials,message,canRevoke,users}:{materials:readonly MessageMaterial[];message:{status:string;ownerEmail:string;lastInteractionAt:Date|null;createdAt:Date};canRevoke:(m:MessageMaterial)=>boolean;users?:{email:string;displayName:string}[]}){
 const qc=useQueryClient();const [target,setTarget]=useState<MessageMaterial|null>(null),[reason,setReason]=useState('');
 const revoke=useMutation({mutationFn:revokeSalesMaterialShare,onSuccess:()=>{setTarget(null);setReason('');crmSuccess('Enlace revocado. Quien lo abra va a ver que ya no está disponible.');void qc.invalidateQueries({queryKey:['communication']})}});
 if(!materials.length)return null;
 const sent=MATERIAL_SENT_STATUSES.includes(message.status);
 const who=(email:string)=>users?.find(u=>u.email===email)?.displayName??email;
 return <div className={styles.materialSection}>
  <div className={styles.materialHeading}><h4>Material de venta</h4><HelpLink topic="salesMaterial" hint="materialLinkRecord"/></div>
  <ul className={styles.materialList}>{materials.map(m=><li key={m.shareId} className={styles.materialItem}>
   <strong>{m.title}</strong>
   <div className={styles.badges}><Badge variant={m.revokedAt?'destructive':'success'}>{m.revokedAt?'Enlace revocado':'Enlace activo'}</Badge>{m.attachedVersion!=null&&<Badge variant="secondary">Adjunto</Badge>}{m.attach&&m.attachedVersion==null&&<Badge variant="outline">Adjunto no confirmado</Badge>}</div>
   <span className={styles.meta}>{sent&&m.sentVersion!=null?`Versión enviada: ${m.sentVersion}`:`Versión incluida en el mensaje: ${m.sentVersion??m.preparedVersion??'sin datos'}`} · {m.channel==='email'?'Email':'WhatsApp'} · {who(message.ownerEmail)} · {formatDateTime(message.lastInteractionAt??message.createdAt)}</span>
   {!sent&&<span className={styles.meta}>Envío no confirmado: el mensaje figura como «{messageLabels[message.status]??message.status}».</span>}
   {m.revokedAt&&<span className={styles.meta}>Revocado por {who(m.revokedByEmail??'')} el {formatDateTime(m.revokedAt)}: {m.revokeReason}</span>}
   <span className={styles.meta}>Registro técnico de acceso: {m.technicalAccessCount}{m.lastTechnicalAccessAt?` · último ${formatDateTime(m.lastTechnicalAccessAt)}`:''}. No confirma que el cliente lo haya visto.</span>
   {!m.revokedAt&&canRevoke(m)&&<div className={styles.actions}><Button size="sm" variant="outline" disabled={revoke.isPending} disabledReason={BUSY} onClick={()=>{revoke.reset();setReason('');setTarget(m)}}>Revocar enlace</Button></div>}
  </li>)}</ul>
  <CrmDialog opened={!!target} onClose={()=>{if(!revoke.isPending)setTarget(null)}} busy={revoke.isPending} title="Revocar enlace" description={`«${target?.title??''}»: desde ahora el enlace muestra que ya no está disponible. El material sigue en «Material de venta» y lo podés volver a mandar con un enlace nuevo.`}>
   <label>Motivo<Input autoFocus value={reason} maxLength={500} disabled={revoke.isPending} onChange={e=>setReason(e.target.value)} placeholder="Ej.: le mandé la versión nueva"/></label>
   {revoke.error&&<p role="alert">{revoke.error.message} Podés reintentar.</p>}
   <DialogFooter><Button variant="outline" disabled={revoke.isPending} disabledReason={BUSY} onClick={()=>setTarget(null)}>Cancelar</Button><Button disabled={reason.trim().length<3||revoke.isPending} disabledReason={revoke.isPending?BUSY:'Escribí el motivo (mínimo 3 caracteres).'} onClick={()=>{if(target&&!revoke.isPending)revoke.mutate({shareId:target.shareId,reason:reason.trim()})}}>{revoke.isPending?'Revocando…':'Revocar enlace'}</Button></DialogFooter>
  </CrmDialog>
 </div>;
}
