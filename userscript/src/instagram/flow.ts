import { findComposer, findMessageButton } from "./finders";
import { composerEmpty, focusComposer, insertIntoComposer } from "./insert";
import { textHash } from "./handoff";

/**
 * Spec 94 §2.2: the paste flow as a small state machine. Each phase either moves forward or ends in `failed` with a reason that maps to
 * one notice (§2.3). It never sends: the last phase is `done`, right after the text is in the composer.
 */
export type FlowPhase = "finding-button" | "waiting-composer" | "reading-clipboard" | "inserting" | "done" | "failed";
export type FlowFailure = "no-button" | "composer-timeout" | "composer-busy" | "clipboard-denied" | "clipboard-empty" | "clipboard-changed" | "insert-failed";
export type FlowResult = { readonly ok: true } | { readonly ok: false; readonly reason: FlowFailure; readonly composer: HTMLElement | null };

/** Allowed transitions; `advance` refuses anything else, so a bug cannot skip from the button to inserting. */
export const FLOW_TRANSITIONS: Readonly<Record<FlowPhase, readonly FlowPhase[]>> = {
  "finding-button": ["waiting-composer", "failed"],
  "waiting-composer": ["reading-clipboard", "failed"],
  "reading-clipboard": ["inserting", "failed"],
  inserting: ["done", "failed"],
  done: [],
  failed: [],
};

/** Default waits (D5). */
export const BUTTON_TIMEOUT_MS = 15_000, COMPOSER_TIMEOUT_MS = 15_000, POLL_INTERVAL_MS = 200;

/** Polls `find` until it returns an element or `timeoutMs` passes. Polling (not an observer) keeps it independent of how Instagram re-renders. */
export function pollFor<T>({ find, timeoutMs, intervalMs = POLL_INTERVAL_MS }: { find: () => T | null; timeoutMs: number; intervalMs?: number }): Promise<T | null> {
  return new Promise(resolve => {
    const startedAt = Date.now();
    const tick = () => { const found = find(); if (found) return resolve(found); if (Date.now() - startedAt >= timeoutMs) return resolve(null); setTimeout(tick, intervalMs); };
    tick();
  });
}

export type FlowDeps = {
  readonly doc: Document;
  /** `navigator.clipboard.readText` in the browser. */
  readonly readClipboard: () => Promise<string>;
  /** `textHash` of the prepared message, from the handoff: the clipboard is pasted only when it still holds that text. */
  readonly expectedTextHash: string;
  readonly settle?: () => Promise<void>;
  readonly buttonTimeoutMs?: number;
  readonly composerTimeoutMs?: number;
  readonly intervalMs?: number;
  readonly onPhase?: (phase: FlowPhase) => void;
};

const defaultSettle = () => new Promise<void>(resolve => setTimeout(resolve, 60));

/** Runs the flow once: click «Enviar mensaje», wait for the composer, read the clipboard, check it is the CRM message, insert. */
export async function runPasteFlow({ doc, readClipboard, expectedTextHash, settle = defaultSettle, buttonTimeoutMs = BUTTON_TIMEOUT_MS, composerTimeoutMs = COMPOSER_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS, onPhase }: FlowDeps): Promise<FlowResult> {
  let phase: FlowPhase = "finding-button";
  const advance = (next: FlowPhase) => { if (!FLOW_TRANSITIONS[phase].includes(next)) throw new Error(`Invalid transition ${phase} → ${next}`); phase = next; onPhase?.(next); };
  const fail = (reason: FlowFailure, composer: HTMLElement | null = null): FlowResult => { advance("failed"); return { ok: false, reason, composer }; };
  onPhase?.(phase);
  // A chat that is already open (e.g. Instagram restored it) needs no click.
  let composer = findComposer({ doc });
  if (!composer) {
    const button = await pollFor({ find: () => findMessageButton({ doc }), timeoutMs: buttonTimeoutMs, intervalMs });
    if (!button) return fail("no-button");
    button.click();
  }
  advance("waiting-composer");
  composer ??= await pollFor({ find: () => findComposer({ doc }), timeoutMs: composerTimeoutMs, intervalMs });
  if (!composer) return fail("composer-timeout");
  if (!composerEmpty(composer)) return fail("composer-busy", composer);
  advance("reading-clipboard");
  focusComposer(composer);
  let text: string;
  try { text = await readClipboard(); } catch { return fail("clipboard-denied", composer); }
  if (!text.trim()) return fail("clipboard-empty", composer);
  // The seller may have copied something else since the CRM did: never paste that (it could be a password or a client's data).
  let hash = "";
  try { hash = await textHash({ text }); } catch { /* treated as a mismatch */ }
  if (hash !== expectedTextHash) return fail("clipboard-changed", composer);
  advance("inserting");
  const inserted = await insertIntoComposer({ composer, text, settle });
  if (!inserted.ok) return fail("insert-failed", composer);
  advance("done");
  return { ok: true };
}
