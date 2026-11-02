import { USERSCRIPT_VERSION } from "./version";

export type AttachMetadata={eligible:boolean;reason:string|null;fileName:string|null;mimeType:string|null;byteSize:number|null;kind:"document"|"image"|null};
export type Media="document"|"image"|"video"|"audio"|null;
export type Match = { accountId: string; code: string; name: string; city: string | null; status?: string | null; statusLabel?: string | null; assignedUserName: string | null; doNotContact: boolean; restrictionActive: boolean; archived: boolean; leads: { id: string; name: string; stage: string }[]; url: string; openWhatsapp?: { messageId:string; openedAt: string; body?: string | null; materials?:HeldMaterial[] }[]; autoRegister?: {enabled:boolean;reason?:"global_disabled"|"auto_disabled"|"not_eligible"|string;since:string} };
export type ContextResponse = { minVersion: string; latestVersion?: string; user: { email: string; displayName: string }; autoRegister?:boolean; hiddenMatches?: number; matches: Match[] };
export type RegisterResult = { externalId: string; status: "created" | "duplicate" | "rejected"; kind?: "message" | "inbound"; id?: string; reason?: string };
export type RegisterResponse = { results: RegisterResult[] };
export class ApiError extends Error { constructor(message: string, public status: number, public minVersion?: string) { super(message); } }
let requestAllowed: () => boolean = () => true;
/** The page app installs its account guard here so every CRM request path shares the same gate. */
export function setCrmRequestGuard(guard: () => boolean): void { requestAllowed = guard; }

export function request<T>(url: string, token: string, method = "GET", body?: unknown, statusProbe = false): Promise<T> {
  if (!statusProbe && !requestAllowed()) return Promise.reject(new ApiError("El script está apagado para esta cuenta.", 409));
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "X-Hospeda-Userscript-Version": USERSCRIPT_VERSION };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    GM_xmlhttpRequest({ method, url, headers, data: body === undefined ? undefined : JSON.stringify(body), timeout: 15_000, responseType: "json",
      onload: response => {
        const payload = (response.response || (() => { try { return JSON.parse(response.responseText); } catch { return {}; } })()) as { error?: string; minVersion?: string };
        if (response.status >= 200 && response.status < 300) { resolve(payload as T); return; }
        const fallback = response.status === 401 ? "Token inválido o revocado. Configurá uno nuevo desde el menú del script." : response.status === 426 ? "Actualizá el script desde el menú de Tampermonkey." : response.status === 403 ? "No tenés permiso para registrar en este negocio." : response.status >= 500 ? "El CRM no está disponible. Probá de nuevo en unos minutos." : "No se pudo completar la operación.";
        reject(new ApiError(payload.error || fallback, response.status, payload.minVersion));
      }, onerror: () => reject(new ApiError("No se pudo conectar con el CRM.", 0)), ontimeout: () => reject(new ApiError("La solicitud tardó demasiado. Podés reintentar.", 0))
    });
  });
}

export function fetchContext(base: string, query: { code?: string; phone?: string }, token: string): Promise<ContextResponse> {
  const params = new URLSearchParams(query as Record<string, string>);
  return request(`${base}/_api/userscript/context?${params}`, token);
}

/** Since spec 97 the CRM also publishes the Hospeda Instagram username (§4.5); null when it is not configured. */
export type StatusResponse = Omit<ContextResponse, "matches"> & { instagramAccount?: string | null; whatsappAccount?: string | null };
export function fetchStatus(base: string, token: string): Promise<StatusResponse> { return request(`${base}/_api/userscript/status`, token, "GET", undefined, true); }

export function registerBatch(base: string, token: string, payload: { accountId: string; chat: { title: string; phone: string | null }; messages: unknown[]; automatic?:boolean }): Promise<RegisterResponse> {
  return request(`${base}/_api/userscript/register`, token, "POST", payload);
}
export type AutoRegistration={id:string;direction:"in"|"out";excerpt:string;sentAt:string|null;receivedAt:string|null;status:string};
export const fetchAutoRegistrations=(base:string,token:string,accountId:string)=>request<{registrations:AutoRegistration[]}>(`${base}/_api/userscript/auto-registrations?accountId=${encodeURIComponent(accountId)}`,token);
export const voidAutoRegistration=(base:string,token:string,payload:{id:string;reason:string})=>request<{voided:boolean;skipped:string[]}>(`${base}/_api/userscript/void`,token,"POST",payload);
export const saveAutoRegisterPreference=(base:string,token:string,autoRegister:boolean)=>request<{autoRegister:boolean}>(`${base}/_api/userscript/preferences`,token,"POST",{autoRegister});

