const MAX_NEXT_LENGTH = 2000;
const AUTH_PATHS = ["/login", "/forgot-password", "/reset-password", "/register"];

/** Returns `next` only when it is a same-origin internal path that is safe to redirect to after login, otherwise null. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (typeof next !== "string" || next.length === 0 || next.length > MAX_NEXT_LENGTH) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return null;
  try {
    const base = window.location.origin, url = new URL(next, base);
    if (url.origin !== base) return null;
    if (AUTH_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p + "/"))) return null;
    const out = url.pathname + url.search + url.hash;
    return out.startsWith("//") || out.startsWith("/\\") ? null : out;
  } catch { return null; }
}

/** Builds the `/login` URL carrying the current location as `next` (plain `/login` for a bare root). */
export function loginUrlWithNext({ pathname, search = "", hash = "" }: { pathname: string; search?: string; hash?: string }): string {
  const target = pathname + search + hash;
  return target === "/" || !target ? "/login" : `/login?next=${encodeURIComponent(target)}`;
}
