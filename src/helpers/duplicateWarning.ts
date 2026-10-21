import type {DuplicateCandidate,DuplicateCheckInput} from '../endpoints/business_duplicate_check.schema';

const REASON_LABELS:Record<string,string>={'Nombre y localidad normalizados coinciden':'Mismo nombre y ciudad','Teléfono compartido':'Mismo teléfono','WhatsApp compartido':'Mismo WhatsApp','Teléfono parecido':'Teléfono parecido','Email compartido':'Mismo email','Teléfono de la persona compartido':'Mismo teléfono que la persona','Teléfono de la persona parecido':'Teléfono parecido al de la persona'};
/** Most matches the creation dialog lists. */
export const MAX_SHOWN_DUPLICATES=3;

/** Plain words for a server match reason; unknown reasons pass through unchanged. */
export const duplicateReasonLabel=(reason:string):string=>REASON_LABELS[reason]??reason;

/**
 * Builds the duplicate-check query from what the seller typed, or null while nothing is specific enough to search.
 * Name needs 3 characters (city only travels with it), phones 6 digits and email a full address.
 */
export const duplicateQuery=({nombre,ciudad,telefono,email,personPhone}:{nombre?:string;ciudad?:string;telefono?:string;email?:string;personPhone?:string}):DuplicateCheckInput|null=>{
 const name=nombre?.trim()??'',mail=email?.trim()??'';
 const phone=(v?:string)=>{const t=v?.trim()??'';return t.replace(/\D/g,'').length>=6?t:'';};
 const query:DuplicateCheckInput={
  ...(name.length>=3?{nombre:name,...(ciudad?.trim()?{ciudad:ciudad.trim()}:{})}:{}),
  ...(phone(telefono)?{telefono:phone(telefono)}:{}),
  ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)?{email:mail}:{}),
  ...(phone(personPhone)?{personPhone:phone(personPhone)}:{})
 };
 return Object.keys(query).length?query:null;
};

const PERSON_SHARED='Teléfono de la persona compartido';
/** A No contactar business whose phone is exactly the person's phone. It only warns (decision 13B). */
export const isPersonPhoneDnc=(c:DuplicateCandidate)=>c.doNotContact&&!c.blocking&&c.reasons.includes(PERSON_SHARED);

/**
 * Splits server candidates into the hard block (`blocking`, decided by the server) and the matches to show:
 * blocking first, then No contactar, at most `MAX_SHOWN_DUPLICATES`. `dncWarning` flags a shown No contactar match that does not block.
 * `personPhoneDnc` lists No contactar businesses that only share the person's phone: they get their own warning and are not part of `shown`.
 */
export const duplicateWarning=({candidates:all}:{candidates:readonly DuplicateCandidate[]}):{blocker:DuplicateCandidate|null;shown:DuplicateCandidate[];hidden:number;dncWarning:boolean;personPhoneDnc:DuplicateCandidate[]}=>{
 const personPhoneDnc=all.filter(isPersonPhoneDnc),candidates=all.filter(c=>!(isPersonPhoneDnc(c)&&c.reasons.every(r=>r===PERSON_SHARED)));
 const rank=(c:DuplicateCandidate)=>c.blocking?0:c.doNotContact?1:2;
 const sorted=candidates.map((c,i)=>({c,i})).sort((a,b)=>rank(a.c)-rank(b.c)||a.i-b.i).map(x=>x.c);
 const shown=sorted.slice(0,MAX_SHOWN_DUPLICATES);
 return {blocker:sorted.find(c=>c.blocking)??null,shown,hidden:Math.max(0,sorted.length-MAX_SHOWN_DUPLICATES),dncWarning:shown.some(c=>c.doNotContact&&!c.blocking),personPhoneDnc};
};
