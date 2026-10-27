# Spec 92 — Open Instagram chats from the composer

Status: approved by the owner on 27/10/2026, including the recommended option of every decision in section 6 (D1–D4). Type: composer flow, one new message status (migration `049`) and a change to the Instagram webhook's echo handling. It does not change permissions, «No contactar» gating or what counts as contact.

Builds on [spec 88](88-instagram-direct-webhooks.md) (echoes of messages sent from Hospeda's Instagram account come back through Meta's webhook) and [spec 91](91-communication-polish.md) («Preparar respuesta»).

## 1. Problem

- WhatsApp has a full flow from the composer: write or review the message, click «Abrir WhatsApp con este mensaje», and the CRM records the attempt as «WhatsApp abierto · envío no confirmado» (`whatsapp_opened`) and asks «¿Lo enviaste?» afterwards (`dispatch` in `src/helpers/communicationService.ts`, `MessageComposer.tsx`).
- Instagram has nothing like it. Today a seller has two options:
  - log a «Red social» attempt by hand (`ManualCommunicationForm`, `manual_start` → `manual_pending`), which copies the text but asks the seller to type the profile, does not open the chat, and needs a manual result;
  - or skip the CRM, write from the Instagram app, and let the webhook record the echo as «Enviado desde la app de Instagram de Hospeda», with no template, no management, no author and no link to a task.
- «Preparar respuesta» (spec 91 §10) falls back for Instagram: «"Preparar respuesta" no prepara mensajes por Instagram: elegí el canal en "Contactar"» (`replyTarget` in `src/helpers/communicationTimeline.ts`), even though most Instagram replies go to the same business account.
- Instagram's `ig.me/m/<username>` link opens the chat but does **not** accept prefilled text (only `ref` is documented). The CRM can only copy the text to the clipboard for the seller to paste.
- Unlike WhatsApp, we get proof of the send: spec 88 already receives the echo of every message sent from Hospeda's account. That echo can confirm the attempt on its own, so the seller does not have to answer «¿Lo enviaste?».

## 2. Final behaviour

### 2.1 Where Instagram appears

1. **«Contactar» (`BusinessContactDialog`).** The «Canal» select gets a new option, «Instagram», between «Email · Brevo» and «Llamada». «Red social» stays for other networks and for Instagram contacts logged by hand. Its manual form shows the hint «Para escribir por Instagram desde el CRM usá el canal Instagram.» when the destination field mentions Instagram.
   - Enabled when the business's `perfil_instagram` normalizes to a valid username (`normalizeInstagramUsername` in `src/helpers/instagram.ts`). This is the same value and rule that inbound and echo matching use.
   - Otherwise it is disabled, with the reason «El negocio no tiene un usuario de Instagram válido. Cargalo en "Datos del negocio": es el mismo que usamos para asociar los mensajes recibidos.» «Agregar o editar teléfono o email» becomes «Agregar o editar datos de contacto» and opens the same editor.
   - The button reads «Continuar con el mensaje» and opens the composer: `GeneralMessageStep` without a management, `ContactTemplateDialog` with one. Same permission, purpose, «Nuevo» status and «No contactar» rules as WhatsApp.
2. **«Preparar respuesta»** (spec 91 §10). When the last received message is Instagram, `replyTarget` returns `{channel:'instagram', contactId:''}` if all of these hold:
   - the business has a valid Instagram username;
   - the sender (`from_address`, `@usuario`) normalizes to that same username;
   - there is no active `social` or `all` restriction at business level.

   Otherwise it opens «Contactar» with its defaults and one of these reasons:
   - «El negocio no tiene usuario de Instagram cargado: elegí el canal en "Contactar".»
   - «@x no es el Instagram cargado en el negocio (@y): elegí el canal en "Contactar".»
   - the existing restriction text.

   Email and WhatsApp keep their current rules.
3. **«Responder» in the Bandeja** for an Instagram thread uses the same `replyTarget` rule.

**Persons.** `crm_contacts` has no Instagram field, so the recipient is always the business username. A person's Instagram is out of scope (section 4).

