# Spec 98 — Sales material from the WhatsApp and Instagram panels

Status: **approved, in implementation** (owner decisions 29/10/2026, section 12; worktree `feat/sales-material-script-98`, stacked on spec 97's branch). Requested by the owner on 29/10/2026: «que tanto en whatsapp como en instagram, tengamos para elegir y enviar del material de venta». Decision 12.4 took option 2, so «Sin gestión» in the WhatsApp panel is part of this spec (section 15). Type: one migration (`055`), server changes in the sales material service and the user script endpoints, the CRM composer change (decision 12.2), WhatsApp «Sin gestión» in the panel (decision 12.4, section 15), and user script **1.7.0**. No new endpoint, no new permission. It does not change what counts as contact, «No contactar» gating, the echo confirmation of [spec 92](92-instagram-open-chat.md) or the «never send» rule of the script.

Builds on [spec 89](89-material-de-venta.md) (sales material, share links, §9 «Agregar material» in the WhatsApp panel), [spec 92](92-instagram-open-chat.md) (Instagram attempts, echo confirmation, «No sales material»), [spec 96](96-contact-three-clicks.md) (owner review: «Enviar material» opens a free draft with the material) and [spec 97](97-instagram-chat-panel.md) (Instagram panel, decision 12.5: material on Instagram is a later spec, this one). **Spec 97 is not merged yet**: this spec assumes it lands in `staging` first.

Owner rules that apply throughout: always the simplest path for the seller; the script pastes, the seller presses send.

## 1. Problem

- **On WhatsApp, material is a detour.** The panel's «Agregar material» exists (spec 89 §9, user script 1.3.0) but only inside «Mandar un mensaje», after a template was picked and a draft prepared (`userscript/src/compose.ts:118-121`: the button renders only when `state.prepared` is set). A seller who just wants to send the brochure has to pick some template, prepare it, open the picker, add the material and probably edit the text away. The CRM already solved this for itself: «Enviar material» opens a free draft with the material and lets the seller switch to a template keeping it (`src/components/ContactTemplateDialog.tsx:97-101`, test `ContactTemplateDialog.material.spec.tsx:21-39`).
- **On Instagram, there is no material at all.** The Instagram panel's compose view says so explicitly (`userscript/src/instagramApp/compose.ts:5-9`: «without persons, materials or replacing text»); the CRM composer hides the material section for Instagram (`src/components/MessageComposer.tsx:131`, `{!ig&&…}`) and «Enviar material» never offers Instagram (`src/components/BusinessContactDialog.tsx:73-74`). The reason is in the data model and the service, not in the UI (section 3.3).

## 2. Goals and non-goals

### Goals

1. From either panel (WhatsApp Web, Instagram chat page), the seller can **pick a sales material first** and get a draft with its link ready to paste, in as few clicks as the CRM's «Enviar material».
2. From that draft, the seller can switch to a template of the management (or of «Sin gestión» on Instagram) **keeping the material**, mirroring spec 96's owner review.
3. «Agregar material» inside «Mandar un mensaje» (after a template) keeps working on WhatsApp and appears on Instagram.
4. Instagram drafts carry share links with the same guarantees as WhatsApp: one token per draft, server-side permission / «No contactar» / restriction checks, `sent_version` fixed at the open, revocation, technical access record.
5. Optionally (decision 12.2), the CRM composer also offers material on Instagram.

### Non-goals

- **Sending.** The script never sends: no Enter, no key event, no click on Send. Unchanged from specs 84, 94 and 97.
- **Attachments on WhatsApp or Instagram.** Only the link travels (spec 89 D8); see decision 12.3 for Instagram.
- **Material references inside Instagram templates** (`{{material:<uuid>}}`). `validateTemplateMaterials` keeps refusing them for non-email/WhatsApp templates (`src/helpers/templateMaterialService.ts:37`) and `resolveTemplateMaterials` keeps resolving only email/WhatsApp drafts (`:58`). Candidate follow-up.
- ~~«Sin gestión» in the WhatsApp panel~~: in scope since decision 12.4 = option 2 (section 15).
- Changing what the public page `/m/<token>` shows, the material catalog or its permissions.
- Accessibility-only work (deferred by the owner).

## 3. Current state (verified in code on this branch)

### 3.1 WhatsApp panel

- Business view: «Mandar un mensaje» is disabled without a token, for Nuevo, «No contactar»/restriction, or **without open managements** (`userscript/src/ui.ts:211`); click opens `openCompose` (`ui.ts:212-213`).
- `openCompose` (`userscript/src/compose.ts:70-191`): management select, template radios, person select, then `prepareTemplate` (`compose.ts:140-143`). Material state lives in `Materials` (`compose.ts:14-16`); «Agregar material» appears only after the draft exists and before it was dispatched (`compose.ts:118-121`); `addToDraft` calls `addMaterial` and replaces body and revision (`compose.ts:147-153`). A new template, person or management is a new draft and **drops the added materials** (`choose`, `compose.ts:135`: `state.added = []`).
- The picker (`userscript/src/materials.ts:19-49`, `materialPicker`) searches on the server with a 300 ms debounce. It builds nodes with the global `document` (`materials.ts:6`) and its listeners do not check `event.isTrusted` (`materials.ts:30,43,45`).
- API (`userscript/src/api.ts:41-55`): `prepareTemplate` requires a `templateId` (`api.ts:46`); `PreparedTemplate` has no material list (`api.ts:44`, only `materialWarnings`); `fetchMaterials` and `addMaterial` (`api.ts:53,55`).

### 3.2 Instagram panel

- `openInstagramCompose` (`userscript/src/instagramApp/compose.ts:53-179`): scope select (managements plus «Sin gestión» with purpose, spec 97 decision 12.6), templates, preview «Para @usuario», paste with re-proof → `dispatch` → empty-composer check (`compose.ts:141-168`). No material state (`compose.ts:37-38`).
- The allowlist of CRM calls (`userscript/src/instagramApp/client.ts:7-19`, `INSTAGRAM_API_FUNCTIONS` at `:19`) does not include `fetchMaterials` / `addMaterial`.
- `userscript/src/instagramIsolation.spec.ts:156` only allows imports from `./*`, `../instagram/*`, `../api|styles|logo|version|parse`; spec 97 §5.4 already anticipated «`../materials` only if 12.5».
- `instagramPrepareInput` requires a `templateId` (`src/endpoints/userscript.ts:123`).

### 3.3 Server: every place that assumes channel ∈ {email, whatsapp}

Instagram attempts are stored as `crm_messages.channel='social'` with `destination_detail=INSTAGRAM_DESTINATION` (`src/helpers/communicationService.ts:155,194`; detector `isInstagramAttempt`, `src/helpers/instagramChat.ts:63`, which also excludes Hospeda's echoes). Places that would refuse or mislabel an Instagram draft with material:

| # | Where | What it assumes |
| --- | --- | --- |
| 1 | `migrations/046_sales_material.sql:68` | `crm_sales_material_shares.channel CHECK (channel IN ('email','whatsapp'))`. Not changed by any later migration. |
| 2 | `src/helpers/salesMaterialShareService.ts:11` | `salesMaterialShareInput.channel: z.enum(['email','whatsapp'])`. |
| 3 | `salesMaterialShareService.ts:32,35` | `assertAccountContactAllowed(…, input.channel)` and `m.channel!==input.channel` (a share channel equals the message channel; for Instagram they differ: `instagram` vs `social`). |
| 4 | `salesMaterialShareService.ts:47` | `insertSalesMaterialShare` typed `channel:'email'\|'whatsapp'`. |
| 5 | `src/helpers/salesMaterialDraft.ts:62` | `draftFor`: «Este canal no lleva material de venta.» for any other message channel (blocks `material_add`, `material_remove`, `material_attach`). |
| 6 | `salesMaterialDraft.ts:20` | `ShareRow.channel:'email'\|'whatsapp'`. |
| 7 | `salesMaterialDraft.ts:79`, `src/helpers/salesMaterialMessage.ts:89-93` | `attachBlockReasons`: any non-email channel gets «WhatsApp no adjunta archivos: va solo el enlace.» |
| 8 | `salesMaterialMessage.ts:3,20-26,38-41` | `MaterialChannel='email'\|'whatsapp'`; snippet/append/remove: WhatsApp = plain text line, email = paragraph. |
| 9 | `src/helpers/templateMaterials.ts:37,59-60`, `templateMaterialService.ts:37,58-60` | Template refs only for email/WhatsApp (out of scope, section 2). |
| 10 | `src/endpoints/salesMaterials.schema.ts:57` | `MessageMaterial.channel:'email'\|'whatsapp'`. |
| 11 | `src/components/MessageMaterials.tsx:32,63` | `DraftMaterials` prop typed email/WhatsApp; the record labels the channel `'Email':'WhatsApp'`. |
| 12 | `src/components/MessageComposer.tsx:131` | Material section hidden for Instagram. |
| 13 | `src/components/BusinessContactDialog.tsx:73-74,117` | «Enviar material» leaves Instagram out; copy «email o WhatsApp». |
| 14 | `src/endpoints/userscript.ts:142-148,170-175` | `materials` uses `scriptWhatsappScope` (WhatsApp blocked reasons, open managements only). |
| 15 | `userscript.ts:160-161,178` | `scriptWhatsapp` + comment «WhatsApp only (sales material stays out of Instagram, decision 12.5)»; `materialAdd` refuses anything else. |
| 16 | `userscript.ts:116` | Script `prepare` input requires `templateId` (no free draft). |

Already channel-agnostic (no change needed):
- **Open claim.** `dispatch` calls `claimDraftMaterials` for every channel before branching (`communicationService.ts:612`), so an Instagram open would already check tokens, revoke links deleted from the text and fix `sent_version` (`salesMaterialDraft.ts:145-176`; `attach` forced false for non-email, `:172`).
- **Revocation.** Draft cancel revokes draft links (`communicationService.ts:145`, `revokeDraftShares`); «Revocar enlace» checks the share, not the channel (`salesMaterialDraft.ts` `revokeSalesMaterialShare`); spec 92 already shows the material record of an unconfirmed Instagram send in «Requiere acción» (spec 92 line 114).
- **Body storage.** `saveBody` stores `text_body = body` for non-email drafts (`salesMaterialDraft.ts:74`); Instagram bodies are plain text already (`communicationService.ts:149`).
- **Technical access record.** Counted per share, no channel (`technical_access_count`, migration 046/047). Instagram's link-preview crawler is expected to be `facebookexternalhit`, already in `PREVIEW_BOT_PATTERN` (`src/helpers/salesMaterialShare.ts:24`), so previews do not count (verify live, section 9).
- **Echo confirmation.** `pickEchoCandidate` compares words (Dice ≥ 0.5, `src/helpers/instagramEcho.ts:31-46`, `userscript/src/textMatch.ts:17-23`); a pasted text with the link and its title is the same text Meta echoes back.
- **Prepare result.** The `prepare` mutation already returns `materials` (`communicationService.ts:496`, `withMaterials`), but the script endpoint drops it (`userscript.ts:154`).

## 4. Final behaviour

### 4.1 «Enviar material» in both panels (decision 12.1, recommended option)

Business view, next to «Mandar un mensaje» and with the same disabled reason, a second button **«Enviar material»**:

1. Opens the compose view in material mode: the picker first (`materialPicker`, search, «Cargando material…»), no template list yet.
2. Picking a material prepares a **free draft** (`templateId: null`) in the default scope (first open management and its default person on WhatsApp; on Instagram the first open management or «Sin gestión» with the default purpose, as `initialInstagramChoice`) and runs `material_add` on it. Busy state «Preparando el mensaje…».
3. The preview shows the draft («Podés ver «Título» en: <link>»), the added materials, and above it a **«Mensaje modelo»** select: «Mensaje libre» plus the scope's templates (same list and order as today). Choosing a template prepares that template's draft and re-adds every material added so far (D2); «Mensaje libre» goes back to a free draft with them.
4. «Agregar otro material» stays available until the draft is opened; management, person (WhatsApp) and purpose (Instagram «Sin gestión») selects work as in «Mandar un mensaje» and also keep the materials.
5. «Pegar en el chat» / «Copiar» as today: WhatsApp checks chat and phone then `dispatch` (`compose.ts:155-161`); Instagram re-proves the thread, `dispatch`, empty-composer check (`instagramApp/compose.ts:141-168`). Disabled while busy, while the body is empty (a free draft whose `material_add` failed) or with unresolved variables. Nothing is sent.

Errors keep the selection and offer «Reintentar» (failed `material_add` on the free draft: «No se pudo agregar el material. Podés reintentar.»; the paste stays disabled). No auto-retry.

### 4.2 «Agregar material» inside «Mandar un mensaje»

- **WhatsApp:** unchanged, except that switching template, person or management now keeps the added materials (D2) instead of dropping them (`compose.ts:135`).
- **Instagram:** the same button and picker after the draft is prepared, before it is opened. `materialWarnings` from `prepare` shown as on WhatsApp.

### 4.3 CRM composer (only with decision 12.2 = include)

- `MessageComposer` shows «Material de venta» for Instagram drafts (drop the `!ig` gate, `MessageComposer.tsx:131`), without «Adjuntar el archivo» (decision 12.3).
- «Enviar material» (`BusinessContactDialog.tsx:73-74`) offers Instagram among the channels; the copy at `:117` becomes «Se agrega al mensaje de email, WhatsApp o Instagram…».
- The material record (`MessageMaterials.tsx:63`) labels the channel «Instagram».
- «Abrir Instagram de @x» copies the text with the link, as any other text (spec 92); the spec 97 handoff pastes it.

## 5. API and data changes

### 5.1 Migration `055_sales_material_instagram.sql`

`053` and `054` (spec 97) are the last applied migrations on this branch; applied migrations are immutable. Same pattern as migration 022:

```sql
ALTER TABLE crm_sales_material_shares DROP CONSTRAINT crm_sales_material_shares_channel_check;
ALTER TABLE crm_sales_material_shares ADD CONSTRAINT crm_sales_material_shares_channel_check
  CHECK (channel IN ('email','whatsapp','instagram'));
```

No data written; existing rows satisfy the new CHECK. Confirm the constraint name against the local DB before shipping (`\d crm_sales_material_shares`). Regenerate `src/helpers/schema.tsx` if the column type changes there.

### 5.2 Sales material service

- **One mapping helper**, `materialChannelOf(message)` in `salesMaterialMessage.ts`: `email`→`email`, `whatsapp`→`whatsapp`, an Instagram attempt (`isInstagramAttempt`)→`instagram`, anything else→`null`. Every place in rows 2–8 of 3.3 goes through it instead of `m.channel`.
- `MaterialChannel` gains `instagram`. `materialLinkSnippet` / `appendMaterialLink` / `removeMaterialLink` treat it as WhatsApp (plain-text line; Instagram has no markup, `communicationService.ts:149`).
- `attachBlockReasons`: the reason names the channel («Instagram no adjunta archivos: va solo el enlace.»).
- `draftFor` (`salesMaterialDraft.ts:62`): accepts a draft whose `materialChannelOf` is not null; a manual «Red social» log or Hospeda's echo stays refused. `assertAccountContactAllowed` keeps receiving the message channel (`social`), so restrictions on `social`/`all` apply, as in `prepare`.
- `salesMaterialShareInput.channel` and `insertSalesMaterialShare` accept `instagram`; the message/channel consistency check (`salesMaterialShareService.ts:35`) compares `materialChannelOf(m)`; the contact check maps `instagram`→`social`.
- Types: `ShareRow.channel`, `MessageMaterial.channel` add `'instagram'`.
- Unchanged: `claimDraftMaterials`, revocation, technical access, template refs.

### 5.3 User script endpoints (`src/endpoints/userscript.ts`)

All keep `scriptAuth` (401/426), Zod, and return what older scripts expect; the new parameters are optional.

| Endpoint | Change |
| --- | --- |
| `POST /_api/userscript/prepare` | WhatsApp `templateInput.templateId` and `instagramPrepareInput.templateId` become nullable (free draft). The response adds `materials: {materialId, title}[]` from the mutation result (a reused draft may already hold a material; the panel then skips re-adding it). |
| `GET /_api/userscript/materials` | Adds `channel` (`scriptChannelParam`, default `whatsapp`). Instagram scope: blocked reasons of `instagramTemplates` (`src/helpers/userscriptInstagramTemplates.ts:37-38`: «No contactar», username missing, archived, Nuevo without verification scope, restriction on `social`), so «Sin gestión» businesses get material too. WhatsApp unchanged (`scriptWhatsappScope`). |
| `POST /_api/userscript/material_add` | Uses `scriptChannel` (WhatsApp or an Instagram attempt) instead of `scriptWhatsapp`; `scriptWhatsapp` and its decision-12.5 comment are deleted. Still `attach:false`. Error copy «Solo se pueden preparar WhatsApp o Instagram desde el script.» |

The server re-checks permissions, «No contactar», restrictions and the draft revision in `material_add` and again at `dispatch`; the panel's disabled reasons are usability only. The chat proof stays a client-side guard (spec 97 §7 T1/T2).

## 6. User script changes (1.7.0)

- `materials.ts`: `materialPicker` takes `doc` and a `trusted(event)` guard (default: always true on WhatsApp, so WhatsApp behaviour is unchanged); every listener that calls the CRM checks it (spec 97 §5.4 item 4). Builds nodes with `doc`, not the global `document`.
- `compose.ts` (WhatsApp): material mode entry (4.1), «Mensaje modelo» select over the preview, materials kept across `choose` (D2), paste disabled on an empty body.
- `ui.ts`: «Enviar material» button with the same `blockedReason` as «Mandar un mensaje» (`ui.ts:211`).
- `instagramApp/compose.ts`: material mode, «Agregar material», the same «Mensaje modelo» select; `instagramApp/panel.ts`: «Enviar material» in the business view next to «Mandar un mensaje» (`panel.ts:158`), trusted click.
- `instagramApp/client.ts`: `fetchMaterials(accountId, search)` (with `channel:'instagram'`) and `addMaterial` join the allowlist and `INSTAGRAM_API_FUNCTIONS`.
- `api.ts`: `fetchMaterials` takes an optional channel; `prepareTemplate`/`prepareInstagramTemplate` accept `templateId: null`; `PreparedTemplate.materials?`.
- `instagramIsolation.spec.ts`: `../materials` joins the allowed imports; the static and runtime checks stay otherwise identical.
- `USERSCRIPT_VERSION` → **1.7.0**; `USERSCRIPT_MIN_VERSION` stays **1.5.0** (D3). `scripts/verify-userscript-build.mjs` checks it.
- Copy: footer note unchanged («El mensaje no se envía solo…»); picker heading «ELEGÍ EL MATERIAL» in material mode, «AGREGAR MATERIAL» otherwise.

## 7. Rules that do not change

- Opening a channel, preparing a draft, adding material or pasting is not evidence of contact, reply, interest or delivery. A technical access to `/m/<token>` never changes stages, tasks, responses or message states (spec 89 §7).
- The script never sends. Instagram never replaces text already in the composer (spec 97 D3).
- Server-side permission, «No contactar», restriction and archived checks on `material_add`, `prepare` and `dispatch`. «No se envió» does not revoke a link already opened; it stays revocable from «Requiere acción» (spec 92).
- No auto-retry of anything whose outcome is uncertain.

## 8. Risks

- **Instagram and links in DMs.** Instagram may restrict links in message requests (first contact, account that does not follow Hospeda), render the link only as a preview card, or flag repeated links as spam. Unknown until tested live (section 9). If links are dropped, the echo has no text to match and the attempt stays in «Requiere acción» for manual confirmation (existing fallback).
- **Link-only echoes.** A free draft is only «Podés ver «Título» en: <url>». If Meta's echo for a message with a link carries the text, it matches (identical words); if it arrives as a share/attachment with empty text, it does not (`hasComparableWords`). Same fallback.
- **Edited text.** The seller can delete the link in WhatsApp/Instagram after pasting; `sent_version` was already fixed at `dispatch`. Same as WhatsApp today; the record says «Versión incluida en el mensaje», never «visto».
- **Abandoned free drafts.** Switching template leaves the previous draft (with a live, never-sent link) as a draft, exactly like the CRM's «Mensaje modelo» switch (`ContactTemplateDialog.tsx:126` prepares without `discardDraft`). Nobody but the seller has that URL; it is revoked if the draft is cancelled. Accepted, D4.
- **Gate on the latest version** (spec 96 §10.2): releasing 1.7.0 blocks every seller's desktop CRM until they update. Coordinated release mandatory (section 11).

## 9. Live verification (before shipping Instagram material)

With the Hospeda account and test user `qaz.uor`:
1. A message with a `/m/<token>` link reaches the recipient in an existing 1:1 thread and in a first-contact/message request.
2. Meta's echo (`crm_messages` `manual_sent` from the webhook) carries the text with the URL; the attempt is confirmed automatically.
3. The link preview card appears and the request comes from `facebookexternalhit` (no technical access counted).
4. Pasting a multi-line text with a URL into Instagram's Lexical composer keeps line breaks and the URL intact (`insertIntoComposer` verification).

## 10. Test plan

- **Unit (CRM):** `salesMaterialMessage.spec.ts`: `materialChannelOf` (WhatsApp, email, Instagram attempt, «Red social» log, echo), snippet/append/remove for Instagram, the Instagram attach reason.
- **Unit (user script):** `materials.spec.ts`: `trusted` guard on add/search/close, injected `doc`; `compose.spec.ts`: material mode (pick → free draft → `material_add` → preview), template switch keeps materials, reused draft skips re-adding, paste disabled on empty body, failure keeps selection; existing assertions unchanged. Instagram `compose` spec: same plus re-proof before `dispatch`, busy composer refused with material; `panel.spec.ts`: «Enviar material» button and disabled reasons; `instagramIsolation.spec.ts` updated allowlist.
- **Component (only with 12.2 = include):** `MessageComposer` shows materials for Instagram without the attach checkbox; `BusinessContactDialog` offers Instagram with `initialMaterial`; `ContactTemplateDialog.material.spec.tsx` with `channel="instagram"`; `MessageMaterials` label.
- **Integration** (local disposable DB only): migration 055 applies and replays; `scripts/test-sales-material-share.ts`: share for an Instagram attempt draft, refused for a manual social log, «No contactar», restriction on `social`; `scripts/test-sales-material-composer.ts`: `material_add`/`material_remove` on an Instagram draft, `dispatch` fixes `sent_version`, link deleted from the text is revoked; `scripts/test-userscript.ts`: free draft (`templateId:null`) on both channels, `prepare` returns `materials`, `materials?channel=instagram` (blocked reasons, «Sin gestión»), `material_add` on an Instagram draft, refused for email; `scripts/test-instagram-open-chat.ts`: an echo with the link confirms the attempt.
- **Browser e2e (only with 12.2 = include):** «Enviar material» → Instagram → «Abrir Instagram de @x» copies a text with `/m/`.
- **Manual (owner, live):** section 9, plus «Enviar material» end to end in both panels.
- Gates: `npm run typecheck`, `npm test`, `npm run build`, CI integration and browser suites green.

## 11. Rollout

1. Spec 97 merged to `staging` first; rebase and confirm the migration number (`055`).
2. Section 9 done before enabling Instagram material in the release.
3. Deploy (owner-approved, manual): `npm run db:migrate` applies `055` (no data written).
4. **Publish 1.7.0 in the same deploy**; tell sellers to force «Buscar actualizaciones» in Tampermonkey (the gate blocks the desktop CRM until they do).
5. Docs: user guide (`src/content/user-guide.json`, regenerate `docs/guia-de-uso.md`: «Enviar material» from the panels, Instagram material), `docs/estado-desarrollo.md`, `docs/pendientes.md`, `docs/decisiones.md` (section 12, and that spec 97 decision 12.5 is superseded).
6. `staging` → `main` only when the owner asks.

## 12. Decisions

Owner decisions (29/10/2026): **12.1 option 1, 12.2 option 1, 12.3 option 1, 12.4 option 2** (differs from the recommendation: «Sin gestión» in the WhatsApp panel is in this spec, section 15). Defaults D1–D5 (section 13) accepted as written. Spec 97 decision 12.5 («material on Instagram is a later spec») is superseded by this spec. The options are kept below for the record.

Further owner decisions (29/10/2026, after the first implementation round):

- **«Quitar» in both panels.** Every material the draft holds is listed above the preview («MATERIAL EN EL MENSAJE») with «Quitar». It calls the existing `material_remove` through a new script endpoint, `POST /_api/userscript/material_remove`. That endpoint has the same token, `scriptChannel`, owner, revision and draft-status checks as `material_add`. Instagram only accepts trusted clicks. A removed material is no longer re-added on later switches (D2 still applies to the others) and can be picked again. A failed removal keeps the material with «Reintentar». A revision conflict re-prepares once (it reuses the draft with its fresh revision) and retries.
- **«Seguir sin ese material»** is accepted.
- **The WhatsApp business view always enables «Mandar un mensaje» / «Enviar material»** (except for «No contactar», a restriction, or a missing token). This is accepted.
- **Old scripts (1.5–1.6) and Nuevo businesses** (section 15.3) are accepted as is.
- **«Buscar o crear en el CRM»** (owner, 29/10/2026): the link shown when a panel finds no business now searches the chat's phone or Instagram in Negocios. When the search finds nothing, Negocios offers creating the business with that phone or Instagram already filled in. Nothing is ever created automatically. See section 17.


**12.1 Entry point for material in the panels.**
1. **A second button «Enviar material» in the business view** (4.1). What: material first, then a free draft, template optional above the preview. Pros: two clicks to a pasteable brochure, same mental model as the CRM's «Enviar material»; «Mandar un mensaje» stays as is. Cons: one more button in a narrow panel; a second mode in the compose view. Impact: `ui.ts`, `panel.ts`, a material mode in both compose views.
2. **Material first inside «Mandar un mensaje».** What: the compose view opens with an «Enviar solo material» toggle/link at the top; choosing it shows the picker instead of the template list. Pros: one entry point, no new button. Cons: one more click (open compose, then the toggle) and less discoverable. Impact: same compose work, no business-view change.
3. **Keep «Agregar material» only after a template** (today on WhatsApp, added on Instagram). Pros: smallest change. Cons: the seller still picks and edits a template to send a brochure, the detour of section 1. Impact: Instagram work only.
- **Recommendation: 1.** Simplest path for the seller and parity with the CRM.

**12.2 CRM composer: material on Instagram in this spec.**
1. **Include.** What: 4.3. Pros: the server work (5.1–5.2) is the same either way; the UI cost is removing two gates, a label and copy; a seller gets the same answer in the CRM and in the panel. Cons: more e2e to update; the CRM's «Abrir Instagram» on a phone (spec 92, `ig.me`) pastes by hand, so the link travels only if the seller pastes. Impact: `MessageComposer`, `BusinessContactDialog`, `MessageMaterials`, their specs.
2. **Panels only.** Pros: smaller diff. Cons: «Enviar material» in the CRM still refuses Instagram while the panel allows it, which reads as a bug. Impact: none in the CRM.
- **Recommendation: 1.**

**12.3 Attachment or link on Instagram.**
1. **Link only** (like WhatsApp, spec 89 D8). Pros: no file handling in Instagram's page; the public page shows any format, with preview card; revocable. Cons: no native image/PDF in the chat. Impact: as designed.
2. **Also paste the file** (image or PDF) into Instagram's composer from the panel. Pros: native media in the chat. Cons: needs a file fetch inside the script plus a synthetic paste/drop into Instagram's composer (far more automation and fragility under spec 97 §5.4), no revocation once sent, no `sent_version` semantics for a file. Impact: large; its own spec.
- **Recommendation: 1.**

**12.4 «Sin gestión» in the WhatsApp panel.**
1. **Out of scope.** Pros: keeps this spec on material; the WhatsApp panel keeps requiring an open management (`ui.ts:211`), as today. Cons: on WhatsApp, a business without an open management can get material only from the CRM; Instagram can (spec 97 decision 12.6). Impact: none.
2. **In scope.** What: `templates`/`prepare` gain the general scope for WhatsApp (purpose chip, `prepare_general`, person choice), as spec 97 did for Instagram. Pros: every material send can start from WhatsApp. Cons: more server logic (purpose validation, person candidates of the general case) and UI in a spec about material. Impact: `templates`, `prepare`, `compose.ts`, tests.
- **Recommendation: 1**, with a follow-up spec if the owner sees sellers needing it.

## 13. Defaults this spec chose

- **D1. Share channel value `instagram`,** not `social`: `social` also covers manual «Red social» logs, which never carry material; the message stays `channel='social'` and the mapping is `materialChannelOf` (5.2).
- **D2. Materials survive a draft change** (template, person, management, purpose): the panel re-adds what was added, skipping what a reused draft already holds. Mirrors `ContactTemplateDialog.material.spec.tsx:32-39`.
- **D3. `USERSCRIPT_MIN_VERSION` stays 1.5.0:** no existing contract changes; the CRM gate already requires the latest.
- **D4. Abandoned free drafts are not cancelled on a switch,** as in the CRM (section 8).
- **D5. No new revocation or analytics rules for Instagram:** the share is revocable and counted like any other.

## 15. «Sin gestión» in the WhatsApp panel (decision 12.4 = option 2)

Mirrors what the Instagram panel already does (spec 97 decision 12.6). Every existing WhatsApp management flow is unchanged when a management exists.

### 15.1 Behaviour

- Business view: «Mandar un mensaje» and «Enviar material» are disabled only without a connected script or with «No contactar»/a business-level restriction (as the Instagram panel's `contactBlockReason`). They no longer require an open management or a non-Nuevo status: the compose view shows the CRM's `blocked` reason when nothing can be prepared.
- Compose view: the «Gestión» select lists the open managements plus «Sin gestión» when the CRM offers it. Without managements the view starts on «Sin gestión» with `defaultContactPurpose` (Nuevo: only «Verificar el negocio»). «Propósito» select; «Otro» needs its aclaración before anything is prepared.
- «Persona» for «Sin gestión» follows the service's `channelTarget`: when any person of the business has a phone, one of them must be chosen (only those without a WhatsApp restriction are offered, the primary one by default) and «Teléfono del negocio» is not offered; otherwise the business WhatsApp or phone.
- «care» is never offered to a business that is not a client (`panelPurposes`) and the server refuses it without `confirmedClient` (spec 97 L6); the script never sends `confirmedClient`.
- Paste: unchanged (chat and phone check, `dispatch` once, replace only with confirmation).

### 15.2 Server

- `src/helpers/userscriptWhatsappTemplates.ts` (new): `scriptWhatsappScope` moved out of the endpoint, `whatsappTemplates` builds the response, pure `whatsappGeneralPeople` and `whatsappBlockReason`.
- `GET /_api/userscript/templates` (WhatsApp) adds `general: {defaultPurpose, purposes:[{value,label,templates}], contacts, businessPhone} | null`, only when the user can modify the business (`canModifyBusiness`) and somebody can receive the message. In Nuevo no management is listed (the service refuses them) and `blocked` is null when the verification is possible. `blocked` stays «No contactar» first, then «nothing to prepare», then the restriction check (first editable management, else business level).
- `POST /_api/userscript/prepare` (WhatsApp) accepts `{id, accountId, leadId:null, contactId, templateId, purpose, otherPurpose}` (strict Zod, `whatsappGeneralInput`) and maps it to `prepare_general` with `channel:'whatsapp'` (`whatsappPrepareMutation`). A request with a `leadId` string is the old `prepare`.
- `GET /_api/userscript/materials` (WhatsApp) uses the same scope, so a business contactable only «Sin gestión» gets material too.

### 15.3 Compatibility

Older scripts (1.5.0–1.6.0, still accepted by the version gate) ignore `general`. Visible changes for them:

- A Nuevo business now answers `blocked:null` with no managements, instead of the Nuevo reason. Their button was already disabled for Nuevo, and `prepare` refuses a management of a Nuevo business on the server.
- A business whose open managements the user cannot edit, but which the user can contact «Sin gestión», now answers `blocked:null, leads:[]`. An old script shows an empty view with nothing to prepare: a silent dead end. This is **accepted** (review item 5): there is no version branching on the server, and the desktop CRM gate already requires the current script, so sellers update to 1.7.0.

Owner-accepted, 29/10/2026.

## 16. Implementation notes (29/10/2026)

Implemented on `feat/sales-material-script-98` following section 12.

- **Migration** `055_sales_material_instagram.sql`: drops and re-adds `crm_sales_material_shares_channel_check` with `instagram` (the inline CHECK of 046 takes that default name; confirm with `\d crm_sales_material_shares` on the local DB before shipping). No data written. `schema.tsx` has no typed column for it, nothing to regenerate.
- **Service**: `materialChannelOf` and `contactChannelOf` in `salesMaterialMessage.ts`; `draftFor` returns the draft plus its material channel; `assertAttachable`, `insertSalesMaterialShare`, `createSalesMaterialShare` use it; the contact check keeps `social` for Instagram. Instagram snippets are plain-text lines; the attach reason names the channel.
- **Endpoints**: `prepare` returns `materials` (live links of a reused draft) via `preparedResponse`; `templateId` nullable on both channels; `materials` takes `channel` (Instagram scope = `instagramTemplates` blocked reasons); `material_add` uses `scriptChannel` (WhatsApp or an Instagram attempt; never email, a «Red social» log or an echo). `scriptWhatsapp` and its decision-12.5 comment are gone.
- **CRM**: `MessageComposer` shows «Material de venta» for Instagram (no «Adjuntar el archivo», `DraftMaterials` gets `channel="instagram"`); `BusinessContactDialog` offers Instagram for «Enviar material» and the copy says «email, WhatsApp o Instagram»; the material record labels «Instagram» (`MATERIAL_CHANNEL_LABELS`).
- **User script 1.7.0** (`USERSCRIPT_MIN_VERSION` stays 1.5.0, D3):
  - `materials.ts`: `materialPicker` takes `doc`, `trusted`, `heading` and `closeLabel`; add, search and close check `trusted(event)` (always true on WhatsApp). New pure helpers `missingMaterials`, `materialsInDraft`, `addMissingMaterials` (sequential re-add, stops at the first refusal, no auto-retry).
  - `compose.ts` (WhatsApp) and `instagramApp/compose.ts`: `mode: "material"` («Enviar material»: picker first with «ELEGÍ EL MATERIAL», free draft on the first pick, «Mensaje modelo» select with «Mensaje libre», «Agregar otro material»). Materials survive template, person, management and purpose changes (D2), skipping what a reused draft holds. A refused material shows «Falta agregar: …» with «Reintentar» and «Seguir sin ese material»; paste and copy stay disabled while a chosen material is missing or the body is empty.
  - `ui.ts` and `instagramApp/panel.ts`: «Enviar material» next to «Mandar un mensaje», same disabled reason; on Instagram only a trusted click opens it (`PanelActions.sendMaterial`, `start.ts` keeps the mode).
  - `instagramApp/client.ts`: `fetchMaterials` (with `channel=instagram`) and `addMaterial` join `INSTAGRAM_API_FUNCTIONS`. `instagramIsolation.spec.ts` allows `../materials` and adds a static check that `materials.ts` imports only types from `./api`, uses no GM/network/clipboard/storage and guards every click/input listener with `trusted(event)`.
- **Choices confirmed by the owner on 29/10/2026** (section 12):
  - A material the CRM refused while re-adding (after a template switch) can be dropped with «Seguir sin ese material»; without that button an archived material would trap the view.
  - The WhatsApp business view no longer disables the buttons for Nuevo or for «no open managements» (section 15.1); the compose view explains the CRM's reason instead.
  - On a template switch the previous draft is left as a draft (D4); with materials that means a live, never-sent link until the draft is cancelled, as in the CRM.
- **Tests**: unit tests for the helpers, endpoint schemas, WhatsApp/Instagram compose flows, panel buttons, picker guard, CRM components; integration groups added to `scripts/test-userscript.ts` and `scripts/test-sales-material-share.ts` (written, not run in this session: they need the disposable DB with 055 applied).
- **Still needed live** (section 9): links in Instagram DMs and message requests, echo with a link, `facebookexternalhit` preview, Lexical paste of a multi-line text with a URL; «Enviar material» end to end in both panels; WhatsApp «Sin gestión» paste on a Nuevo business.

### 16.1 Review round (29/10/2026)

- `scripts/test-userscript.ts`: the shared business is put back to Nuevo after the state-New checks, so the spec 98 WhatsApp block now sets it to `reviewed` explicitly.
- Material mode shows the picker alone only until a material is chosen. After that the normal view appears, so a «Sin gestión» + «Otro» aclaración can be typed. A failed prepare keeps «Material elegido: …» with «Reintentar». `chosen` stays true after «Quitar» empties the draft, so a model switch still prepares.
- `prepare_general` reuses a draft only when `purpose` and `other_purpose` match too (`IS NOT DISTINCT FROM`). Before this, a free general draft came back with the old purpose after the seller changed «Propósito».
- `prepare`, `material_add` and `material_remove` (script) return `materials: [{shareId, materialId, title}]`, but only for live shares whose link is still in the text (`heldMaterials` over `shareTokenHashesInBody`).
- `addMissingMaterials` and `removeHeldMaterial` handle a 409 by re-preparing once, then retrying on the fresh revision. A second conflict is shown with «Reintentar».
- «Sin gestión» on a business that also has an open management: `prepare_general` with `leadId:null` is allowed. `communicationContext` with no lead only checks that the business is writable, and no rule refuses a general contact when managements exist. The CRM composer offers it the same way, so nothing changed.
- `instagramIsolation.spec.ts`: the app that `main.ts` starts (500 ms poll against the production base) was never stopped. Once a later test stored a token and opened a chat page, that app could tick, which is where the stray `crm.hospeda.com.ar/_api/userscript/status` came from. The leak predates spec 98 (spec 97 added the `main` import). Every app started through the module is now stopped in `afterEach`.

## 17. «Buscar o crear en el CRM» (owner decision, 29/10/2026)

### 17.1 Behaviour

- **No-match state in both panels.** «Buscar en Negocios del CRM» becomes «Buscar o crear en el CRM». It opens Negocios in a new tab:
  - WhatsApp: `/accounts?q=<phone>&createPhone=<phone>`. `<phone>` is the chat's digits, with `+` when the chat shows one (the CRM phone search compares the last 8 digits). Without a readable phone (fewer than 6 digits) the link opens `/accounts` as before.
  - Instagram: `/accounts?q=<username>&createInstagram=<username>`. The search uses the bare username; since §17.2 the CRM search also matches `@user` and profile URLs against `perfil_instagram`. The href is built with `URLSearchParams`. There are no new API functions and no change to `INSTAGRAM_API_FUNCTIONS`.
- **Negocios** (`src/pages/business-list.tsx`, `src/helpers/businessSearchOrCreate.ts`). `readSearchOrCreate` reads `q` (applied as the list search, through the same path as typing it) and the prefill:
  - a phone must be 6–20 digits, optionally with a leading `+` (`^\+?\d{6,20}$`; the panel sends `+` only when the chat shows one);
  - an Instagram must normalize to a valid username;
  - anything else is dropped, and the search still applies.

  The three params leave the URL with `replace`, like `adminTool`, so a reload does not repeat them. The query is applied with a functional state update (pruning deleted groups on the latest preferences), so the deleted-group pruning effect never restores an older `q`.
- **Empty state.** Only when the list was opened with a prefill, the search still equals the prefilled `q`, the result has **zero rows**, the latest fetch is neither running nor failed (stale data kept after an error does not count), and **no filters are active** (no filter groups or legacy filters, e.g. a saved view or the seller's default «Mis negocios»), the empty state shows «Crear negocio con este teléfono» or «Crear negocio con este Instagram». With filters active it shows `SEARCH_OR_CREATE_FILTERS_HINT` and «Buscar en todos los negocios», which clears the filters and keeps the search; the CTA then appears if there are still no rows. It opens the existing `BusinessQuickCreate` with the prefill. With rows, there is no button: the seller picks one as today. The dialog never opens by itself. «Nuevo negocio» keeps opening without a prefill.
- **`BusinessQuickCreate`:**
  - new optional «Instagram» field, which accepts `@user`, a bare username or a profile URL;
  - an invalid value shows `INSTAGRAM_PROFILE_INVALID` and disables «Crear negocio»;
  - the value is saved as `perfilInstagram` = `https://www.instagram.com/<user>/` (`canonicalInstagramProfile`);
  - the unsaved-changes guard compares with the prefilled values, so closing an untouched prefilled dialog asks nothing.
- **Server:**
  - `account_save` canonicalizes `perfilInstagram` when it **creates** a business, and refuses a value that is not a profile (400). Edits keep their current free-text rule (no canonicalization, no 400).
  - `normalizeInstagramProfile` rejects Instagram's own path segments (`INSTAGRAM_RESERVED_SEGMENTS`: `p`, `reel`, `reels`, `tv`, `stories`, `explore`, `accounts`, `direct`, `about`, `legal`, …). A post, reel, story, login or inbox URL is never a username: not stored on create, never «Instagram compartido», never a panel match.
  - The duplicate check (`GET /_api/business/duplicate-check`) accepts `instagram`. A business whose stored profile normalizes to the same username gets «Instagram compartido» («Mismo Instagram» in the dialog). The SQL prefilter is anchored (`perfil_instagram ~* instagramProfilePattern(user)`, dots escaped), never a `%user%` substring, so a short username cannot fill the 50-row limit and hide the match; DNC-first ordering is unchanged.
  - `isBlockingMatch` treats it like an exactly shared phone: a No contactar business with the same Instagram blocks creation, both in the dialog and server-side through `findNewDncBlocker` (`perfilInstagram` is now one of its identity keys). Admins are blocked too.
  - **Edits follow the phone rule** (`findNewDncBlocker` compares the identity keys before and after): editing another field of a business that already shares an Instagram with a No contactar business does not block; changing only the format of the same Instagram (`@user` ↔ URL) does not block; editing a business's Instagram **to** the Instagram of a No contactar business returns 409, for sellers and admins.
- **After creating**, the toast and link behave as before. On the next poll the panels match the new business:
  - WhatsApp matches by phone over `telefono`, `whatsapp` and contact phones (`phoneSearchSql`, last 8 digits);
  - Instagram matches by `normalizeInstagramUsername(perfil_instagram)`;
  - so the stored phone or canonical URL is found.

### 17.2 Instagram in the CRM search (owner decision, 29/10/2026: option 2)

The free search now matches the business Instagram profile. A word that is a profile (`@user`, `user` or an instagram.com profile URL; `normalizeInstagramUsername`) also matches a business whose `perfil_instagram` normalizes to that username:

- `instagramSearchSql` in `src/helpers/searchSql.ts`: `coalesce(column,'') ~* instagramProfilePattern(user)`, anchored on the whole profile with regex metacharacters escaped. Never a substring; Instagram pages (`/p/…`, `/reels`, `/accounts/…`) never match.
- The leading `@` is dropped only for this alternative. Other columns (email, name…) still receive the word as typed. Accent folding and ñ ≠ n are untouched.
- `multiFieldSearchSql` and `idSetSearchSql` take `instagramColumns`. The business list (`businessSearchSql`) reads `crm_accounts.perfil_instagram` as its own id set, so the per-row regex does not keep the other columns off their trigram index. `managementSearchSql` adds `perfilInstagram`, so the two stay equal over the projection (`scripts/test-search.ts`). Ctrl+K «Negocios» also matches it. Ctrl+K «Gestiones» is unchanged.
- No index and no migration: the regex runs only for words that are valid usernames, over `crm_accounts` (thousands of rows). A trigram index would only help a `like` prefilter, which this anchored match does not need.

The panel link keeps `q=<user>`, and the create CTA no longer appears when a business with that Instagram exists.

### 17.3 Tests

- Unit:
  - panel hrefs and encoding (`userscript.spec.ts`, `instagramApp/panel.spec.ts`);
  - `readSearchOrCreate`;
  - Negocios reads and clears the params, shows the button only on zero rows with a prefill, and «Nuevo negocio» opens without a prefill (`business-list-page.spec.tsx`);
  - `BusinessQuickCreate`: prefill, Instagram field, validation, duplicate query, «Mismo Instagram» No contactar blocking;
  - duplicate check: `withInstagramMatches`, `isBlockingMatch`, `canonicalInstagramProfile`, `duplicateQuery`, reserved segments, the anchored prefilter pattern;
  - Negocios: the hint and «Buscar en todos los negocios» with filters active, and no CTA after a failed search;
  - search: `instagramSearchSql`, `multiFieldSearchSql`/`idSetSearchSql` with `instagramColumns` (`searchSql.spec.ts`), updated `leads_GET.sql.spec.ts` snapshots.
- Integration, in `scripts/test-commercial.ts` (written, not run):
  - create with `@USER` stores the canonical URL;
  - an invalid Instagram returns 400;
  - `duplicate-check?instagram=` finds it;
  - a non-DNC duplicate only warns;
  - No contactar with the same Instagram returns 409 for seller and admin;
  - edits: another field and a format-only change do not block, an edit to the No contactar Instagram returns 409;
  - a post URL is refused on create, and a login URL finds no duplicate.
- Integration, in `scripts/test-search.ts` (written, not run): business vs management parity for `@user`, `user`, upper case, profile URL, a post URL, `reels` and a username prefix; the business list finds the profile by `@user`, `user` and URL, not by a prefix, a post or a login URL; Ctrl+K Negocios finds it.

