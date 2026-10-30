# Spec 94 — Write the message into Instagram Web with the user script

Status: requested and decided by the owner on 27–28/10/2026. Owner decisions: one script for WhatsApp and Instagram (D1), a one-time handoff instead of a bare marker (D6), and the text travels in the handoff, so the clipboard is never read on Instagram (D7). D2–D5 are recommended defaults. Two independent security reviews shaped sections 2 and 5. Type: a new module in the existing «Hospeda CRM» user script, a CRM → script handoff and CRM copy. No migration, no endpoint, no new permission. It does not change what counts as contact, «No contactar» gating or the echo confirmation of [spec 92](92-instagram-open-chat.md).

Builds on [spec 92](92-instagram-open-chat.md) («Abrir Instagram»: copy synchronously, then open the profile on a computer or `ig.me` on a phone, through `instagramTarget` in `src/helpers/instagramChat.ts`) and on the WhatsApp user script ([spec 84](84-userscript-templates.md)–[86](86-userscript-chat-badges.md), PR #244 for versions and the installed status).

## 1. Problem

- On a computer `ig.me/m/<user>` does not open Instagram Web («Esta página no está disponible»), so «Abrir Instagram» opens the business profile. The seller still has to click «Enviar mensaje», wait for the chat and paste with Ctrl+V. Three manual steps per message, and the paste is the one people forget.
- [Spec 88](88-instagram-direct-webhooks.md) discarded a user script that **read** Instagram's DM inbox to register messages: its HTML is obfuscated and changes often, and the official API registers without it. That reason still holds for reading and registering. This spec does something much smaller: on a profile the CRM itself just opened, press one button found by its accessible name and write the text the CRM prepared. Nothing is read from Instagram and nothing is registered; Meta's echo (spec 92) keeps confirming the send.

## 2. Final behaviour

### 2.1 The handoff and the marker (CRM)

**Inside the click** (spec 92, unchanged): the CRM copies the saved final text synchronously and, on a computer, pre-opens a blank tab, both before any `await`. The clipboard copy stays as the manual fallback.

**After that**, on a computer:
- in the composer, once `dispatch` has recorded the attempt;
- in «Copiar y abrir de nuevo» (composer and «Requiere acción»), right after the click;

the CRM calls `handOffToUserscript({username, text})` (`src/components/InstagramOpenChat.tsx`):

1. It runs only when all of these hold. Otherwise it returns null:
   - this CRM page has the user script at **1.4.0 or later** (the `data-hospeda-userscript` attribute from PR #244);
   - the username is valid;
   - the text is not blank and is at most **4000 characters** (`HANDOFF_TEXT_MAX`). Instagram publishes no limit for its web composer and the CRM does not cap Instagram drafts; 4000 covers every real message.
2. It generates a **nonce**: 128 random bits from `crypto.getRandomValues`, as 32 hex characters.
3. It dispatches the event `hospeda-instagram-handoff` on `document`. Its `detail` is the JSON **string** `{nonce, username, expiresAt: now + 2 min, text}`. A string crosses Tampermonkey's sandbox; objects and `event.source` identity may not. This is the same pattern as `announce.ts`.
4. The script on the CRM page (`listenForInstagramHandoff` in `userscript/src/instagramBridge.ts`):
   - parses and validates the payload with `parseHandoff`;
   - stores it under its own GM key `hospeda-instagram-handoff`, separate from the token; a newer handoff replaces an older one;
   - **acks** by setting `data-hospeda-instagram-ack` to the nonce on `<html>`.
5. The CRM waits up to **300 ms** for that ack:
   - acked: the tab goes to `https://www.instagram.com/<username>/#hospeda=<nonce>` and the toast says the script will write the message;
   - no ack (no script, an older one, a failed bridge): the tab goes to the plain `https://www.instagram.com/<username>/` and the toast asks for a manual paste.

   The CRM never promises an automatic paste that will not happen.

A phone keeps `https://ig.me/m/<username>` with no handoff. If the popup was blocked, there is no handoff: the link offered in the composer opens the plain profile and copies again.

**About the fragment.** A fragment is not sent to Instagram's servers and is not part of its routing, so the profile opens normally for someone without the script. Instagram's own page scripts can still see it in `location.href` before the user script removes it. That is harmless: the nonce is single use and bound to the profile, and the text never appears in the URL. It carries no personal data.

### 2.2 The Instagram module of the user script

The existing «Hospeda CRM» script adds `@match https://www.instagram.com/*`. `main.ts` routes by host with `siteFor` in `userscript/src/site.ts`:
- WhatsApp Web → the WhatsApp module;
- `www.instagram.com` → the Instagram module (`userscript/src/instagram/`);
- any other matched host (the CRM) → the version announcement plus the handoff listener.

On `www.instagram.com` the module:

1. **Is silent without a well-formed marker.** Only `#hospeda=<32 hex>` counts. A bare `#hospeda` or a malformed marker is ignored and left as it is. Without a marker the module reads no storage and injects nothing; it only keeps a `hashchange` listener that repeats this check.
2. **Consumes the marker** at once with `history.replaceState`, keeping the path, query and history state.
3. **Checks the handoff** with `checkHandoff` in `handoff.ts`. It reads **only** the `hospeda-instagram-handoff` key and waits up to 3 s for it to reach this tab, because GM storage syncs between tabs asynchronously. It acts only when:
   - the stored nonce equals the URL nonce;
   - the handoff has not expired;
   - the profile in the path equals the stored username, case-insensitive.

   A handoff with this nonce is deleted first, whatever the verdict. The delete is **compare-and-delete**: only the handoff of this nonce, so a tab never wipes a newer handoff from a second «Abrir Instagram».
4. **With a well-formed marker but no valid handoff** (missing, expired, for another profile, or superseded by a newer «Abrir Instagram»), it shows a fixed, neutral notice: «No pude confirmar que lo abrió el CRM: tocá "Enviar mensaje" y pegá el mensaje (Ctrl+V).» It does nothing else: no click and no read.
5. **Runs once.** A flag blocks a second run while one is in progress. With the marker consumed and the handoff deleted, a re-render, an SPA navigation or a repeated `hashchange` cannot start another run.
6. **Always clicks the profile's «Enviar mensaje» / «Message».** An already open chat is never reused.
   - It looks only inside the profile header (`main header`), and prefers `button` / `[role="button"]` over links. So a story highlight or a post titled «Mensaje» cannot match.
   - It skips hidden elements: `hidden`, `aria-hidden="true"`, `inert`, `display:none` or `visibility:hidden`, on the element or an ancestor.
   - It compares the normalized accessible name (`aria-label`, else `aria-labelledby`, else the text) to exactly `enviar mensaje`, `message` or `mensaje`. Never class names.
   - It waits up to **15 s** for the button. Right before the click it re-checks that the path is still the verified profile.
7. **Writes only into the thread that click opened.**
   - The only proof is the URL: after the click the page must move from the profile to `/direct/t/<id>/`. Then only the page's own composer counts.
   - **Floating mini-chats are never used**, whatever their label says. A label or header match would let a group («target y amigos»), a similar username («target_fan», «target.x») or a message reading «@target» pass.
   - It waits up to **15 s**. If the page moves anywhere else in the meantime (another profile, the feed), it aborts.
   - Without that proof it writes nothing and shows a notice.
   - The composer is an editable element whose normalized label is in `COMPOSER_LABELS` (`mensaje`, `message`, `escribe un mensaje`, …).
8. **Never writes into a composer that already has text.**
9. **Inserts the handoff text** (D3, D7): first a synthetic `paste` event whose `clipboardData` is a `DataTransfer` with `text/plain`, which Lexical handles like a real paste, line breaks included. If the composer is still empty, `document.execCommand('insertText', false, text)`. If the paste left other content, there is no second attempt (it would duplicate). Success means the composer text **equals** the handoff text, whitespace ignored.
10. **Never reads the clipboard** and **never sends.** No key event at all, so no Enter, no click on «Enviar» / «Send», no form submit. A short notice says «Mensaje pegado. Revisalo y envialo vos.»

### 2.3 Notices

The page is left usable: nothing is removed and nothing is typed. A notice appears at the bottom for 8 s, with a close button, in Spanish. «Ctrl+V» reads «⌘V» on macOS. When a composer was found, it gets the focus.

| Case | Notice |
| --- | --- |
| Marker without a valid handoff | «No pude confirmar que lo abrió el CRM: tocá "Enviar mensaje" y pegá el mensaje (Ctrl+V).» |
| No «Enviar mensaje» in the header within 15 s | «No encontré el botón "Enviar mensaje". Abrí el chat y pegá el mensaje con Ctrl+V.» |
| The page moved to another profile or page | «Cambiaste de página antes de que se abriera el chat, así que no pegué nada. Pegá el mensaje con Ctrl+V.» |
| No composer within 15 s | «No se abrió el chat a tiempo. Cuando se abra, pegá el mensaje con Ctrl+V.» |
| A composer exists but the thread was not proven (no `/direct/t/`, or only a floating chat) | «No pude confirmar que el chat abierto sea el de este perfil, así que no pegué nada. Pegá el mensaje con Ctrl+V.» |
| The composer already had text | «El chat ya tenía texto escrito, así que no pegué nada. Si hace falta, pegá el mensaje con Ctrl+V.» |
| Neither insertion worked | «No pude pegar el mensaje: pegalo con Ctrl+V.» |

The notice is built with DOM APIs and inline style properties inside a shadow root (no `innerHTML`, no `<style>`), so Instagram's CSP and Trusted Types do not block it.

### 2.4 Isolation inside the shared script (D1)

Isolation is **by code, not by capability**: `@grant` applies to every `@match`, so the GM functions exist on instagram.com too. The Instagram module:

- reads only the handoff key, through a `HandoffStore` built in `main.ts` (`gmHandoffStore`). It never reads the token, the session or any other GM value, and its only write is a compare-and-delete of that key;
- never calls `GM_xmlhttpRequest`, the CRM API or `api.ts`, and never reads the clipboard;
- runs no WhatsApp logic;
- imports nothing outside `userscript/src/instagram/`. The only module-level `GM_getValue` in `main.ts` moved inside the WhatsApp start.

`userscript/src/instagramIsolation.spec.ts` covers this:
- it loads `main.ts` at `https://www.instagram.com/…` with `GM_*` spies and a spied `api.ts`;
- without a marker, nothing is read, requested or injected;
- a full authorized paste reads only the handoff key, writes only `null` to it and never calls `readText`;
- a static check rejects imports from outside the folder, dynamic `import(`, side-effect imports, any `GM_*`, `unsafeWindow`, `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `new Image`, `navigator.clipboard` / `readText`, `eval`, `new Function`, web storage and cookies.

### 2.5 Versions and distribution (D4)

- Same file and same `@updateURL` / `@downloadURL` (`/userscripts/hospeda-crm.user.js`), version **1.4.0**. `@description` covers both sites. `scripts/verify-userscript-build.mjs` also checks the Instagram `@match`.
- These keep working unchanged: Tampermonkey's update check, the WhatsApp update prompt, the «En este navegador» status and each token's last reported version. The Instagram module makes no request, so it neither reports a version nor shows an update prompt.
- **On the next update Tampermonkey asks once to approve the new site** (`www.instagram.com`). Until the seller accepts, the script keeps working on WhatsApp and does nothing on Instagram. **There is no clipboard permission prompt.**

### 2.6 CRM copy

- **Toast after «Abrir Instagram» on a computer** (copied, tab opened):
  - acked handoff: «Mensaje copiado. El script de Hospeda abre el chat y lo pega: revisalo y envialo vos.»
  - otherwise: «Mensaje copiado. En el perfil tocá «Enviar mensaje» y pegalo (Ctrl+V). Con el user script de Hospeda se pega solo.»
  - Phone, popup blocked and copy failure keep their texts.
- **User script page** (`/userscript`): same route and name. It mentions Instagram from 1.4.0 and the one-time site approval. «Cómo se usa» says the script writes the prepared message in that profile's chat without asking for the clipboard, and never sends.
- **User guide:** the article «Pegar el mensaje en Instagram con el script» covers:
  - what the script does, and that there is no clipboard prompt (Firefox works the same);
  - that it only writes in the chat opened from that profile, never in a floating chat;
  - the 4000-character cap;
  - what to do when a notice appears.

  `docs/guia-de-uso.md` is regenerated.

## 3. Rules that do not change

- Opening Instagram, writing the text or clicking «Enviar mensaje» is not evidence of a send, contact, reply or acceptance. The attempt stays `instagram_opened` until Meta's echo or the seller's answer (spec 92).
- The script never sends a message, never presses Enter, never clicks Send.
- No new endpoint, token scope or permission. Server-side permission and «No contactar» checks still run on `dispatch` before anything opens.
- The mobile flow and the copy-before-open order (M3 of spec 92) are unchanged.

## 4. Scope and non-goals

- In scope: the handoff and marker (2.1), the Instagram module (2.2–2.4), the version bump and metadata (2.5), the CRM copy (2.6), fixtures, tests and docs.
- Not in scope:
  - reading or registering Instagram messages from the page;
  - sending, scheduling or retrying;
  - phones and tablets;
  - Instagram's floating mini-chats;
  - other networks, or a person's own Instagram;
  - an update prompt inside Instagram.

## 5. Security

**Threats and mitigations.**
- **A forged link.** Any site can link to `instagram.com/<attacker>/#hospeda`. A bare or malformed marker does nothing. A well-formed one needs a stored handoff with the same random nonce for the same profile, so it only gets the neutral notice.
- **Leaking the clipboard (H1).** Reading the clipboard on instagram.com would grant that origin a permission every Instagram script could then use. So the module never reads it: the CRM hands over the text itself.
- **The wrong recipient (M2).** The script always clicks the verified profile's header button and only writes into the page composer after the move to `/direct/t/<id>/`. A floating chat, even one labelled or messaged with the target's name, a group or a similar username, is never used. Moving to another profile aborts.
- **Replay and races (L7).** A handoff is single use, valid for 2 minutes and deleted compare-and-delete. With two quick opens, the second supersedes the first: the first tab shows the neutral notice and does not touch the second tab's handoff.
- **A sandbox-dependent bridge (M1).** The handoff is a JSON string event plus an attribute ack, with no object identity. Without an ack the CRM falls back to the plain profile.

**Tradeoff accepted (D7).** The prepared text sits for up to 2 minutes in Tampermonkey's storage. That storage belongs to the script and web pages cannot read it. It is deleted on use. If no Instagram tab consumes it, the script on the CRM page (never the Instagram module) deletes it by nonce once the 2 minutes plus a 5-second margin pass, and deletes any expired one when it starts.

**Residual risk.**
- A malicious script running in the CRM's own origin could dispatch a handoff, but that already implies control of the CRM.
- Instagram's own scripts can see the nonce in the URL before it is removed. It is useless to them: single use, bound to the profile, and it carries no text.

## 6. Risks

- **Fragile DOM.** The finders depend on accessible names, roles, the profile header and the `/direct/t/` route. If Instagram stops navigating to `/direct/t/` (for example, if it opens a floating chat instead), the script shows a notice and the seller pastes by hand. The fixtures under `userscript/fixtures/instagram-*.html` model the accessible structure (no live capture).
- **The fragment.** The script runs at `document-idle`. If Instagram ever dropped the fragment before that, the script would not run (manual paste). Then move the capture to `document-start`.
- **Handoff timing.** The CRM waits 300 ms for the ack; the Instagram tab waits 3 s for GM storage. A miss means a manual paste, never a wrong one.
- **Terms of use.** Instagram's terms prohibit automated access. The script only clicks one button and writes text in the seller's own session, at the seller's request, and never sends, reads or collects anything. The risk is low but not zero.
- **Desktop only.**

## 7. Acceptance

- `instagramTarget` returns `https://www.instagram.com/<user>/#hospeda=<nonce>` only with a valid nonce, the plain profile otherwise, and `ig.me` on a phone.
- CRM side:
  - `handOffToUserscript` returns null without the script, with one older than 1.4.0, with an invalid username, with a text over 4000 characters, or without an ack;
  - with an ack it returns a fresh nonce and dispatches a JSON string;
  - the composer opens `#hospeda=<nonce>` and shows the script toast only after the ack, and the plain profile otherwise;
  - «Copiar y abrir de nuevo» pre-opens the tab inside the click and hands off again.
- Instagram module, against the fixtures:
  - no marker or a bare `#hospeda`: silent;
  - wrong, superseded, expired, wrong-profile, reused or missing handoff: only the neutral notice;
  - a valid handoff: deleted first, writes once;
  - always clicks; the header-only button finder ignores highlights and post links;
  - writes only into the page composer after `/direct/t/`;
  - never writes into a floating chat (messages reading «@target», a group label, `target_fan`, `target.x`, several names, even the exact template);
  - aborts on navigation;
  - exact text equality, paste then `insertText`, never a key event or a Send click, never the clipboard;
  - a composer with text is left alone;
  - two quick opens behave as in section 5.
- Bridge and isolation tests as in 2.4.
- `tests/browser/instagram-open-chat.e2e.ts` (no script in that browser) still expects the plain profile URL.
- The built script contains `@match https://www.instagram.com/*` and `@version 1.4.0`.

## 8. Decisions

- **D1. One script, not two (owner, 28/10/2026).** Instagram is a module of «Hospeda CRM», routed by host and isolated as in 2.4.
- **D2. Marker in the fragment (default):** `#hospeda=<nonce>`.
- **D3. Paste event first, `insertText` as fallback (default).** Never a key event.
- **D4. No version reporting from Instagram (default).** The shared script already reports through WhatsApp and announces itself on the CRM page.
- **D5. Timeouts (default):** 15 s for the button and for the composer, 3 s for the handoff to reach the tab, 300 ms for the ack, 2 min of validity.
- **D6. One-time handoff instead of a bare marker (owner, 28/10/2026, security review).** See section 5.
- **D7. The text travels in the handoff; the clipboard is never read on Instagram (owner, 28/10/2026, second review).** Tradeoff: the text stays up to 2 minutes (cleaned up by the CRM-side script if unused) in Tampermonkey's per-script storage. The clipboard copy stays as the manual fallback.
