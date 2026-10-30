# Spec 97 — Instagram chat page: open the thread and a Hospeda panel to paste templates

Status: **closed** — merged into `staging` through PR #285 (29/10/2026). Deployed to production on 2026-10-30 (auto-deploy on the staging → main merge, PR #288). Implemented on `feat/instagram-chat-panel-97` (see §13). Requested by the owner on 29/10/2026 and approved as a new spec that lifts the isolation of [spec 94](94-instagram-userscript.md) §2.4. The proposal in section 4 was agreed in principle with the owner; section 12 lists the forks still open. Type: one migration (`053`), extensions of existing user script endpoints, a CRM change in where «Abrir Instagram» lands, and user script **1.6.0** with a panel on Instagram's chat page. No new permission. It does not change what counts as contact, «No contactar» gating or the echo confirmation of [spec 92](92-instagram-open-chat.md).

Builds on [spec 88](88-instagram-direct-webhooks.md) (Meta's webhook registers Instagram messages and echoes), [spec 92](92-instagram-open-chat.md) («Abrir Instagram», `instagram_opened`, echo confirmation), [spec 94](94-instagram-userscript.md) (Instagram module, one-time handoff, user script 1.4.0) and [spec 96](96-contact-three-clicks.md) (connected script, desktop gate on the latest version, 1.5.x). **Specs 94 and 96 are not merged yet** (`docs/pendientes.md`): this spec assumes both land in `staging` first.

## 1. Problem

- **The spec 94 flow broke.** It opens the profile with `#hospeda=<nonce>`, clicks «Enviar mensaje» and waits for the page to move to `/direct/t/<id>/` (`runPasteFlow` in `userscript/src/instagram/flow.ts`). Instagram now opens a small **floating chat** over the profile instead of navigating. The URL never changes, the flow ends in `thread-unverified` or `composer-timeout`, and the seller sees «No pude confirmar que el chat abierto sea el de este perfil…» / «No se abrió el chat a tiempo…». By spec 94's own rule (M2) the script never pastes into a floating chat, so nothing is pasted. Observed by the owner on 29/10/2026; spec 94 §6 had listed exactly this as a risk.
- **The landing page is the wrong one.** Even when it worked, «Abrir Instagram» on a computer lands on the profile and needs a click. The owner wants it to land on the chat page itself, `https://www.instagram.com/direct/t/<threadId>/` (for example, test user `qaz.uor` → `/direct/t/17848251833510164/`).
- **On Instagram the script is invisible.** On WhatsApp Web the seller sees the script running, the recognized business, and can pick a template and paste it without leaving the chat. On Instagram there is nothing: no status, no business, no templates. Every Instagram message has to start in the CRM.

Instagram Web does not expose a URL that opens a chat by username (`ig.me/m/<user>` fails on the web, spec 92), so the thread id has to be **learned**.

## 2. Goals and non-goals

### Goals

1. «Abrir Instagram» on a computer lands on the chat page `/direct/t/<threadId>/` whenever the CRM knows the thread of that username.
2. The CRM learns the thread id from the seller's own browsing: when the script is on a chat page whose other participant is **proven** to be `@username` of a CRM business, it reports `{username, threadId}`.
3. A Hospeda panel on the chat page, built with the WhatsApp panel's patterns: script status (installed, connected, user, version), the recognized business, its templates, «Pegar en el chat» into Instagram's composer, never sending.
4. The CRM → Instagram handoff (nonce, single use, text) keeps working and lands on the chat page.
5. When the thread is unknown, the seller still gets the text pasted with at most one extra click (section 4.2), and the thread is learned on the way.

### Non-goals

- **Sending.** The script never sends: no Enter, no key event, no click on «Enviar» / «Send», no form submit. Unchanged from specs 84 and 94.
- **Registering messages from the script.** On Instagram the script registers nothing: no «Registrar mensajes», no auto-registration, no reading of the conversation. Verified: [spec 88](88-instagram-direct-webhooks.md) §5 and `docs/decisiones.md` («Instagram Direct por la API oficial de Meta», 26/10/2026) record that Meta's webhook (`GET/POST /_api/inbound/instagram`, `src/endpoints/inboundInstagram.ts`, routed in `src/server/app.ts`) stores every incoming message (`crm_inbound_messages`, «Por revisar») and every Hospeda echo (`crm_messages`, `manual_sent`), and spec 92 confirms the opened attempt with the echo. Caveat: this only works while the Meta integration is configured and its token valid (`instagramComposerFlags` in `src/helpers/instagramEcho.ts` reports `instagramAutoConfirm=false` otherwise); the script does not fill that gap.
- Reading message contents, the inbox list or any thread other than the open one.
- Instagram's mobile web and the apps; phones keep `ig.me` (spec 92).
- Sales material on Instagram (unless decision 12.5 says otherwise).
- Changing templates, their policy or the CRM composer beyond the landing URL.
- Accessibility-only work (deferred by the owner).

## 3. User stories

**US1 — Land on the chat.** As a seller on a computer, when I click «Abrir Instagram de @cabanas_del_rio» and the CRM knows that chat, Instagram opens on the chat page and the script pastes the message.

```gherkin
Scenario: known thread, script connected
  Given the business has perfil_instagram "cabanas_del_rio"
  And the CRM has a verified thread "17848251833510164" for "cabanas_del_rio" seen from the Hospeda account
  And user script 1.6.0 is installed, connected and acks the handoff
  When I click «Abrir Instagram de @cabanas_del_rio» in the composer
  Then the attempt is recorded as instagram_opened (spec 92, unchanged)
  And the new tab opens https://www.instagram.com/direct/t/17848251833510164/#hospeda=<nonce>
  And the script proves the thread is with @cabanas_del_rio before touching the composer
  And it pastes the text into the empty composer and shows «Mensaje pegado. Revisalo y envialo vos.»
  And nothing is sent

Scenario: known thread, no ack
  Given the same thread is known
  And the script does not ack within 300 ms
  When I click «Abrir Instagram de @cabanas_del_rio»
  Then the tab opens https://www.instagram.com/direct/t/17848251833510164/ without a fragment
  And the toast asks me to paste with Ctrl+V
```

**US2 — Unknown thread.** As a seller, when the CRM does not know the chat yet, I still get the message pasted with at most one extra click, and the next time it lands on the chat.

```gherkin
Scenario: unknown thread, Instagram opens a floating chat
  Given no thread is stored for "cabanas_del_rio"
  When I click «Abrir Instagram de @cabanas_del_rio» with the script connected
  Then the tab opens the profile with #hospeda=<nonce> (spec 94)
  And the script clicks the profile's «Enviar mensaje»
  And it reaches the chat page (directly, or through the floating chat's own link to /direct/t/<id>/, or after I open it myself)
  And it pastes only after proving that chat page is with @cabanas_del_rio
  And it reports {username:"cabanas_del_rio", threadId:<id>} to the CRM
  And the next «Abrir Instagram» for that business lands on the chat page
```

**US3 — See the script and the business on Instagram.** As a seller on any Instagram chat page, I see that the script is running and, when the chat is with a CRM business, which one.

```gherkin
Scenario: recognized business
  Given I am on /direct/t/<id>/ logged in with the Hospeda account
  And the script proves the other participant is @cabanas_del_rio
  And exactly one business I can see has that Instagram
  Then the launcher shows the business code
  And the panel shows the code, city, name, responsible, status, open managements and «No contactar» when it applies

Scenario: not a business
  Given the proven participant matches no business
  Then the panel says «No encontré un negocio con @<usuario> en el CRM.» with «Buscar en Negocios del CRM»
  And nothing is reported to the CRM
```

**US4 — Paste a template from Instagram.** As a seller on a recognized chat, I pick a template, review it, and paste it into the composer without sending.

```gherkin
Scenario: paste a template
  Given the panel shows a recognized business I can contact
  When I open «Mandar un mensaje», pick a template and click «Pegar en el chat»
  Then the CRM prepares the draft for @<usuario> and records instagram_opened (dispatch)
  And the script re-proves the thread, finds the page composer empty and pastes the text
  And the panel says «Listo, está en el chat» with «No lo voy a enviar»
  And Meta's echo confirms the send later (spec 92)

Scenario: blocked business
  Given the business has «No contactar» or an active Instagram restriction
  Then «Mandar un mensaje» is disabled with the CRM's reason and no draft is prepared
```

**US5 — Wrong account or unproven chat.** As a seller, the script never pastes or learns on a chat it cannot prove, or from an Instagram account that is not Hospeda's.

```gherkin
Scenario: logged in with another account
  Given the logged-in Instagram account is not the configured Hospeda account
  Then the panel says «Estás con la cuenta @<cuenta>. Entrá con la cuenta de Instagram de Hospeda para usar el script.»
  And no thread is reported and «Pegar en el chat» is disabled

Scenario: group or unproven header
  Given the chat is a group, or the header has no single profile link
  Then the panel says «No pude confirmar con quién es este chat.»
  And nothing is pasted or reported unless decision 12.1 allows the seller to confirm it
```

## 4. Final behaviour

### 4.1 Where «Abrir Instagram» lands (CRM)

Unchanged: the copy inside the click, the pre-opened tab, `dispatch` before any navigation, the phone flow (`ig.me`), the toasts' manual fallback (spec 92 M3, spec 94 §2.1).

New on a computer:

| CRM knows a verified thread for the username | Script acks the handoff | Tab goes to |
| --- | --- | --- |
| yes | yes | `https://www.instagram.com/direct/t/<threadId>/#hospeda=<nonce>` |
| yes | no | `https://www.instagram.com/direct/t/<threadId>/` |
| no | yes | `https://www.instagram.com/<username>/#hospeda=<nonce>` (spec 94, extended in 4.2) |
| no | no | `https://www.instagram.com/<username>/` |

- The server returns the thread with the username: `dispatch` for Instagram answers `{message, username, threadId|null}`, and `withInstagramFlags` (`src/helpers/communicationService.ts`) adds `instagramThreadId` to Instagram attempts so «Copiar y abrir de nuevo» (`InstagramOpenedActions`) uses it too.
- `instagramTarget` (`src/helpers/instagramChat.ts`) takes an optional `threadId` and builds the chat URL only from a valid id (section 5.1); otherwise the profile, as today. Label: «Abrir el chat de @<usuario> en Instagram».
- The handoff payload gains an optional `threadId`. `handOffToUserscript` sends it only to scripts ≥ **1.6.0** (`INSTAGRAM_CHAT_SCRIPT_VERSION`, next to `INSTAGRAM_PASTE_SCRIPT_VERSION` in `src/components/InstagramOpenChat.tsx`); an older script gets the spec 94 profile handoff. In practice the spec 96 gate already blocks desktop Instagram below the latest version.
- Toast with an acked handoff: «Mensaje copiado. El script de Hospeda abre el chat y lo pega: revisalo y envialo vos.» (the spec 94 text). Without ack on a chat URL: «Mensaje copiado. Pegalo en el chat con Ctrl+V.»

### 4.2 The handoff on Instagram (script)

The marker rules of spec 94 stay: only `#hospeda=<32 hex>` counts; it is consumed at once with `replaceState`; the handoff is read only from its GM key, waited for up to 3 s, compare-and-deleted before acting; a valid marker without a valid handoff shows the neutral notice; one run at a time.

**On a chat page** (`/direct/t/<id>/`):
1. The handoff must have `threadId` equal to the path's id, besides nonce and expiry.
2. The script waits up to 15 s for the **thread proof** (4.4) and requires `@username` = the handoff's username, and the account check (4.5).
3. Proof contradicts (the header proves another username): nothing is pasted, the script reports the thread as stale (5.2), and the notice says «Este chat ya no es de @<usuario>. Abrí el perfil y tocá "Enviar mensaje"; el mensaje está copiado.» with a link «Abrir el perfil de @<usuario>».
4. Proof inconclusive: nothing is pasted automatically; what happens next is decision 12.1.
5. Proven: the page composer (never a floating one), empty, gets the text with the spec 94 insertion (`insertIntoComposer`: paste event, then `insertText`, exact equality). The panel opens on that business.

**On a profile page** (unknown thread): the spec 94 flow, with the floating chat handled (decision 12.2, recommended option):
1. Click the header's «Enviar mensaje» exactly as spec 94 (header-only, accessible name, visible, profile re-checked).
2. If the page moves to `/direct/t/<id>/` → continue as on a chat page, with the handoff kept **in memory** (it was already deleted from GM) and the path's id as the expected thread.
3. If instead a floating chat appears that was **not there before the click**, the script looks inside it for Instagram's own link to the full chat: an `<a>` whose `href` path is `/direct/t/<id>/`. It reads only that `href` and clicks the link (an in-app navigation, so the script and the in-memory handoff survive). Then step 2. The floating chat's composer is still never used.
4. If there is no such link within 15 s, the notice says «Instagram abrió un chat flotante. Abrilo en pantalla completa y pego el mensaje.» The in-memory handoff stays valid until it expires; if the tab reaches a chat page with a proof for that username before then, the text is pasted. A full page reload loses it: then the seller pastes with Ctrl+V (the CRM copied it).
5. Every successful proof reports the thread (4.4), so the next open lands on the chat page.

### 4.3 The panel on the chat page

Shown on every `/direct/t/<id>/` page (decision 12.3, recommended option), never on the feed, profiles or the inbox list. It reuses the WhatsApp panel's look (`PANEL_CSS`, launcher + card, light/dark tokens) and its views, adapted.

**Launcher** (fixed bottom-right, outside Instagram's tree, on an own custom element with an open shadow root; exact position must not cover Instagram's composer or send button, to verify live):

| State (first match) | Label | Dot |
| --- | --- | --- |
| no token | «Falta el token» | warn |
| server rejected the version | «Actualizá el script» | warn |
| logged in with another account | «Otra cuenta» | warn |
| CRM unreachable | «Revisá la conexión» | error |
| thread not proven | «Hospeda» | none |
| recognized, «No contactar» or restriction | «<código> · No contactar» | error |
| recognized | «<código>» | ok |
| not a business | «Sin CRM» | none |

**Business view** (as `business()` in `userscript/src/ui.ts`, without anything WhatsApp-specific):
- eyebrow «<código> · <ciudad>», the name, chips «Responsable: …», status, «N gestiones abiertas»;
- a line «@<usuario> · chat verificado» (or «@<usuario> · confirmado por <vendedor>» when decision 12.1 allows it);
- «No contactar» note: «Este negocio pidió no ser contactado. No le escribas desde Instagram.»;
- buttons «Mandar un mensaje» (disabled with the CRM's reason) and «Abrir en CRM».
- Several businesses with that Instagram: «Hay varios negocios con este Instagram» + select, as WhatsApp. Hidden match: «Este Instagram está en un negocio que no podés ver. Consultá a un administrador antes de escribirle.»
- Not a business: «No encontré un negocio con @<usuario> en el CRM.» + «Buscar en Negocios del CRM».
- Not proven: «No pude confirmar con quién es este chat.» (+ decision 12.1).

**«Mandar un mensaje»** (as `openCompose` in `userscript/src/compose.ts`):
- management select when there are several open managements; «MODELOS PARA ESTA GESTIÓN» with the Instagram templates (stored channel `social`, same filter as `ContactTemplateDialog`); the raw-template popover on hover;
- «Sin gestión» per decision 12.6 (recommended: allowed, with the purpose chip and `defaultContactPurpose`, as spec 96 §2.3);
- no person select: Instagram always goes to the business username (spec 92). Preview header «Para @<usuario>»;
- footer note «El mensaje no se envía solo: se pega en el chat para que lo revises y lo envíes vos.»;
- «Pegar en el chat» and «Copiar»; after pasting «Listo, está en el chat» / «Revisalo y envialo vos. Si al final no lo mandás, avisalo acá.» with «Volver al negocio», «Cambiar de modelo», «No lo voy a enviar»;
- busy states «Cargando modelos…», «Preparando el mensaje…», «Procesando…», «Registrando…»; buttons disabled while busy (no double submit); errors keep the selection and offer «Reintentar».

**«Pegar en el chat»** order: re-prove the thread (same id, same username, Hospeda account) → `dispatch` (once per draft: `instagram_opened` + journal `instagram_opened_unconfirmed`, so the echo can confirm it) → re-read the composer → paste. Failures:
- the thread changed during the requests: «El chat cambió. Volvé al negocio y abrí los modelos desde este chat.»;
- the composer has text: «La caja de Instagram ya tiene texto. Borralo y tocá "Pegar en el chat" de nuevo.» (never replaced, D3);
- insertion failed: «No pude escribir en la caja de Instagram. Copialo y pegalo con Ctrl+V.» with «Copiar texto» / «Reintentar». The attempt stays `instagram_opened`.

**Ajustes** (minimal): «CONEXIÓN» with «Conectado como <nombre>» or the reason, «SCRIPT» with «Versión 1.6.0 · al día» or «Hay una versión nueva del script (x)» + «Actualizar», theme. **No token field on Instagram**: «Conectá el script desde el CRM: User script → Conectar este navegador.» with a link (section 7, T4).

### 4.4 Thread proof and learning

A thread is **proven** for `@username` only when all hold, checked right before every paste and every report:
1. The path is `/direct/t/<id>/` with a valid id, and it did not change while checking.
2. Inside the conversation pane (`role="main"`, never the inbox list, never a floating chat) the **labelled** profile links (`href` of the form `/<name>/`, trailing slash optional, with the «Abrir la página del perfil de …» / «Open the profile page of …» label: header and message avatars) point to **exactly one distinct username**; unlabelled profile links are message content (the author of a shared post or reel, «Ver perfil») and are ignored (live chat, 29/10/2026), and it is `<username>` (lowercase compare), and the header link labelled «Abrir la página del perfil de <username>» / «Open the profile page of <username>» is among them. The live page has several such links for the same user (header, «Ver perfil», one per message avatar; 9.1), so the rule counts distinct usernames, not links. The `href` is Instagram's own data; a display name or text is never proof.
3. No group signal: zero, or two or more distinct usernames, or a participant count, means not proven.
4. The logged-in account is the Hospeda account (4.5).

**Must be verified on the live site before implementation** (section 9): whether the 1:1 thread header exposes such a profile link at all, how a group header looks, and how to scope "header of the open conversation" by role/structure without class names. If the header exposes no profile link, rule 2 cannot work and decision 12.1 falls back to seller confirmation.

**Learning**: when a chat page is proven for a username, the panel asks the CRM for businesses with that Instagram (`context?instagram=`). If at least one visible business matches and the stored thread for that username is missing or different, the script reports `{username, threadId, proof:"header"}`. Unknown usernames are never reported. Reports are cached per tab (one per `{username, threadId}`), so browsing does not repeat them.

### 4.5 The Hospeda account check

A thread id belongs to the account that sees it (**assumption to verify live**: open the same `/direct/t/<id>/` with another account and confirm it does not open that conversation). A thread learned from a seller's personal account would send every later open to the wrong place. So:
- the CRM exposes the expected Hospeda username to the script (`status` and `context` responses, `instagramAccount`), from the source chosen in decision 12.7;
- the script reads the logged-in username from Instagram's own navigation (the profile link of the logged-in user; **selector to verify live**);
- mismatch or unknown: no report, no paste, the panel shows the warning of US5. Without a configured Hospeda username, learning and pasting are off and the panel says «Falta configurar la cuenta de Instagram de Hospeda en el CRM.»

### 4.6 Notices

The spec 94 notices stay (with the new flows mapping onto them). New ones, same component (`showNotice`, shadow DOM, inline styles, 8 s, close button, «⌘V» on macOS):

| Case | Notice |
| --- | --- |
| Chat page, proof contradicts the handoff | «Este chat ya no es de @<usuario>. Abrí el perfil y tocá "Enviar mensaje"; el mensaje está copiado.» |
| Chat page, proof inconclusive (no seller confirmation) | «No pude confirmar con quién es este chat, así que no pegué nada. Pegá el mensaje con Ctrl+V.» |
| Floating chat without a link to the full chat | «Instagram abrió un chat flotante. Abrilo en pantalla completa y pego el mensaje.» |
| Another Instagram account | «Estás con otra cuenta de Instagram. Entrá con la de Hospeda y pegá el mensaje con Ctrl+V.» |
| Pasted | «Mensaje pegado. Revisalo y envialo vos.» |

### 4.7 CRM copy

- `InstagramReviewNotices`: «Se copia el mensaje y se abre Instagram: en el celular, el chat de @x; en la computadora, el chat de @x si ya lo conocemos o su perfil, donde el script abre el chat.» (rest unchanged).
- `/userscript` page: «En Instagram el script muestra el negocio del chat, te deja pegar modelos y nunca envía.»
- User guide: rewrite «Pegar el mensaje en Instagram con el script» (panel, chat verificado, chat flotante, cuenta de Hospeda, what each notice means); regenerate `docs/guia-de-uso.md`.

## 5. Technical design

### 5.1 Data model — migration `053_instagram_threads.sql`

The last migration on this branch is `052_response_outcome.sql` (spec 96, not merged); `050` is unused but numbers are applied in order, so the next free number is **053** (confirm against `staging` when implementing). Applied migrations are immutable.

```sql
CREATE TABLE crm_instagram_threads(
  viewer_username text NOT NULL CHECK (viewer_username ~ '^[a-z0-9._]{1,30}$'),
  username text NOT NULL CHECK (username ~ '^[a-z0-9._]{1,30}$'),
  thread_id text NOT NULL CHECK (thread_id ~ '^[0-9]{1,40}$'),
  proof text NOT NULL CHECK (proof IN ('header','seller')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  verified_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (viewer_username, username)
);
```

- **Keyed by username, not by business.** A thread is with an Instagram account; several businesses can share a username (spec 92 «usuario compartido»), and recognition already goes by normalized `perfil_instagram` (index `crm_accounts_instagram_normalized`, migration 045). Changing a business's Instagram simply points it at another (maybe unknown) thread.
- `thread_id` is digits only, as observed (`17848251833510164`). **Verify live** that every thread id is numeric; if not, widen to `^[A-Za-z0-9_-]{1,64}$` before the migration ships.
- `viewer_username` is the Hospeda account (4.5).
- Stale threads are deleted (compare-and-delete on `thread_id`), not flagged.
- No business history entry: the row is navigation metadata, not a business fact (D4). `verified_by_user_id` and `verified_at` keep who and when. Regenerate `src/helpers/schema.tsx`.

### 5.2 Endpoints

All in `src/endpoints/userscript.ts`, bearer token (`scriptAuth`: 401 revoked, 426 below `USERSCRIPT_MIN_VERSION`), Zod on every input, routed in `src/server/app.ts` (not `index.ts`, contrary to `AGENTS.md`). Older scripts never send the new parameters, so their behaviour is unchanged.

| Endpoint | Change |
| --- | --- |
| `GET /_api/userscript/status` | adds `instagramAccount: string \| null` (the Hospeda username, 4.5). |
| `GET /_api/userscript/context?instagram=<username>` | new query alternative to `code`/`phone`. Normalizes with `normalizeInstagramUsername`; matches every business outside trash and not merged whose `perfil_instagram` normalizes to it (the webhook's rule). Each candidate goes through `assertBusinessAccess` as today: visible ones become `matches` (same `Match` shape plus `canContact`), the rest count in `hiddenMatches`. Adds `instagram: {username, threadId \| null}` with the stored thread for the Hospeda account. 400 for an invalid username. |
| `POST /_api/userscript/instagram/thread` (new) | body `{username, threadId, proof:'header'\|'seller'}` (strict). Requires at least one visible business with that Instagram that the token's user can contact (`canModifyBusiness` or a modifiable open management, the spec 96 rule): otherwise 404 «No encontré un negocio con ese Instagram.» (never says whether it exists). 409 when `instagramAccount` is not configured. «No contactar» does **not** block it: recording where a chat lives is not contact. Upserts the row for `instagramAccount`. Per-token rate limit like `allowBadgeRequest` (`src/helpers/userscriptBadges.ts`). Returns `{threadId}`. |
| `POST /_api/userscript/instagram/thread/stale` (new) | body `{username, threadId}`: deletes the row only if it still holds that `threadId` (compare-and-delete). Same permission as above. |
| `GET /_api/userscript/templates?accountId=&channel=instagram` | `channel` defaults to `whatsapp`. Instagram scope: recipient `instagramRecipient(account)`; templates `message_templates.channel='social'` filtered with `templateCompatibility` like `ContactTemplateDialog`; no contacts; `blocked` from `assertAccountContactAllowed(…, 'social')`, «No contactar», archived and permissions; Nuevo allows only the general verification contact (as the CRM). With decision 12.6 = allow, also returns a `general` entry (purpose options and the default). |
| `POST /_api/userscript/prepare` | adds `channel: 'whatsapp' \| 'instagram'` (default `whatsapp`); for Instagram `contactId` must be null; and, with 12.6, `prepare_general` with `purpose`. |
| `POST /_api/userscript/dispatch`, `/outcome` | `scriptWhatsapp(id)` becomes `scriptChannel(id)`: accepts `channel='whatsapp'` or an Instagram attempt (`isInstagramAttempt`). Outcome accepts `whatsapp_opened` or `instagram_opened`. `material_add` stays WhatsApp-only (unless 12.5). |
| `POST /_api/communication` `dispatch` (CRM) | Instagram result adds `threadId`; Instagram messages carry `instagramThreadId` (`withInstagramFlags`). |

The server checks everything again at `dispatch` (permissions, «No contactar», restrictions, username unchanged); the panel's disabled reasons are usability only.

### 5.3 User script modules

- `userscript/src/instagram/` stays the **DOM layer**: pure functions over `Document`, no GM, no network, no clipboard. Additions:
  - `thread.ts`: `threadIdFromPath`, `findConversationHeader`, `proveThread({doc, pathname}) → {threadId, username} | {reason}` (4.4), `loggedInUsername({doc})` (4.5);
  - `finders.ts`: `findFloatingFullChatLink` (4.2 step 3), `findPageComposer` (the existing non-floating rule);
  - `handoff.ts`: optional `threadId` in `parseHandoff`/`checkHandoff` (thread path compares the id; profile path compares the username);
  - `flow.ts`: the chat-page flow and the floating-chat branch, keeping the transition table style.
- `userscript/src/instagramApp/` (new) is the **wiring layer**, the only place on instagram.com that touches GM and the CRM, like `instagramBridge.ts` does today:
  - `start.ts`: route from `main.ts` (`siteFor` → `instagram`), watch SPA path changes by polling `location.pathname` (no `hashchange` on `pushState`; patching `history` from the sandbox is unreliable), run the handoff (4.2) and the panel;
  - `panel.ts`: launcher, business view, ajustes, built node by node;
  - `api` calls only through an allowlist: `fetchStatus`, `fetchContext` (instagram), `reportInstagramThread`, `reportInstagramThreadStale`, `fetchTemplates` (instagram), `prepareTemplate`, `dispatchTemplate`, `markTemplateNotSent`.
- **Compose reuse.** `compose.ts` is bound to WhatsApp's composer through `selectors.ts`. Recommended: extract a small target adapter (`{channel, readComposer, paste, isSameChat, recipientLabel}`) so WhatsApp and Instagram share the view and state machine; WhatsApp behaviour must stay identical (`compose.spec.ts` green, unchanged assertions). The alternative is an Instagram copy of the view (about 150 lines of duplication). Implementation choice, to confirm when tasks are cut.
- **Styles under Instagram's CSP** (to verify live, section 9): spec 94 avoided `<style>` for its notice. The panel uses a constructable stylesheet (`new CSSStyleSheet()` + `replaceSync(PANEL_CSS)` + `shadowRoot.adoptedStyleSheets`) and falls back to inline style properties if that throws. Icons node by node (Trusted Types). The logo is a `data:` URI (`logo.ts`); if Instagram's `img-src` blocks it, the launcher shows the «H» dot used by the chat badges.
- `vite.config.ts`: `@description` «Registra mensajes de WhatsApp Web en el CRM y, en WhatsApp e Instagram, pega los modelos del CRM sin enviarlos». `@match`, `@grant`, `@connect` unchanged, so Tampermonkey should not ask for a new approval (confirm on the first update).

### 5.4 Relaxing spec 94's isolation: what changes and what stays

Spec 94 §2.4 made the Instagram module read only the handoff key and make no request. This spec deliberately lets the Instagram side use the token and call the CRM. The properties kept:

1. **The token never reaches the page.** It is read with `GM_getValue` inside the sandbox and sent only in `GM_xmlhttpRequest` headers to the CRM host (`@connect` allows only that host). It is never written to the DOM, an attribute, a URL, `console` or a page event. Instagram's page JS cannot call GM functions or read GM storage.
2. **No token entry on instagram.com.** Page JS can read inputs in an open shadow root, so the token is only ever set from the CRM (1.5.1 «Conectar este navegador») or WhatsApp Web.
3. **No page-to-script channel on instagram.com.** The script listens to no page-dispatched event there (no `TOKEN_EVENT`, no `HANDOFF_EVENT`); those listeners stay on the CRM origin only.
4. **Trusted clicks only.** Every panel action that calls the CRM or writes into Instagram's composer requires `event.isTrusted`, so Instagram's JS cannot drive the panel with synthetic clicks.
5. **No reading of messages.** The DOM read is limited to: the path, the open conversation's header links, the logged-in user's profile link, the floating chat's full-chat link, and the composer's own text (to check it is empty and verify the paste). Never the message list, never the inbox.
6. **No clipboard read.** `navigator.clipboard.readText` stays forbidden; `writeText` is allowed only from a trusted click on «Copiar».
7. **No WhatsApp code** (`selectors`, `internals`, `register`, `autoRegister`, `badges*`, `ui`) runs or is imported on instagram.com; no `unsafeWindow`.
8. **Accepted exposure**, same as WhatsApp's panel today: anything rendered in the panel (business name, code, responsible, template text) is readable by Instagram's page JS. Keep the panel to the fields listed in 4.3; no notes, no history.

`userscript/src/instagramIsolation.spec.ts` is rewritten to enforce this:
- static check on `instagram/`: unchanged (no GM, network, clipboard, dynamic code);
- static check on `instagramApp/`: imports only `./*`, `../instagram/*`, `../api`, `../styles`, `../logo`, `../version`, `../parse`, `../materials` only if 12.5; no `unsafeWindow`, `readText`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `eval`, `new Function`, dynamic `import(`, web storage, cookies; no `addEventListener` for `hospeda-*` page events;
- runtime at `https://www.instagram.com/…`: GM reads only `hospeda-userscript-token`, `hospeda-instagram-handoff` and the Instagram panel's own keys (`hospeda-instagram-open`, theme); without a token no request; on a non-chat page without a marker, nothing injected and no request; requests only to the allowlisted API functions; the token never appears in `document.documentElement.outerHTML`; a synthetic click on «Pegar en el chat» does nothing.

### 5.5 Versions

- `USERSCRIPT_VERSION` → **1.6.0** (`userscript/src/version.ts`); `scripts/verify-userscript-build.mjs` checks it and the new `@description`.
- `USERSCRIPT_MIN_VERSION` stays **1.5.0** (D5): no existing contract changes, older scripts keep working on WhatsApp.
- The CRM gate of spec 96 §10.2 blocks the desktop CRM (every page, admins included) below the latest bundled version. **Releasing 1.6.0 therefore blocks every seller's desktop CRM until they update.** Rollout step in section 11.
- `INSTAGRAM_CHAT_SCRIPT_VERSION = '1.6.0'` decides whether the handoff carries `threadId` (4.1).

## 6. Rules that do not change

- Opening Instagram, pasting or reporting a thread is not evidence of a send, contact, reply or acceptance. The attempt stays `instagram_opened` until Meta's echo or the seller's answer (spec 92).
- The script never sends, never presses Enter, never clicks Send.
- Server-side permission, «No contactar», restriction and archived checks on `prepare` and `dispatch`. Read access grants nothing else.
- No auto-retry of anything whose outcome is uncertain.
- Phones keep `ig.me`; email is untouched.

## 7. Security

- **T1 — Wrong recipient from a bad thread id.** Only a proven header (exactly one profile link = the username) or, if allowed, an explicit seller confirmation stores a thread; every paste re-proves; a contradicting proof deletes the row. A group, a similar username (`target_fan`, `target.x`) or a message reading «@target» are not proof: only the header link's `href` counts.
- **T2 — Thread poisoning through the API.** Any holder of a valid token could report a wrong thread for a business they can contact. Impact: the next «Abrir Instagram» lands on the wrong chat, where the script refuses to paste (proof fails) and deletes the row. Residual: a seller without the script would paste by hand into the wrong chat; the URL still shows the other username in Instagram's header. Accepted; reports are rate limited and record the user.
- **T3 — Forged handoff links.** Unchanged from spec 94: a marker needs a stored handoff with the same random nonce; on a chat page the handoff must also name that thread id and the proof must name that username.
- **T4 — Token theft on instagram.com.** Section 5.4 items 1–3.
- **T5 — Synthetic UI events from Instagram's JS.** `isTrusted` (5.4 item 4).
- **T6 — Wrong Instagram account.** 4.5.
- **T7 — Information exposure to Instagram.** 5.4 item 8. Lookups send the chat's username to the CRM; the CRM already receives every DM of the Hospeda account through the webhook (spec 88), so this adds nothing Meta does not already send.

## 8. Risks

- **Instagram's DOM.** The header proof, the floating chat's full-chat link, the logged-in user's link and the composer are all unverified assumptions until section 9 is done. If the header has no profile link, automatic learning is impossible and everything falls back to decision 12.1. Fixtures (`userscript/fixtures/instagram-*.html`) are synthetic models, not captures.
- **Thread id per viewer** (4.5) is an assumption to verify.
- **CSP for styles and the logo** (5.3) to verify; fallbacks defined.
- **Terms of use.** The script now reads a few header links and shows a panel, besides clicking and pasting. It still never sends, reads messages or collects anything beyond the username of the open chat. Low, not zero.
- **Gate on the latest version** (5.5): a coordinated release is mandatory.
- **Stale learning after a username change on Instagram**: the old thread proves another username and is deleted; the new username is learned on the next proven visit.
- **Lookup volume**: one `context` call per newly opened chat, cached 60 s per username (as WhatsApp).

## 9. Live-site verification (before implementation)

On `https://www.instagram.com` logged in with the Hospeda account, Spanish and English UI, against test user `qaz.uor` (`/direct/t/17848251833510164/`) and one group chat. Record the accessible structure (roles, `aria-label`, `href`), never class names, and turn it into fixtures:
1. 1:1 thread header: does it contain a link to `/<username>/`? Exactly one? Where is it relative to the conversation pane (`role="main"`?), and how to exclude the inbox list?
2. Group thread header: links, participant count, how to tell it apart.
3. Floating chat opened from a profile: its container, whether it offers a link or button to the full chat, and whether that is an `<a href="/direct/t/<id>/">`.
4. Logged-in user: a stable link to the own profile (navigation «Perfil» / avatar).
5. Thread ids: numeric always? Does the same id open for another account?
6. CSP: does a constructable stylesheet apply inside a shadow root? Does a `data:` image load? Any Trusted Types errors in the console with the panel open?
7. Composer: still the Lexical `contenteditable` with label «Mensaje» (spec 94 `COMPOSER_LABELS`), and the paste event still works on the chat page.
8. Tampermonkey: updating 1.5.x → 1.6.0 does not ask for new permissions.

### 9.1 Results (owner's browser, 29/10/2026, Spanish UI, Hospeda account)

These override the assumptions above where they differ.
1. **1:1 chat page** (`/direct/t/17848251833510164`, no trailing slash): `role="main"` exists. Its profile links all point to `qaz.uor`: the header link (`/qaz.uor/`, `aria-label` «Abrir la página del perfil de qaz.uor», text = display name + username), «Ver perfil» (`/qaz.uor/`), and four message avatars (`/qaz.uor`, no trailing slash, `aria-label` in English «Open the profile page of qaz.uor» even with the Spanish UI). Rule 4.4.2 counts distinct usernames for that reason, and labels are matched in both languages.
2. **Composer:** one `contenteditable="true"` with `data-lexical-editor` and **no `aria-label`**. Spec 94's `COMPOSER_LABELS` («Mensaje») no longer matches, which likely also breaks today's flow; the finder must locate the Lexical editor inside the conversation pane instead.
3. **Floating chat** (profile `/qaz.uor/` after «Enviar mensaje»): it has **no link** to `/direct/t/<id>/`; it has buttons «Volver», «Expandir» and «Cerrar». **«Expandir» navigates to the chat page** (`/direct/t/<id>`). Flow 4.2 therefore clicks «Expandir» (`aria-label` «Expandir»/«Expand», to confirm in English) and proves the thread on the chat page; it never pastes into the floating chat.
4. **Navigation «Mensajes» link** points to the last opened thread (`/direct/t/<id>`). It proves nothing and is never used.
5. **Logged-in account:** an `img` with `alt` «Foto del perfil de hospeda.com.ar» and the navigation link to `/hospeda.com.ar/` (the «Perfil» item) identify it. The navigation link is not inside `nav`/`role="navigation"`, so the selector is the profile link whose accessible text is «Perfil»/«Profile» together with that `alt`.
6. **CSP:** a constructable stylesheet adopted by a shadow root applies (computed colour matched), so the panel can use `adoptedStyleSheets`. `data:` images and Trusted Types errors still to check during implementation.
7. Still open: group chat header, English UI labels, thread ids per account (assumption kept: they belong to the viewing account), Tampermonkey prompt on 1.6.0.
8. **To check live (review M3):** whether `#hospeda=<nonce>` survives when the CRM opens `/direct/t/<id>/` (Instagram may redirect to the path without the trailing slash, to the inbox, or drop the fragment). If the fragment is lost, the known-thread handoff silently falls back to manual paste; the script reports a stored thread stale only when the marker arrives on another path.
9. **Conversation list** (`/direct/inbox/`, Spanish UI, 29/10/2026): a DIV with `aria-label` «Lista de conversaciones» (assumed «Conversation list» in English) inside `role="main"` on the inbox page; on a chat page it sits beside the conversation. Rows are `div[role="button"]` with **no href, no thread id and no @username**: only the display name followed by the last-message preview (for example «Leandro Asrilevich» + «Tú: ¡Hola, Zz! ¿Cómo v…») and an `img` with `alt` «user-profile-picture». Other `role="button"` elements in the list are not chats: the account switcher («hospeda.com.ar…»), «Más opciones», «Nuevo mensaje», the notes tray («…Tu nota»); there is also a tablist. On a proven chat page the header link text is display name + username concatenated («Leandro Asrilevich» + «qaz.uor») and an `h1`/`h2` in the pane holds the display name alone.

## 10. Test plan

- **Unit (Vitest, userscript):**
  - `thread.ts` against new fixtures (`instagram-thread-header-es/en.html`, `instagram-thread-group-es.html`, `instagram-inbox-with-thread-es.html` with other usernames in the list, `instagram-mini-chat-full-link-es.html`): proven, group, zero/two links, inbox links ignored, floating chat ignored, path change mid-check;
  - handoff with `threadId`: parse, thread-path check, profile-path check, mismatches;
  - flows: chat page proven/contradicted/inconclusive; profile → navigation; profile → floating chat → full-chat link; no link → notice and later paste on a proven page; reload loses the in-memory handoff;
  - panel: every launcher state, business/multiple/hidden/none/unproven views, disabled reasons, `isTrusted` guard, no token form on Instagram;
  - compose adapter: Instagram paste order (re-prove → dispatch → paste), busy composer refused, failure keeps the attempt; WhatsApp `compose.spec.ts` unchanged and green;
  - rewritten `instagramIsolation.spec.ts` (5.4).
- **Unit (CRM):** `instagramTarget` with `threadId` (valid, invalid, phone); `handOffToUserscript` sends `threadId` only to ≥ 1.6.0; `InstagramOpenedActions` uses `instagramThreadId`; `MessageComposer.instagram.spec.tsx` for the chat URL.
- **Integration** (extend `scripts/test-userscript.ts`, local disposable DB only): migration 053 applies and replays; `context?instagram=` (one, several, hidden, trash, merged); thread report (no visible business 404, read-only 404/403, contactable OK, «No contactar» OK, invalid formats 400, no `instagramAccount` 409, upsert, rate limit); stale compare-and-delete; templates `channel=instagram` (Nuevo, «No contactar», restriction `social`, archived); prepare/dispatch/outcome for an Instagram draft from the script (`instagram_opened` + journal); then the echo confirms it (reuse `scripts/test-instagram-open-chat.ts`); old-script calls without the new parameters unchanged; `dispatch` returns `threadId`.
- **Browser e2e:** `tests/browser/instagram-open-chat.e2e.ts` with `simulateUserscript(page,{version:'1.6.0',connection:'connected'})` and a seeded thread → the tab URL is `/direct/t/<id>/` (no ack in the simulation → no fragment); without a thread → the plain profile, as today. Instagram itself cannot run in CI.
- **Manual (owner, live):** section 9 plus US1–US5 end to end with `qaz.uor`, including the echo confirming the attempt.
- Gates: `npm run typecheck`, `npm test`, `npm run build`, CI integration and browser suites green.

## 11. Rollout and production checklist

1. Specs 94 and 96 merged to `staging` first; rebase and confirm the migration number.
2. Section 9 done and fixtures committed before writing the finders.
3. Set `INSTAGRAM_ACCOUNT_USERNAME` (decision 12.7) in Coolify **before** the deploy.
4. Deploy (owner-approved, manual): `npm run db:migrate` applies `053` (no data written).
5. **Publish 1.6.0 in the same deploy as migration 053.** Owner decision (29/10/2026): the spec 96 gate stays as is (an installed version below the latest blocks the desktop CRM); it is not relaxed for minor versions. That same day, tell sellers to force «Buscar actualizaciones» in Tampermonkey and to approve instagram.com if Tampermonkey asks.
6. Owner verifies live: a known-thread open, an unknown-thread open with the floating chat, a template pasted from the panel, the echo confirming it, and the wrong-account warning.
7. Docs: `docs/estado-desarrollo.md`, `docs/pendientes.md`, `docs/decisiones.md` (decisions of section 12), user guide regenerated.
8. `staging` → `main` only when the owner asks.

## 12. Decisiones

Owner decisions (29/10/2026): 12.1 option 2, 12.2 option 2, 12.3 option 1, 12.4 option 1, 12.5 option 1 (material on Instagram is a later spec),
12.6 option 2, 12.7 option 1. The options are kept below for the record.

Rule from the owner: always the simplest path for the seller.

**12.1 How the thread is proven and when it is trusted.**
1. **Header proof only.** What: store and paste only with the automatic proof of 4.4. Pros: no seller action, no human error. Cons: if Instagram's header has no usable profile link, nothing is ever learned and nothing pasted on chat pages. Impact: smallest code.
2. **Header proof, plus seller confirmation inside a CRM handoff.** What: when the proof is inconclusive and the seller arrived from «Abrir Instagram de @x», the panel asks «¿Este chat es con @x?» with «Sí, es este chat · pegar»; a trusted click stores `proof:'seller'` and pastes. A later contradicting header proof still deletes it. Pros: works even if the header proof fails; one click, once per business. Cons: a careless «Sí» stores a wrong thread until a proof contradicts it. Impact: one more panel state and the `seller` proof value.
3. **Seller confirmation always.** What: no automatic proof. Pros: independent of the DOM. Cons: a click on every first visit and more room for error. Impact: simplest DOM, worst for the seller.
- **Recommendation: 2.** Automatic when Instagram allows it, one click when it does not.

**12.2 What happens when the thread is unknown.**
1. **Profile and manual paste.** What: open the profile, the seller clicks «Enviar mensaje» and pastes; the thread is learned later if the seller opens the full chat. Pros: no automation in the floating chat. Cons: three manual steps on every first contact, the problem the owner reported. Impact: minimal.
2. **Profile, the script clicks «Enviar mensaje» and follows the floating chat's own full-chat link, else asks the seller to expand it; pastes after the proof.** What: 4.2. Pros: usually zero extra clicks, at most one; the thread is learned on the way. Cons: depends on that link existing (section 9.3); an in-memory handoff is lost on a full reload. Impact: one more branch in `flow.ts`.
3. **Search the username in the inbox (`/direct/new/`) and open the result.** Pros: no profile step. Cons: typing into Instagram's search and choosing a result is far more automation and far more fragile. Impact: large.
- Also considered and discarded for now: getting the thread id from Meta's API. The webhook carries IGSIDs, not web thread ids (spec 88 §1), and nothing shows the API conversation id equals the `/direct/t/` id; worth a separate investigation, not a dependency.
- **Recommendation: 2.**

**12.3 Where the panel appears.**
1. **Every chat page.** Unrecognized chats show «Sin CRM». Pros: the seller always sees the script is alive (the owner's ask), parity with WhatsApp. Cons: one lookup per new chat. Impact: as designed.
2. **Only recognized businesses.** Pros: quieter. Cons: no way to tell «script off» from «not a business». Impact: same code, hidden launcher.
3. **Only when arriving from the CRM.** Pros: least exposure. Cons: no templates on chats opened directly in Instagram; no learning while browsing. Impact: fewer requests.
- **Recommendation: 1.**

**12.4 Recognition key.**
1. **Username only** (normalized `perfil_instagram`, the webhook's rule). Pros: one rule everywhere; the thread id is only a navigation cache. Cons: after an Instagram rename the business is not recognized until someone updates `perfil_instagram`. Impact: as designed.
2. **Username, or the stored thread id when the username matches nothing.** Pros: survives renames. Cons: a thread id is only as good as its last proof; recognizing by it would show a business on a chat whose header proves someone else. Impact: extra lookup path.
- **Recommendation: 1.**

**12.5 Sales material on Instagram.**
1. **Out of scope (templates only).** Pros: ships the fix and the panel without touching material policy; spec 92 keeps Instagram drafts without material. Cons: material still goes by WhatsApp or email. Impact: none.
2. **In scope.** What: «Agregar material» in the Instagram panel and the CRM composer. Cons: `sales_material_shares.channel` only allows email and WhatsApp (CHECK in migration 046), and the share links, revocation and echo matching would all need Instagram support. Impact: migration change, service and UI work; likely its own spec.
- **Recommendation: 1**, with a follow-up spec if the owner wants it.

**12.6 Contact without a management from the panel.**
1. **Open managements only** (as the WhatsApp panel). Pros: parity. Cons: a Nuevo business only allows the general verification contact, so the panel could not verify new businesses, one of Instagram's main uses (the catalog has «Verificación del negocio · Instagram»). Impact: none.
2. **Also «Sin gestión» with the default purpose** (spec 96 §2.3: chip, `defaultContactPurpose`, `prepare_general`). Pros: the seller can do every Instagram contact from Instagram. Cons: more server logic in the script endpoints (purpose validation and block reasons). Impact: `templates`/`prepare` gain the general scope.
- **Recommendation: 2.**

**12.7 Where the Hospeda Instagram username comes from (4.5).**
1. **Environment variable `INSTAGRAM_ACCOUNT_USERNAME`** in Coolify, next to `INSTAGRAM_ACCOUNT_ID`. Pros: trivial. Cons: one more variable to keep right. Impact: `status`/`context` read it.
2. **From Meta's API** (`graph.instagram.com/me?fields=username` with the stored token, cached on refresh). Pros: no configuration. Cons: depends on the integration being up; more code. Impact: touches the token refresh.
3. **No account check.** Pros: none for the seller. Cons: a personal-account session poisons threads. Impact: none; not advisable.
- **Recommendation: 1.**

## 13. Defaults this spec chose

- **D1. Thread table keyed by `(viewer_username, username)`,** not by business (5.1).
- **D2. Stale threads are deleted, not flagged** (compare-and-delete).
- **D3. Never replace text already in Instagram's composer** (spec 94 rule kept), unlike WhatsApp's replace-with-confirmation; avoids clearing a Lexical editor programmatically.
- **D4. No business history entry for a learned thread;** `verified_by_user_id` and `verified_at` are enough.
- **D5. `USERSCRIPT_MIN_VERSION` stays 1.5.0;** the CRM gate already requires the latest version.
- **D6. Timeouts:** 15 s for the proof, the button and the full-chat link; 3 s for the handoff; 300 ms for the ack; 2 min of validity (spec 94 D5).

## 14. Implementation notes (29/10/2026)

Implemented on `feat/instagram-chat-panel-97` following §12. Deviations and choices taken without an owner decision (marked **NEEDS OWNER**, simplest path for the seller):

- `crm_instagram_threads.verified_by_user_id` is `integer` (not `bigint`): `users.id` is `serial`.
- «care» without a management for a business that is not a client: the panel does not offer it, and since the review (L6) the server rejects it in `prepare_general` unless the request carries `confirmedClient` (the CRM composer sends it after its checkbox; the user script never does).
- New notice `account-unknown` («No pude confirmar con qué cuenta de Instagram estás…»): without the account check (no token, no CRM answer, or the avatar alt missing) nothing is pasted. **NEEDS OWNER**.
- A 401 from the CRM shows «Falta el token» in the launcher (same as no token).
- Reporting a thread ignores «No contactar» (it is navigation metadata) but still requires a visible business the user may contact otherwise.
- «Copiar y abrir de nuevo» in «Requiere acción» has no thread id, so it still opens the profile.
- Group detection, the English «Expand» label, Trusted Types, thread ids per account and Instagram's dark mode class were not observed live: implemented defensively (§9.1 lists what was).

### Review fixes (29/10/2026)

- **H1:** a failed proof carries the usernames it saw. A group, or a pane that names only other users, is evidence against @x (`contradicted`): never offered for confirmation, never pasted, and a stored thread is reported stale. «¿Este chat es con @x?» appears only for real ambiguity (no links, no pane, only @x without a labelled header, several users including @x). The seller proof is stored only after the paste re-checked the chat.
- **H2:** the group signal is read only in the header region (pane children that hold no message list or composer), so «cabaña para 4 personas» in a message never turns a 1:1 chat into a group.
- **M2:** the business lookup matches `perfil_instagram` with an anchored pattern (whole handle or first URL segment, a superset of the normalization) and no `LIMIT` before the exact filter.
- **M3:** a known-thread handoff whose marker arrives on another path reports the stored thread stale (see §9.1 item 8).
- **M4:** a seller confirmation never overwrites a header proof (`ON CONFLICT … WHERE proof='seller' OR excluded.proof='header'`).
- **L1:** an Instagram `prepare` with a management of another business is refused; the panel refuses a draft whose recipient is not the chat's user before recording anything.
- **L2:** `context?instagram=` returns the thread only when the user sees a matching business. **L3:** the business picker and «No es este chat» require trusted events. **L5:** the Hospeda account is checked before clicking «Enviar mensaje»/«Expandir».
- **L6:** `prepare_general` with «care» on a non-client requires `confirmedClient` (both the CRM composer and the user script path).
- Owner decision: the spec 96 gate is kept unchanged (see §11 step 5).

## 15. Badges in the conversation list (owner, 29/10/2026, option 1)

**Decision:** badges by display name, only for learned chats. Instagram's list rows carry no username or thread id (§9.1 item 9), so a row is marked only when its display name matches exactly **one** learned thread's display name.

- **Learning the name.** When the script proves a chat (§4.4, header proof) it also sends the header's display name (`headerDisplayName`: the pane's single `h1`/`h2`, else the labelled header link's text without the username). It is stored on the thread row: migration `054_instagram_thread_display_name.sql` adds nullable `display_name` (1–100 characters, trimmed, single-spaced, no control characters; 053 is untouched). The name is read only when the pane has the labelled header link of that same username, in the same step as a fresh proof of the chat (a context answer that arrives after the chat changed stores nothing). A later header proof with another name replaces it; a header proof without a readable name keeps it; a seller proof only fills an empty name of the same thread; a new thread id never inherits the old name. `context?instagram=` returns `instagram.displayName` with the thread (only for a visible business, like L2), and a known thread is reported again only to store or correct the name.
- **Data.** `GET /_api/userscript/instagram/threads` (script token, version gate, rate limit like the WhatsApp badges): the learned threads of the Hospeda account that have a display name and whose businesses the user can see (`assertAccountViewable`), most recently proven first, at most 500, each with spec 86's badge data (code, name, city, status, owner, «No contactar», restriction on `social`/`all`, open management; `multiple` when several visible businesses share the username). Threads whose businesses are all hidden are left out. 409 without `INSTAGRAM_ACCOUNT_USERNAME`.
- **Marking.** On `/direct/` pages (inbox and chats), with the switch on, a working token and the Hospeda account logged in: chat rows are `role="button"` with the profile-picture avatar, no `aria-label`, outside the tablist, not the notes tray or the account switcher. The row's name is its first text (never the preview). The match is exact apart from case and spacing: accents count (José ≠ Jose), ñ ≠ n, invisible format characters are dropped; the CRM and the script use the same key. A name shared by two learned threads of the account marks none: the CRM leaves those out before the visibility filter and the limit (so a hidden twin is never revealed and never lets the other one through), and the script also marks none for a name shown on two visible rows. The badge goes right after the name, in a shadow root built with `textContent` (adoptedStyleSheets, `<style>` fallback), with the details as a tooltip; no link and no click handler, so a click is Instagram's row click (no paste, no registration). Re-applied on every poll (re-renders, recycled rows); the list of threads is fetched once per 5 minutes (1 minute after a failure), after a new learning, never per row, and dropped when the token changes. A poll whose list text, badge count, data and theme did not change does no row work. A malformed response is an empty list, and any failure in the badges is caught so it never stops the panel, learning or paste.
- **Settings.** «Mostrar insignias en la lista de chats» in the panel's Ajustes (on by default, GM key `hospeda-instagram-badges`); the badges follow the panel theme. Off `/direct/` nothing is read or requested, as before.
- **Limits.** Only chats the script already proved with a readable name get a badge. Two learned chats with the same visible name, or two visible rows with the same name: no badge. A name the CRM cannot store (too long, empty after cleanup) is dropped and the thread is still stored. The CRM reads every named thread of the account to decide ambiguity (one small query per 5 minutes per seller). The English list label and the account switcher shape in other accounts are not verified live. The display name is asserted by the client and shared by every seller of the account: a user with a token who may report that username's thread could send any name through the API, and the Instagram contact controls their own visible name (copying another learned chat's name only hides both badges; copying an unlearned chat's name moves the badge there). Accepted limit (review M3): the badge is informational, the duplicate rules reduce it, and no action trusts it.

