# Spec 94 — Paste the message into Instagram Web with the user script

Status: requested and decided by the owner on 27–28/10/2026 (one script for WhatsApp and Instagram, D1; the marker, insertion and version defaults below, D2–D5). Type: a new module in the existing «Hospeda CRM» user script, a marker on the desktop profile URL and CRM copy. No migration, no endpoint, no new permission. It does not change what counts as contact, «No contactar» gating or the echo confirmation of [spec 92](92-instagram-open-chat.md).

Builds on [spec 92](92-instagram-open-chat.md) («Abrir Instagram»: copy synchronously, then open the profile on a computer or `ig.me` on a phone, through `instagramTarget` in `src/helpers/instagramChat.ts`) and on the WhatsApp user script ([spec 84](84-userscript-templates.md)–[86](86-userscript-chat-badges.md), PR #244 for versions and the installed status).

## 1. Problem

- On a computer `ig.me/m/<user>` does not open Instagram Web («Esta página no está disponible»), so «Abrir Instagram» opens the business profile. The seller still has to click «Enviar mensaje», wait for the chat and paste with Ctrl+V. Three manual steps per message, and the paste is the one people forget.
- [Spec 88](88-instagram-direct-webhooks.md) discarded a user script that **read** Instagram's DM inbox to register messages: its HTML is obfuscated and changes often, and the official API registers without it. That reason still holds for reading and registering. This spec does something much smaller: on a profile the CRM itself opened, press one button found by its accessible name and paste the text the CRM already copied. Nothing is read from Instagram and nothing is registered; Meta's echo (spec 92) keeps confirming the send.

## 2. Final behaviour

### 2.1 The marker (CRM)

- On a computer, `instagramTarget({username, mobile:false})` returns `https://www.instagram.com/<username>/#hospeda`. The fragment is the marker (D2).
  - A fragment never reaches Instagram's servers and is not part of the route, so the profile opens exactly as before for someone without the script.
  - It carries no personal data and no text: only the constant `hospeda`. The username is already in the path, the message is only in the clipboard.
  - `instagramProfileUrl` keeps returning the plain profile URL; only the «Abrir Instagram» target carries the marker. The constant lives in `userscript/src/instagram/marker.ts` and the CRM imports it, as it already imports the script version.
- Every desktop path that opens Instagram after copying gets it: «Abrir Instagram», «Copiar y abrir de nuevo» (composer and «Requiere acción») and the link shown when the popup was blocked (which copies on click).
- On a phone (`(pointer: coarse)`) the target stays `https://ig.me/m/<username>` with no marker.

### 2.2 The Instagram module of the user script

The existing «Hospeda CRM» script adds `@match https://www.instagram.com/*`. `main.ts` routes by host: WhatsApp Web → the WhatsApp module, `www.instagram.com` → the Instagram module, the CRM origin → the installed-version announcement.

On `www.instagram.com` the module:

1. **Checks the marker and does nothing else without it.** When `location.hash` is exactly `#hospeda`, it removes it at once with `history.replaceState` (same path and query, no fragment), so a reload, Back or Instagram's own re-render never sees it again. Without the marker it injects nothing, observes nothing and reads nothing. It also listens to `hashchange` so a marker that arrives without a page load (same tab, same document) runs too.
2. **Runs once per marker.** A module flag blocks a second run while one is in progress, and the marker is consumed before the run starts. A re-render, an SPA navigation or a second `hashchange` without a new marker does nothing.
3. **Finds and clicks «Enviar mensaje» / «Message»** on the profile. It looks at `button`, `[role="button"]` and `a` elements inside `main` (the whole document when there is no `main`), skips anything hidden (`hidden`, `aria-hidden="true"`, `inert`, or with an ancestor that is), and compares the accessible name (`aria-label`, else `aria-labelledby`, else the visible text), normalized (lowercase, collapsed spaces, no accents) to exactly `enviar mensaje`, `message` or `mensaje`. Never class names or generated ids. «Mensajes» / «Messages» (the left navigation) do not match. It waits up to **15 s** for the button (the profile renders after load).
4. **Waits for the DM composer** up to **15 s**: an editable element (`[contenteditable="true"]`, `[role="textbox"]` or `textarea`), visible as above, whose accessible label (`aria-label`, `aria-placeholder`, `placeholder` or `aria-labelledby`), normalized and without a trailing «…»/«...», is `mensaje`, `message`, `escribe un mensaje`, `escribí un mensaje` or `write a message`. The search box («Buscar» / «Search») never matches.
5. **Stops if the composer already has text** (a draft Instagram kept): nothing is pasted, so nothing is mixed (notice in 2.3).
6. **Focuses the composer and reads the clipboard** with `navigator.clipboard.readText()`. The browser asks for permission the first time («www.instagram.com quiere ver el texto y las imágenes copiados en el portapapeles»); the seller accepts once.
7. **Inserts the text** (D3): first a synthetic `paste` event whose `clipboardData` is a `DataTransfer` holding `text/plain`; Instagram's editor (Lexical) handles it like a real paste, line breaks included. If, after the editor updates, the composer does not contain the text and is still empty, it falls back to `document.execCommand('insertText', false, text)`. If the composer has some other content after the paste, there is no second attempt (it would duplicate). The result is checked by comparing the composer text with the clipboard text (whitespace collapsed).
8. **Stops there. It never sends:** it dispatches no `Enter` or other key event, never clicks «Enviar» / «Send», and never submits a form. The seller reviews and sends. A short notice confirms: «Mensaje pegado. Revisalo y envialo vos.»

### 2.3 When something fails

The page is left as it is (usable, nothing removed, nothing typed) and a small notice appears at the bottom of the page for 8 seconds, with a close button, in Spanish. `Ctrl+V` reads `⌘V` on macOS. When a composer was found, it is focused so the paste goes straight in.

| Case | Notice |
| --- | --- |
| No «Enviar mensaje» button within 15 s (own profile, logged out, layout change, a profile without the button) | «No encontré el botón "Enviar mensaje". Abrí el chat y pegá el mensaje con Ctrl+V.» |
| The composer did not appear within 15 s | «No se abrió el chat a tiempo. Cuando se abra, pegá el mensaje con Ctrl+V.» |
| The composer already had text | «El chat ya tenía texto escrito, así que no pegué nada. Si hace falta, pegá el mensaje con Ctrl+V.» |
| Clipboard permission denied, unavailable, or the tab lost focus | «No pude leer el portapapeles. Pegá el mensaje con Ctrl+V.» |
| Clipboard empty | «El portapapeles está vacío. Copiá el mensaje desde el CRM y pegalo con Ctrl+V.» |
| Neither insertion worked | «No pude pegar el mensaje: pegalo con Ctrl+V.» |

The notice is built with DOM APIs and inline style properties inside a shadow root (no `innerHTML`, no `<style>` element), so Instagram's Content-Security-Policy and Trusted Types do not block it.

### 2.4 Isolation inside the shared script (D1)

The Instagram module:

- never reads the CRM token or any other `GM_getValue` key, and never writes GM storage;
- never calls `GM_xmlhttpRequest`, the CRM API or `api.ts`;
- runs no WhatsApp logic (no panel, no badges, no auto-registration, no update prompt, no menu commands);
- imports nothing from the WhatsApp modules. The only module-level `GM_getValue` call in `main.ts` (the auto-registration preference) moves inside the WhatsApp start, so loading the script on Instagram touches no GM storage.

A unit test runs the Instagram start with `GM_*` stubs that fail the test when called and with `api.ts` mocked, and asserts none of them is used; another asserts that the Instagram sources import nothing but each other.

### 2.5 Versions and distribution (D4)

- Same file, same `@updateURL` / `@downloadURL` (`/userscripts/hospeda-crm.user.js`), version **1.4.0**. `@description` covers both sites.
- The existing mechanisms keep working unchanged: Tampermonkey's update check, the WhatsApp update prompt (from `latestVersion`, which is the bundled version), the «En este navegador» status on the CRM page and the token's last reported version. The Instagram module makes no request, so it neither reports its version nor shows an update prompt on Instagram.
- **On the next update Tampermonkey asks once to approve the new site** (`www.instagram.com`). Until the seller accepts, the script keeps working on WhatsApp and does nothing on Instagram.

### 2.6 CRM copy

- **Toast after «Abrir Instagram» on a computer** (copied, popup opened):
  - script ≥ 1.4.0 detected on this CRM page (the attribute of PR #244): «Mensaje copiado. El script de Hospeda abre el chat y lo pega: revisalo y envialo vos.»
  - otherwise the current text plus a hint: «Mensaje copiado. En el perfil tocá «Enviar mensaje» y pegalo (Ctrl+V). Con el user script de Hospeda se pega solo.»
  - Phone, popup blocked and copy failure keep their texts.
- **User script page** (`/userscript`): the page keeps its route and name. The status panel adds the line «También pega en Instagram el mensaje que copia el CRM (versión 1.4.0 o posterior).», and «Cómo se usa» gets an «En Instagram» note. An installed script older than 1.4.0 is already shown as «Desactualizado» by the existing comparison.
- **User guide:** a new article in «Registrar mensajes de WhatsApp» («Pegar el mensaje en Instagram con el script»): what it does, the one-time site approval, the one-time clipboard permission, that it never sends, and what to do when a notice appears. `docs/guia-de-uso.md` is regenerated.

## 3. Rules that do not change

- Opening Instagram, pasting or clicking «Enviar mensaje» is not evidence of a send, contact, reply or acceptance. The attempt stays `instagram_opened` until Meta's echo or the seller's answer (spec 92).
- The script never sends a message, never presses Enter, never clicks Send.
- No new endpoint, token scope or permission. Server-side permission and «No contactar» checks still run on `dispatch` before anything opens.
- The mobile flow (`ig.me` link-button) and the copy-before-open order (M3 of spec 92) are unchanged.

## 4. Scope and non-goals

- In scope: the marker (2.1), the Instagram module with its finders, state machine and notice (2.2–2.4), the version bump and metadata (2.5), the CRM copy (2.6), fixtures and tests, docs.
- Not in scope:
  - reading or registering Instagram messages from the page (spec 88's reason stands; the echo already does it);
  - sending, scheduling or retrying messages;
  - phones and tablets (Tampermonkey on mobile is not a supported setup, and the app opens instead);
  - other networks, Instagram's `/direct/inbox/` without the marker, or a person's own Instagram;
  - an update prompt inside Instagram (it would need a request to the CRM).

## 5. Risks

- **Fragile DOM.** The finders depend on accessible names and roles, which change less than class names but can change. Any failure falls back to today's manual paste, with a notice. Fixtures under `userscript/fixtures/instagram-*.html` model the accessible structure (no live capture); when Instagram changes, update them and the name lists.
- **The fragment.** The script runs at `document-idle`. If Instagram ever dropped the fragment before that, the script would simply not run (manual paste). If it happens, move the marker capture to `document-start` (D2 alternative).
- **Terms of use.** Instagram's terms prohibit automated access. The script only clicks one button and pastes in the seller's own logged-in session, at the seller's request, and never sends, reads or collects anything. The risk is low but not zero; an account warning would be the signal to remove the Instagram match.
- **Clipboard.** Chrome and Edge ask once per site and then allow `readText`. Firefox only allows it from a user gesture with its own «Pegar» prompt, so there the script usually falls back to the notice. If the clipboard changed between the CRM and Instagram, the pasted text is whatever was copied last: it is visible and not sent.
- **Desktop only.**

## 6. Acceptance

- `instagramTarget` returns `https://www.instagram.com/<user>/#hospeda` on a computer and `https://ig.me/m/<user>` on a phone; invalid usernames still return null. Unit tests.
- The Instagram module, against HTML fixtures modelled on the profile and DM markup (Spanish and English):
  - ignores a page without the marker (no DOM change, no listeners beyond `hashchange`);
  - consumes the marker with `replaceState` and runs once, also with two `hashchange` events;
  - clicks the profile button by accessible name and ignores «Mensajes», hidden copies and the search box;
  - pastes into the composer with the paste event, falls back to `insertText`, never dispatches Enter and never clicks Send;
  - shows the right notice for: no button, composer timeout, existing text, clipboard denied, empty clipboard, insertion failed;
  - never touches `GM_*` storage or network helpers nor `api.ts`.
- `main.ts` routing: Instagram host → Instagram module only.
- The CRM toast mentions the script only when the announced version supports Instagram. Component or unit test.
- `tests/browser/instagram-open-chat.e2e.ts` expects `https://www.instagram.com/<user>/#hospeda`.
- The built script contains `@match https://www.instagram.com/*` and `@version 1.4.0` (`scripts/verify-userscript-build.mjs`).
- Optional local check: the built script injected into a local page that mimics profile → DM pastes the copied text and does not send. Screenshots.

## 7. Decisions

- **D1. One script, not two (owner, 28/10/2026).** Sellers install and update a single «Hospeda CRM» script; Instagram is a module routed by host, isolated as in 2.4. Alternative discarded: a second `hospeda-instagram.user.js` with its own install, version and status. It doubled installs and the status UI for a small feature.
- **D2. Marker `#hospeda` in the fragment (default).** Never sent to Instagram, invisible to its routing, constant. Alternatives: a query parameter (reaches Instagram's servers and could be stripped or logged), a longer or versioned fragment (YAGNI until the format needs to change).
- **D3. Paste event first, `insertText` as fallback (default).** The paste path is what Lexical treats as a real paste and keeps line breaks; `insertText` is the widely supported fallback. Never a key event, so there is no path to Enter.
- **D4. No version reporting from Instagram (default).** The module makes no request, so it cannot report like the WhatsApp module does with its token. The shared script already reports through WhatsApp and announces itself on the CRM page, and Tampermonkey updates it from `@updateURL`, so no new mechanism is needed.
- **D5. Timeouts of 15 s for the button and for the composer (default).** Long enough for a slow profile load, short enough that the notice still makes sense.
