import { ApiError, type InstagramContextResponse, type InstagramInboxThread } from "../api";
import { consumePasteMarker } from "../instagram/marker";
import { checkHandoff, parseHandoff, threadIdFromPath, type InstagramHandoff } from "../instagram/handoff";
import { findPageComposer } from "../instagram/finders";
import { headerDisplayName, loggedInUsername, proveThread, type ThreadProof } from "../instagram/thread";
import { openChatFromProfile, pasteOnChatPage, pollFor, proofVerdict, type FlowFailure, type FlowResult } from "../instagram/flow";
import { PASTED_NOTICE, UNCONFIRMED_NOTICE, failureNotice, pasteShortcut, showNotice, type NoticeLink } from "../instagram/notice";
import type { InstagramApi } from "./client";
import type { InstagramStore } from "./storage";
import { PANEL_ID, removePanel, renderPanel, type PanelActions } from "./panel";
import { CHAT_CHANGED, openInstagramCompose } from "./compose";
import { applyInboxBadges, inboxBadgeDiagnostic, removeInboxBadges } from "./inboxBadges";
import { conversationList } from "../instagram/inbox";
import { accountState, chatUsername, initialState, selectedMatch, type AppState, type StatusState } from "./state";

/**
 * Spec 97 §5.3: the wiring layer on instagram.com, the only place there that touches GM storage (through `InstagramStore`) and the CRM (through
 * the `InstagramApi` allowlist). It watches the SPA path by polling (no `hashchange` on `pushState`), runs the one-time CRM handoff (§4.2) and the
 * panel on chat pages (§4.3), and learns threads (§4.4). It listens to no page-dispatched event, never reads the clipboard and never sends.
 * On a page outside `/direct/` that carries no marker it reads nothing, requests nothing and injects nothing. On `/direct/` pages (inbox and
 * chats) it also marks the conversation list (§15) when the seller keeps the badges on.
 */
export type FlowTiming = { readonly intervalMs?: number; readonly settle?: () => Promise<void>; readonly buttonTimeoutMs?: number; readonly chatTimeoutMs?: number; readonly proofTimeoutMs?: number; readonly composerTimeoutMs?: number; readonly contradictionMs?: number };
export type HandoffOutcome = FlowResult | { readonly ok: false; readonly reason: FlowFailure | "unconfirmed" };
export type InstagramAppDeps = {
  readonly store: InstagramStore;
  readonly api: InstagramApi;
  readonly base: string;
  readonly version: string;
  readonly win?: Window & typeof globalThis;
  readonly pollMs?: number;
  /** How long to wait for the handoff to reach this tab (GM storage syncs between tabs asynchronously). */
  readonly handoffWaitMs?: number;
  readonly flow?: FlowTiming;
  /** §5.4.4: real clicks only. Tests inject it; production keeps `event.isTrusted`. */
  readonly trusted?: (event: Event) => boolean;
  readonly onResult?: (result: HandoffOutcome) => void;
};
export type InstagramApp = { readonly tick: () => Promise<void>; readonly stop: () => void; readonly state: () => Readonly<AppState> };

/** A thread entry the badges can use: anything else in a response is ignored (review H1). */
const validThread = (value: unknown): value is InstagramInboxThread => { const v = value as Partial<InstagramInboxThread> | null; return !!v && typeof v.username === "string" && typeof v.displayName === "string" && !!v.badge && typeof v.badge === "object" && (v.badge.kind === "single" ? typeof v.badge.code === "string" : v.badge.kind === "multiple" && Array.isArray(v.badge.businesses)); };
const STATUS_TTL_MS = 5 * 60_000, CONTEXT_TTL_MS = 10_000, THREADS_TTL_MS = 5 * 60_000, THREADS_RETRY_MS = 60_000;
const proofKey = (proof: ThreadProof | null) => !proof ? "" : proof.ok ? `ok:${proof.threadId}:${proof.username}` : `no:${proof.reason}`;
const errorMessage = (cause: unknown) => cause instanceof Error && cause.message ? cause.message : "No se pudo consultar el CRM.";
function statusFromError(cause: unknown): StatusState {
  if (cause instanceof ApiError && cause.status === 401) return { kind: "rejected" };
  if (cause instanceof ApiError && cause.status === 426) return { kind: "outdated", required: cause.minVersion || "última" };
  return { kind: "error", message: errorMessage(cause) };
}

