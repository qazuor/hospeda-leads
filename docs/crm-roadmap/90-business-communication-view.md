# Spec 90 — Communication in the business page

Status: approved by the owner on 27/10/2026 (mockup «Comunicación en la ficha»). Type: UI. It does not change contracts, permissions or business rules.

## 1. Problem

The «Comunicación» tab of a business page shows everything, but split into blocks that do not read as a conversation (diagnosis of 26/10/2026):

- Received and sent messages are two separate lists, each sorted on its own. The Bandeja reads «hola → prueba → pepe»; the business page shows «pepe, hola» on top and the Hospeda reply far below.
- Sent messages are one-line rows («status · channel · recipient · date») that hide the text. Calls land in the same list as «Envío confirmado manualmente · Llamada».
- A registered response shows up to three times: on the received card, in «Respuestas registradas» and in Historial.
- Historial does not show received messages. It shows `inbound_*` journal entries with no label, rendered as «Novedad en la comunicación», and the header's «Último contacto» picks that title up. One Instagram echo produces two Historial entries.
- Labels disagree: Instagram is «Instagram», «Redes», «Red social» or raw `social`; Historial prints `call` raw and titles a call «Mensaje»; Instagram cards show «(sin asunto)»; the business page says «No es una respuesta» where the Bandeja says «Descartar».
- Six ways to start or record contact are spread across the page, and there are two «restricciones» blocks with almost the same name.

## 2. Final behaviour

### 2.1 Comunicación tab, top to bottom

1. Title «Comunicación», the line «Todo lo enviado y recibido con este negocio, en orden, con o sin gestión.» and a link «Abrir en la Bandeja» (to `/inbox?account=<id>`).
2. **Action bar**: «Contactar» (primary, the existing composer), «Registrar llamada u otro contacto» (the existing manual social/other-channel form plus calls where allowed) and «Registrar respuesta sin mensaje» (the existing response dialog without an inbound message). Same permission and «No contactar» gating as today; a disabled action keeps saying why.
3. **Restriction notice**: only when an active contact restriction exists, one line naming it and pointing to «Preferencias y restricciones». The full restrictions editor is no longer duplicated inside the tab.
4. **«Requiere acción · N»**: received messages «Por revisar» (with «Registrar respuesta» / «No es una respuesta») and «¿Lo enviaste?» prompts for opened-but-unconfirmed sends (with «Sí, se envió» / «No se envió»). Same actions and endpoints as today. Empty state: «Nada pendiente: no hay mensajes por revisar ni envíos sin confirmar.»
5. **«Conversación»**: one chronological list (oldest first, newest at the bottom; day separators) that merges sent messages, received messages and calls of the business, with or without management.
   - Received: left-aligned bubble, header with channel icon + channel label, sender, time, and the management chip («Gestión: <name>» or «Sin gestión»). Subject only for email. Tags under the bubble: «Por revisar», «Respuesta registrada · <outcome>[ · completó la tarea «X»]», «Automática · no cuenta como respuesta», «Registrado automáticamente» (auto-registration) with its void action, and voided items only behind the existing «Anulados» toggle.
   - Sent: right-aligned bubble with the text visible, sender (including «X, por delegación de Y» and «Instagram de Hospeda» for echoes), channel, time, management chip, and an honest status line with the existing status labels (accepted ≠ delivered; opened WhatsApp ≠ sent).
   - Calls: a centred event row («Llamada registrada · <result> · <who> · <time>»).
   - Channel filter chips «Todo · WhatsApp · Email · Instagram · Llamadas» with counts; only channels present are shown. Client-side filter.
   - Long histories: show the latest 30 items with «Ver anteriores».
6. **«Borradores · N»**: drafts (not sent, not opened) as their own block with «Seguir editando».
7. The «Respuestas registradas» block disappears: each response is shown on its received message, and a response registered without a message appears in the conversation as a received event («Respuesta registrada sin mensaje · <outcome>»).

### 2.2 Rest of the page

- Left column: drop the WhatsApp / Email buttons (they open the same composer as «Contactar»). Keep «Agendar tarea» and «Anotar lo que pasó». «Preferencias y restricciones» stays here as the only place to edit restrictions.
- Historial: titles for the `inbound_*` journal actions («Mensaje recibido por <canal>», «Mensaje asociado», «Mensaje descartado», «Respuesta registrada»), channel names for `social` → «Instagram» (or «Red social» when not Instagram) and `call` → «Llamada», a call titled «Llamada» with a phone icon, and one entry per Instagram echo (no extra «Contacto realizado»).
- Header «Último contacto»: same event as today, with the new title (e.g. «Mensaje recibido por Instagram de @x · 26 oct, 23:17»). What counts as last contact does not change.
- Labels unified across the business page and the Bandeja: «Instagram» for Instagram (`social` rows from Instagram), no «(sin asunto)» outside email, one wording for dismissing a received message (the business page's «No es una respuesta»; the Bandeja keeps its button but uses the same label).

## 3. Rules that do not change

- Opening a channel, saving a draft or moving a stage is not evidence of contact, reply, acceptance, payment or delivery.
- Server-side permission checks and «No contactar» on every write path. Read access to a business grants nothing else. The Comunicación data endpoint keeps its current visibility; this spec does not reuse the Bandeja query (which hides the business-level «General» thread from non-owners).
- Registering a response stays a separate, explicit act. No auto-retry of uncertain sends.
- Business days in Argentina via `crmDates.tsx`.

## 4. Scope and non-goals

- UI only. Prefer no API change; if the merged list needs fields the current `communication` endpoint does not return (e.g. response linked to a received message, call result), add them read-only to the existing response with tests. No migrations.
- Not in scope: embedding the Bandeja thread view; redefining «último contacto»; moving journal entries to an audit view; mobile-specific redesign beyond the layout working at 390 px (the left column must not end up below the whole conversation: on narrow screens the tab content comes after a compact business card).

## 5. Acceptance

- One business with WhatsApp, email, Instagram (in + echo), a call, a delegated send, a response with a resolved task, an auto-reply, an auto-registration, a draft and a «¿Lo enviaste?» prompt renders as one chronological conversation, and the channel chips filter it.
- Every action that existed in the tab still exists, with the same endpoint, gating and loading/double-submit behaviour.
- Historial shows no «Novedad en la comunicación» for `inbound_*` actions, no raw `social`/`call`, one entry per Instagram echo.
- Unit/component tests for the merge/sort/grouping helper, the filter chips, the requires-action list, label helpers and Historial titles; e2e tests updated for the new structure (no weakened assertions).