### 2.2 Composer (Instagram)

- **Title and header.** Title «Preparar Instagram». The header reads «Instagram para <negocio>» with `@usuario` as the destination, with an Instagram icon in `--platform-instagram`.
- **Templates.** The model list shows active `social` templates that pass `templateCompatibility` (the catalog already has «· Instagram» models in migration `036`).
- **Plain text only.** The editor is the WhatsApp one without bold or italic, and the body is stored as plain text (`htmlToPlainText`). Instagram shows `*asterisks*` literally.
- **No sales material.** The material picker is hidden: `sales_material_shares.channel` only allows email and WhatsApp. «Enviar material» does not offer Instagram.
- **Same steps as WhatsApp:**
  - «Editar mensaje» → «Guardar y ver contenido final» → «Revisé destinatario y contenido final» → «Abrir Instagram»;
  - drafts, «Seguir con ese borrador», «Cancelar borrador», unsaved-changes guard and double-submit blocking as today.
- **Notices in the review step,** each shown only when it applies:
  - Always: «Se copia el mensaje y se abre el chat de @usuario. Pegalo y envialo desde la cuenta de Instagram de Hospeda: cuando Instagram nos avise del envío, se confirma solo.»
  - Always: «Tenés que estar con la sesión de Hospeda en Instagram, en este navegador o en la app. Con otra cuenta el envío no se registra y vas a tener que confirmarlo a mano.»
  - The integration cannot confirm (`instagramAutoConfirm=false`, see 2.6): «La conexión con Instagram no está activa: este envío no se va a confirmar solo. Después vas a tener que contestar "¿Lo enviaste?".»
  - Another active business has the same username (`instagramShared=true`): «Otro negocio tiene el mismo usuario de Instagram: los mensajes de este chat no se asocian solos y el envío no se va a confirmar solo.»
- **Help text** next to the button: «Se abrirá Instagram con el mensaje copiado. Instagram no permite cargar el texto en el chat: lo pegás vos.»

### 2.3 «Abrir Instagram»

On click, inside the same user gesture and before any `await`:

1. The CRM writes the saved final text (`text_body`, never unsaved editor content: the button is disabled while dirty) with `navigator.clipboard.writeText`. If that rejects, it falls back to `execCommand('copy')` like `ManualCommunicationForm`.
2. On pointer devices (`(pointer: fine)`), it opens `about:blank` in a new tab with `opener=null`, as `MessageComposer` does for WhatsApp.
3. It sends `dispatch` (existing action, same Zod input).
4. On success, it points the open tab at `https://ig.me/m/<username>` (URL built by a helper `instagramChatUrl({username})` that accepts only `^[a-z0-9._]{1,30}$`) and shows the toast «Mensaje copiado: pegalo en el chat (Ctrl+V)». On macOS the copy is «(⌘V)».

The button shows «Abriendo Instagram…» while pending. After success the composer shows «Estado del contacto» with the waiting state (2.4).

**Mobile** (`(pointer: coarse)`, phones and tablets):
- Programmatic navigation of a pre-opened blank tab does not reliably hand `ig.me` to the Instagram app, so no tab is pre-opened.
- The click copies (inside the gesture) and records the attempt.
- On success the composer shows a large link-button «Ir al chat de @usuario en Instagram» (a real `<a href target="_blank" rel="noreferrer">`). The seller's tap on it opens the app.
- The toast reads «Mensaje copiado: en el chat mantené apretado y elegí Pegar».

**Opening the same attempt again.** After the attempt is recorded, the composer and the bubble's «⋯» menu offer «Copiar y abrir de nuevo». It copies the same text and opens the same `ig.me` URL, client-side only. It creates no new attempt and makes no request.

