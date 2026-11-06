import { samePhone } from "../../src/helpers/phoneIdentity";
export type WhatsappAccountState = "unconfigured" | "unknown" | "ok" | "mismatch";
export function whatsappAccountState({ expected, loggedIn }: { expected: readonly string[] | string | null | undefined; loggedIn: string | null | undefined }): WhatsappAccountState {
  const accounts = Array.isArray(expected) ? expected : expected ? [expected] : [];
  if (!accounts.length) return "unconfigured";
  if (!loggedIn) return "unknown";
  return accounts.some(phone => samePhone({ a: phone, b: loggedIn })) ? "ok" : "mismatch";
}
export function loggedInWhatsappPhone(storage: Pick<Storage, "getItem">): string | null {
  try {
    const raw = storage.getItem("last-wid-md");
    if (!raw) return null;
    let value: unknown = raw;
    try { value = JSON.parse(raw) as unknown; } catch { /* WhatsApp may store the value without JSON quotes. */ }
    if (typeof value !== "string") return null;
    const match = /^\s*(\+?\d{8,})(?::\d+)?(?:@[^\s]+)?\s*$/.exec(value);
    return match?.[1]?.replace(/\D/g, "") ?? null;
  } catch { return null; }
}
