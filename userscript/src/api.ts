import { USERSCRIPT_VERSION } from "./version";

export type Match = { accountId: string; code: string; name: string; city: string | null; status?: string | null; statusLabel?: string | null; assignedUserName: string | null; doNotContact: boolean; restrictionActive: boolean; archived: boolean; leads: { id: string; name: string; stage: string }[]; url: string; openWhatsapp?: { openedAt: string; body?: string | null }[]; autoRegister?: {enabled:boolean;reason?:"global_disabled"|"auto_disabled"|"not_eligible"|string;since:string} };
export type ContextResponse = { minVersion: string; latestVersion?: string; user: { email: string; displayName: string }; autoRegister?:boolean; matches: Match[] };
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

export type StatusResponse = Omit<ContextResponse, "matches">;
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
export type PreparedTemplate={messageId:string;revision:number;body:string;recipient:string;recipientName:string;unresolved:string[]};
export const fetchTemplates=(base:string,token:string,accountId:string)=>request<TemplatesResponse>(`${base}/_api/userscript/templates?accountId=${encodeURIComponent(accountId)}`,token);
export const prepareTemplate=(base:string,token:string,payload:{id:string;leadId:string;contactId:string|null;templateId:string})=>request<PreparedTemplate>(`${base}/_api/userscript/prepare`,token,"POST",payload);
export const dispatchTemplate=(base:string,token:string,payload:{id:string;revision:number})=>request(`${base}/_api/userscript/dispatch`,token,"POST",payload);
export const markTemplateNotSent=(base:string,token:string,id:string)=>request(`${base}/_api/userscript/outcome`,token,"POST",{id,event:"manual_not_sent"});
