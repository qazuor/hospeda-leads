import type { InstagramContextResponse, InstagramMatch, StatusResponse } from "../api";
import type { ThreadProof } from "../instagram/thread";

/**
 * Spec 97 §4.3: the Instagram panel's state and the pure decisions on it (account check, launcher label, which view). Kept apart from the DOM so
 * every launcher state and view is unit tested.
 */
export type StatusState = { readonly kind: "idle" | "loading" } | { readonly kind: "ok"; readonly value: StatusResponse } | { readonly kind: "rejected" } | { readonly kind: "outdated"; readonly required: string } | { readonly kind: "error"; readonly message: string };
export type ContextState = { readonly username: string; readonly kind: "loading" } | { readonly username: string; readonly kind: "ok"; readonly value: InstagramContextResponse } | { readonly username: string; readonly kind: "error"; readonly message: string };
export type AccountState = "ok" | "mismatch" | "unknown" | "unconfigured";
export type PanelView = "main" | "settings" | "compose";

export type AppState = {
  token: boolean;
  status: StatusState;
  /** The logged-in Instagram username read from the page (§4.5), or null. */
  loggedIn: string | null;
  threadId: string | null;
  proof: ThreadProof | null;
  /** Decision 12.1: the seller confirmed this chat for that username from a CRM handoff (this tab only). */
  sellerConfirmed: { readonly username: string; readonly threadId: string; readonly by: string } | null;
  /** Decision 12.1: the question «¿Este chat es con @x?» is open for a handoff whose proof was inconclusive. */
  confirm: { readonly username: string; readonly threadId: string } | null;
  context: ContextState | null;
  selectedId: string | null;
  view: PanelView;
  busy: boolean;
  error: string;
};

export function initialState({ token }: { token: boolean }): AppState {
  return { token, status: { kind: "idle" }, loggedIn: null, threadId: null, proof: null, sellerConfirmed: null, confirm: null, context: null, selectedId: null, view: "main", busy: false, error: "" };
}

/** The Hospeda account check (§4.5): unknown until the CRM answered and the page shows a logged-in account; unconfigured without one in the CRM. */
export function accountState({ status, loggedIn }: Pick<AppState, "status" | "loggedIn">): AccountState {
  if (status.kind !== "ok") return "unknown";
  const expected = status.value.instagramAccount ?? null;
  if (!expected) return "unconfigured";
  if (!loggedIn) return "unknown";
  return loggedIn === expected.toLowerCase() ? "ok" : "mismatch";
}

/** The username the chat is with: a header proof, or the seller's confirmation for this very thread. */
export function chatUsername(state: Pick<AppState, "proof" | "sellerConfirmed" | "threadId">): string | null {
  if (state.proof?.ok && state.proof.threadId === state.threadId) return state.proof.username;
  return state.sellerConfirmed && state.sellerConfirmed.threadId === state.threadId ? state.sellerConfirmed.username : null;
}

/** The business the panel shows: the only visible match, or the one the seller picked among several. */
export function selectedMatch(state: Pick<AppState, "context" | "selectedId">): InstagramMatch | null {
  const matches = state.context?.kind === "ok" ? state.context.value.matches : [];
  return matches.length === 1 ? matches[0]! : matches.find(match => match.accountId === state.selectedId) ?? null;
}

export type LauncherTone = "ok" | "warn" | "error" | "";
/** §4.3 launcher table, first match wins. */
export function launcherState(state: AppState): { readonly label: string; readonly tone: LauncherTone } {
  if (!state.token || state.status.kind === "rejected") return { label: "Falta el token", tone: "warn" };
  if (state.status.kind === "outdated") return { label: "Actualizá el script", tone: "warn" };
  if (accountState(state) === "mismatch") return { label: "Otra cuenta", tone: "warn" };
  if (state.status.kind === "error" || state.context?.kind === "error") return { label: "Revisá la conexión", tone: "error" };
  if (!chatUsername(state)) return { label: "Hospeda", tone: "" };
  const match = selectedMatch(state);
  if (match) return match.doNotContact || match.restrictionActive ? { label: `${match.code} · No contactar`, tone: "error" } : { label: match.code, tone: "ok" };
  if (state.context?.kind === "ok" && !state.context.value.matches.length) return { label: "Sin CRM", tone: "" };
  return { label: "Hospeda", tone: state.context?.kind === "ok" ? "ok" : "" };
}

export type BodyKind = "no-token" | "rejected" | "outdated" | "connection" | "loading" | "unconfigured" | "mismatch" | "account-unknown" | "confirm" | "unproven" | "searching" | "none" | "hidden" | "multiple" | "business";
/** Which main view the panel shows (§4.3, US3, US5). */
export function bodyKind(state: AppState): BodyKind {
  if (!state.token) return "no-token";
  if (state.status.kind === "rejected") return "rejected";
  if (state.status.kind === "outdated") return "outdated";
  if (state.status.kind === "error") return "connection";
  if (state.status.kind !== "ok") return "loading";
  const account = accountState(state);
  if (account === "unconfigured") return "unconfigured";
  if (account === "mismatch") return "mismatch";
  if (state.confirm && state.confirm.threadId === state.threadId) return account === "ok" ? "confirm" : "account-unknown";
  if (!chatUsername(state)) return "unproven";
  if (account === "unknown") return "account-unknown";
  if (!state.context || state.context.kind === "loading") return "searching";
  if (state.context.kind === "error") return "connection";
  const { matches, hiddenMatches = 0 } = state.context.value;
  if (!matches.length) return hiddenMatches > 0 ? "hidden" : "none";
  return selectedMatch(state) ? "business" : "multiple";
}

/** Why «Mandar un mensaje» is disabled, in the CRM's words; empty when it is allowed. The server checks everything again. */
export function contactBlockReason(match: InstagramMatch): string {
  if (match.doNotContact) return "El negocio tiene No contactar activo.";
  if (match.restrictionActive) return "Hay una restricción activa para Instagram.";
  if (match.archived) return "El negocio está archivado.";
  if (!match.canContact) return "No podés contactar este negocio desde tu usuario.";
  return "";
}