export type TemplateLead={id:string;name:string;type:string|null;stage:string;templates:{id:string;name:string;recommended:boolean;body:string}[];contacts:{id:string;name:string;phone:string;default:boolean}[]};
export type ScriptPurpose="verification"|"first_contact"|"resume"|"relationship"|"care"|"operations"|"other";
/** Spec 98 decision 4: «Sin gestión» on WhatsApp. When a person of the business has a phone one must be chosen; else `businessPhone`. */
export type WhatsappGeneral={defaultPurpose:ScriptPurpose;purposes:{value:ScriptPurpose;label:string;templates:TemplateLead["templates"]}[];contacts:TemplateLead["contacts"];businessPhone:string|null};
/** `general` is absent on a CRM older than spec 98. */
export type TemplatesResponse={leads:TemplateLead[];general?:WhatsappGeneral|null;blocked:string|null};
/**
 * `materialWarnings`: sales material of the model the CRM left out of this message, with the reason (spec 89 §9). `materials` (spec 98): the
 * live material links the draft already holds (a reused draft), so the panel does not add them again.
 */
export type PreparedTemplate={messageId:string;revision:number;body:string;recipient:string;recipientName:string;unresolved:string[];materialWarnings?:string[];materials?:HeldMaterial[]};
/** A material the draft holds (its link is in the text). `shareId` is what «Quitar» sends; older CRMs may omit it. */
export type HeldMaterial={shareId?:string;materialId:string;title:string;attach?:AttachMetadata};
export type MaterialFile={file:File;version:string|null};
export function fetchMaterialFile(base:string,token:string,messageId:string,shareId:string,expected:{fileName:string;mimeType:string;byteSize:number},onProgress:(loaded:number,total:number)=>void):{promise:Promise<MaterialFile>;abort:()=>void}{
 let settled=false;let abortRequest=()=>{};
 const promise=new Promise<MaterialFile>((resolve,reject)=>{
  const headers={Authorization:`Bearer ${token}`,"X-Hospeda-Userscript-Version":USERSCRIPT_VERSION};
  const xhr=GM_xmlhttpRequest({method:"GET",url:`${base}/_api/userscript/material_file?${new URLSearchParams({messageId,shareId})}`,headers,timeout:120_000,responseType:"arraybuffer",
   onprogress:event=>{onProgress(event.loaded,expected.byteSize);if(event.loaded>expected.byteSize){xhr.abort();if(!settled){settled=true;reject(new Error("No pude bajar el archivo."));}}},
   onload:response=>{if(settled)return;if(response.status<200||response.status>=300){settled=true;const payload=response.response as {error?:string}|null;const fallback=response.status===401?"Token inválido o revocado. Configurá uno nuevo desde el menú del script.":response.status===426?"Actualizá el script desde el menú de Tampermonkey.":response.status===403?"No tenés permiso para registrar en este negocio.":response.status===404?"No encontramos ese archivo.":response.status===409?"Este archivo cambió. Volvé a preparar el mensaje.":response.status===429?"Hay demasiadas descargas en curso. Probá de nuevo en unos minutos.":"No pude bajar el archivo.";reject(new ApiError(payload?.error||fallback,response.status));return;}
    let bytes=response.response;if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==expected.byteSize){settled=true;reject(new Error("No pude bajar el archivo."));return;}
    const type=(response.responseHeaders||"").match(/^content-type:\s*([^;\r\n]+)/im)?.[1]?.trim()||"";if(type.toLowerCase()!==expected.mimeType.toLowerCase()){settled=true;reject(new Error("No pude bajar el archivo."));return;}
    const version=(response.responseHeaders||"").match(/^x-hospeda-material-version:\s*(.+)$/im)?.[1]?.trim()||null;const file=new File([bytes],expected.fileName,{type});bytes=null;response.response=null;settled=true;resolve({file,version});
   },onerror:()=>{if(!settled){settled=true;reject(new Error("No pude bajar el archivo."));}},ontimeout:()=>{if(!settled){settled=true;reject(new Error("No pude bajar el archivo."));}}});abortRequest=()=>{if(!settled){settled=true;xhr.abort();reject(new Error("Descarga cancelada."));}};
 });return {promise,abort:()=>abortRequest()};
}
/** The CRM's answer to `material_add` and `material_remove`: the new text and revision, and (since spec 98) the materials the draft holds. */
export type MaterialChange={revision:number;body:string;materials?:HeldMaterial[]};
export const fetchTemplates=(base:string,token:string,accountId:string)=>request<TemplatesResponse>(`${base}/_api/userscript/templates?accountId=${encodeURIComponent(accountId)}`,token);
/** A WhatsApp draft: of a management, or «Sin gestión» (`leadId: null`, with the purpose and the business). `templateId: null` is a free draft. */
export type WhatsappPrepare={id:string;leadId:string;contactId:string|null;templateId:string|null}|{id:string;accountId:string;leadId:null;contactId:string|null;templateId:string|null;purpose:ScriptPurpose;otherPurpose:string|null};
export const prepareTemplate=(base:string,token:string,payload:WhatsappPrepare)=>request<PreparedTemplate>(`${base}/_api/userscript/prepare`,token,"POST",payload);
export const dispatchTemplate=(base:string,token:string,payload:{id:string;revision:number})=>request(`${base}/_api/userscript/dispatch`,token,"POST",payload);
export const markTemplateNotSent=(base:string,token:string,id:string)=>request(`${base}/_api/userscript/outcome`,token,"POST",{id,event:"manual_not_sent"});
/** An active deliverable sales material the seller can add to a WhatsApp or Instagram draft. */
export type ScriptMaterial={id:string;title:string;categories:string[];format:string;formatLabel:string;otherVertical?:boolean};
export type MaterialsResponse={materials:ScriptMaterial[];blocked:string|null;truncated?:boolean};
/** The CRM searches title and description (accent-insensitive) and caps the list, so a search always reaches every material. */
export const fetchMaterials=(base:string,token:string,accountId:string,search='',channel:"whatsapp"|"instagram"="whatsapp")=>request<MaterialsResponse>(`${base}/_api/userscript/materials?${new URLSearchParams({accountId,...(search.trim()?{search:search.trim()}:{}),...(channel==="instagram"?{channel}:{})})}`,token);
/** Adds a material to the prepared draft: the CRM creates its own link and returns the new text and revision. */
export const addMaterial=(base:string,token:string,payload:{messageId:string;revision:number;materialId:string})=>request<MaterialChange>(`${base}/_api/userscript/material_add`,token,"POST",payload);
/** «Quitar» (owner, 29/10/2026): the CRM revokes that link of the draft and takes it out of the text. */
export const removeMaterial=(base:string,token:string,payload:{messageId:string;revision:number;shareId:string})=>request<MaterialChange>(`${base}/_api/userscript/material_remove`,token,"POST",payload);

