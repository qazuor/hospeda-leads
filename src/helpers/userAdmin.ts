/** Normalize a human-entered WhatsApp line and validate the stored digits-only format. */
export function normalizeWhatsappPhone(value:string|null|undefined):{phone:string|null;error:string|null}{
 const digits=(value??'').replace(/\D/g,'');
 if(!digits)return {phone:null,error:null};
 if(digits.length<8||digits.length>15)return {phone:null,error:'El número de WhatsApp debe tener entre 8 y 15 dígitos.'};
 return {phone:digits,error:null};
}
/** Resolve the WhatsApp line expected by the script user, falling back to the legacy environment value. */
export function resolveWhatsappAccountPhone({userPhone,env}:{userPhone:string|null|undefined;env:Readonly<Record<string,string|undefined>>}):string|null{
 const user=(userPhone??'').replace(/\D/g,'');
 if(user.length>=8&&user.length<=15)return user;
 const fallback=(env.WHATSAPP_ACCOUNT_PHONE??'').replace(/\D/g,'');
 return fallback.length>=8&&fallback.length<=15?fallback:null;
}
/** Whether an administrator may change a role without removing their own access or the final active administrator. */
export function canChangeUserRole({actorId,targetId,targetRole,nextRole,activeAdmins}:{actorId:number;targetId:number;targetRole:'admin'|'user';nextRole:'admin'|'user';activeAdmins:number}):boolean{
 return actorId!==targetId&&!(targetRole==='admin'&&nextRole!=='admin'&&activeAdmins-(targetRole==='admin'?1:0)<=0);
}
/** Whether an administrator may deactivate a target without self-deactivation or removing the final active administrator. */
export function canDeactivateUser({actorId,targetId,targetRole,activeAdmins}:{actorId:number;targetId:number;targetRole:'admin'|'user';activeAdmins:number}):boolean{
 return actorId!==targetId&&!(targetRole==='admin'&&activeAdmins<=1);
}
