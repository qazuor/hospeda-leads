import type { ChatMessage } from "./selectors";
import { registerBatch, type RegisterResult } from "./api";

const CACHE_KEY = "hospeda-userscript-external-ids";
const CACHE_LIMIT = 1500;
export function messageFingerprint(title: string, messages: { externalId: string }[]): string { return `${title}:${messages[0]?.externalId || ""}:${messages.at(-1)?.externalId || ""}:${messages.length}`; }
export function getCachedIds(): string[] { return GM_getValue<string[]>(CACHE_KEY, []); }
export function filterCached(messages: ChatMessage[], cached = getCachedIds()): ChatMessage[] { const ids = new Set(cached); return messages.filter(message => !ids.has(message.externalId)); }
export function batches<T>(items: T[], size = 50): T[][] { const result: T[][] = []; for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size)); return result; }
export function mergeResults(cached: string[], results: RegisterResult[]): string[] { return [...new Set([...cached, ...results.filter(result => result.status !== "rejected").map(result => result.externalId)])].slice(-CACHE_LIMIT); }
export function summarizeResults(results: RegisterResult[]): string { const created = results.filter(item => item.status === "created").length; const duplicate = results.filter(item => item.status === "duplicate").length; const rejected = results.filter(item => item.status === "rejected").length; return `${created} registrados · ${duplicate} ya estaban · ${rejected} rechazados`; }

export class RegisterController {
  private submitting = false;
  constructor(private readonly base: string, private readonly token: string) {}
  async submit(accountId: string, chat: { title: string; phone: string | null }, selected: ChatMessage[]): Promise<RegisterResult[]> {
    if (this.submitting) throw new Error("Ya hay un registro en curso.");
    if (!selected.length) return [];
    this.submitting = true;
    try {
      const result: RegisterResult[] = [];
      for (const batch of batches(selected, 50)) {
        const response = await registerBatch(this.base, this.token, { accountId, chat, messages: batch });
        result.push(...response.results);
        GM_setValue(CACHE_KEY, mergeResults(getCachedIds(), response.results));
      }
      if (result.some(item => item.status === "created" || item.status === "duplicate")) GM_setValue("hospeda-userscript-last-register", new Date().toISOString());
      return result;
    } finally { this.submitting = false; }
  }
  get isSubmitting(): boolean { return this.submitting; }
}
