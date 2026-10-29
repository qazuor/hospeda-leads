import { USERSCRIPT_VERSION } from "./version";

export type Match = { accountId: string; code: string; name: string; city: string | null; status?: string | null; statusLabel?: string | null; assignedUserName: string | null; doNotContact: boolean; restrictionActive: boolean; archived: boolean; leads: { id: string; name: string; stage: string }[]; url: string; openWhatsapp?: { openedAt: string; body?: string | null }[]; autoRegister?: {enabled:boolean;reason?:"global_disabled"|"auto_disabled"|"not_eligible"|string;since:string} };
export type ContextResponse = { minVersion: string; latestVersion?: string; user: { email: string; displayName: string }; autoRegister?:boolean; hiddenMatches?: number; matches: Match[] };
export type RegisterResult = { externalId: string; status: "created" | "duplicate" | "rejected"; kind?: "message" | "inbound"; id?: string; reason?: string };
export type RegisterResponse = { results: RegisterResult[] };
export class ApiError extends Error { constructor(message: string, public status: number, public minVersion?: string) { super(message); } }

export function request<T>(url: string, token: string, method = "GET", body?: unknown): Promise<T> {
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
export type StatusResponse = Omit<ContextResponse, "matches"> & { instagramAccount?: string | null };
export function fetchStatus(base: string, token: string): Promise<StatusResponse> { return request(`${base}/_api/userscript/status`, token); }

export function registerBatch(base: string, token: string, payload: { accountId: string; chat: { title: string; phone: string | null }; messages: unknown[]; automatic?:boolean }): Promise<RegisterResponse> {
  return request(`${base}/_api/userscript/register`, token, "POST", payload);
}
export type AutoRegistration={id:string;direction:"in"|"out";excerpt:string;sentAt:string|null;receivedAt:string|null;status:string};
export const fetchAutoRegistrations=(base:string,token:string,accountId:string)=>request<{registrations:AutoRegistration[]}>(`${base}/_api/userscript/auto-registrations?accountId=${encodeURIComponent(accountId)}`,token);
export const voidAutoRegistration=(base:string,token:string,payload:{id:string;reason:string})=>request<{voided:boolean;skipped:string[]}>(`${base}/_api/userscript/void`,token,"POST",payload);
export const saveAutoRegisterPreference=(base:string,token:string,autoRegister:boolean)=>request<{autoRegister:boolean}>(`${base}/_api/userscript/preferences`,token,"POST",{autoRegister});

export type TemplateLead={id:string;name:string;type:string|null;stage:string;templates:{id:string;name:string;recommended:boolean;body:string}[];contacts:{id:string;name:string;phone:string;default:boolean}[]};
export type TemplatesResponse={leads:TemplateLead[];blocked:string|null};
/** `materialWarnings`: sales material of the model the CRM left out of this message, with the reason (spec 89 §9). */
export type PreparedTemplate={messageId:string;revision:number;body:string;recipient:string;recipientName:string;unresolved:string[];materialWarnings?:string[]};
export const fetchTemplates=(base:string,token:string,accountId:string)=>request<TemplatesResponse>(`${base}/_api/userscript/templates?accountId=${encodeURIComponent(accountId)}`,token);
export const prepareTemplate=(base:string,token:string,payload:{id:string;leadId:string;contactId:string|null;templateId:string})=>request<PreparedTemplate>(`${base}/_api/userscript/prepare`,token,"POST",payload);
export const dispatchTemplate=(base:string,token:string,payload:{id:string;revision:number})=>request(`${base}/_api/userscript/dispatch`,token,"POST",payload);
export const markTemplateNotSent=(base:string,token:string,id:string)=>request(`${base}/_api/userscript/outcome`,token,"POST",{id,event:"manual_not_sent"});
/** An active deliverable sales material the seller can add to a WhatsApp draft. */
export type ScriptMaterial={id:string;title:string;categories:string[];format:string;formatLabel:string};
export type MaterialsResponse={materials:ScriptMaterial[];blocked:string|null;truncated?:boolean};
/** The CRM searches title and description (accent-insensitive) and caps the list, so a search always reaches every material. */
export const fetchMaterials=(base:string,token:string,accountId:string,search='')=>request<MaterialsResponse>(`${base}/_api/userscript/materials?${new URLSearchParams({accountId,...(search.trim()?{search:search.trim()}:{})})}`,token);
/** Adds a material to the prepared draft: the CRM creates its own link and returns the new text and revision. */
export const addMaterial=(base:string,token:string,payload:{messageId:string;revision:number;materialId:string})=>request<{revision:number;body:string}>(`${base}/_api/userscript/material_add`,token,"POST",payload);

/** Spec 97 §5.2: a business as the Instagram panel sees it (WhatsApp's `Match` without WhatsApp fields, plus whether the user can contact it). */
export type InstagramMatch={accountId:string;code:string;name:string;city:string|null;status:string|null;statusLabel:string|null;assignedUserName:string|null;doNotContact:boolean;restrictionActive:boolean;archived:boolean;canContact:boolean;leads:{id:string;name:string;stage:string}[];url:string};
export type InstagramContextResponse=Omit<ContextResponse,"matches">&{instagramAccount:string|null;matches:InstagramMatch[];instagram:{username:string;threadId:string|null}};
export const fetchInstagramContext=(base:string,token:string,username:string)=>request<InstagramContextResponse>(`${base}/_api/userscript/context?${new URLSearchParams({instagram:username})}`,token);
export type InstagramThreadReport={username:string;threadId:string;proof:"header"|"seller"};
export const reportInstagramThread=(base:string,token:string,payload:InstagramThreadReport)=>request<{threadId:string}>(`${base}/_api/userscript/instagram/thread`,token,"POST",payload);
export const reportInstagramThreadStale=(base:string,token:string,payload:{username:string;threadId:string})=>request<{deleted:boolean}>(`${base}/_api/userscript/instagram/thread/stale`,token,"POST",payload);
export type ScriptPurpose="verification"|"first_contact"|"resume"|"relationship"|"care"|"operations"|"other";
export type InstagramTemplate={id:string;name:string;recommended:boolean;body:string};
export type InstagramTemplatesResponse={leads:{id:string;name:string;type:string|null;stage:string;templates:InstagramTemplate[]}[];general:{defaultPurpose:ScriptPurpose;purposes:{value:ScriptPurpose;label:string;templates:InstagramTemplate[]}[]}|null;blocked:string|null;username:string|null};
export const fetchInstagramTemplates=(base:string,token:string,accountId:string)=>request<InstagramTemplatesResponse>(`${base}/_api/userscript/templates?${new URLSearchParams({accountId,channel:"instagram"})}`,token);
export type InstagramPrepare={id:string;accountId:string;leadId:string|null;templateId:string;purpose?:ScriptPurpose|null;otherPurpose?:string|null};
export const prepareInstagramTemplate=(base:string,token:string,payload:InstagramPrepare)=>request<PreparedTemplate>(`${base}/_api/userscript/prepare`,token,"POST",{...payload,channel:"instagram"});
export type DispatchResult={messageId:string;status:string;alreadyConfirmed?:boolean};
