import superjson from 'superjson';

/** Status 0 means the request never got an HTTP answer (offline, DNS, timeout). */
export class CrmApiError extends Error{
 readonly status:number;
 constructor(message:string,status:number){super(message);this.name='CrmApiError';this.status=status;}
}
export const API_TIMEOUT_MS=20000;
export const OFFLINE_MESSAGE='Sin conexión o el servidor no responde. Tus datos siguen acá; reintentá cuando vuelvas a tener internet.';
/** Status 0 on a write: the server may have applied it, so never say it failed. */
export const UNCERTAIN_MESSAGE='No pudimos confirmar si se guardó. Revisá antes de repetir; lo que escribiste sigue acá.';
export const GENERIC_MESSAGE='No se pudo completar la acción. Intentá de nuevo.';
export const SESSION_EXPIRED_MESSAGE='Tu sesión venció. Volvé a ingresar para seguir.';
export const UNREADABLE_MESSAGE='El servidor devolvió una respuesta que no se pudo interpretar.';
export const SESSION_EXPIRED_EVENT='crm:session-expired';
/** Statuses where repeating the same read cannot help. Status 0 gets a single retry (transient reset or redeploy). */
export const NON_RETRYABLE_STATUSES:readonly number[]=[400,401,403,404,409];
/** For slow server work (imports, bulk changes, sends that wait on Brevo). */
export const LONG_TIMEOUT_MS=120000;
export type ApiOptions={
 /** Spanish message shown when the server sends no usable message. */
 fallback?:string;
 /** Dispatch `crm:session-expired` on 401. Off for login/registration, where 401 means wrong credentials. */
 sessionEvent?:boolean;
 /** Request timeout; defaults to API_TIMEOUT_MS. 0 or null disables it. */
 timeoutMs?:number|null;
};
const spanishMarker=/[áéíóúüñ¿¡]|\b(de|del|la|las|el|los|no|un|una|que|en|para|con|por|se|ya|es|al|tu|tus|su|sus|lo|le|sin|hay|más|este|esta|ese|esa)\b/i;
const englishMarker=/\b(not|failed|fail|invalid|unknown|error|endpoint|allowed|authenticated|unauthorized|forbidden|found|request|internal|server|required|expected|received|cannot|can't|the|is|must|denied|timeout|network|fetch|unexpected|token|undefined|null|violates|duplicate|constraint|connect|successfully|unavailable|disabled|requires|incomplete|revoked|rejected|aborted|unsupported|supported|missing)\b/i;
/** True when a server message reads as English/technical rather than Spanish UI copy. */
export function isEnglishMessage(message:string):boolean{return !spanishMarker.test(message)&&englishMarker.test(message);}
/** Turns whatever the server said into Spanish copy a seller can read. */
export function userMessage(message:unknown,status:number,fallback=GENERIC_MESSAGE):string{
 const text=typeof message==='string'?message.trim():'';
 if(text&&!isEnglishMessage(text))return text;
 return status===401?SESSION_EXPIRED_MESSAGE:fallback;
}
const parseBody=(text:string):unknown=>{
 if(!text)return undefined;
 let value:unknown;
 try{value=superjson.parse(text)}catch{}
 if(value===undefined){try{value=JSON.parse(text)}catch{}}
 return value;
};
const timeoutSignal=(signal:AbortSignal|null|undefined,ms:number|null)=>{
 if(!ms)return signal??undefined;
 const timeout=AbortSignal.timeout(ms);
 return signal&&typeof AbortSignal.any==='function'?AbortSignal.any([signal,timeout]):signal??timeout;
};
const isRead=(init:RequestInit)=>['GET','HEAD'].includes((init.method??'GET').toUpperCase());

/**
 * Fetches a CRM endpoint and returns its SuperJSON body.
 * Throws CrmApiError: status 0 for network failure/timeout (uncertain-outcome copy on writes), the HTTP status for non-2xx.
 * A caller-initiated abort is rethrown untouched so query cancellation keeps working.
 */
export async function apiJson<T>(url:string,init:RequestInit={},options:ApiOptions={}):Promise<T>{
 let response:Response;let text:string;
 try{response=await fetch(url,{...init,signal:timeoutSignal(init.signal,options.timeoutMs===undefined?API_TIMEOUT_MS:options.timeoutMs)});text=await response.text();}
 catch(error){if(init.signal?.aborted)throw init.signal.reason??error;throw new CrmApiError(isRead(init)?OFFLINE_MESSAGE:UNCERTAIN_MESSAGE,0);}
 const body=parseBody(text) as (T&{error?:unknown;message?:unknown})|undefined;
 if(!response.ok){
  if(response.status===401&&options.sessionEvent!==false&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  throw new CrmApiError(userMessage(body?.error??body?.message,response.status,options.fallback),response.status);
 }
 if(body===undefined)throw new CrmApiError(UNREADABLE_MESSAGE,response.status);
 return body;
}
/** JSON POST with a SuperJSON body, the shape every CRM mutation uses. */
export const postJson=<T>(url:string,body:unknown,options?:ApiOptions,init:RequestInit={}):Promise<T>=>apiJson<T>(url,{...init,method:'POST',headers:{'Content-Type':'application/json',...(init.headers??{})},body:superjson.stringify(body)},options);
/** Whether TanStack Query should retry a failed read. */
export const shouldRetryQuery=(failureCount:number,error:unknown):boolean=>{
 if(!(error instanceof CrmApiError))return failureCount<2;
 if(NON_RETRYABLE_STATUSES.includes(error.status))return false;
 return failureCount<(error.status===0?1:2);
};
/** 403/404: retrying the same read cannot succeed. */
export const isNotRetryable=(error:unknown):boolean=>error instanceof CrmApiError&&(error.status===403||error.status===404);
