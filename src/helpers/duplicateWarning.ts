import type {DuplicateCandidate,DuplicateCheckInput} from '../endpoints/business_duplicate_check.schema';

/** Same text the server returns (409) when creating a duplicate of a No contactar business (owner decision 1C). */
export const DNC_DUPLICATE_BLOCK='Ese negocio pidió no ser contactado. Consultá con un administrador.';
/** Reasons that make a No contactar match a hard block on the server (`isBlockingMatch`): same name and city, or an exactly shared phone. */
const BLOCKING_REASONS=['Nombre y localidad normalizados coinciden','Teléfono compartido','WhatsApp compartido'];
const REASON_LABELS:Record<string,string>={'Nombre y localidad normalizados coinciden':'Mismo nombre y ciudad','Teléfono compartido':'Mismo teléfono','WhatsApp compartido':'Mismo WhatsApp','Teléfono parecido':'Teléfono parecido','Email compartido':'Mismo email'};
/** Most matches the creation dialog lists. */
export const MAX_SHOWN_DUPLICATES=3;

/** True when creating the typed business would be rejected because it duplicates a No contactar business. */
export const isDncBlock=(candidate:Pick<DuplicateCandidate,'doNotContact'|'reasons'>):boolean=>candidate.doNotContact&&candidate.reasons.some(reason=>BLOCKING_REASONS.includes(reason));

/** Plain words for a server match reason; unknown reasons pass through unchanged. */
export const duplicateReasonLabel=(reason:string):string=>REASON_LABELS[reason]??reason;

/**
 * Builds the duplicate-check query from what the seller typed, or null while nothing is specific enough to search.
 * Name needs 3 characters (city only travels with it), phone 6 digits and email a full address.
 */
export const duplicateQuery=({nombre,ciudad,telefono,email}:{nombre?:string;ciudad?:string;telefono?:string;email?:string}):DuplicateCheckInput|null=>{
 const name=nombre?.trim()??'',phone=telefono?.trim()??'',mail=email?.trim()??'';
 const query:DuplicateCheckInput={
  ...(name.length>=3?{nombre:name,...(ciudad?.trim()?{ciudad:ciudad.trim()}:{})}:{}),
  ...(phone.replace(/\D/g,'').length>=6?{telefono:phone}:{}),
  ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)?{email:mail}:{})
 };
 return Object.keys(query).length?query:null;
};

/** Splits candidates into the hard block (if any) and the matches to show: blocking first, then No contactar, at most `MAX_SHOWN_DUPLICATES`. */
export const duplicateWarning=({candidates}:{candidates:readonly DuplicateCandidate[]}):{blocker:DuplicateCandidate|null;shown:DuplicateCandidate[];hidden:number}=>{
 const rank=(c:DuplicateCandidate)=>isDncBlock(c)?0:c.doNotContact?1:2;
 const sorted=candidates.map((c,i)=>({c,i})).sort((a,b)=>rank(a.c)-rank(b.c)||a.i-b.i).map(x=>x.c);
 return {blocker:sorted.find(isDncBlock)??null,shown:sorted.slice(0,MAX_SHOWN_DUPLICATES),hidden:Math.max(0,sorted.length-MAX_SHOWN_DUPLICATES)};
};
