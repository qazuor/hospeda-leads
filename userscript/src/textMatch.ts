/** Below this word overlap the sent text is a different message, not an edited version of the prepared one. */
export const SENT_MATCH_THRESHOLD = 0.5;

const words = (text: string) => new Set(text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 1));

/** Whether `text` has at least one word that the overlap can compare (Instagram requires it: an empty prepared text never matches). */
export function hasComparableWords(text: string | null | undefined): boolean {
  return words(text || "").size > 0;
}

/**
 * Whether a sent WhatsApp is the prepared message, possibly edited (another greeting, a line added): the Dice overlap of their words.
 * Shared by the CRM register, which only completes a «WhatsApp abierto» attempt with a matching text, and the panel notice that announces it.
 * An attempt without a prepared text cannot be compared and keeps matching by phone and time, as before.
 */
export function sentMatchesPrepared(prepared: string | null | undefined, sent: string): boolean {
  const a = words(prepared || ""), b = words(sent);
  if (!a.size) return true;
  if (!b.size) return false;
  let shared = 0; for (const word of a) if (b.has(word)) shared++;
  return (2 * shared) / (a.size + b.size) >= SENT_MATCH_THRESHOLD;
}