export function startInstagramApp(deps: InstagramAppDeps): InstagramApp {
  const win = deps.win ?? window, doc = win.document, flow = deps.flow ?? {}, trusted = deps.trusted ?? ((event: Event) => event.isTrusted);
  const platform = win.navigator.platform || win.navigator.userAgent || "";
  const state = initialState({ token: false });
  let running = false, pending: InstagramHandoff | null = null, confirmHandoff: InstagramHandoff | null = null, lastPath: string | null = null, lastFingerprint = "", statusAt = 0, proofCandidate = "", proofTicks = 0, proofTimer = 0, lastVisibleRefresh = 0, badgeDiagnostic = "Apagadas.";
  let statusLoad: Promise<void> | null = null;
  const contexts = new Map<string, { at: number; value: InstagramContextResponse }>(), reported = new Set<string>();
  // §15: one list of learned chats per TTL (no request per row); `at` also throttles retries after a failure.
  // Keyed by token (review L5): another token never sees the previous one's list.
  let inbox: { token: string; at: number; threads: readonly InstagramInboxThread[] } | null = null, inboxLoad: Promise<void> | null = null;
  const warn = (text: string, link?: NoticeLink) => showNotice({ doc, text: pasteShortcut({ text, platform }), tone: "warning", link });
  const result = (outcome: HandoffOutcome) => deps.onResult?.(outcome);
  const account = (): "ok" | "mismatch" | "unknown" => { state.loggedIn = loggedInUsername({ doc }); const value = accountState(state); return value === "ok" || value === "mismatch" ? value : "unknown"; };
  const dark = () => { const theme = deps.store.theme(); if (theme !== "auto") return theme === "dark"; return doc.documentElement.classList.contains("__fb-dark-mode") || (typeof win.matchMedia === "function" && win.matchMedia("(prefers-color-scheme: dark)").matches); };
  const onDirect = () => win.location.pathname.startsWith("/direct/");
  const isEditing = () => { const active = doc.getElementById(PANEL_ID)?.shadowRoot?.activeElement; return !!active && (active.tagName === "SELECT" || (active.tagName === "INPUT" && !["checkbox", "radio"].includes((active as HTMLInputElement).type))); };

  function loadStatus(force = false): Promise<void> {
    state.token = !!deps.store.token();
    if (!state.token) { state.status = { kind: "idle" }; return Promise.resolve(); }
    if (!force && state.status.kind === "ok" && Date.now() - statusAt < STATUS_TTL_MS) return Promise.resolve();
    statusLoad ??= (async () => {
      if (state.status.kind !== "ok") state.status = { kind: "loading" };
      try { state.status = { kind: "ok", value: await deps.api.fetchStatus() }; statusAt = Date.now(); }
      catch (cause) { state.status = statusFromError(cause); }
      finally { statusLoad = null; ensureContext(); render(); if (onDirect()) safeBadges(true); }
    })();
    return statusLoad;
  }

  /** §4.4 learning: a header-proven chat of a username that a visible business has, whose stored thread is missing or different. Once per tab. */
  function learn(): void {
    if (!state.proof?.ok || state.context?.kind !== "ok") return;
    const { username, threadId } = state.proof, value = state.context.value;
    // Review H2: learn() also runs when a context request resolves, possibly after the chat changed. The chat is proven again now and the name is
    // read in the same synchronous step, so a thread is never stored with another chat's name.
    void stableProof(threadId).then(now => {
      if (!now?.ok || now.username !== username || now.threadId !== threadId || threadIdFromPath(win.location.pathname) !== threadId) return;
      reportLearned({ username, threadId, value });
    });
  }
  async function stableProof(threadId: string): Promise<ThreadProof | null> {
    const first = proveThread({ doc, readPath: () => win.location.pathname });
    if (!first.ok || first.threadId !== threadId) return null;
    await new Promise(resolve => win.setTimeout(resolve, 500));
    const second = proveThread({ doc, readPath: () => win.location.pathname });
    return proofKey(first) === proofKey(second) && second.ok && second.threadId === threadId ? second : null;
  }
  function reportLearned({ username, threadId, value }: { username: string; threadId: string; value: InstagramContextResponse }): void {
    const displayName = headerDisplayName({ doc, username });
    // §15: a known thread is reported again only to store (or correct) the header's display name for the list badges.
    const known = value.instagram.threadId === threadId && (!displayName || value.instagram.displayName === displayName);
    if (state.context?.username !== username || !value.matches.length || known || account() !== "ok") return;
    const key = `${username}:${threadId}:${displayName ?? ""}`; if (reported.has(key)) return; reported.add(key);
    void deps.api.reportThread({ username, threadId, proof: "header", ...(displayName ? { displayName } : {}) }).then(() => { if (inbox) inbox = { ...inbox, at: 0 }; }, () => { reported.delete(key); });
  }
  /** §15: the learned chats for the list badges, at most once per TTL (a failure waits a minute). */
  function loadInbox(token: string): void {
    if (inbox && inbox.token !== token) inbox = null;
    if (inboxLoad || (inbox && Date.now() - inbox.at < THREADS_TTL_MS)) return;
    inboxLoad = (async () => {
      try {
        // Review H1: a 2xx without the expected shape is an empty list, never a crash.
        const response: unknown = await deps.api.fetchThreads(), list = (response as { threads?: unknown } | null)?.threads;
        inbox = { token, at: Date.now(), threads: Array.isArray(list) ? list.filter(validThread) : [] };
      } catch (cause) { const status = statusFromError(cause); if (status.kind !== "error") state.status = status; /* retried after THREADS_RETRY_MS */ inbox = { token, at: Date.now() - THREADS_TTL_MS + THREADS_RETRY_MS, threads: inbox?.threads ?? [] }; }
      finally { inboxLoad = null; if (onDirect()) safeBadges(true); }
    })();
  }
  /** §15 on `/direct/` pages: badges only with the switch on, a working token and the Hospeda account logged in (the list is that account's). */
  function badges(rescan: boolean): void {
    const token = deps.store.token(), enabled = deps.store.badges();
    if (state.status.kind === "idle" || (state.status.kind === "ok" && Date.now() - statusAt >= STATUS_TTL_MS)) void loadStatus();
    // tick() already read the logged-in account this poll (review L4); a load that finished between polls reads it again.
    if (rescan) state.loggedIn = loggedInUsername({ doc });
    const listFound = !!conversationList({ doc }), connected = !!token && state.status.kind === "ok", expectedAccount = state.status.kind === "ok" ? state.status.value.instagramAccount ?? null : null, accountMatches = accountState(state) === "ok";
    const setDiagnostic = (known = 0, marked = 0) => { badgeDiagnostic = inboxBadgeDiagnostic({ enabled, connected, expectedAccount, accountMatches, listFound, known, marked }); win.console.debug(`[Hospeda] Instagram insignias: ${badgeDiagnostic}`); };
    if (!enabled || !connected || !accountMatches) { setDiagnostic(); removeInboxBadges({ doc }); return; }
    loadInbox(token);
    if (listFound && inbox?.token === token) {
      const marked = applyInboxBadges({ doc, threads: inbox.threads, dark: dark(), ownUsername: state.loggedIn, base: deps.base });
      setDiagnostic(inbox.threads.length, marked);
    } else setDiagnostic(inbox?.token === token ? inbox.threads.length : 0, 0);
  }
  /** Review H1: the badges are an extra; whatever goes wrong there never stops the panel, learning or paste. */
  function safeBadges(rescan: boolean): void {
    try { badges(rescan); } catch (cause) { win.console.debug("[Hospeda] Instagram: list badges skipped.", cause); try { removeInboxBadges({ doc }); } catch { /* nothing left to do */ } }
  }
  async function loadContext(username: string, force = false): Promise<void> {
    const cached = contexts.get(username);
    if (!force && cached && Date.now() - cached.at < CONTEXT_TTL_MS) { state.context = { username, kind: "ok", value: cached.value }; learn(); render(); return; }
    if (!force || state.context?.username !== username) { state.context = { username, kind: "loading" }; render(); }
    try {
      const value = await deps.api.fetchContext(username); contexts.set(username, { at: Date.now(), value });
      if (state.context?.username !== username) return;
      state.context = { username, kind: "ok", value }; learn();
    } catch (cause) {
      if (state.context?.username !== username) return;
      const status = statusFromError(cause); if (status.kind !== "error") state.status = status;
      state.context = { username, kind: "error", message: errorMessage(cause) };
    }
    render();
  }
  /** Loads the business of the chat once the CRM answered and the chat's username is known. */
  function ensureContext(): void {
    const username = chatUsername(state);
    if (username && state.status.kind === "ok" && (!state.context || state.context.username !== username)) void loadContext(username);
  }

  function render(force = false): void {
    if (!state.threadId) return;
    const existing = doc.getElementById(PANEL_ID);
    if (!force && ((isEditing() && existing?.dataset.threadId === state.threadId) || (state.view === "compose" && existing?.dataset.threadId === state.threadId))) return;
    const open = deps.store.isOpen(), isDark = dark(), fingerprint = JSON.stringify([state, open, isDark, deps.store.badges(), badgeDiagnostic]);
    if (!force && fingerprint === lastFingerprint && doc.getElementById(PANEL_ID)) return;
    lastFingerprint = fingerprint;
    const host = renderPanel({ doc, state, open, dark: isDark, theme: deps.store.theme(), badges: deps.store.badges(), badgeDiagnostic, base: deps.base, version: deps.version, actions, mountCompose }); host.dataset.threadId = state.threadId;
  }

  /** Null while the chat is still the one the compose view was opened for; else why not (§4.3 «Pegar en el chat» order). */
  function checkChatFor(threadId: string, username: string): () => string | null {
    return () => {
      const path = win.location.pathname, verdict = proofVerdict({ proof: proveThread({ doc, readPath: () => win.location.pathname }), username, threadId, path });
      const seller = state.sellerConfirmed?.threadId === threadId && state.sellerConfirmed.username === username;
      if (!(verdict === "proven" || (seller && verdict === "inconclusive"))) return CHAT_CHANGED;
      return account() === "ok" ? null : "Estás con otra cuenta de Instagram. Entrá con la de Hospeda para pegar el mensaje.";
    };
  }
  /** Which compose view the business view opened: «Mandar un mensaje» or «Enviar material» (spec 98 §4.1). */
  let composeMode: "template" | "material" = "template";
  function mountCompose(card: HTMLElement, header: (title: string) => HTMLElement): void {
    const match = selectedMatch(state), username = chatUsername(state), threadId = state.threadId;
    if (!match || !username || !threadId) { state.view = "main"; return; }
    openInstagramCompose(card, { doc, api: deps.api, match, username, trusted, checkChat: checkChatFor(threadId, username), composer: () => findPageComposer({ doc }), back: () => { state.view = "main"; render(true); }, header, settle: flow.settle, mode: composeMode });
  }

  /** §4.2 on the chat page: proof, account, paste. An inconclusive proof opens the seller confirmation (decision 12.1). */
  async function pasteFromHandoff(handoff: InstagramHandoff, threadId: string, fromCrm: boolean): Promise<void> {
    await loadStatus();
    const outcome = await pasteOnChatPage({ doc, location: win.location, username: handoff.username, threadId, text: handoff.text, account, ...flow }).catch((): FlowResult => ({ ok: false, reason: "insert-failed", composer: null }));
    if (outcome.ok) { showNotice({ doc, text: PASTED_NOTICE, tone: "success" }); deps.store.setOpen(true); render(true); }
    else if (outcome.reason === "thread-contradicted") {
      // D2: the chat page the CRM stored proves somebody else: forget it, so the next open goes to the profile.
      if (fromCrm && handoff.threadId === threadId) void deps.api.reportThreadStale({ username: handoff.username, threadId }).catch(() => {});
      warn(failureNotice({ reason: outcome.reason, username: handoff.username }), { text: `Abrir el perfil de @${handoff.username}`, href: `https://www.instagram.com/${handoff.username}/` });
    } else if (outcome.reason === "thread-unproven") { state.confirm = { username: handoff.username, threadId }; state.error = ""; confirmHandoff = handoff; deps.store.setOpen(true); render(true); }
    else { outcome.composer?.focus(); warn(failureNotice({ reason: outcome.reason, username: handoff.username })); }
    result(outcome);
  }
  async function runHandoff(nonce: string): Promise<void> {
    // A marker that arrives mid-run starts nothing: its handoff is deleted (single use, never left behind).
    if (running) { deps.store.handoff.clear({ nonce }); return; }
    running = true;
    try {
      const handoff = await pollFor({ find: () => { const value = parseHandoff({ value: deps.store.handoff.read() }); return value?.nonce === nonce ? value : null; }, timeoutMs: deps.handoffWaitMs ?? 3000, intervalMs: flow.intervalMs });
      // Single use: the handoff of this nonce is deleted before anything else, whatever the verdict. Another tab's handoff stays.
      if (handoff) deps.store.handoff.clear({ nonce });
      const verdict = checkHandoff({ handoff, nonce, pathname: win.location.pathname });
      // M3: a stored thread that did not open (redirect to the inbox, a profile or another chat) is forgotten, compare-and-delete.
      if (handoff && handoff.threadId && verdict !== "missing" && verdict !== "nonce" && verdict !== "expired" && threadIdFromPath(win.location.pathname) !== handoff.threadId) void deps.api.reportThreadStale({ username: handoff.username, threadId: handoff.threadId }).catch(() => {});
      if (!handoff || verdict !== "ok") { win.console.debug(`[Hospeda] Instagram: marker not confirmed (${verdict}).`); warn(UNCONFIRMED_NOTICE); result({ ok: false, reason: "unconfirmed" }); return; }
      const thread = threadIdFromPath(win.location.pathname);
      if (thread) { await pasteFromHandoff(handoff, thread, true); return; }
      await loadStatus();
      const opened = await openChatFromProfile({ doc, location: win.location, username: handoff.username, account, ...flow });
      if (opened.ok) { await pasteFromHandoff(handoff, opened.threadId, false); return; }
      // The handoff stays in memory until it expires: a proven chat page for that username still gets the text (a reload loses it).
      if (opened.reason === "floating-no-link") pending = handoff;
      warn(failureNotice({ reason: opened.reason, username: handoff.username })); result(opened);
    } finally { running = false; }
  }

  const actions: PanelActions = {
    trusted,
    toggle: () => { deps.store.setOpen(!deps.store.isOpen()); render(true); },
    view: view => { state.view = view; render(true); },
    select: accountId => { state.selectedId = accountId; render(true); },
    retry: () => { void loadStatus(true).then(() => { const username = chatUsername(state); if (username && state.status.kind === "ok") void loadContext(username, true); }); },
    confirmChat: () => void (async () => {
      const confirm = state.confirm, handoff = confirmHandoff;
      if (!confirm || !handoff || state.busy) return;
      if (handoff.expiresAt <= Date.now() || threadIdFromPath(win.location.pathname) !== confirm.threadId) { state.confirm = null; confirmHandoff = null; warn(failureNotice({ reason: "thread-unproven", username: confirm.username })); render(true); return; }
      state.busy = true; state.error = ""; render(true);
      try {
        if (account() !== "ok") { state.error = "Estás con otra cuenta de Instagram. Entrá con la de Hospeda para pegar el mensaje."; return; }
        const outcome = await pasteOnChatPage({ doc, location: win.location, username: confirm.username, threadId: confirm.threadId, text: handoff.text, account, sellerConfirmed: true, ...flow });
        state.confirm = null; confirmHandoff = null;
        // Stored only once the paste re-checked the chat: a confirmation never survives evidence against the user (H1).
        if (outcome.ok && outcome.proof === "seller") { /* H2: null unless the labelled header link names this user, so no unverified heading is sent */ const displayName = headerDisplayName({ doc, username: confirm.username }); await deps.api.reportThread({ username: confirm.username, threadId: confirm.threadId, proof: "seller", ...(displayName ? { displayName } : {}) }).catch(() => {}); }
        if (outcome.ok) { state.sellerConfirmed = { username: confirm.username, threadId: confirm.threadId, by: state.status.kind === "ok" ? state.status.value.user.displayName : "vos" }; showNotice({ doc, text: PASTED_NOTICE, tone: "success" }); ensureContext(); }
        else { if (outcome.reason === "thread-contradicted") void deps.api.reportThreadStale({ username: confirm.username, threadId: confirm.threadId }).catch(() => {}); outcome.composer?.focus(); warn(failureNotice({ reason: outcome.reason, username: confirm.username })); }
        result(outcome);
      } finally { state.busy = false; render(true); }
    })(),
    rejectChat: () => { const confirm = state.confirm; state.confirm = null; confirmHandoff = null; if (confirm) warn(failureNotice({ reason: "thread-unproven", username: confirm.username })); render(true); },
    compose: () => { if (!selectedMatch(state)) return; composeMode = "template"; state.view = "compose"; render(true); },
    sendMaterial: () => { if (!selectedMatch(state)) return; composeMode = "material"; state.view = "compose"; render(true); },
    setTheme: theme => { deps.store.setTheme(theme); render(true); },
    setBadges: enabled => { deps.store.setBadges(enabled); if (!enabled) removeInboxBadges({ doc }); render(true); },
  };

  function onPathChange(threadId: string | null): void {
    state.threadId = threadId; state.proof = null; state.context = null; state.selectedId = null; state.error = "";
    if (state.view === "compose") state.view = "main";
    if (state.confirm?.threadId !== threadId) { state.confirm = null; confirmHandoff = null; }
  }
  async function tick(): Promise<void> {
    const nonce = consumePasteMarker({ location: win.location, history: win.history });
    if (nonce) void runHandoff(nonce);
    const path = win.location.pathname, threadId = threadIdFromPath(path);
    if (path !== lastPath) { lastPath = path; proofCandidate = ""; proofTicks = 0; onPathChange(threadId); }
    // §4.3 decision 12.3: the panel lives on every chat page and nowhere else (feed, profiles, inbox).
    if (onDirect()) { state.loggedIn = loggedInUsername({ doc }); safeBadges(false); } else removeInboxBadges({ doc });
    if (!threadId) { removePanel({ doc }); return; }
    if (state.status.kind === "idle" || (state.status.kind === "ok" && Date.now() - statusAt >= STATUS_TTL_MS)) void loadStatus();
    const proof = proveThread({ doc, readPath: () => win.location.pathname });
    const key = proofKey(proof);
    if (key !== proofCandidate) { proofCandidate = key; proofTicks = 1; win.clearTimeout(proofTimer); proofTimer = win.setTimeout(() => void tick(), 500); }
    else proofTicks++;
    if (proofTicks >= 2 && proofKey(proof) !== proofKey(state.proof)) state.proof = proof;
    ensureContext();
    if (pending && pending.expiresAt <= Date.now()) pending = null;
    if (pending && !running && proof.ok && proof.username === pending.username) { const handoff = pending; pending = null; running = true; void pasteFromHandoff(handoff, proof.threadId, false).finally(() => { running = false; }); }
    render();
  }

  const timer = win.setInterval(() => void tick(), deps.pollMs ?? 500);
  const onHash = () => void tick();
  win.addEventListener("hashchange", onHash);
  const onVisibility = () => { if (doc.visibilityState !== "visible" || Date.now() - lastVisibleRefresh < 10_000) return; lastVisibleRefresh = Date.now(); const username = chatUsername(state); if (username) void loadContext(username, true); if (onDirect()) safeBadges(true); };
  doc.addEventListener("visibilitychange", onVisibility);
  void tick();
  return { tick, stop: () => { win.clearInterval(timer); win.clearTimeout(proofTimer); win.removeEventListener("hashchange", onHash); doc.removeEventListener("visibilitychange", onVisibility); removeInboxBadges({ doc }); }, state: () => state };
}
