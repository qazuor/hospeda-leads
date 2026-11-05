/** Normalize and validate assigned WhatsApp lines. */
export function normalizeWhatsappPhones(values:readonly string[]):{phones:string[];error:string|null}{
 const phones:string[]=[];
 for(const value of values){const digits=value.replace(/\D/g,'');if(!digits)continue;if(digits.length<8||digits.length>15)return {phones:[],error:'Cada número de WhatsApp debe tener entre 8 y 15 dígitos.'};if(!phones.includes(digits))phones.push(digits);}
 if(phones.length>5)return {phones:[],error:'Podés asignar hasta 5 números de WhatsApp.'};
 return {phones,error:null};
}
/** Resolve assigned numbers, falling back to the legacy environment value only when none are assigned. */
export function resolveWhatsappAccountPhones({userPhones,env}:{userPhones:readonly string[]|null|undefined;env:Readonly<Record<string,string|undefined>>}):string[]{
 const assigned=normalizeWhatsappPhones(userPhones??[]).phones;if(assigned.length)return assigned;
 const fallback=normalizeWhatsappPhones([env.WHATSAPP_ACCOUNT_PHONE??'']).phones;return fallback;
}
/** Whether an administrator may change a role without removing their own access or the final active administrator. */
export function canChangeUserRole({actorId,targetId,targetRole,nextRole,activeAdmins}:{actorId:number;targetId:number;targetRole:'admin'|'user';nextRole:'admin'|'user';activeAdmins:number}):boolean{
 return actorId!==targetId&&!(targetRole==='admin'&&nextRole!=='admin'&&activeAdmins-(targetRole==='admin'?1:0)<=0);
}
/** Whether an administrator may deactivate a target without self-deactivation or removing the final active administrator. */
export function canDeactivateUser({actorId,targetId,targetRole,activeAdmins}:{actorId:number;targetId:number;targetRole:'admin'|'user';activeAdmins:number}):boolean{
 return actorId!==targetId&&!(targetRole==='admin'&&activeAdmins<=1);
}
