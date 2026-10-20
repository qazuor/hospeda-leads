/** `tel:` link for a phone as the seller typed it: only digits and a leading plus survive. */
export function telHref(phone:string):string{return 'tel:'+phone.replace(/[^\d+]/g,'');}
/** True when the phone has at least one digit to dial. */
export function isDialable(phone:string|null|undefined):boolean{return /\d/.test(phone??'');}
/** Summary stored for a call when the seller adds no note: only what she stated by pressing the button. */
export function callSummary({result,who,phone,note}:{result:'manual_sent'|'manual_no_contact';who:string;phone:string;note:string}):string{
 const trimmed=note.trim();
 if(trimmed)return trimmed;
 const target=who.trim()+(phone.trim()?' ('+phone.trim()+')':'');
 return result==='manual_sent'?'Llamada realizada a '+target+'.':'Intento de llamada sin contacto a '+target+'.';
}