**Failure cases:**
- **Clipboard denied** (both methods fail). The attempt is still recorded and the chat still opens. The composer shows «No pudimos copiar el mensaje. Copialo desde acá:», a read-only textarea with the text selected and a «Copiar» button that retries from that user gesture. The toast becomes «Instagram abierto. Copiá el mensaje desde el CRM y pegalo en el chat.»
- **Popup blocked** (`window.open` returned `null` on desktop). The attempt is still recorded. The composer shows «No se pudo abrir Instagram automáticamente. El intento quedó guardado como no confirmado.» with the link «Abrir el chat de @usuario en Instagram». The link copies again on click.
- **Missing or invalid username.** The channel option is disabled (2.1). If the username was removed after the draft was prepared, `dispatch` answers 409 «Cambió el Instagram del negocio. Prepará un nuevo borrador.», the same way as a changed phone or email. Nothing is opened: the pre-opened tab is closed.
- **Server refusal** (permissions, «No contactar», restriction, closed management, archived). The error from the server is shown, the pre-opened tab is closed and the text stays in the composer. The clipboard keeps the text: harmless, and it is not a send.
- **Network error or uncertain answer.** Same as WhatsApp. The composer reloads the message: if `dispatch` committed, the status is already `instagram_opened` and «Copiar y abrir de nuevo» is offered. Nothing retries automatically.

### 2.4 Waiting for the echo, then «¿Lo enviaste?»

- An opened attempt is `instagram_opened` («Instagram abierto · envío no confirmado»).
  - It is an unconfirmed send everywhere `whatsapp_opened` is: dashed bubble, the hint «No sabemos si se envió…», «Requiere acción», Hoy's pending outcomes, `needsSentAnswer`, `OUTCOME_READY_STATUSES` and `sentTone`.
  - One helper, `isOpenedUnconfirmed(status)`, replaces the literal `'whatsapp_opened'` checks: `communicationTimeline.ts:165`, `ConfirmSendButtons.tsx:10`, the `outcome` guard at `communicationService.ts:513`, `pendingContactOutcomes` at `communicationService.ts:426/429`, and `contactOutcome.ts`.
- **Waiting period: 15 minutes** after the open (`INSTAGRAM_ECHO_WAIT_MS`). During that time:
  - the bubble and the composer show «Esperando que Instagram confirme el envío…», with the hint «Si lo enviaste desde la cuenta de Hospeda se confirma solo. Si no llega en 15 minutos te preguntamos si lo enviaste.»;
  - the attempt is not listed in «Requiere acción» or in Hoy's pending outcomes;
  - «Sí, se envió» / «No se envió» stay available in the bubble's «⋯» menu and in the composer, for a seller who knows the answer.
- **After 15 minutes without an echo,** the attempt shows the normal «¿Lo enviaste?» with «Sí, se envió» / «No se envió», in the summary and on the bubble, exactly like WhatsApp. The window is computed from `last_interaction_at`. The existing live refresh updates the UI when an echo resolves the attempt.
- **It never expires.** An unanswered attempt stays in «Requiere acción» like an unanswered WhatsApp today. Turning silence into «no se envió» would infer a state without evidence. See D2.
- **Answering by hand:**
  - «Sí, se envió» makes it `manual_sent` (same `outcome` action, now accepted for `instagram_opened`). A later matching echo only links its `mid` to it (2.5): no second row.
  - «No se envió» makes it `manual_not_done`. A later echo is never matched to it: it is recorded as a standalone echo, as today. The seller's explicit answer is not rewritten.

### 2.5 Echo-to-attempt matching (webhook)

