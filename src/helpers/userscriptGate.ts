import {compareSemver,parseUserscriptVersion} from './userscriptPure';

/** Spec 96 §3.3: shown (disabled, no link) while the page waits for the script to announce itself. */
export const USERSCRIPT_WAITING_REASON='Buscando el script de Hospeda…';
/** The script announced its version but has not answered whether its token works yet (its status request can take up to 15 s). */
export const USERSCRIPT_VERIFYING_REASON='Verificando el script…';
export const USERSCRIPT_MISSING_REASON='Instalá el script de Hospeda para contactar por WhatsApp o Instagram desde la computadora.';
export const USERSCRIPT_NO_TOKEN_REASON='Conectá el script: falta el token.';
export const USERSCRIPT_REJECTED_REASON='El token del script fue revocado o no es válido: creá uno nuevo.';
/** The script could not tell whether its token works (network, timeout, 5xx, or no answer yet): «Verificar de nuevo» asks again. */
export const USERSCRIPT_UNVERIFIED_REASON='No pudimos verificar el script con el CRM.';
/** Spec 96 §3.3: «Actualizá el script (tenés 1.4.0, la actual es 1.5.0).» */
export const userscriptOutdatedReason=({installed,latest}:{installed:string;latest:string}):string=>`Actualizá el script (tenés ${installed}, la actual es ${latest}).`;
/** Spec 96 §10.3: the token belongs to another CRM user. */
export const userscriptOtherUserReason=({email}:{email:string}):string=>`El script está conectado con otra cuenta (${email}). Reconectalo con la tuya.`;

/** What the page knows about the script in this browser: `undefined` while waiting, `null` once it had time to announce itself and did not. */
export type UserscriptStatus={readonly version:string|null|undefined;readonly connection:string|null|undefined;readonly user:string|null};

/**
 * Why WhatsApp and Instagram are blocked on this computer (spec 96 §3.3), or '' when they are not. Phones and tablets (`mobile`) are
 * never blocked, and email never asks. Owner, 28/10/2026: any version below the latest bundled one blocks («bloquear siempre»).
 * A usability guard, not a security control: the server checks are unchanged.
 */
export function userscriptContactBlock({mobile,status,latest,currentUserEmail}:{mobile:boolean;status:UserscriptStatus;latest:string;currentUserEmail:string|null}):string{
 if(mobile)return '';
 if(status.version===undefined)return USERSCRIPT_WAITING_REASON;
 if(status.version===null)return USERSCRIPT_MISSING_REASON;
 const version=parseUserscriptVersion(status.version);
 if(!version||compareSemver(version,latest)<0||status.connection==='outdated')return userscriptOutdatedReason({installed:status.version,latest});
 if(status.connection==='missing-token')return USERSCRIPT_NO_TOKEN_REASON;
 if(status.connection==='rejected')return USERSCRIPT_REJECTED_REASON;
 if(status.connection==='connected'&&status.user){
  if(currentUserEmail&&status.user.trim().toLowerCase()!==currentUserEmail.trim().toLowerCase())return userscriptOtherUserReason({email:status.user});
  return '';
 }
 // Still checking (blocked while verifying); unknown, no answer in time, or connected without a published user (never 1.5.0): unverified.
 return status.connection===undefined?USERSCRIPT_VERIFYING_REASON:USERSCRIPT_UNVERIFIED_REASON;
}

/** Where Tampermonkey installs or updates the script (served by the CRM). */
export const USERSCRIPT_URL='/userscripts/hospeda-crm.user.js';
/**
 * What the CRM asks of this computer's script: `install` and `update` get the latest script and `connect` fixes its token, and those
 * three block the whole CRM (`blocking`); `unverified` (the CRM could not check the token) only warns, so a server hiccup never locks
 * every seller out.
 */
export type UserscriptPrompt={readonly kind:'install'|'update'|'connect'|'unverified';readonly blocking:boolean;readonly title:string;readonly description:string};
const BLOCK_CONSEQUENCE='El CRM queda bloqueado hasta que lo hagas: sin el script al día, lo que hablás por WhatsApp e Instagram no se registra solo.';
/**
 * Owner review of spec 96 (28/10/2026): nobody, admins included, uses the CRM on a computer without the current, connected script.
 * Null on phones and tablets (no Tampermonkey there), while the page still looks for the script or verifies its token, and when
 * nothing is wrong.
 */
export function userscriptPrompt({mobile,status,latest,currentUserEmail}:{mobile:boolean;status:UserscriptStatus;latest:string;currentUserEmail:string|null}):UserscriptPrompt|null{
 if(mobile||status.version===undefined)return null;
 if(status.version===null)return {kind:'install',blocking:true,title:'Instalá el script de Hospeda',description:`No lo detectamos en esta página. Instalalo (o actualizalo, si ya lo tenías) y recargá. ${BLOCK_CONSEQUENCE}`};
 const reason=userscriptContactBlock({mobile,status,latest,currentUserEmail});
 if(!reason||reason===USERSCRIPT_VERIFYING_REASON)return null;
 if(reason===USERSCRIPT_UNVERIFIED_REASON)return {kind:'unverified',blocking:false,title:'No pudimos verificar el script',description:`${reason} Mientras tanto, WhatsApp e Instagram quedan bloqueados en esta computadora.`};
 if(reason===userscriptOutdatedReason({installed:status.version,latest}))return {kind:'update',blocking:true,title:'Actualizá el script de Hospeda',description:`Tenés la versión ${status.version} y la actual es ${latest}. ${BLOCK_CONSEQUENCE}`};
 return {kind:'connect',blocking:true,title:'Conectá el script de Hospeda',description:`${reason} ${BLOCK_CONSEQUENCE}`};
}
