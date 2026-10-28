# Spec 96 — Contact in three clicks, with a connected user script

Status: implemented on `feat/contact-three-clicks-96` (28/10/2026, no PR yet; e2e and integration suites validated only in CI). Decided by the owner on 28/10/2026 (items A1–A7 and B1–B5 of the request); the open questions of section 9 were answered the same day (section 10). Sections 8 (D5–D9) record the defaults this spec chose where the code left a fork. Type: UI flow change in the contact dialogs and the composer, server changes in `prepare` and in response registration (10.1), and user script 1.5.0. No new endpoint, no new permission; one migration if 10.1 needs a marker column. It does not change what counts as contact, «No contactar» gating or the echo confirmation of [spec 92](92-instagram-open-chat.md).

Builds on [spec 91](91-communication-polish.md) (action bar, «Responder»), [spec 92](92-instagram-open-chat.md) («Abrir Instagram») and [spec 94](94-instagram-userscript.md) (user script 1.4.0, Instagram handoff).

## 1. Problem

Contacting a business by WhatsApp today takes six to eight clicks and three screens:

1. «Contactar» (`CommunicationActionBar.tsx`, or the header button in `CommercialPanel.tsx`).
2. `BusinessContactDialog.tsx`: «¿Sobre qué?», «Propósito del contacto» (general case only), «Canal», then «Continuar con el mensaje».
3. `ContactTemplateDialog.tsx` (with a management) or `GeneralMessageStep.tsx` (without one: a template `<select>` plus «Preparar mensaje»).
4. `MessageComposer.tsx`: the editor opens first (`editing` starts `true`), «Guardar y ver contenido final» (the `edit` action), the checkbox «Revisé destinatario y contenido final», then «Abrir WhatsApp con este mensaje».
5. Without `onLog`, the footer then offers «Anotar cómo salió» and leaving asks «¿Salir sin anotar cómo salió?» (`OutcomeAfterContact.tsx`, `leaveWithoutOutcome`).

Separately, on a computer the WhatsApp auto-confirmation and the Instagram paste depend on the user script, but nothing stops a seller with no script, an old one or one without a token from contacting, and the attempt then sits in «Requiere acción».

## 2. Final behaviour — contact in three clicks (A)

### 2.1 Entry points

| Entry point | Today | After |
| --- | --- | --- |
| Comunicación action bar (`CommunicationActionBar.tsx`, business page only: `LeadDetailDialog.tsx` passes no `onContact`) | «Contactar» | Three buttons «WhatsApp», «Instagram», «Email» (2.2), then «Registrar ▾» and «Enviar material» as today. |
| Header «Contactar» (`CommercialPanel.tsx` line 130), row «Contactar» (`BusinessRowActions.tsx`), drawer «Contactar» (`BusinessPreviewDrawer.tsx`) | `BusinessContactDialog` without a channel | The contact step (2.3) with the compact channel choice. |
| «Responder» (spec 91 item 10), Bandeja (`inbox/InboxDetail.tsx`, `contactPreset`) | `BusinessContactDialog` with `initialChannel`/`initialContactId`/`initialLeadId` | The contact step with that channel, person and management preselected. |
| «Enviar material» (`CommercialPanel.tsx`, `initialMaterial`) | `BusinessContactDialog` | The contact step with the compact channel choice limited to WhatsApp and Email (only they carry material, spec 89 §8.2). |
| Task without management (`TaskContactDialog.tsx` line 53) | `BusinessContactDialog` with `initialChannel` | The contact step with that channel, `onLog` kept (2.6). |
| Task with management (`TaskContactDialog.tsx` line 54), `NextWork.tsx`, `my-day.tsx` (through `WorkPanel` → `TaskContactDialog`), `sale.tsx` (`?contact=`), `_index.tsx` (`?contact=`, `openContact`) | `ContactTemplateDialog` with a known channel | Unchanged entry; they get the new composer (2.4–2.5). `TaskContactDialog` keeps its own recipient/channel/call screen: it is also the task's completion hub. |
| «Registrar ▾ → Llamada u otro contacto» on the business (`RecordContactDialog` → `onContact('call')`) | `BusinessContactDialog` with `call` | The call dialog (2.7). |

### 2.2 Channel buttons in the action bar

