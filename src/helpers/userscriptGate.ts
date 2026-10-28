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
/** What the always-visible prompt asks for: `update` installs the latest script, `connect` fixes its token. */
export type UserscriptPrompt={readonly kind:'update'|'connect';readonly title:string;readonly description:string};
const PROMPT_CONSEQUENCE='Hasta que lo hagas no podés contactar por WhatsApp ni Instagram desde la computadora y las conversaciones no se registran solas.';
/**
 * Owner review of spec 96 (28/10/2026): an outdated or disconnected script gets a prompt as visible as the one in WhatsApp Web, on every
 * page. Null on phones and tablets, while the page waits or verifies, when no script is installed (the contact buttons explain that
 * one) and when the CRM could not verify the token (a network problem the user cannot fix from the prompt).
 */
export function userscriptPrompt({mobile,status,latest,currentUserEmail}:{mobile:boolean;status:UserscriptStatus;latest:string;currentUserEmail:string|null}):UserscriptPrompt|null{
 if(mobile||!status.version)return null;
 const reason=userscriptContactBlock({mobile,status,latest,currentUserEmail});
 if(!reason||reason===USERSCRIPT_VERIFYING_REASON||reason===USERSCRIPT_UNVERIFIED_REASON)return null;
 if(reason===userscriptOutdatedReason({installed:status.version,latest}))return {kind:'update',title:'Actualizá el script de Hospeda',description:`Tenés la versión ${status.version} y la actual es ${latest}. ${PROMPT_CONSEQUENCE}`};
 return {kind:'connect',title:'Conectá el script de Hospeda',description:`${reason} ${PROMPT_CONSEQUENCE}`};
}
