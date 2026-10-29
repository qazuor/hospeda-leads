import { expandButtons, findFloatingExpand, findMessageButton, findPageComposer } from "./finders";
import { composerEmpty, focusComposer, insertIntoComposer } from "./insert";
import { profileUsername, threadIdFromPath } from "./handoff";
import { proveThread, type ThreadProof } from "./thread";

/**
 * Spec 94 §2.2 rebuilt by spec 97 §4.2: two small state machines. `openChatFromProfile` clicks the profile's «Enviar mensaje» and follows
 * Instagram to the chat page (directly, or through the new floating chat's «Expandir»); `pasteOnChatPage` proves the chat, checks the account
 * and writes into the page's empty composer. Each phase moves forward or ends in `failed` with a reason that maps to one notice. Nothing is
 * ever sent: the last phase is `done`, right after the text is in the composer.
 */
export type FlowPhase = "finding-button" | "opening-chat" | "proving" | "waiting-composer" | "inserting" | "done" | "failed";
export type OpenFailure = "no-button" | "navigated-away" | "floating-no-link" | "other-account" | "account-unknown";
export type PasteFailure = "navigated-away" | "thread-contradicted" | "thread-unproven" | "other-account" | "account-unknown" | "composer-timeout" | "composer-busy" | "insert-failed" | "text-differs";
export type FlowFailure = OpenFailure | PasteFailure;
export type OpenResult = { readonly ok: true; readonly threadId: string } | { readonly ok: false; readonly reason: OpenFailure };
export type FlowResult = { readonly ok: true; readonly proof: "header" | "seller" } | { readonly ok: false; readonly reason: PasteFailure; readonly composer: HTMLElement | null };

/** Allowed transitions; `advance` refuses anything else, so a bug cannot skip from the button to inserting. */
export const FLOW_TRANSITIONS: Readonly<Record<FlowPhase, readonly FlowPhase[]>> = {
  "finding-button": ["opening-chat", "failed"],
  "opening-chat": ["done", "failed"],
  proving: ["waiting-composer", "failed"],
  "waiting-composer": ["inserting", "failed"],
  inserting: ["done", "failed"],
  done: [],
  failed: [],
};

/** D6: 15 s for the button, the chat page, the proof and the composer. A contradicting header must hold for a moment (an SPA re-render). */
export const BUTTON_TIMEOUT_MS = 15_000, CHAT_TIMEOUT_MS = 15_000, PROOF_TIMEOUT_MS = 15_000, COMPOSER_TIMEOUT_MS = 15_000, CONTRADICTION_MS = 1500, POLL_INTERVAL_MS = 200;

/** Polls `find` until it returns a value or `timeoutMs` passes. Polling (not an observer) keeps it independent of how Instagram re-renders. */
export function pollFor<T>({ find, timeoutMs, intervalMs = POLL_INTERVAL_MS }: { find: () => T | null; timeoutMs: number; intervalMs?: number }): Promise<T | null> {
  return new Promise(resolve => {
    const startedAt = Date.now();
    const tick = () => { const found = find(); if (found) return resolve(found); if (Date.now() - startedAt >= timeoutMs) return resolve(null); setTimeout(tick, intervalMs); };
    tick();
  });
}

const machine = (start: FlowPhase, onPhase?: (phase: FlowPhase) => void) => {
  let phase = start; onPhase?.(phase);
  return (next: FlowPhase) => { if (!FLOW_TRANSITIONS[phase].includes(next)) throw new Error(`Invalid transition ${phase} → ${next}`); phase = next; onPhase?.(next); };
};
const ABORT = Symbol("abort");

