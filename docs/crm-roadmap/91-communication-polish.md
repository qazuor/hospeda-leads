# Spec 91 — Communication view, second pass

Status: approved by the owner on 27/10/2026 (review of spec 90 on local staging, items 1–12). Type: UI plus one small read-state table. It does not change permissions, «No contactar» gating or what counts as contact.

## 1. Problem

Spec 90 made the «Comunicación» tab one chronological conversation, but on a real multichannel business (local «Aguas Termales Demo», 9 items over 4 channels) it reads heavy and repetitive:

- Every message is a bordered card with a grey bubble inside (double frame).
- «Sin gestión» chip on almost every item.
- «Corregir respuesta» / «Corregir cómo salió o el resumen» buttons repeated on every sent item and call.
- Calls and responses without a message render as a card with a dashed pill inside, heavier than messages.
- «Anulados» sits among the channel chips although it is not a channel.
- The action bar wraps «Enviar material» to a second line.
- Long emails show in full.
- The list opens at the oldest item; on long histories the latest activity is far below.
- A «Por revisar» message appears twice: in «Requiere acción» (with actions) and in the conversation.
- No quick way to answer the last received message, no way to narrow by management, and no hint of what is new since the user last looked.

## 2. Final behaviour

### Visual

1. **Bubbles without the outer card.** Each message is a single bubble. The meta line (channel icon + label, sender, time, management chip) sits above the bubble in small muted text, outside it. Sent bubbles are right-aligned with a soft brand tint (blue-tinted background, from tokens in `src/base.css`). Received bubbles are left-aligned and neutral. Tags and status lines sit under the bubble, outside it. Opened-but-unconfirmed sends keep a dashed border to signal uncertainty. Works in light and dark themes.

   **Two-line items (owner review, 27/10/2026).** Every item is a compact header line and then the bubble. The header reads, in order: time · channel (icon + label) · sender · badges («Por revisar», «Respuesta registrada · …», «Automática · no cuenta como respuesta», «Registrado automáticamente», the sent status as a toned badge, the management chip) · compact actions (about 24px: «Registrar respuesta», «No es una respuesta», «Sí, se envió», «No se envió», «Ver diseño», email «Responder») · «⋯». It wraps only without room, actions last. Received items are left-aligned, sent items right-aligned with the same order. There are no separate tag or status rows under the bubble; the registered response summary stays as a muted note under the bubble. Calls and responses without a message stay centred slim lines with the same order (time · type · result · who · badges · «⋯») and their note below. The admin «Marcar como enviado / no enviado» and «¿Cómo salió?» forms stay under the bubble.

   **Chat background:** a plain chat-wallpaper colour (`--chat-wallpaper`: `#EFEAE2` light, `#0B141A` dark; colour only, no pattern or third-party assets). Received bubbles are the card colour (white) in light mode and a lifted `#1F2A35` in dark; sent bubbles stay brand blue.

   **Chat window (owner feedback after local testing, 27/10/2026).** Loose bubbles on the page background read as scattered, so «Conversación» is one framed card (border, radius, card tokens):
   - **Header** (fixed at the top of the frame): the «Conversación» title, the channel chips, the management selector and «Mostrar anulados».
   - **Body** (its own scroll, on a light tinted «chat» surface, with a dark-mode equivalent): «Ver anteriores» at the top, day separators, «Nuevo desde tu última visita» and the bubbles.
   - **Footer** (fixed at the bottom of the frame): «Preparar respuesta», when available.
   - «Requiere acción» and the action bar stay above the frame; «Borradores» stays below it.
   - **Height:** the frame grows with its content up to `max-height: clamp(420px, 100dvh − 58px top bar − 32px, 900px)`, so a short history is not a big empty box, and once the page brings the frame under the top bar the whole frame is visible (810px at 1440×900). At ≤600px it is `max(360px, min(70dvh, 100dvh − 150px))`, keeping room for the mobile top bar and bottom navigation; the header wraps and the chips scroll sideways.