In `POST /_api/inbound/instagram` (`src/endpoints/inboundInstagram.ts`), an echo whose chat resolves to exactly one business (today's rule: username from `crm_instagram_contacts` → normalized `perfil_instagram`, trash excluded) looks for an attempt to resolve **before** inserting a new row. It runs inside the existing transaction, after the existing business lock (`lockCommunication`), the `pg_advisory_xact_lock(hashtext(mid))` lock and the "mid already seen in either table" check.

**Candidates** (`crm_messages`, `FOR UPDATE`):
- same `account_id` as the echo's business, `channel='social'`, `destination_detail='instagram'`, `owner_email <> 'instagram@hospeda'`;
- normalized `recipient` equals the echo's username. We match by username, not IGSID: attempts store `@usuario`, the echo is resolved to a username before any business match, and an echo without a username never matches a business;
- `status='instagram_opened'`, **or** `status='manual_sent' AND external_id IS NULL` (confirmed by hand, not yet linked);
- `last_interaction_at` between `echo time − 24 h` and `echo time + 10 min`. These are the same windows as the WhatsApp user script (decisiones, «WhatsApp abierto y el user script»);
- the echo text matches the copied text: `sentMatchesPrepared(text_body, echoText)` from `userscript/src/textMatch.ts`, a Dice word overlap ≥ 0.5 (decisiones: a hand-written message is not attributed to the template).

**Order:** `instagram_opened` before hand-confirmed rows, then the **newest** `last_interaction_at`. The first one wins. One echo resolves at most one attempt. Other open attempts stay as they are and fall back to «¿Lo enviaste?».

**What happens to the matched row.** No echo row is inserted.
- **`instagram_opened` →**
  - `status='manual_sent'`, `external_id=mid`, `text_body` and `summary` set to the echo text (what was actually sent; `body` keeps the prepared text), `last_interaction_at` set to the echo time;
  - the activity result becomes «Envío confirmado por Instagram»;
  - the task attached by `task_id` completes as with «Sí, se envió», and `markClientForCare` runs;
  - journal `contact_resolved`: `automatic:true`, `triggeredBy:'instagram-webhook'`, `actor:null`, `after:{status:'manual_sent', externalId, source:'instagram_echo', textEdited:boolean}`.

  The message keeps its owner, management, contact, template and delegation. The echo's «single open management» heuristic does not apply.
- **`manual_sent` without `external_id` →** only `external_id=mid` is set, with journal `contact_linked` (`triggeredBy:'instagram-webhook'`), as `completeUserscriptOpened` does for WhatsApp.
- **The bubble.** It is the seller's sent bubble («Nosotros», the seller's name), with the status line «Enviado · confirmado por Instagram» (a new `sentStatusLabel` case: `social` + Instagram + `manual_sent` + `external_id` + not the echo owner). If `textEdited`, the bubble shows the sent text and a muted «Editado antes de enviar» line. The prepared text stays available in «⋯» → «Ver texto preparado».

**Rules that keep it safe:**
- **Idempotency.** After resolution the attempt holds `external_id=mid`, so a Meta retry hits the existing "mid already seen" check and returns 200. `UNIQUE(channel, external_id)` on `crm_messages` still guards the race. The advisory lock on the `mid` plus the business lock serialize two different echoes for the same attempt: the second sees the row no longer `instagram_opened` and becomes a standalone echo.
- **System path, no user permission.** The webhook is authenticated by its signature, not a session. Resolution uses a system variant of the completion code that does not call `communicationContext` or `assertAccountReadable` with the seller's current permissions. The activity's `actor_email` is the attempt owner, the journal actor is the system. A seller who lost access, or was deactivated, between the open and the send must not break the webhook.
- **Errors fall back.** Any error in the resolution step rolls back only that step (savepoint) and the echo is stored as a standalone row, as today. The webhook never answers 503 because of an attempt, so Meta does not retry forever.
- **«No contactar» set after the open** does not block the resolution. The message was already sent, the same rule as spec 88 for echoes (record, do not block). `markClientForCare` keeps its D4 rule: no client mark on a «No contactar» business unless an admin records it.
- **Echoes with no matching attempt** (no attempt, text too different, outside the window, attempt answered «No se envió», two businesses with the same username, unmatched chat) are stored exactly as today: an `instagram@hospeda` `manual_sent` row, or an unmatched outgoing inbound. Associating an unmatched chat by hand later (spec 88 D2) moves its rows but does not resolve attempts.
- **Several echoes for one attempt** (the seller sends a greeting, then the pasted text): only the one whose text matches resolves the attempt. The others are standalone echoes.

**Echo before the attempt is recorded.** This is rare: the seller sent the text from Instagram first and then used «Abrir Instagram», or `dispatch` committed after a slow retry. While recording the attempt, `dispatch` looks for a standalone echo that:
- has `owner_email='instagram@hospeda'`, the same business and the same normalized recipient;
- was received in the last 10 minutes;
- matches the text.

