/** Replace known staff addresses inside CRM free text while preserving client addresses. */
export function redactStaffEmails(value:unknown,emails:readonly string[]):string{
 let text=String(value??'');
 for(const email of emails)if(email)text=text.replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'[equipo]');
 return text;
}
