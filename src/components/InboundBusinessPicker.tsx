import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getCommercialList,getCommercialDetail} from '../endpoints/commercial.schema';
import {addressOwnedElsewhere,saveAddressOffer,type UnmatchedGroup} from '../helpers/inboundUnmatchedShared';
import {openPreviewManagements} from './BusinessPreviewDrawer';
import {Button} from './Button';
import {Checkbox} from './Checkbox';
import {Input} from './Input';
import {QueryErrorNotice} from './QueryErrorNotice';

/** Spec 103 B3: homonyms are told apart by code and city («H123 · Nombre · Ciudad»). */
export const businessOptionLabel=({id,nombre,ciudad}:{id:string|number;nombre:string;ciudad?:string|null}):string=>[`H${id}`,nombre,ciudad?.trim()||null].filter(Boolean).join(' · ');
/** What a card sends to `POST /_api/inbound/assign` for the chosen business. */
export type AssignChoice={accountId:string;leadId:string|null;contactId:string|null;saveAddress?:boolean};
const lower=(v:string|null|undefined)=>v?.trim().toLowerCase()??'';

/**
 * Manual association («Otro negocio», or the only path without a suggestion): search, business, optional open management and person, and the D4 box.
 * Its state is its own, so a choice never leaks to another card (spec 103 B3).
 */
export function InboundBusinessPicker({group,disabled,busy,done,disabledReason,onAssign}:{group:Pick<UnmatchedGroup,'channel'|'address'|'instagramUsername'|'verified'|'addressOwners'>;disabled:boolean;busy:boolean;done:boolean;disabledReason?:string;onAssign:(choice:AssignChoice)=>void}){
 const [term,setTerm]=useState(''),[selected,setSelected]=useState(''),[leadId,setLeadId]=useState(''),[contactId,setContactId]=useState(''),[skipSave,setSkipSave]=useState(false);
 const businesses=useQuery({queryKey:['inbound-business-picker',term],queryFn:()=>getCommercialList(term,'',1),enabled:term.trim().length>=2});
 const detail=useQuery({queryKey:['inbound-account-detail',selected],queryFn:()=>getCommercialDetail(selected),enabled:!!selected});
 const contacts=detail.data?.contacts.filter(c=>!c.deletedAt)??[],contact=contacts.find(c=>String(c.id)===contactId);
 const account=detail.data?.account,address=lower(group.address);
 const owned=selected?addressOwnedElsewhere({group,accountId:selected}):null;
 const possible=account?saveAddressOffer({group,account:{instagramEmpty:!account.perfilInstagram?.trim(),emailEmpty:!account.email?.trim()},contact:contact?{name:contact.name,emailEmpty:!contact.email?.trim()}:null,alreadyStored:group.channel==='email'&&(lower(account.email)===address||contacts.some(c=>lower(c.email)===address))}):null,offer=owned?null:possible;
 return <div>
  <label>Buscar negocio<Input value={term} disabled={done} onChange={e=>{setTerm(e.target.value);setSelected('');setLeadId('');setContactId('')}} placeholder="Escribí al menos dos caracteres"/></label>
  {businesses.data?.rows&&<select aria-label="Negocio" value={selected} disabled={done} onChange={e=>{setSelected(e.target.value);setLeadId('');setContactId('')}}><option value="">Elegí un negocio</option>{businesses.data.rows.map(b=><option key={b.id} value={String(b.id)}>{businessOptionLabel(b)}</option>)}</select>}
  {selected&&<>{detail.isPending?<p role="status">Cargando gestiones y personas…</p>:detail.error?<QueryErrorNotice error={detail.error} onRetry={detail.refetch} busy={detail.isFetching}/>:detail.data?<><label>Gestión abierta (opcional)<select value={leadId} onChange={e=>setLeadId(e.target.value)}><option value="">Sin gestión</option>{openPreviewManagements(detail.data).map(o=><option key={o.id} value={String(o.id)}>{o.opportunityName||o.nombre}</option>)}</select></label><label>Persona (opcional)<select value={contactId} onChange={e=>setContactId(e.target.value)}><option value="">Sin persona</option>{contacts.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></label>{owned&&possible&&<p>{owned} No se guarda acá: con el dato en dos negocios los próximos mensajes quedarían sin asociar.</p>}{offer&&<label><Checkbox checked={!skipSave} disabled={done} onChange={e=>setSkipSave(!e.target.checked)}/> {offer.label}</label>}</>:null}</>}
  <Button disabled={disabled||done||!selected||detail.isPending||!!detail.error||busy} disabledReason={done?'Este mensaje ya quedó asociado.':busy?'La operación está en curso. Esperá a que termine para continuar.':disabled&&disabledReason?disabledReason:'Elegí un negocio para asociar el email.'} onClick={()=>{if(!done&&!busy)onAssign({accountId:selected,leadId:leadId||null,contactId:contactId||null,...(offer?{saveAddress:!skipSave}:{})});}}>{done?'Asociado':busy?'Asociando…':'Asociar'}</Button>
 </div>;
}
