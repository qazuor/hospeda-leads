import { findComposers, findMessageButton, findThreadComposer, isThreadPath } from "./finders";
import { composerEmpty, focusComposer, insertIntoComposer } from "./insert";
import { profileUsername } from "./handoff";

/**
 * Spec 94 §2.2: the paste flow as a small state machine. Each phase either moves forward or ends in `failed` with a reason that maps to
 * one notice (§2.3). It never sends: the last phase is `done`, right after the handoff text is in the composer of the thread it opened.
 */
export type FlowPhase = "finding-button" | "waiting-composer" | "inserting" | "done" | "failed";
export type FlowFailure = "no-button" | "navigated-away" | "composer-timeout" | "thread-unverified" | "composer-busy" | "insert-failed";
export type FlowResult = { readonly ok: true } | { readonly ok: false; readonly reason: FlowFailure; readonly composer: HTMLElement | null };

/** Allowed transitions; `advance` refuses anything else, so a bug cannot skip from the button to inserting. */
export const FLOW_TRANSITIONS: Readonly<Record<FlowPhase, readonly FlowPhase[]>> = {
  "finding-button": ["waiting-composer", "failed"],
  "waiting-composer": ["inserting", "failed"],
  inserting: ["done", "failed"],
  done: [],
  failed: [],
};

/** Default waits (D5). */
export const BUTTON_TIMEOUT_MS = 15_000, COMPOSER_TIMEOUT_MS = 15_000, POLL_INTERVAL_MS = 200;

/** Polls `find` until it returns a value or `timeoutMs` passes. Polling (not an observer) keeps it independent of how Instagram re-renders. */
export function pollFor<T>({ find, timeoutMs, intervalMs = POLL_INTERVAL_MS }: { find: () => T | null; timeoutMs: number; intervalMs?: number }): Promise<T | null> {
  return new Promise(resolve => {
    const startedAt = Date.now();
    const tick = () => { const found = find(); if (found) return resolve(found); if (Date.now() - startedAt >= timeoutMs) return resolve(null); setTimeout(tick, intervalMs); };
    tick();
  });
}

export type FlowDeps = {
  readonly doc: Document;
  /** The live location (Instagram is a SPA: the path changes without a reload). */
  readonly location: Pick<Location, "pathname">;
  /** The verified profile username of the handoff: the click and the paste are bound to it. */
  readonly username: string;
  /** The handoff text (the saved final message). */
  readonly text: string;
  readonly settle?: () => Promise<void>;
  readonly buttonTimeoutMs?: number;
  readonly composerTimeoutMs?: number;
  readonly intervalMs?: number;
  readonly onPhase?: (phase: FlowPhase) => void;
};

const defaultSettle = () => new Promise<void>(resolve => setTimeout(resolve, 60));
const ABORT = Symbol("navigated-away");

/**
 * Runs the flow once: click the profile's «Enviar mensaje» (always: an already open chat is never reused), wait for the composer of the
 * thread that click opened for `username`, insert `text` if the composer is empty. Aborts if the page moves to another profile.
 */
export async function runPasteFlow({ doc, location, username, text, settle = defaultSettle, buttonTimeoutMs = BUTTON_TIMEOUT_MS, composerTimeoutMs = COMPOSER_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS, onPhase }: FlowDeps): Promise<FlowResult> {
  let phase: FlowPhase = "finding-button";
  const advance = (next: FlowPhase) => { if (!FLOW_TRANSITIONS[phase].includes(next)) throw new Error(`Invalid transition ${phase} → ${next}`); phase = next; onPhase?.(next); };
  const fail = (reason: FlowFailure, composer: HTMLElement | null = null): FlowResult => { advance("failed"); return { ok: false, reason, composer }; };
  const onProfile = () => profileUsername(location) === username;
  onPhase?.(phase);
  const button = await pollFor<HTMLElement | typeof ABORT>({ find: () => (!onProfile() ? ABORT : findMessageButton({ doc })), timeoutMs: buttonTimeoutMs, intervalMs });
  if (button === ABORT) return fail("navigated-away");
  if (!button) return fail("no-button");
  // Re-checked right before the click: the button must be the one of the verified profile.
  if (!onProfile()) return fail("navigated-away");
  const startPath = location.pathname;
  button.click();
  advance("waiting-composer");
  const composer = await pollFor<HTMLElement | typeof ABORT>({
    find: () => {
      const path = location.pathname;
      // Still on the profile, or in a thread: keep waiting. Anywhere else (another profile, the feed) the seller moved on.
      if (path !== startPath && !isThreadPath(path)) return ABORT;
      return findThreadComposer({ doc, pathname: path, startPath, username });
    },
    timeoutMs: composerTimeoutMs, intervalMs,
  });
  if (composer === ABORT) return fail("navigated-away");
  if (!composer) return findComposers({ doc }).length ? fail("thread-unverified") : fail("composer-timeout");
  if (!composerEmpty(composer)) return fail("composer-busy", composer);
  advance("inserting");
  focusComposer(composer);
  const inserted = await insertIntoComposer({ composer, text, settle });
  if (!inserted.ok) return fail("insert-failed", composer);
  advance("done");
  return { ok: true };
}