/** Spec 97 §5.2: a business as the Instagram panel sees it (WhatsApp's `Match` without WhatsApp fields, plus whether the user can contact it). */
export type InstagramMatch={accountId:string;code:string;name:string;city:string|null;status:string|null;statusLabel:string|null;assignedUserName:string|null;doNotContact:boolean;restrictionActive:boolean;archived:boolean;canContact:boolean;leads:{id:string;name:string;stage:string}[];url:string};
export type InstagramContextResponse=Omit<ContextResponse,"matches">&{instagramAccount:string|null;matches:InstagramMatch[];instagram:{username:string;threadId:string|null;displayName?:string|null}};
export const fetchInstagramContext=(base:string,token:string,username:string)=>request<InstagramContextResponse>(`${base}/_api/userscript/context?${new URLSearchParams({instagram:username})}`,token);
export type InstagramThreadReport={username:string;threadId:string;proof:"header"|"seller";displayName?:string};
export const reportInstagramThread=(base:string,token:string,payload:InstagramThreadReport)=>request<{threadId:string}>(`${base}/_api/userscript/instagram/thread`,token,"POST",payload);
export const reportInstagramThreadStale=(base:string,token:string,payload:{username:string;threadId:string})=>request<{deleted:boolean}>(`${base}/_api/userscript/instagram/thread/stale`,token,"POST",payload);
/** Spec 97 §15: a learned chat with its header display name and the spec 86 badge data (Instagram restriction channels). */
export type InstagramInboxBusiness={accountId:string;code:string;name:string;city:string|null;statusLabel:string|null;assignedUserName:string|null;doNotContact:boolean;restricted:boolean;openManagement:{stageLabel:string;typeLabel:string|null}|null};
export type InstagramInboxBadge=({kind:"single"}&InstagramInboxBusiness)|{kind:"multiple";businesses:{accountId:string;code:string;name:string;statusLabel:string|null}[]};
export type InstagramInboxThread={username:string;displayName:string;badge:InstagramInboxBadge};
export const fetchInstagramThreads=(base:string,token:string)=>request<{threads:InstagramInboxThread[]}>(`${base}/_api/userscript/instagram/threads`,token);
export type InstagramTemplate={id:string;name:string;recommended:boolean;body:string};
export type InstagramTemplatesResponse={leads:{id:string;name:string;type:string|null;stage:string;templates:InstagramTemplate[]}[];general:{defaultPurpose:ScriptPurpose;purposes:{value:ScriptPurpose;label:string;templates:InstagramTemplate[]}[]}|null;blocked:string|null;username:string|null};
export const fetchInstagramTemplates=(base:string,token:string,accountId:string)=>request<InstagramTemplatesResponse>(`${base}/_api/userscript/templates?${new URLSearchParams({accountId,channel:"instagram"})}`,token);
export type InstagramPrepare={id:string;accountId:string;leadId:string|null;templateId:string|null;purpose?:ScriptPurpose|null;otherPurpose?:string|null};
export const prepareInstagramTemplate=(base:string,token:string,payload:InstagramPrepare)=>request<PreparedTemplate>(`${base}/_api/userscript/prepare`,token,"POST",{...payload,channel:"instagram"});
export type DispatchResult={messageId:string;status:string;alreadyConfirmed?:boolean};