export type OpenDeps = {
  readonly doc: Document;
  /** The live location (Instagram is a SPA: the path changes without a reload). */
  readonly location: Pick<Location, "pathname">;
  /** The verified profile username of the handoff: the click is bound to it. */
  readonly username: string;
  /** The Hospeda account check, run before clicking anything (L5). Omitted only by callers that check it themselves. */
  readonly account?: AccountCheck;
  readonly buttonTimeoutMs?: number; readonly chatTimeoutMs?: number; readonly intervalMs?: number;
  readonly onPhase?: (phase: FlowPhase) => void;
};

/**
 * §4.2 on a profile (unknown thread): clicks the header's «Enviar mensaje» (always: an already open chat is never reused), then waits for the page
 * to reach `/direct/t/<id>/`. Live (9.1) Instagram opens a floating chat instead; its «Expandir» (only one that appeared after the click) is
 * clicked, an in-app navigation that keeps this script and its in-memory handoff. Moving to any other page aborts. Without «Expandir» in 15 s the
 * result is `floating-no-link`: the seller expands it and the paste happens on a proven chat page later.
 */
export async function openChatFromProfile({ doc, location, username, account, buttonTimeoutMs = BUTTON_TIMEOUT_MS, chatTimeoutMs = CHAT_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS, onPhase }: OpenDeps): Promise<OpenResult> {
  const advance = machine("finding-button", onPhase);
  const fail = (reason: OpenFailure): OpenResult => { advance("failed"); return { ok: false, reason }; };
  const onProfile = () => profileUsername(location) === username;
  const button = await pollFor<HTMLElement | typeof ABORT>({ find: () => (!onProfile() ? ABORT : findMessageButton({ doc })), timeoutMs: buttonTimeoutMs, intervalMs });
  if (button === ABORT) return fail("navigated-away");
  if (!button) return fail("no-button");
  // Re-checked right before the click: the button must be the one of the verified profile.
  if (!onProfile()) return fail("navigated-away");
  // §4.5: never open a chat from another Instagram account (L5); the paste checks it again on the chat page.
  if (account) { const state = account(); if (state !== "ok") return fail(state === "mismatch" ? "other-account" : "account-unknown"); }
  const startPath = location.pathname, before = new Set<Element>(expandButtons({ doc }));
  button.click();
  advance("opening-chat");
  let expanded = false;
  const found = await pollFor<string | typeof ABORT>({
    find: () => {
      const path = location.pathname, thread = threadIdFromPath(path);
      if (thread) return thread;
      if (path !== startPath) return ABORT;
      if (!expanded) { const expand = findFloatingExpand({ doc, before }); if (expand) { expanded = true; expand.click(); } }
      return null;
    },
    timeoutMs: chatTimeoutMs, intervalMs,
  });
  if (found === ABORT) return fail("navigated-away");
  if (!found) return fail("floating-no-link");
  advance("done");
  return { ok: true, threadId: found };
}

/** The logged-in Instagram account against the Hospeda one (§4.5): `unknown` covers no CRM answer, no configured account and an unreadable page. */
export type AccountCheck = () => "ok" | "mismatch" | "unknown";

export type PasteDeps = {
  readonly doc: Document;
  readonly location: Pick<Location, "pathname">;
  /** The username the chat must be with (the handoff's or the panel's business). */
  readonly username: string;
  /** The chat page the paste is bound to. */
  readonly threadId: string;
  readonly text: string;
  readonly account: AccountCheck;
  /**
   * Decision 12.1 option 2: the seller confirmed «Sí, es este chat» with a trusted click. The proof then only has to not contradict the username;
   * a header proving somebody else still refuses.
   */
  readonly sellerConfirmed?: boolean;
  readonly settle?: () => Promise<void>;
  readonly proofTimeoutMs?: number; readonly composerTimeoutMs?: number; readonly contradictionMs?: number; readonly intervalMs?: number;
  readonly onPhase?: (phase: FlowPhase) => void;
};