2. **Management chip only when there is one.** «Gestión: <name>» is shown; «Sin gestión» is not rendered on items (the management filter in item 11 still offers it).
3. **Per-item actions in a «⋯» menu.** «Corregir respuesta», «Corregir cómo salió o el resumen», the auto-registration void action and any other per-item secondary action move into a menu button on the item. The button shows on hover/focus on pointer devices and always on touch/narrow screens. «Registrar respuesta» / «No es una respuesta» on a «Por revisar» message stay visible as buttons (see item 9). Same handlers, endpoints, loading and double-submit behaviour.
4. **Calls and responses without a message as a slim centred line.** For example «Llamada · No atendió · Admin Test · 11:30» or «Respuesta registrada sin mensaje · Pidió información · Llamada · 10:15», with the summary as a second muted line if present, the management chip only when there is one, and the «⋯» menu. No card, no dashed pill.
5. **«Mostrar anulados» separate from the channel chips.** A switch/toggle at the end of the filter row, visually distinct from the chips. It is shown only when there are voided items, as today.
6. **Action bar on one line.** «Contactar» (primary), «Registrar ▾» (a menu with «Llamada u otro contacto» and «Respuesta sin mensaje») and «Enviar material», plus the help link. A disabled action keeps saying why (tooltip or the menu item's description). It may wrap only on narrow screens.
7. **Long emails clamped.** An email body longer than about 6 lines is clamped with «Ver más» / «Ver menos». Other channels are clamped only if very long (about 12 lines).

### Functional

8. **Open at the latest item.** All scrolling happens in the frame body (item 1); the page never jumps to the frame. When the tab opens, the body scrolls to its end, and it stays there while content settles (fonts, clamps, details loading) until the user scrolls the body by hand (wheel, touch, scroll keys or a scrollbar drag). A sticky «Ir al último» button at the bottom of the body appears while the latest item is out of view of the body. «Ver anteriores» (older items beyond the latest 30) keeps working and keeps the scroll position when it loads more. A «Requiere acción» entry centres its item in the body and highlights it; the page scrolls only when the frame itself is out of view.
9. **No duplicated pending items.** «Por revisar» messages carry «Registrar respuesta» / «No es una respuesta» directly on their bubble in the conversation. «Requiere acción» becomes a compact summary: «N mensajes por revisar · M envíos sin confirmar». Each entry is clickable and scrolls to the item and highlights it briefly. «¿Lo enviaste?» prompts keep their «Sí, se envió» / «No se envió» buttons in the summary block, because there is no received bubble to attach them to. The opened-unconfirmed send in the conversation shows the same two buttons. The empty state keeps its current text.
10. **«Responder» at the end of the conversation.** When the business has at least one received message, a «Responder» button sits below the last item. It opens the existing composer with the channel and recipient of the last received message preselected (the same as choosing them by hand). If that channel or recipient cannot be used from the composer (permissions, «No contactar», unsupported channel), it opens the composer with its normal defaults and says why. It only prepares a message; it is not contact.
11. **Filter by management.** Next to the channel chips, a selector «Todas las gestiones · <each management present> · Sin gestión». It appears only when items belong to two or more distinct values. It combines with the channel filter. Client-side.
12. **«Nuevo desde tu última visita».** A divider line «Nuevo desde tu última visita» before the first item newer than the user's previous visit to this business's Comunicación tab, ignoring items the user sent. There is no divider on the first visit or when nothing is new.
    - Read state is per user and per business, in a new table `crm_communication_reads (user_id, account_id, last_seen_at)` (migration `048`, PK `(user_id, account_id)`, FKs with `ON DELETE CASCADE`).
    - `GET /_api/communication` returns the caller's previous `lastSeenAt` (read-only, nullable).
    - The client marks the visit through a new `POST /_api/communication/seen` (Zod input `{ accountId, seenAt }`). It upserts `GREATEST(existing, seenAt)` and caps `seenAt` at the server's `now()`. It requires read access to the business, the same check as the GET. It writes only the caller's own read state: it is not a business write, not contact, and does not touch the journal or history.
    - The client sends the newest loaded item's timestamp after the tab renders, not the client clock. The divider for the current visit is computed from the value fetched before marking.

13. **Business tabs in the URL (owner request, 27/10/2026).** On `/accounts/:accountId` the open tab is `?tab=<slug>` (`resumen`, `historial`, `tareas`, `comunicacion`, `gestiones`, `documentos`), so a reload or a shared link opens it again.
    - Reading: `?tab=` first, then the legacy `?section=` (search results, toasts, old links, with its aliases). Missing or unknown values open Resumen; a tab the user cannot see (Tareas on a read-only business) falls back to Resumen.
    - Writing: a tab change replaces the history entry (Back leaves the business page instead of walking through tabs), keeps every other param, drops the legacy `section` and omits `tab` for Resumen. The page keeps the panel mounted on a tab change (the panel's key travels in the location state); a real navigation to the same business still remounts it.
    - «Mensajes por revisar» in Hoy links to `?tab=comunicacion`. Search results keep their `?section=` links, which still work.
    - The management page (`/sales/:leadId`) has its own tabs and embeds the business panel without tabs, so it is unchanged.

## 3. Rules that do not change

- Opening a channel, preparing a reply, saving a draft or moving a stage is not evidence of contact, reply, acceptance, payment or delivery. «Responder» only opens the composer.
- Server-side permission and «No contactar» checks on every write path; read access grants nothing else (the seen endpoint writes only the caller's own read marker).
- Registering a response stays explicit. No auto-retry of uncertain sends.
- Business days in Argentina via `crmDates.tsx`.
- Same Comunicación data visibility as spec 90.

## 4. Scope and non-goals

- No changes to the Bandeja, Historial, the header «Último contacto» or the left column beyond what the action bar needs.
- No unread counters in navigation or lists (read state is only used for the divider in this tab).
- Mobile: must work at 390 px. The «⋯» menu is always visible there, and the floating «Ir al último» button must not cover the action buttons.

## 5. Acceptance

- On «Aguas Termales Demo» (local), the tab renders bubbles without outer cards, no «Sin gestión» chips, no repeated «Corregir…» buttons, calls as slim lines, a one-line action bar and the anulados switch apart from the chips.
- Opening the tab shows the latest item. «Ir al último» appears after scrolling up. «Ver anteriores» keeps the position.
- A «Por revisar» message has its actions only on its bubble. The summary entry scrolls to and highlights it.
- «Responder» preselects the last inbound channel and recipient, or explains the fallback.
- The management filter appears only with two or more values and combines with the channel chips.
- «Nuevo desde tu última visita» appears only for items newer than the previous visit and not sent by the viewer. The seen endpoint rejects a business the user cannot read, never moves `last_seen_at` backwards and caps future timestamps.
- Tests:
  - unit/component tests for the clamping, management filter, divider computation, scroll-to-latest and summary-scroll behaviour, the «⋯» menu actions and the «Responder» preselection;
  - an integration test for the seen endpoint (permissions, GREATEST, cap, cascade);
  - existing e2e tests updated without weakening assertions.
