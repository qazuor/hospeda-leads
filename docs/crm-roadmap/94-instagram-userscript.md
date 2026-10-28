# Spec 94 — Paste the message into Instagram Web with the user script

Status: requested and decided by the owner on 27–28/10/2026: one script for WhatsApp and Instagram (D1) and a one-time handoff instead of a bare marker after a security review (D6). The marker, insertion, version and timeout defaults (D2–D5) are recommended defaults. Type: a new module in the existing «Hospeda CRM» user script, a CRM → script handoff and CRM copy. No migration, no endpoint, no new permission. It does not change what counts as contact, «No contactar» gating or the echo confirmation of [spec 92](92-instagram-open-chat.md).

Builds on [spec 92](92-instagram-open-chat.md) («Abrir Instagram»: copy synchronously, then open the profile on a computer or `ig.me` on a phone, through `instagramTarget` in `src/helpers/instagramChat.ts`) and on the WhatsApp user script ([spec 84](84-userscript-templates.md)–[86](86-userscript-chat-badges.md), PR #244 for versions and the installed status).

## 1. Problem

- On a computer `ig.me/m/<user>` does not open Instagram Web («Esta página no está disponible»), so «Abrir Instagram» opens the business profile. The seller still has to click «Enviar mensaje», wait for the chat and paste with Ctrl+V. Three manual steps per message, and the paste is the one people forget.
- [Spec 88](88-instagram-direct-webhooks.md) discarded a user script that **read** Instagram's DM inbox to register messages: its HTML is obfuscated and changes often, and the official API registers without it. That reason still holds for reading and registering. This spec does something much smaller: on a profile the CRM itself just opened, press one button found by its accessible name and paste the text the CRM already copied. Nothing is read from Instagram and nothing is registered; Meta's echo (spec 92) keeps confirming the send.

## 2. Final behaviour

### 2.1 The handoff and the marker (CRM)

On a computer, inside the «Abrir Instagram» click (and in «Copiar y abrir de nuevo», composer and «Requiere acción»), right after the synchronous copy and before the tab opens, the CRM calls `handOffToUserscript({username, text})` (`src/components/InstagramOpenChat.tsx`):

1. It runs only when this CRM page has the user script at **1.4.0 or later** (the `data-hospeda-userscript` attribute the script sets on every CRM page since PR #244) and Web Crypto is available. Otherwise it returns null.
2. It generates a **nonce**: 128 random bits from `crypto.getRandomValues`, as 32 hex characters.
3. It posts `{type:'hospeda-instagram-handoff', nonce, username, expiresAt: now + 2 min, textHash}` with `window.postMessage(…, location.origin)`. `textHash` is the first 16 hex characters of SHA-256 over the prepared text with line endings normalized and surrounding blanks trimmed. The script on the CRM page accepts the message only when `event.source === window` and `event.origin === location.origin`, validates every field, and stores it under its own GM key `hospeda-instagram-handoff`, separate from the token.
4. The URL becomes `https://www.instagram.com/<username>/#hospeda=<nonce>` (`instagramTarget({username, mobile:false, nonce})`).

Without a handoff (no script, an older script, a phone, no Web Crypto) the CRM opens the plain `https://www.instagram.com/<username>/`, exactly as before, and the toast says to paste by hand (2.6). A phone keeps `https://ig.me/m/<username>`.

The fragment never reaches Instagram's servers and is not part of its routing, so the profile opens normally for someone without the script. It carries no personal data or text: the username is already in the path and the message is only in the clipboard. The popup-blocked link reuses the same nonce (still single use and valid for two minutes) and copies again on click.

### 2.2 The Instagram module of the user script

The existing «Hospeda CRM» script adds `@match https://www.instagram.com/*`. `main.ts` routes by host (`siteFor` in `userscript/src/site.ts`): WhatsApp Web → the WhatsApp module, `www.instagram.com` → the Instagram module (`userscript/src/instagram/`), any other matched host (the CRM) → the version announcement plus the handoff listener (`userscript/src/instagramBridge.ts`).

On `www.instagram.com` the module:

1. **Does nothing without a well-formed marker.** Only `#hospeda=<32 hex>` counts; a bare `#hospeda` or anything else is ignored and left as is. Without it the module reads no storage, injects nothing and observes nothing; it only keeps a `hashchange` listener that repeats the same check.
2. **Consumes the marker** at once with `history.replaceState` (same path, query and history state, no fragment), so a reload, Back or Instagram's re-render never sees it again.
3. **Checks the handoff** (`checkHandoff` in `handoff.ts`), reading **only** the `hospeda-instagram-handoff` key, and waiting up to 3 s for it to reach this tab (GM storage syncs between tabs asynchronously). It acts only when:
   - the stored nonce equals the URL nonce;
   - it has not expired;
   - the profile in the path (`/<user>/`) equals the stored username, case-insensitive.

   A handoff with the matching nonce is **deleted before anything else**, whatever the verdict, so it is single use. A handoff with another nonce is left alone (a foreign link must not cancel a real pending open). On any failed check the module does nothing at all: no click, no clipboard read, no notice, only a `console.debug` line.
4. **Runs once.** A flag blocks a second run while one is in progress; with the marker consumed and the handoff deleted, a re-render, an SPA navigation or a repeated `hashchange` cannot start another.
5. **Finds and clicks «Enviar mensaje» / «Message»** on the profile. It looks at `button`, `[role="button"]` and `a` elements inside `main` (the whole document when there is no `main`), skips anything hidden (`hidden`, `aria-hidden="true"`, `inert`, `display:none`, `visibility:hidden`, on the element or an ancestor), and compares the accessible name (`aria-label`, else `aria-labelledby`, else the text), normalized (lowercase, no accents, collapsed spaces), to exactly `enviar mensaje`, `message` or `mensaje`. Never class names or generated ids. «Mensajes» / «Messages» in the left navigation do not match. It waits up to **15 s**. If the chat is already open, it skips the click.
6. **Waits for the DM composer** up to **15 s**: an editable element (`[contenteditable="true"]`, `[role="textbox"]` or `textarea`), visible as above, whose label (`aria-label`, `aria-placeholder`, `placeholder` or `aria-labelledby`), normalized and without a trailing «…»/«...», is `mensaje`, `message`, `escribe un mensaje`, `escribí un mensaje`, `envía un mensaje`, `write a message` or `send a message` (`COMPOSER_LABELS` in `finders.ts`). The search box never matches.
7. **Never pastes into a composer that already has text.** It shows the notice and stops (2.3).
8. **Focuses the composer and reads the clipboard** with `navigator.clipboard.readText()`. Chrome and Edge ask once per site.
9. **Pastes only the CRM message.** The clipboard text must hash to the handoff's `textHash`; otherwise the notice «El portapapeles cambió: pegá el mensaje con Ctrl+V.» and nothing is pasted. This also covers a seller who copied something else in between.
10. **Inserts the text** (D3): a synthetic `paste` event whose `clipboardData` is a `DataTransfer` with `text/plain` (Instagram's Lexical editor handles it like a real paste, line breaks included). If the composer is still empty afterwards, `document.execCommand('insertText', false, text)`. If the paste left other content, there is no second attempt (it would duplicate). Success means the composer text equals the clipboard text, whitespace ignored.
11. **Stops there. It never sends:** no `Enter` or any other key event, no click on «Enviar» / «Send», no form submit. A short notice says «Mensaje pegado. Revisalo y envialo vos.»

### 2.3 When something fails (after an authorized handoff)

The page is left usable (nothing removed, nothing typed) and a notice appears at the bottom for 8 s, with a close button, in Spanish. `Ctrl+V` reads `⌘V` on macOS. When a composer was found, it gets the focus so the seller can paste right away.

| Case | Notice |
| --- | --- |
| No «Enviar mensaje» within 15 s (own profile, logged out, a layout change) | «No encontré el botón "Enviar mensaje". Abrí el chat y pegá el mensaje con Ctrl+V.» |
| The composer did not appear within 15 s | «No se abrió el chat a tiempo. Cuando se abra, pegá el mensaje con Ctrl+V.» |
| The composer already had text | «El chat ya tenía texto escrito, así que no pegué nada. Si hace falta, pegá el mensaje con Ctrl+V.» |
| Clipboard denied, unavailable, or the tab lost focus | «No pude leer el portapapeles. Pegá el mensaje con Ctrl+V.» |
| Clipboard empty | «El portapapeles está vacío. Copiá el mensaje desde el CRM y pegalo con Ctrl+V.» |
| Clipboard is not the CRM message | «El portapapeles cambió: pegá el mensaje con Ctrl+V.» |
| Neither insertion worked | «No pude pegar el mensaje: pegalo con Ctrl+V.» |

The notice is built with DOM APIs and inline style properties inside a shadow root (no `innerHTML`, no `<style>` element), so Instagram's Content-Security-Policy and Trusted Types do not block it.

### 2.4 Isolation inside the shared script (D1)

The Instagram module:

- reads only the handoff key, through a `HandoffStore` that `main.ts` builds (`gmHandoffStore`): it never reads the token, the session or any other GM value, and only writes `null` to that key;
- never calls `GM_xmlhttpRequest`, the CRM API or `api.ts`;
- runs no WhatsApp logic (no panel, badges, auto-registration, update prompt or menu commands);
- imports nothing outside `userscript/src/instagram/`. The only module-level `GM_getValue` in `main.ts` (the auto-registration preference) moved inside the WhatsApp start.

`userscript/src/instagramIsolation.spec.ts` loads `main.ts` with the page at `https://www.instagram.com/…`, `GM_*` spies and a spied `api.ts`: without a marker nothing is read, requested or injected; a full authorized paste reads only the handoff key and writes only `null` to it. A static check rejects imports from outside the folder and any `GM_*`, `fetch` or `XMLHttpRequest` in its sources.

### 2.5 Versions and distribution (D4)

- Same file, same `@updateURL` / `@downloadURL` (`/userscripts/hospeda-crm.user.js`), version **1.4.0**. `@description` covers both sites. `scripts/verify-userscript-build.mjs` also checks the Instagram `@match`.
- The existing mechanisms keep working unchanged: Tampermonkey's update check, the WhatsApp update prompt, the «En este navegador» status on the CRM page and each token's last reported version. The Instagram module makes no request, so it neither reports a version nor shows an update prompt on Instagram.
- **On the next update Tampermonkey asks once to approve the new site** (`www.instagram.com`). Until the seller accepts, the script keeps working on WhatsApp and does nothing on Instagram.

### 2.6 CRM copy

- **Toast after «Abrir Instagram» on a computer** (copied, tab opened):
  - with a handoff: «Mensaje copiado. El script de Hospeda abre el chat y lo pega: revisalo y envialo vos.»
  - without one: «Mensaje copiado. En el perfil tocá «Enviar mensaje» y pegalo (Ctrl+V). Con el user script de Hospeda se pega solo.»
  - Phone, popup blocked and copy failure keep their texts.
- **User script page** (`/userscript`): same route and name. The status panel says the script also pastes on Instagram from 1.4.0; «Cómo se usa» gets an Instagram note. A script older than 1.4.0 already shows «Desactualizado».
- **User guide:** a new article «Pegar el mensaje en Instagram con el script» in «Registrar mensajes de WhatsApp»: what it does, the one-time site approval, the one-time clipboard permission, that it never sends, and what to do when a notice appears. `docs/guia-de-uso.md` is regenerated.

## 3. Rules that do not change

- Opening Instagram, pasting or clicking «Enviar mensaje» is not evidence of a send, contact, reply or acceptance. The attempt stays `instagram_opened` until Meta's echo or the seller's answer (spec 92).
- The script never sends a message, never presses Enter, never clicks Send.
- No new endpoint, token scope or permission. Server-side permission and «No contactar» checks still run on `dispatch` before anything opens.
- The mobile flow and the copy-before-open order (M3 of spec 92) are unchanged.

## 4. Scope and non-goals

- In scope: the handoff and marker (2.1), the Instagram module (2.2–2.4), the version bump and metadata (2.5), the CRM copy (2.6), fixtures, tests and docs.
- Not in scope:
  - reading or registering Instagram messages from the page (spec 88's reason stands; the echo already does it);
  - sending, scheduling or retrying messages;
  - phones and tablets;
  - Instagram's inbox without a handoff, other networks, a person's own Instagram;
  - an update prompt inside Instagram (it would need a request to the CRM).

## 5. Security

**Threat.** With a bare marker, any website could link to `https://www.instagram.com/<attacker>/#hospeda`. The script would open a DM with the attacker's profile and paste whatever the seller had copied: a password, a client's data, a sales-material link. It would not send, but the text would sit in the composer one Enter away.

**Mitigation (D6).**
- **Only the CRM can authorize a paste.** The nonce is random (128 bits), lives only in the URL the CRM opens and in the script's GM storage, and is handed over through a same-window, same-origin `postMessage` on the CRM page. Another site can neither read it nor write the handoff key (GM storage is per script, and the listener rejects other origins and frames).
- **Single use, short-lived, bound to the profile.** The handoff expires after two minutes, is deleted as soon as a URL with its nonce is seen, and only works on the profile the CRM opened.
- **Only the CRM's text is pasted.** The clipboard must hash to the prepared text, so a password copied in between is never pasted.
- **Never over existing text, never sent.** A non-empty composer is left alone; there is no code path that sends.
- **Residual risk.** A malicious page in the same CRM origin could post a handoff, but that already implies control of the CRM. Someone who reads the seller's screen within two minutes could reuse a nonce only for the same profile and the same text, which is what the seller asked for.

## 6. Risks

- **Fragile DOM.** The finders depend on accessible names and roles, which change less than class names but can change. Any failure falls back to today's manual paste, with a notice. Fixtures under `userscript/fixtures/instagram-*.html` model the accessible structure (no live capture); when Instagram changes, update them and the name lists.
- **The fragment.** The script runs at `document-idle`. If Instagram ever dropped the fragment before that, the script would simply not run (manual paste). Then move the marker capture to `document-start` (D2 alternative).
- **Handoff timing.** GM storage reaches the Instagram tab asynchronously; the module waits up to 3 s. A missed handoff means a manual paste, never a wrong one.
- **Terms of use.** Instagram's terms prohibit automated access. The script only clicks one button and pastes in the seller's own logged-in session, at the seller's request, and never sends, reads or collects anything. The risk is low but not zero; an account warning would be the signal to remove the Instagram match.
- **Clipboard.** Chrome and Edge ask once per site and then allow `readText`. Firefox only allows it from a user gesture with its own «Pegar» prompt, so there the script usually shows the clipboard notice and the seller pastes.
- **Desktop only.**

## 7. Acceptance

- `instagramTarget` returns `https://www.instagram.com/<user>/#hospeda=<nonce>` only with a valid nonce, the plain profile otherwise, and `https://ig.me/m/<user>` on a phone. Unit tests.
- CRM: `handOffToUserscript` returns null without the script or with one older than 1.4.0; with it, it returns a fresh nonce and posts `{type, nonce, username, expiresAt, textHash}` to `location.origin`. The composer opens `#hospeda=<nonce>` and shows the script toast; without the script it opens the plain profile. Unit/component tests.
- The Instagram module, against HTML fixtures modelled on the profile and DM markup (Spanish and English):
  - no marker, a bare `#hospeda`, a wrong nonce, no handoff, an expired nonce, another profile's username and a reused nonce all do nothing (no click, no clipboard read, no notice);
  - a valid handoff is deleted first and pastes once, also with repeated `hashchange` events and with a handoff that arrives a moment late;
  - clicks the profile button by accessible name and ignores «Mensajes», hidden copies and the search box;
  - pastes with the paste event, falls back to `insertText`, never dispatches a key event and never clicks Send;
  - leaves a composer with text untouched, and does not paste a clipboard that does not hash to the prepared text;
  - shows the right notice for each failure in 2.3.
- The CRM-page listener stores only same-window, same-origin, well-formed handoffs.
- Isolation tests as in 2.4.
- `tests/browser/instagram-open-chat.e2e.ts` (no script in that browser) still expects the plain profile URL.
- The built script contains `@match https://www.instagram.com/*` and `@version 1.4.0`.

## 8. Decisions

- **D1. One script, not two (owner, 28/10/2026).** Sellers install and update a single «Hospeda CRM» script; Instagram is a module routed by host, isolated as in 2.4. Discarded: a second `hospeda-instagram.user.js` with its own install, version and status.
- **D2. Marker in the fragment (default).** `#hospeda=<nonce>`: never sent to Instagram, invisible to its routing. Alternative: a query parameter (reaches Instagram's servers and could be stripped or logged).
- **D3. Paste event first, `insertText` as fallback (default).** The paste path is what Lexical treats as a real paste and keeps line breaks; `insertText` is the widely supported fallback. Never a key event, so there is no path to Enter.
- **D4. No version reporting from Instagram (default).** The module makes no request. The shared script already reports through WhatsApp and announces itself on the CRM page, and Tampermonkey updates it from `@updateURL`.
- **D5. 15 s for the button and for the composer, 3 s for the handoff, 2 min of validity (default).**
- **D6. One-time handoff instead of a bare marker (owner, 28/10/2026, after a security review).** See section 5. A bare `#hospeda` authorizes nothing.