const defaultSettle = () => new Promise<void>(resolve => setTimeout(resolve, 60));
export type ProofVerdict = "proven" | "contradicted" | "inconclusive" | "moved";
/** One proof read against the expected chat. */
export function proofVerdict({ proof, username, threadId, path }: { proof: ThreadProof; username: string; threadId: string; path: string }): ProofVerdict {
  if (threadIdFromPath(path) !== threadId) return "moved";
  // Evidence against `username` is never ambiguity: a group, or a pane that names only other people (decision 12.1 confirms ambiguity only).
  if (!proof.ok) return proof.reason === "group" || (proof.names.length > 0 && !proof.names.includes(username)) ? "contradicted" : "inconclusive";
  return proof.threadId === threadId && proof.username === username ? "proven" : "contradicted";
}

/**
 * §4.2 on a chat page: waits up to 15 s for the proof (§4.4) that the chat is with `username`, checks the Hospeda account (§4.5), waits for the
 * page's own composer (never a floating one) and inserts `text` only into an empty one (D3), with spec 94's insertion. The proof and the account
 * are checked again right before touching the editor. A contradicting proof must hold for `contradictionMs` (a re-render can show the previous
 * page for a moment); an inconclusive one ends as `thread-unproven`, which the panel turns into the seller confirmation.
 */
export async function pasteOnChatPage({ doc, location, username, threadId, text, account, sellerConfirmed = false, settle = defaultSettle, proofTimeoutMs = PROOF_TIMEOUT_MS, composerTimeoutMs = COMPOSER_TIMEOUT_MS, contradictionMs = CONTRADICTION_MS, intervalMs = POLL_INTERVAL_MS, onPhase }: PasteDeps): Promise<FlowResult> {
  const advance = machine("proving", onPhase);
  const fail = (reason: PasteFailure, composer: HTMLElement | null = null): FlowResult => { advance("failed"); return { ok: false, reason, composer }; };
  const verdict = () => proofVerdict({ proof: proveThread({ doc, readPath: () => location.pathname }), username, threadId, path: location.pathname });
  const accepted = (value: ProofVerdict) => value === "proven" || (sellerConfirmed && value === "inconclusive");
  let contradictedSince: number | null = null, last = "inconclusive" as ProofVerdict;
  const settled = await pollFor<ProofVerdict>({
    find: () => {
      last = verdict();
      if (last === "moved" || accepted(last)) return last;
      if (last !== "contradicted") { contradictedSince = null; return null; }
      contradictedSince ??= Date.now();
      return Date.now() - contradictedSince >= contradictionMs ? last : null;
    },
    timeoutMs: proofTimeoutMs, intervalMs,
  });
  if (settled === "moved") return fail("navigated-away");
  if (settled === "contradicted" || (!settled && last === "contradicted")) return fail("thread-contradicted");
  if (!settled) return fail("thread-unproven");
  const accountState = account();
  if (accountState !== "ok") return fail(accountState === "mismatch" ? "other-account" : "account-unknown");
  advance("waiting-composer");
  const composer = await pollFor<HTMLElement | typeof ABORT>({ find: () => (threadIdFromPath(location.pathname) !== threadId ? ABORT : findPageComposer({ doc })), timeoutMs: composerTimeoutMs, intervalMs });
  if (composer === ABORT) return fail("navigated-away");
  if (!composer) return fail("composer-timeout");
  if (!composerEmpty(composer)) return fail("composer-busy", composer);
  // Last checks before touching the editor: same chat, same proof, same account.
  const again = verdict();
  if (again === "moved") return fail("navigated-away");
  if (!accepted(again)) return fail(again === "contradicted" ? "thread-contradicted" : "thread-unproven");
  if (account() !== "ok") return fail("other-account");
  advance("inserting");
  focusComposer(composer);
  const inserted = await insertIntoComposer({ composer, text, settle });
  if (!inserted.ok) return fail(inserted.reason === "different" ? "text-differs" : "insert-failed", composer);
  advance("done");
  return { ok: true, proof: again === "proven" ? "header" : "seller" };
}