If one exists, in the same transaction:
- the attempt is resolved with the echo's time and text, as above, with `after.source:'instagram_echo_earlier'` and the echo id;
- the echo row becomes `voided` (journal `interaction_voided`, reason «Unido al intento <id> abierto desde el CRM»). It keeps its `external_id`, so a Meta retry is still a no-op.

Voided rows already stay out of lists, counters, last activity and search (decisiones, spec 85 integration). The composer then shows «Ya está enviado: Instagram confirmó este mensaje.» and opens nothing. See D3.

### 2.6 Data and server

- **Migration `049_instagram_opened.sql`.** It replaces `crm_messages_status_check` with the 042 list plus `instagram_opened`. No new columns:
  - `destination_detail='instagram'` already marks Instagram (`isInstagramOutbound`);
  - `recipient` holds `@usuario`, the same format as echoes;
  - the open time is `last_interaction_at`, which nothing else changes while the status is `instagram_opened`;
  - the echo `mid` goes to the existing `external_id`.

  No new index: candidates are filtered by `account_id` (indexed) and are a handful per business. The migration test replays it on a copy, like the other `test-*-migration` scripts.
- **Zod inputs.** `prepare` and `prepare_general` accept `channel:'instagram'` (`communication.schema.ts:14-15`). The stored row is:
  - `channel='social'`, `destination_detail='instagram'`;
  - `recipient='@'+normalizeInstagramUsername(account.perfil_instagram)`, `recipient_name=account.nombre`, `contact_id` null (or the chosen person, kept only as context; the destination is still the business username);
  - the body is plain text, from `social` templates.

  `channelTarget` gets an Instagram branch: business-level only, 409 «El negocio no tiene un usuario de Instagram válido.» when missing. The draft-reuse query works unchanged with these values.
- **Same checks as WhatsApp,** every write path server-side:
  - `prepare`, `prepare_general`, `edit` and `dispatch` run `communicationContext(..., write=true)` / `messageFor` (owner or admin), `assertMessageTaskContext` (delegation), and `assertAccountContactAllowed(..., 'social')`: trash, «No contactar», archived, closed management, and restrictions on `social` or `all` for the business, management or person;
  - plus the «Nuevo» status rule (verification purpose only).

  Read access grants nothing.
- **`dispatch` for Instagram,** in its claim transaction:
  - checks the draft and its revision, as today;
  - re-reads `perfil_instagram` and compares it with `recipient` (409 if it changed);
  - sets `status='instagram_opened'` and `last_interaction_at=now()`;
  - creates the activity «Instagram abierto · envío no confirmado» and the journal `instagram_opened_unconfirmed` (with recipient and content, like WhatsApp);
  - runs the echo-first check (2.5);
  - returns `{message, url:'https://ig.me/m/<username>'}`.

  Nothing is sent through Meta's API.
- **`outcome`** accepts `manual_sent` / `manual_not_sent` for `channel='social'` + `destination_detail='instagram'` + `instagram_opened`, with the same checks. «No se envió» records the activity «Instagram marcado como no enviado».
- **Read-only flags.** The `prepare` / `prepare_general` response for Instagram includes:
  - `instagramAutoConfirm`: `INSTAGRAM_APP_SECRET` and `INSTAGRAM_ACCOUNT_ID` are set, `INTEGRATION_SECRETS_KEY` is valid, and the stored token is not expired. Without a token, echoes cannot be resolved to a username and stay unmatched;
  - `instagramShared`: another active business normalizes to the same username.

  They expose no secret and no other business's data, only booleans.
- **Labels:**
  - `messageLabels.instagram_opened` = «Instagram abierto · envío no confirmado»;
  - `historyLabels.instagram_opened_unconfirmed` = «Instagram abierto, envío sin confirmar»;
  - Historial shows one entry per resolved attempt, with no extra echo entry.

## 3. Rules that do not change

