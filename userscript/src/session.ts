const TTL = 12 * 60 * 60 * 1000;
type SessionLink = { accountId: string; savedAt: number };
type ValueStore = { get<T>(key: string, fallback: T): T; set<T>(key: string, value: T): void };
const gmStore: ValueStore = { get: (key, fallback) => GM_getValue(key, fallback), set: (key, value) => GM_setValue(key, value) };
export function rememberOpenedAccount(search: string, storage: ValueStore = gmStore): void {
  const params = new URLSearchParams(search);
  const phone = params.get("phone"), accountId = params.get("accountId") || params.get("account_id");
  if (!phone || !accountId) return;
  const value = readLinks(storage);
  value[phone.replace(/\D/g, "")] = { accountId, savedAt: Date.now() };
  storage.set("hospeda-userscript-links", value);
}
function readLinks(storage: ValueStore): Record<string, SessionLink> {
  try { const all = storage.get<Record<string, SessionLink>>("hospeda-userscript-links", {}); return Object.fromEntries(Object.entries(all).filter(([, item]) => Date.now() - item.savedAt < TTL)); } catch { return {}; }
}
export function recalledAccount(phone: string | null, storage: ValueStore = gmStore): string | null {
  if (!phone) return null;
  return readLinks(storage)[phone.replace(/\D/g, "")]?.accountId || null;
}
