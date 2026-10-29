import { HANDOFF_STORAGE_KEY, type HandoffStore } from "../instagram/handoff";

/**
 * Spec 97 §5.4: the only GM values the script touches on instagram.com. The token is read (never written: it is only set from the CRM's
 * «Conectar este navegador» or WhatsApp Web), the one-time handoff is read and compare-and-deleted, and the panel keeps its own open state and theme.
 */
export const TOKEN_KEY = "hospeda-userscript-token", OPEN_KEY = "hospeda-instagram-open", THEME_KEY = "hospeda-instagram-theme";
export const INSTAGRAM_GM_KEYS: readonly string[] = [TOKEN_KEY, HANDOFF_STORAGE_KEY, OPEN_KEY, THEME_KEY];

export type PanelTheme = "auto" | "light" | "dark";
export type InstagramStore = {
  readonly token: () => string;
  readonly handoff: HandoffStore;
  readonly isOpen: () => boolean;
  readonly setOpen: (open: boolean) => void;
  readonly theme: () => PanelTheme;
  readonly setTheme: (theme: PanelTheme) => void;
};

/** The GM-backed store. Nothing else on instagram.com reads or writes GM storage. */
export function gmInstagramStore(): InstagramStore {
  return {
    token: () => GM_getValue<string>(TOKEN_KEY, ""),
    handoff: {
      read: () => GM_getValue<unknown>(HANDOFF_STORAGE_KEY, null),
      // Compare-and-delete: a tab only removes the handoff of its own nonce, never a newer one another «Abrir Instagram» stored.
      clear: ({ nonce }) => { const current = GM_getValue<{ nonce?: unknown } | null>(HANDOFF_STORAGE_KEY, null); if (current?.nonce === nonce) GM_setValue(HANDOFF_STORAGE_KEY, null); },
    },
    isOpen: () => GM_getValue<boolean>(OPEN_KEY, true),
    setOpen: open => GM_setValue(OPEN_KEY, open),
    theme: () => { const value = GM_getValue<string>(THEME_KEY, "auto"); return value === "light" || value === "dark" ? value : "auto"; },
    setTheme: theme => GM_setValue(THEME_KEY, theme),
  };
}