- Opening Instagram, copying the text, saving a draft or moving a stage is not evidence of contact, reply, acceptance, payment or delivery. `instagram_opened` is unconfirmed until Meta's echo or the seller says otherwise. The echo is evidence that a message left Hospeda's account, not that it was read or answered.
- Server-side permission and «No contactar» checks on every write path. Receiving an echo is not blocked by «No contactar» (spec 88).
- Registering a response stays explicit. Received Instagram messages stay «Por revisar» (spec 88 D3). No auto-retry of uncertain operations. Nothing is sent through Meta's API.
- Echoes without a matching attempt are stored exactly as today.
- Business days in Argentina via `crmDates.tsx`. The 15 min, 10 min and 24 h windows are instants, not business days.

## 4. Scope and non-goals

- **In scope:** the «Instagram» channel in «Contactar» (with and without management, delegated tasks included), the Instagram composer, «Abrir Instagram», `instagram_opened`, echo resolution in the webhook, «Preparar respuesta» and Bandeja «Responder» for Instagram, labels, guide and docs.
- **Not in scope:**
  - sending through Meta's API (24-hour window), which is spec 88 phase 2;
  - prefilled text in `ig.me` (not supported);
  - a person-level Instagram field: `crm_contacts` has none, and inbound matching uses only the business;
  - sales material over Instagram;
  - other social networks;
  - resolving attempts when an unmatched chat is associated by hand;
  - turning silence into «no se envió».
- **Mobile:** must work at 390 px and on iOS and Android with the Instagram app installed. Real devices are checked by hand (section 5), because Playwright cannot hand `ig.me` to the app.

## 5. Acceptance

- **On a business with `perfil_instagram`,** «Contactar» → «Instagram» → model → edit → «Abrir Instagram»:
  - copies the saved text;
  - opens `https://ig.me/m/<username>` in a new tab;
  - shows «Mensaje copiado: pegalo en el chat (Ctrl+V)»;
  - leaves a dashed bubble «Esperando que Instagram confirme el envío…».

  Without a username the option is disabled with its reason.
- **A signed echo** with similar text within 24 h turns that bubble into the seller's sent bubble «Enviado · confirmado por Instagram»:
  - there is no extra «Instagram de Hospeda» bubble and no second Historial entry;
  - the attached task is completed.

  Replaying the same echo changes nothing.
- **An echo with a different text,** an echo after 24 h, or an echo for a business with no attempt is stored as today, and the attempt asks «¿Lo enviaste?» after 15 minutes.
- **With two open attempts,** the echo resolves the newest one with matching text. The other one remains.
- **«Sí, se envió» before the echo,** then the echo: one row, linked to the `mid`. «No se envió», then the echo: the attempt stays «no se envió» and the echo is stored on its own.
- **Echo first, then «Abrir Instagram» within 10 minutes:** one row, the echo is voided, and the composer says it is already sent.
- **Failure cases:** clipboard denied shows the text with «Copiar». Popup blocked shows the link. A username changed after the draft gives 409. «No contactar», a `social` restriction, an archived business, a closed management and a read-only user are refused by the server on `prepare`, `edit`, `dispatch` and `outcome`.
- **«Preparar respuesta»** on a business whose last received message is Instagram from its own username opens the Instagram composer. A different sender, no username or a restriction falls back with the reason.
- **Mobile:** at 390 px the flow ends in «Ir al chat de @usuario en Instagram». It was checked by hand on a real iPhone and Android phone (opens the app, the text pastes, the echo resolves the attempt) against local staging with a temporary tunnel, as in the spec 88 test.

**Tests:**
- **Unit and component tests:**
  - `instagramChatUrl` (valid, invalid, encoding);
  - `isOpenedUnconfirmed`, `needsSentAnswer`, `OUTCOME_READY_STATUSES` and `sentTone` with `instagram_opened`;
  - `requiresAction` hiding Instagram attempts during the waiting period and showing them after it;
  - `sentStatusLabel` for resolved attempts;
  - `replyTarget` Instagram cases (match, different sender, no username, restriction `social` / `all`);
  - the pure echo-candidate picker (window edges, newest wins, opened before hand-confirmed, text threshold, «No se envió» excluded);
  - `MessageComposer` Instagram: copy and open in the same gesture, toast, clipboard-denied fallback with «Copiar», popup-blocked link, mobile link-button, «Copiar y abrir de nuevo» makes no request, double click blocked, button disabled while dirty;
  - `BusinessContactDialog` Instagram option and disabled reason.
