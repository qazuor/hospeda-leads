import { addMaterial, dispatchTemplate, removeMaterial, fetchInstagramContext, fetchMaterials, fetchInstagramThreads, fetchInstagramTemplates, fetchStatus, markTemplateNotSent, prepareInstagramTemplate, reportInstagramThread, reportInstagramThreadStale, type DispatchResult, type InstagramContextResponse, type InstagramInboxThread, type InstagramPrepare, type MaterialChange, type InstagramTemplatesResponse, type InstagramThreadReport, type MaterialsResponse, type PreparedTemplate, type StatusResponse } from "../api";

/**
 * Spec 97 §5.3: the allowlist of CRM calls the Instagram side may make, bound to the CRM base and the saved token. The token travels only in
 * `GM_xmlhttpRequest` headers (`api.ts`), never into the page. Nothing else from `api.ts` is reachable on instagram.com.
 */
export type InstagramApi = {
  readonly fetchStatus: () => Promise<StatusResponse>;
  readonly fetchContext: (username: string) => Promise<InstagramContextResponse>;
  readonly reportThread: (payload: InstagramThreadReport) => Promise<unknown>;
  readonly reportThreadStale: (payload: { username: string; threadId: string }) => Promise<unknown>;
  readonly fetchTemplates: (accountId: string) => Promise<InstagramTemplatesResponse>;
  readonly prepare: (payload: InstagramPrepare) => Promise<PreparedTemplate>;
  readonly dispatch: (payload: { id: string; revision: number }) => Promise<DispatchResult>;
  readonly markNotSent: (id: string) => Promise<unknown>;
  /** Spec 97 §15: learned chats with display names, for the conversation-list badges. */
  readonly fetchThreads: () => Promise<{ threads: InstagramInboxThread[] }>;
  /** Spec 98: deliverable sales material for an Instagram draft (blocked reasons of the Instagram scope) and adding one (link only). */
  readonly fetchMaterials: (accountId: string, search: string) => Promise<MaterialsResponse>;
  readonly addMaterial: (payload: { messageId: string; revision: number; materialId: string }) => Promise<MaterialChange>;
  readonly removeMaterial: (payload: { messageId: string; revision: number; shareId: string }) => Promise<MaterialChange>;
};
export const INSTAGRAM_API_FUNCTIONS: readonly string[] = ["fetchStatus", "fetchInstagramContext", "reportInstagramThread", "reportInstagramThreadStale", "fetchInstagramTemplates", "prepareInstagramTemplate", "dispatchTemplate", "markTemplateNotSent", "fetchInstagramThreads", "fetchMaterials", "addMaterial", "removeMaterial"];

export function instagramApi({ base, token }: { base: string; token: () => string }): InstagramApi {
  return {
    fetchStatus: () => fetchStatus(base, token()),
    fetchContext: username => fetchInstagramContext(base, token(), username),
    reportThread: payload => reportInstagramThread(base, token(), payload),
    reportThreadStale: payload => reportInstagramThreadStale(base, token(), payload),
    fetchTemplates: accountId => fetchInstagramTemplates(base, token(), accountId),
    prepare: payload => prepareInstagramTemplate(base, token(), payload),
    dispatch: async payload => (await dispatchTemplate(base, token(), payload)) as DispatchResult,
    markNotSent: id => markTemplateNotSent(base, token(), id),
    fetchThreads: () => fetchInstagramThreads(base, token()),
    fetchMaterials: (accountId, search) => fetchMaterials(base, token(), accountId, search, "instagram"),
    addMaterial: payload => addMaterial(base, token(), payload),
    removeMaterial: payload => removeMaterial(base, token(), payload),
  };
}
