import { createSpotlight } from '@mantine/spotlight';
import { toast } from 'sonner';

export const [commandStore, commandPalette] = createSpotlight();
let opener: HTMLElement | null = null;
let openedFromTrigger = false;

export function restoreCommandFocus() {
  const previous = opener, fromTrigger = openedFromTrigger;
  const closingDialog = document.activeElement?.closest('[role="dialog"]');
  let timeout: number | undefined;
  const observer = new MutationObserver(restore);
  function restore() {
    if (closingDialog?.isConnected && closingDialog.getClientRects().length > 0) return;
    observer.disconnect();
    window.clearTimeout(timeout);
    window.setTimeout(() => {
      if (commandStore.getState().opened || document.activeElement !== document.body || hasActiveOverlay()) return;
      // Changing theme may replace the header node; use its visible equivalent.
      const target = fromTrigger
        ? [...document.querySelectorAll<HTMLElement>('[data-command-trigger]')].find(element => element.getClientRects().length > 0)
        : previous?.isConnected ? previous : null;
      target?.focus({ preventScroll: true });
    }, 10);
  }
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
  timeout = window.setTimeout(() => { observer.disconnect(); }, 2000);
  restore();
}

export function hasActiveOverlay(): boolean {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"]')]
    .some(element => element.getClientRects().length > 0);
}

/** Do not replace an editor/modal or bypass existing unsaved-change guards. */
export function openCommandPalette() {
  if (commandStore.getState().opened || hasActiveOverlay()) return;
  if (document.querySelector('[data-unsaved="true"]')) {
    toast.info('Guardá o descartá los cambios antes de abrir los accesos rápidos.');
    return;
  }
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  openedFromTrigger = !!opener?.matches('[data-command-trigger]');
  commandPalette.open();
}