- **Integration:**
  - `scripts/test-instagram.ts` cases with mocked Meta:
    - resolution without a new row;
    - retry of the same `mid`;
    - two attempts;
    - different text;
    - outside 24 h;
    - hand-confirmed link only;
    - «No se envió» untouched;
    - no attempt (unchanged behaviour);
    - shared username (unmatched, no resolution);
    - attempt owner without access or deactivated (still resolves, returns 200);
    - «No contactar» set after the open;
    - a forced error in resolution (stored as a standalone echo, returns 200);
    - echo first, then `dispatch` (voided echo, retry no-op).
  - `scripts/test-communication.ts` cases:
    - `prepare` / `prepare_general` / `edit` / `dispatch` / `outcome` for Instagram with every gate (permissions, delegation, «No contactar», `social` / `all` restriction, archived, closed management, «Nuevo» purpose, missing or changed username);
    - journal and activity on open;
    - `pendingContactOutcomes` after the waiting period.
  - A migration replay for `049` (checksum, CHECK accepts `instagram_opened` and keeps the 042 values).
- **E2E:** `tests/browser/instagram-open-chat.e2e.ts`:
  - clipboard permission granted, `ig.me` intercepted by a route (no real network);
  - a signed webhook echo posted with the test secret turns the bubble into a sent bubble without a duplicate;
  - «Preparar respuesta» from an Instagram message;
  - 390 px viewport with the link-button.

  Existing e2e tests are updated without weakening assertions.
- **Docs when it closes:**
  - `docs/decisiones.md`: the rule that «Preparar respuesta» only prepares email or WhatsApp changes, and the Instagram echo matching rule is added;
  - `docs/estado-desarrollo.md` and `docs/pendientes.md`;
  - the user guide: «Abrir Instagram», the Hospeda session, and what to do when it is not confirmed.

## 6. Decisions (owner, 27/10/2026)

Resolved: D1 → 1, D2 → 1, D3 → 1, D4 → 1 (the recommended options).

**D1. How an opened Instagram attempt is stored.**
1. **New status `instagram_opened`** (migration `049` changes the CHECK). Every literal `whatsapp_opened` check goes through `isOpenedUnconfirmed`.
   - For: honest labels, the same UI as WhatsApp, and a clear target for echo matching.
   - Against: one migration and about ten code places to touch.
2. **Reuse `manual_pending`** (the «Red social» manual attempt). No migration.
   - Against: `manual_pending` means «Intento pendiente, falta anotar el resultado», has its own finish form and is matched without text by the user script. It would mix two flows.
- **Recommendation: 1.**

**D2. No echo arrives.**
1. **After 15 minutes, show the normal «¿Lo enviaste?»; never expire.**
2. **Expire to «no se envió» after N hours.**
- **Recommendation: 1.** Expiring infers a state from silence, which AGENTS.md forbids. Missing echoes are expected when the seller uses another account or the token is down, and in those cases the message may well have been sent.

**D3. Echo that arrives before the attempt (within 10 minutes).**
1. **Merge:** `dispatch` resolves the attempt with that echo and voids the echo row.
   - For: one bubble, the author, management and task are kept.
   - Against: a voided row that only an admin sees with «Mostrar anulados».
2. **Leave both:** the attempt asks «¿Lo enviaste?», and answering «Sí» shows two bubbles for one message.
- **Recommendation: 1.**

**D4. Echo text different from the copied text.**
1. **Resolve only when the words overlap ≥ 0.5,** the same rule as the WhatsApp user script. Otherwise it is a standalone echo, and the attempt falls back to «¿Lo enviaste?».
2. **Resolve with any echo in the window,** whatever the text.
- **Recommendation: 1.** A quick «Hola» or another seller's reply in the same chat would otherwise claim the attempt and its author. A real edit keeps most of the words.
