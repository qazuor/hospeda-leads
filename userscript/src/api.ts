import { USERSCRIPT_VERSION } from "./version";

export type Match = { accountId: string; code: string; name: string; city: string | null; assignedUserName: string | null; doNotContact: boolean; restrictionActive: boolean; archived: boolean; leads: { id: string; name: string; stage: string }[]; url: string };
export type ContextResponse = { minVersion: string; user: { email: string; displayName: string }; matches: Match[] };
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

export function registerBatch(base: string, token: string, payload: { accountId: string; chat: { title: string; phone: string | null }; messages: unknown[] }): Promise<RegisterResponse> {
  return request(`${base}/_api/userscript/register`, token, "POST", payload);
}

