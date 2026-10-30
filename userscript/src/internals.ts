import { normalizePhone } from "./parse";

type Wid = { _serialized?: string; user?: string };
export type InternalChatModel = { id?: Wid; contact?: { id?: Wid; phoneNumber?: Wid } };
type Fiber = { return?: Fiber | null; memoizedProps?: { chat?: InternalChatModel } | null };
export type InternalChat = { phone: string | null; group: boolean };

const serialized = (wid: Wid | undefined) => wid?._serialized || "";

/** Phone and group flag of a WhatsApp chat model. Chats keyed by `@lid` expose the real number only on `contact.phoneNumber`. */
export function fromChatModel(chat: InternalChatModel): InternalChat {
  const id = serialized(chat.id) || serialized(chat.contact?.id);
  if (/@g\.us$/i.test(id)) return { phone: null, group: true };
  const number = chat.contact?.phoneNumber, raw = number?.user || serialized(number).split("@")[0] || (/@c\.us$/i.test(id) ? id.split("@")[0] : "");
  return { phone: normalizePhone(raw), group: false };
}

/**
 * Last-resort, read-only lookup of the open chat in WhatsApp Web's private React state, used only when neither the saved name
 * (`· H123`) nor the visible title identifies the business. It reads the `chat` prop from the header's fiber ancestors and never
 * calls WhatsApp code. Private internals change without notice: any failure returns null and the banner stays "Sin asociar".
 */
export function internalChat(header: Element | null): InternalChat | null {
  try {
    if (!header) return null;
    const node = header as unknown as Record<string, unknown>;
    const key = Object.keys(node).find(name => name.startsWith("__reactFiber$"));
    let fiber = key ? (node[key] as Fiber | undefined) : undefined;
    for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return ?? undefined) {
      const chat = fiber.memoizedProps?.chat;
      if (chat && typeof chat === "object") return fromChatModel(chat);
    }
    return null;
  } catch {
    return null;
  }
}

/** The page's own header node: expando properties such as the React fiber are only visible through `unsafeWindow`. */
export function pageHeader(): Element | null {
  const pageDocument = typeof unsafeWindow !== "undefined" ? unsafeWindow.document : document;
  return pageDocument.querySelector("#main header");
}
