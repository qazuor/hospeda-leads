/** Spec 96 §2.5: a phone as the seller reads it on the final button (`+54 9 3442000002`); anything unparsable stays as typed. */
export function displayPhone({phone}:{phone:string}):string{
 const trimmed=phone.trim(),digits=trimmed.replace(/\D/g,'');
 if(digits.startsWith('549')&&digits.length>=12)return `+54 9 ${digits.slice(3)}`;
 if(trimmed.startsWith('+')&&digits.length>=8)return '+'+digits;
 return trimmed;
}

/** Who a message goes to, as the final button and the toast name it: «Ana · +54 9 …», only the phone without a name, `@usuario` or the address. */
export function contactDestination({channel,recipient,recipientName}:{channel:'whatsapp'|'instagram'|'email';recipient:string;recipientName?:string|null}):string{
 if(channel!=='whatsapp')return recipient;
 const name=recipientName?.trim(),phone=displayPhone({phone:recipient});
 return name?`${name} · ${phone}`:phone;
}

/** The final button names the destination (spec 96 §2.5): there is no separate «Revisé destinatario» checkbox any more. */
export function finalActionLabel({channel,recipient,recipientName}:{channel:'whatsapp'|'instagram'|'email';recipient:string;recipientName?:string|null}):string{
 const destination=contactDestination({channel,recipient,recipientName});
 return channel==='whatsapp'?`Abrir WhatsApp con ${destination}`:channel==='instagram'?`Abrir Instagram de ${destination}`:`Enviar email a ${destination}`;
}

/** Spec 96 §2.6: the toast after a WhatsApp opened from the composer, which then closes. Nothing is confirmed by opening it. */
export const whatsappOpenedToast=({destination}:{destination:string}):string=>`WhatsApp abierto para ${destination}. Si el script registra el envío, se confirma solo; si no, lo vas a ver en «Requiere acción».`;
/** Spec 96 §2.6: Brevo accepted the email; delivery is confirmed separately. */
export const emailSentToast=({address}:{address:string}):string=>`Email enviado a ${address}. La entrega se confirma por separado.`;