- `CommunicationActionBar` renders «WhatsApp», «Instagram», «Email» (Lucide `MessageCircle`, `Instagram`, `Mail`) instead of «Contactar». Each calls `onContact(channel)`; `ContactChannel` already includes them (`communication/types.ts`).
- Each is disabled with a reason (the shared `Button` `disabledReason`), first match wins:
  1. business not loaded: «Estamos cargando los datos del negocio.»;
  2. «No contactar»: `CONTACT_DNC_REASON`;
  3. archived: the archived reason used in `BusinessContactDialog` (`archivedReason`);
  4. the user can modify neither the business nor any open management (same rule as `TaskContactDialog`'s general `canPrepare`: `canModifyBusiness || some(canModifyManagement)`): the business permission reason;
  5. missing data: WhatsApp needs a business phone/WhatsApp or an active person with a phone; Email a business or person email; Instagram `normalizeInstagramUsername(perfilInstagram)`, else `INSTAGRAM_MISSING_REASON`;
  6. WhatsApp and Instagram only: the user script gate (3.3).
- One line on desktop, wrapping only on narrow screens (spec 91 §6). Read-only and archived-read-only views keep today's visibility rules.

### 2.3 The contact step (replaces `BusinessContactDialog`'s first screen and `GeneralMessageStep`)

The «Propósito del contacto» + «Canal» screen is removed. One step shows, top to bottom, only what applies:

1. **Channel** (only when the entry point did not give one): a compact segmented control «WhatsApp · Instagram · Email» with the same disabled reasons as 2.2, plus a small link row «Otro: Llamada · Red social · Otro canal» that opens 2.7. No separate screen.
2. **«Sobre»** inline: the management is auto-picked exactly as today (`sobre` in `BusinessContactDialog`: `initialLeadId` when open, the only open management, or «Sin gestión» when none is open). It renders as one line «Sobre: <gestión> · <etapa>» with «Cambiar» when alternatives exist. A required inline select appears only with two or more open managements. «Iniciar gestión» stays available (`CommercialEditor`) when none is open.
3. **Purpose** (only «Sin gestión»): a chip «Propósito: <label>» with an inline select (`contactPurposeOptions`), default `defaultContactPurpose(account.status)`. «Otro» shows «Aclaración del propósito»; «care» on a non-client shows the existing checkbox. `contactPurposeBlockReason` still blocks template choice and the final button with its reason.
4. **Recipient**: auto-picked by `channelRecipientChoice` (management) or the `GeneralMessageStep` rule (general) as today. A compact line «Para: <persona> · <dato>» with «Cambiar»; a required inline select only when `mustChoose` (management) or several candidates (general). Instagram shows `@usuario` only. `PersonPhoneDncNotice`, the recent-contact notice and the «No contactar» alert stay.
5. **Templates**: the current `ContactTemplateDialog` list, unchanged in content (search, «Otra redacción», vertical/profile line, «Escribir un mensaje nuevo»). The general case uses the same list (D5): `templateCompatibility` with `purpose` and `commercialProfile:null` as `GeneralMessageStep` does today, and clicking a template sends `prepare_general` with the purpose. Clicking a template or «Escribir un mensaje nuevo» prepares the draft and opens the composer (2.4).

Implementation note: extend `ContactTemplateDialog` to take a scope (`management` with `lead`, or `general` with `accountId` + purpose) and move the inline pickers into it; delete `GeneralMessageStep.tsx`; `BusinessContactDialog` keeps only the routing (contact step, call dialog, `CommercialEditor`). The floating presentation (`floatingComposer`) applies to both scopes.

### 2.4 Composer opens on the final view

- **Server:** `prepare` and `prepareGeneral` (`src/helpers/communicationService.ts`) also store `text_body` and, for email, `html_body`, computed with `renderFinal` exactly as `edit` does (line 532). Today the insert leaves them null, which is why the composer forces «Guardar y ver contenido final» and `dispatch` rejects an email without `htmlBody` (line 577). `salesMaterialDraft.ts` already re-renders them when present, so «Enviar material» keeps them in sync.
- **Client:** `MessageComposer` starts with `editing=false` when the draft has `textBody` and no unresolved variables; otherwise (blank «Escribir un mensaje nuevo», missing `{{variables}}`, a stale or reused draft) it opens the editor as today.
- The final view shows the content as today plus «Editar». In the editor the save button reads «Guardar cambios» and returns to the final view (the `edit` action, unchanged). The final button stays disabled while there are unsaved changes («Guardá o descartá los cambios pendientes antes de continuar.»).
- The «Editar mensaje / Revisar y confirmar» progress list goes away.

### 2.5 The final button names the destination

- The checkbox «Revisé destinatario y contenido final» is removed (the `confirm` state and its `!confirm` condition).
- Labels: «Abrir WhatsApp con <persona> · <teléfono formateado>» (only the phone when there is no person name), «Abrir Instagram de @<usuario>», «Enviar email a <dirección>». Pending: «Abriendo WhatsApp…», «Abriendo Instagram…», «Enviando email…» as today.
- The click still sends `dispatch` with `confirm:true` (the server requires it). The `window.open('about:blank')` pre-open (WhatsApp, `dispatchMessage`) and the synchronous copy plus pre-open (Instagram, `openInstagram`) stay synchronous in the click, before any `await`.
- Disabled while: busy, dirty, no `textBody`, a purpose block (2.3), the script gate (3.3, WhatsApp/Instagram on desktop) or `sentBlockReason`-style restrictions already shown today.

### 2.6 After the open: close with a toast

Without `onLog`:

- **WhatsApp:** when `dispatch` succeeded and the pre-opened tab received the URL, the composer closes (`onFinished`) and a toast says «WhatsApp abierto para <destino>. Si el script registra el envío, se confirma solo; si no, lo vas a ver en «Requiere acción».» No «¿Lo enviaste?», «¿Cómo salió?» or «¿Cómo sigue?» at that moment.
- **Instagram:** the same once `handleInstagramOpened` finished (handoff wait included), with the existing `instagramOpenedToast` text.
- **Email:** when Brevo accepted, close with «Email enviado a <dirección>. La entrega se confirma por separado.»
- **Stays open** (no auto-close) when the outcome is uncertain or needs the seller: popup blocked (WhatsApp `externalUrl` link, Instagram `popupBlocked`), Instagram copy failed (manual copy area), `alreadyConfirmed`, email `submitting`/`unknown`/`failed`, or any error. Nothing is retried automatically.
- The chained outcome is removed from these flows: no «Anotar cómo salió» footer button and no `leaveWithoutOutcome` guard in `ContactTemplateDialog` (and the deleted `GeneralMessageStep`). The unsaved-changes guard stays.
- Afterwards: an unconfirmed WhatsApp/Instagram attempt stays in «Requiere acción» with «Sí, se envió / No se envió» (existing); the user script confirms WhatsApp sends it registers (existing `openWhatsapp` matching in `src/endpoints/userscript.ts`); Meta's echo confirms Instagram (spec 92); the business's answer is registered with «Registrar respuesta» (existing).

With `onLog` (tasks: `TaskContactDialog` → `WorkPanel` completion, `NextWork` activity): unchanged. The composer stays open after the open, keeps «¿Lo enviaste?» (`hideWhatsAppResolution={!onLog}`) and «Anotar lo que pasó», because completing the task needs that step. Delegated drafts (`taskId`) keep sending `taskId` on every action.

«Enviar material» (`initialMaterialId`): the auto `material_add` still runs once on the fresh draft; the composer shows the final view after it.

### 2.7 Call, social and other channels

They keep their current flows and their outcome chain (`PhoneCallPanel`, `ManualCommunicationForm` with `chainOutcome`). Their dialog asks «¿Sobre qué?» and, for «Sin gestión», the purpose, as today, with the channel fixed by the entry point (no «Canal» select). Out of the three-click goal.

## 3. Final behaviour — a connected, current user script on desktop (B)

### 3.1 User script 1.5.0 announces its connection

- On the CRM origin (`siteFor` → `crm`, `main.ts`), besides `announceInstalled` and `listenForInstagramHandoff`, the script runs `watchConnection` (new, `userscript/src/connection.ts`):
  - no token in GM storage (`hospeda-userscript-token`): `missing-token`, no request;
  - otherwise `unknown`, then `fetchStatus(BASE, token)` (`api.ts`, `GET /_api/userscript/status` with the bearer token through `GM_xmlhttpRequest`, allowed by the existing `@connect`): 2xx → `connected`; 401 → `rejected`; 426 → `outdated`; network error, timeout or 5xx → `unknown`.
- It sets `data-hospeda-userscript-connection` on `<html>` (exported `CONNECTION_ATTRIBUTE` in `announce.ts`) to one of `connected | missing-token | rejected | outdated | unknown`, and dispatches the existing `INSTALLED_EVENT` on every change.
- Re-checks: when the tab becomes visible (`visibilitychange`), at once when the state is not `connected` (the seller may have just pasted the token in WhatsApp Web), throttled to 2 minutes when it is; and when the page dispatches `hospeda-userscript-recheck` on `document` (the «Verificar de nuevo» link, 3.3).
- The page only ever sees the state string. The token and the status response body never leave the script. The Instagram module is untouched (spec 94 §2.4).
- `USERSCRIPT_VERSION` → `1.5.0` (`userscript/src/version.ts`); `scripts/verify-userscript-build.mjs` checks it.

### 3.2 Minimum version

`USERSCRIPT_MIN_VERSION` (`src/helpers/userscriptPure.ts`) goes from 1.3.0 to **1.5.0** (D7). A 1.4.x script then gets 426 in WhatsApp Web and shows the existing update prompt. The CRM gate already blocks anything below the bundled version, so raising the minimum does not change the CRM side; it makes WhatsApp Web say the same thing and prompts the update where sellers work. Impact: from the deploy, 1.3.x/1.4.x stop registering in WhatsApp Web until updated. **Distribution step:** publish 1.5.0 and ask sellers to update before or at the deploy (the same as 1.3.0 in `docs/pendientes.md`).

### 3.3 The gate in the CRM

- **Desktop** means `!isCoarsePointer()` (`InstagramOpenChat.tsx`), the check that already picks the profile vs `ig.me` in `instagramTarget`. Coarse pointer (phones, tablets) is never gated. Email is never gated.
- `useUserscriptStatus()` (new `src/helpers/useUserscriptStatus.ts`) replaces `useInstalledUserscript` in `src/pages/userscript.tsx`: it returns `{version, connection}`, reading both attributes, listening to `INSTALLED_EVENT`, and resolving `version` to `null` after `DETECT_TIMEOUT_MS` (2 s), as today.
- `userscriptContactBlock({mobile, version, connection, latest})` (new pure helper `src/helpers/userscriptGate.ts`) returns the reason or `''`:

| Situation | Reason (with link «Ir a User script» → `/userscript`) |
| --- | --- |
| waiting (first 2 s) | «Buscando el script de Hospeda…» (disabled, no link) |
| not detected | «Instalá el script de Hospeda para contactar por WhatsApp o Instagram desde la computadora.» |
| version below `USERSCRIPT_VERSION` | «Actualizá el script (tenés 1.4.0, la actual es 1.5.0).» |
| `missing-token` | «Conectá el script: falta el token.» |
| `rejected` | «El token del script fue revocado o no es válido: creá uno nuevo.» |
| `outdated` | same text as the version row |
| `unknown` or attribute missing | «No pudimos verificar el script con el CRM.» plus «Verificar de nuevo» |

- Applied to the WhatsApp and Instagram buttons of 2.2, the compact channel choice of 2.3 and the final button of 2.5 (also for entry points that open `ContactTemplateDialog` directly). The reason shows as the disabled tooltip and as a visible status line with the link under the buttons, so the link is reachable.
- Not applied to actions on an attempt that already exists: «Copiar y abrir de nuevo», «Abrir el mismo intento en WhatsApp», «Sí, se envió / No se envió».
- The gate is a usability guard, not a security control: any script on the CRM page could set the attributes. The server checks are unchanged.
- **No admin override** (D8): nothing in the code needs one (admins contact through the same composer, phones and email stay open, and `confirm:true` is checked server side regardless).

### 3.4 The `/userscript` page

`InstallStatus` adds a «Conexión» line: «Conectado», «Falta el token», «Token rechazado», «Versión rechazada por el CRM», «Sin verificar» (with «Verificar de nuevo»). The rest of the page is unchanged; copy mentions that WhatsApp and Instagram from the computer require the script connected and current.

## 4. Rules that do not change

- Opening a channel, preparing or saving a draft is not evidence of contact, reply, acceptance, payment or delivery. Closing the composer after the open records nothing more than today's `whatsapp_opened` / `instagram_opened` / email submission.
- Server-side permission, «No contactar», restriction and archived checks on every write path (`dispatch` keeps requiring `confirm:true`). Read access grants nothing else.
- No auto-retry of a send whose outcome is uncertain.
- Business days in Argentina via `crmDates.tsx`; the 15-minute Instagram echo wait is an instant, as today.
- Call, social, other channels and «Registrar respuesta» keep their flows.

## 5. Scope and non-goals

- In scope: 2.1–2.7, 3.1–3.4, the `prepare` final render, tests, the user guide (`src/content/user-guide.json`, regenerate `docs/guia-de-uso.md`) and project docs.
- Not in scope: changing templates or their policy; the WhatsApp Web panel UI; a server-side check of the script; changing Hoy's «Anotá cómo salió» query itself (`pendingContactOutcomes`; the response rule of 10.1 resolves the outcome instead); mobile UX beyond working at 390 px; accessibility-only work (deferred by the owner).

## 6. Risks

- **Popup gesture.** Any `await` before `window.open` or the Instagram copy breaks popups and the clipboard. Keep the pre-open in the click handler; the label change must not move it.
- **Prepare render cost.** `renderFinal` now runs on every prepare (one extra render per draft). Acceptable; it is the same work `edit` does.
- **Gate on the latest version.** Every future script release blocks desktop WhatsApp/Instagram until sellers update (Tampermonkey checks daily; WhatsApp Web prompts). See Q2.
- **Script on the CRM makes a request per page load.** One `status` call per full load plus visibility re-checks; it also refreshes the token's `last_used_at` / `last_version`.
- **Tests.** The Playwright browser has no script, so every desktop WhatsApp/Instagram e2e would be gated. Add `tests/browser/helpers/userscript.ts` → `simulateUserscript(page,{version:'1.5.0',connection:'connected'})` (sets the attributes and dispatches the event after load). `instagram-open-chat.e2e.ts` still expects the plain profile: the simulation never acks a handoff.
- **Tests that walk the old steps** (update without weakening assertions; keep checking recipient, content, status and `confirm:true`):
  - e2e: `business-contact`, `mantine-contact`, `material-composer`, `communication-resources`, `seller-flow`, `instagram-open-chat`, `commercial`, `dnc-phone-warning`, `work`, `message-template-policy`, `delegated-contact`, `business-row-actions`, `business-cards`, `hoy-task-rows`, `contextual-work`, `dnc-permissions`, `archived-readonly`;
  - unit/component: `MessageComposer.instagram.spec.tsx`, `ContactTemplateDialog.floating.spec.tsx`, `BusinessContactDialog.instagram.spec.tsx`, `CommunicationPanel.polish.spec.tsx` (bar order, «Responder» fallback copy that names «Contactar»), `CommunicationPanel.view.spec.tsx`, `CommunicationPanel.materials.spec.tsx`, `BusinessRowActions.spec.tsx`, `BusinessPreviewDrawer.spec.tsx`, `TaskContactDialog.spec.tsx`, `src/pages/userscript.spec.tsx`, `userscript/src/userscript.spec.ts`, `src/content/userGuideLabels.spec.ts`.

## 7. Acceptance

- **Click count:** a business with one open management, one person with a phone, a connected 1.5.0 script on desktop: «WhatsApp» (bar) → a template → «Abrir WhatsApp con Ana · +54 9 …» = 3 clicks; WhatsApp opens and the composer closes with the toast. Same for «Sin gestión» with the default purpose, Instagram and Email.
- Unit:
  - `userscriptContactBlock`: each row of 3.3, mobile never blocked, email never asked;
  - `watchConnection` with mocked `fetchStatus`/GM: missing token (no request), 2xx, 401, 426, network error, re-check on visibility and on the recheck event, attribute + event on change only; it never writes the token to the DOM;
  - `prepare`/`prepareGeneral` store `text_body` (and `html_body` for email) equal to what `edit` produces (integration, `scripts/test-*.ts`), and `dispatch` of an untouched prepared email succeeds.
- Component:
  - action bar: three channel buttons, each reason in 2.2's order, the script reason with its link;
  - contact step: no channel screen; channel choice only without a preset; «Sobre» select only with ≥2 open managements; purpose chip only for «Sin gestión», `other` note and `care` checkbox block with their reason; recipient select only when a choice is required; general templates use `prepare_general` with the purpose;
  - composer: opens on the final view for a template draft, on the editor for blank or unresolved drafts; no checkbox; the button names the destination; `dispatch` carries `confirm:true`; `window.open` is called synchronously inside the click; closes with a toast on success; stays open on popup blocked, copy failure, uncertain email and errors; with `onLog` it stays open with «Anotar lo que pasó»;
  - `/userscript`: the «Conexión» line for each state.
- e2e: the click-count scenario above (with `simulateUserscript`); the gated state without the simulation shows «Instalá el script…» and keeps Email usable; the existing suites in section 6 updated.
- The built script contains `@version 1.5.0`; `USERSCRIPT_MIN_VERSION` is 1.5.0.
- `npm run typecheck`, `npm test`, `npm run build` and the CI integration and browser suites green.

## 8. Decisions

- **D1–D4. Owner, 28/10/2026:** per-channel buttons; no purpose/channel screen; inline «Sobre», purpose and recipient only when needed; final view first, no checkbox, destination in the button, close with a toast.
- **D5. One template list for both scopes (default).** `GeneralMessageStep`'s `<select>` + «Preparar mensaje» would add two clicks to «Sin gestión»; the `ContactTemplateDialog` list is the one the owner approved.
- **D6. Final render at prepare time (default).** One server change instead of an automatic `edit` request from the client.
- **D7. Minimum version 1.5.0 (default, see 3.2).**
- **D8. No admin override (default).**
- **D9. Task flows keep their outcome step (default).** `onLog` is how a task gets completed; removing it would break `WorkPanel`/`NextWork`.

## 9. Open questions

- **Q1. Hoy fills up with «Anotá cómo salió».** `pendingContactOutcomes` lists every `whatsapp_opened` / `instagram_opened` / `manual_sent` / email message without an outcome activity, and registering a response does not clear it (only a `do_not_contact` response does). Without the chained step, most contacts will appear there. Recommendation: ship as is (it is the reminder the owner already has) and decide after a week of use whether a registered response should satisfy it.
- **Q2. Gate on the latest or on the minimum version.** The owner asked for the latest. Recommendation: gate on `USERSCRIPT_MIN_VERSION` and show «Hay una versión nueva» as a non-blocking hint when below the latest, so a cosmetic release does not stop sales; raise the minimum when a release must be required.
- **Q3. A token of another user.** `connected` only says the token works, not that it belongs to the CRM user in this browser; the script confirms WhatsApp sends only for the token's user (`openWhatsappAttempts` filters by `owner_email`). Recommendation: the script also announces the token user's email (`data-hospeda-userscript-user`, not a secret) and the CRM blocks with «El script está conectado con otra cuenta (<email>)».

## 10. Owner answers (28/10/2026)

### 10.1 Q1 — a registered response resolves the pending outcome (new rule)

- When, after a send or an opened attempt, someone registers a response for that business («Registrar respuesta» on a received message, `inbound_register`, or «Respuesta registrada sin mensaje», `response_create`), the pending «Anotá cómo salió» of that send is resolved automatically, with that response as its outcome, in the same transaction as the response.
- Attribution: the response's linked message when it is an open send; otherwise, among the open sends of the business, the most recent one in the response's management (or, for a response without management, the most recent one when every open send is in the same management or all are without one). When it cannot be attributed unambiguously (open sends in different managements and the response's management does not single one out), nothing is resolved and they stay pending.
- Never inferred: neither «no respondió» from the absence of received messages nor «respondió» from their presence. Only an explicitly registered response resolves an outcome, and resolving it does not confirm an unconfirmed send («Sí, se envió / No se envió» stays in «Requiere acción»).
- Only when the person registering the response could record that outcome herself (the management's or business's responsible, or an admin); otherwise it stays pending for its owner. Replays of the same response do nothing new (idempotent).
- The outcome is visibly marked «Resultado registrado automáticamente desde la respuesta». A seller with write access to that business or management, or an admin, corrects it from the conversation «⋯» menu («Corregir cómo salió», the same work editor used for completed tasks); the correction is audited like any other activity change and removes the automatic mark.
- Category → outcome: interested → «Respondió, le interesa»; later and not_now → «Pidió que lo contacte más adelante»; rejected → «No le interesa»; do_not_contact → «Pidió no ser contactado»; information, operational and other → «Otro», with the category and summary in the result.

### 10.2 Q2 — gate on the latest version

Block WhatsApp and Instagram on desktop whenever the installed script is below the latest bundled `USERSCRIPT_VERSION` («bloquear siempre»). `USERSCRIPT_MIN_VERSION` also goes to 1.5.0 (D7 stands).

### 10.3 Q3 — the token must belong to the logged-in user

The status endpoint already returns the token owner's email. The script publishes it on the CRM origin as `data-hospeda-userscript-user` (never the token), and the CRM blocks with «El script está conectado con otra cuenta (x@y). Reconectalo con la tuya.» when it does not match the logged-in user.

### 10.4 Q4 — one template list

Yes: a single template list for both scopes (D5); `GeneralMessageStep` is deleted.

### 10.5 Q5 — final render at prepare

Yes: `prepare` and `prepareGeneral` render the final text/html (`renderFinal`), so the composer opens on the final view (D6).
