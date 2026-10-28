# Spec 93 — Email delivery, opens and clicks

Status: requested by the owner on 27/10/2026 («para email, armemoslo entero»). Approved by the owner on 27/10/2026, including the defaults in section 7 (D1–D4). Type: read-only API fields, informational badges on the email item, a hardening of the Brevo webhook's reconciliation and the production setup steps. No migration: the existing index covers the new query. It does not change permissions, «No contactar» gating, what counts as contact or «Último contacto».

Builds on the conversation layout of [spec 90](90-business-communication-view.md), [spec 91](91-communication-polish.md) (two-line items, platform colours, «Cómo leer el chat») and [spec 92](92-instagram-open-chat.md).

## 1. Problem

- `POST /_api/brevo/events` (`webhook()` in `src/endpoints/communication.ts`) authenticates Brevo with `Authorization: Bearer <BREVO_WEBHOOK_TOKEN>` (32+ chars, else 503) and stores **every** event in `crm_email_events`. Events are deduplicated by fingerprint and linked to `email_outbox` by message-id + recipient or by the `hospeda-<uuid>` tag. It then calls `reconcileEvents` (`src/helpers/communicationService.ts`), which maps only terminal events: `delivered` → `delivery_confirmed`; `hard_bounce`, `soft_bounce`, `blocked`, `invalid_email`, `error` → `failed`.
- In production the webhook is not configured yet (the runbook lists Brevo as pending), so every sent email stays «Email aceptado por proveedor · entrega no confirmada». There are no written steps to set it up.
- Opens, clicks and spam complaints are stored but shown nowhere.
- `reconcileEvents` runs again on **every** event, opens included, and redelivered duplicates included. Each run re-applies the side effects of the last terminal event:
  - it rewrites the activity result, which fires the activity audit and contact triggers on every open;
  - after a `hard_bounce` it re-adds the automatic «No contactar por email» restriction that an admin may have lifted;
  - after a `delivered` it lifts automatic restrictions again.
- A `soft_bounce` and a `delivered` with the same second sort alphabetically (`ORDER BY occurred_at,event`), so the soft bounce wins and the delivered email ends as «Rebote/fallo».

## 2. Final behaviour

### 2.1 Brevo event names (verified)

Source: Brevo developer docs, «Transactional webhooks» (`developers.brevo.com/docs/transactional-webhooks`), «Create a webhook» (`developers.brevo.com/reference/create-webhook`) and «Secure webhook calls» (`developers.brevo.com/docs/secured-webhooks`), checked through Context7 and the official page on 27/10/2026.

| `event` value received | Subscription name (create API / UI) | CRM use |
| --- | --- | --- |
| `request` | `sent` or `request` | stored only |
| `delivered` | `delivered` | status «Entregado» |
| `soft_bounce` | `softBounce` | status «Rebote/fallo» unless delivered (2.2) |
| `hard_bounce` | `hardBounce` | «Rebote/fallo» + automatic email restriction (unchanged) |
| `blocked` | `blocked` | «Rebote/fallo» |
| `invalid_email` | `invalid` | «Rebote/fallo» + automatic email restriction (unchanged) |
| `error` | not subscribable on its own | «Rebote/fallo» (unchanged) |
| `deferred` | `deferred` | stored only; never a status |
| `opened` | `opened` | open (each opening) |
| `unique_opened` | `uniqueOpened` | open (first opening) |
| `proxy_open`, `unique_proxy_open` | not in the subscription list; Brevo sends them for proxied opens | «Posible apertura automática» (D1) |
| `click` | `click` | click; the URL comes in `link` |
| `spam` | `spam` | «Marcado como spam» |
| `unsubscribed` | `unsubscribed` | stored only (D3) |

Timestamps: `ts_event` (seconds, GMT) is the event time and wins over `ts`. `ts_epoch` is the time the message was **sent** (milliseconds) and is only a last-resort fallback, as today.

### 2.2 Delivery

- `delivered` keeps mapping to `delivery_confirmed`. On the email item the status badge reads **«Entregado · <dd/mm hh:mm>»** with the first `delivered` time. Without that time it keeps the existing label «Entrega confirmada».
- **Delivered beats temporary problems.** A `soft_bounce` or `deferred` before or in the same second as a `delivered` never leaves the email failed: a soft bounce is temporary and Brevo retries it. A `hard_bounce`, `blocked`, `invalid_email` or `error` *after* the delivery still wins (an asynchronous bounce), as today.
- **Side effects run once per new evidence.** `reconcileEvents` runs only when the webhook stores a **new** terminal event, or when the event links earlier orphan events. Opens, clicks, spam, deferred, unsubscribed and redelivered duplicates are stored and nothing else happens. When it does run it writes only what changes (status, activity result), so no audit row is written for a no-op.

### 2.3 Opens, clicks and spam on the email item

Informational badges in the item header, after the status badge (spec 91 two-line layout), on every sent email that has the data: (`<fecha hora>` is the compact Argentina time «27/10 16:24»; the item's day separator already carries the full date)

- **«Abierto · <fecha hora>»** with the first open, plus **«×N»** when there is more than one. Tooltip: «Aproximado: algunos clientes de correo abren los emails automáticamente (Apple Mail) y otros bloquean las imágenes.»
- **«Posible apertura automática · <fecha hora>»** (plus «×N») for `proxy_open` / `unique_proxy_open`, kept apart from «Abierto» (D1). Tooltip: «Brevo detectó una apertura hecha por un servidor intermedio (por ejemplo, la protección de privacidad de Apple Mail). Puede no haberla abierto una persona.»
- **«Click en un enlace · <fecha hora>»** (plus «×N»). Tooltip: the clicked links as plain text (at most 3, scheme + host + path, no query string or fragment, at most 80 characters each), never as links. Without a valid `http(s)` URL the tooltip only says «Brevo registró un click en un enlace del email.»
- **«Marcado como spam · <fecha hora>»**, warning tone. Tooltip: «El destinatario marcó este email como spam. Conviene no volver a escribirle por email sin revisarlo.»

Counting rule. Brevo can send both `opened` and `unique_opened` for the first opening, so the open count is `max(count(opened), min(count(unique_opened), 1))`, and the first open is the earliest of both. The proxy count follows the same rule. Clicks count every `click`. Events with the same message, recipient, type and second are one event (existing fingerprint).

### 2.4 Honesty

- An open, a click or a spam complaint never changes the message status, never counts as contact or reply, never completes or creates tasks, never touches «Último contacto», the activity, the journal or the history (D2). They are only shown.
- The «Cómo leer el chat» legend gains an **«Email (Brevo)»** entry: «Entregado: Brevo confirmó que el servidor del destinatario recibió el email.», «Abierto y Click en un enlace: informativos, no son una respuesta.», the approximate note, «Posible apertura automática» and «Marcado como spam».

### 2.5 API

`GET /_api/communication` adds, read-only, to each loaded message with an `outboxId` and at least one linked event, an `emailEngagement` object (null otherwise):

`{deliveredAt, firstOpenedAt, openCount, firstProxyOpenedAt, proxyOpenCount, firstClickedAt, clickCount, clickedLinks, spamAt, lastEventAt}`

- One aggregated query over `crm_email_events` with `outbox_id = ANY(<loaded outbox ids>) GROUP BY outbox_id`. No N+1. It uses the existing index `crm_email_events_outbox (outbox_id, occurred_at)` (migration 010), so no migration is added. `050` stays free.
- `clickedLinks` is sanitized on the server (2.3). The raw payload is never returned.
- Same read check as today; no new endpoint.

### 2.6 Where it shows

The business «Comunicación» conversation (`ConversationItem`), on the email item. The Bandeja thread view does not render sent emails with this component, so it is out of scope (section 4).

## 3. Rules that do not change

- Opening a channel, saving a draft, moving a stage, **an open or a click** is not evidence of contact, reply, acceptance, payment or delivery.
- `delivered` is evidence that the receiving server accepted the email, not that a person read it.
- Server-side permission and «No contactar» checks on every write path. The webhook stays bearer-authenticated with a constant-time compare, 256 KB and 100 events per request.
- No auto-retry and no resend. «Email con resultado incierto» keeps its manual admin resolution.
- Hard bounce and invalid email keep adding the automatic email restriction; delivery keeps lifting automatic ones. Only the repetition on unrelated events goes away.
- Migrations are immutable; nothing in production is changed by this spec. The webhook is configured by the owner following section 6.

## 4. Scope and non-goals

- In scope: the reconciliation hardening (2.2), the API fields (2.5), the badges and legend (2.3, 2.4), the production steps (section 6), tests.
- Not in scope:
  - showing `deferred`, `soft_bounce` history or `unsubscribed` on the item;
  - adding a restriction for spam complaints or unsubscribes (D3);
  - journal or history entries for opens or clicks (D2);
  - the Bandeja thread, Hoy, reports or business-list filters by opens;
  - changing what `soft_bounce` does when no `delivered` follows (it stays «Rebote/fallo», as today);
  - Brevo marketing campaigns and SMS.

## 5. Acceptance

- Posting signed `delivered`, `opened` ×2, `click` and `spam` events for a sent email:
  - `GET /_api/communication` returns `deliveredAt`, `firstOpenedAt`, `openCount=2`, `firstClickedAt`, `clickCount=1`, `spamAt`, `lastEventAt`;
  - the message status is `delivery_confirmed`, and nothing else changed: no response, no reply status, the task status, the activity result and «Último contacto» stay as they were, and no journal row was added for the opens, the click or the spam.
- `soft_bounce` then `delivered` (also in the same second) ends `delivery_confirmed`.
- A redelivered `hard_bounce` after an admin lifted the restriction does not add it again.
- Without the bearer token: 401; with a short or missing token in the server: 503.
- Unit tests for the badge derivation (ordering, counts, proxy opens, spam, links) and the terminal-event rule; a component test for the badges and the legend.
- Screenshots: an email with Entregado + Abierto ×2 + Click, one marked as spam, and the legend.

## 6. Production configuration (owner)

Do this once, after this spec is deployed. Nothing here is run by an agent.

1. **Token.** Generate a random secret of at least 32 characters (`openssl rand -hex 32`). Set it as `BREVO_WEBHOOK_TOKEN` in the Coolify application and redeploy. Without it the endpoint answers 503.
2. **Create the webhook** (transactional, email). The Brevo UI (Transactional → Settings → Webhook) may not offer bearer authentication; the API does. With the Hospeda Brevo API key, from a trusted machine:

   ```bash
   curl -X POST https://api.brevo.com/v3/webhooks \
     -H "api-key: $BREVO_API_KEY" -H 'content-type: application/json' \
     -d '{"type":"transactional","channel":"email","description":"Hospeda CRM",
          "url":"https://crm.hospeda.com.ar/_api/brevo/events",
          "events":["delivered","opened","uniqueOpened","click","softBounce","hardBounce","blocked","spam","invalid","deferred","unsubscribed"],
          "auth":{"type":"bearer","token":"<BREVO_WEBHOOK_TOKEN>"}}'
   ```

   - Route: `POST /_api/brevo/events` (`src/server/app.ts`).
   - Do not set `batched`: one event per request is the documented default and stays under the 100-events limit.
   - `sent`/`request` is not needed.
3. **Check.** Send an email from the CRM to an address you control. Within a minute the item shows «Entregado · <hora>»; opening it shows «Abierto». `GET https://api.brevo.com/v3/webhooks?type=transactional` lists the webhook. A 401 in Brevo's logs means the token differs; a 503 means `BREVO_WEBHOOK_TOKEN` is missing or short.
4. **Rotate.** Set the new token in Coolify, redeploy, then `PUT /v3/webhooks/<id>` with the new `auth.token`. Do it at a quiet time: events rejected in between may not arrive again (Brevo does not document retries).

## 7. Decisions (owner, 27/10/2026)

Resolved: D1, D2, D3 and D4 as proposed.

- **D1. Proxy opens are labelled, not counted.** `proxy_open` / `unique_proxy_open` show as «Posible apertura automática», separate from «Abierto». Alternative: hide them. Labelling keeps the evidence visible without claiming a person read it.
- **D2. No journal or history entries for opens, clicks or spam.** One entry per open would flood Historial; the badge is enough. Alternative: one journal row for the first open only.
- **D3. Spam and unsubscribe do not add a restriction.** They are shown (spam) or stored (unsubscribe). Alternative: spam adds an automatic «No contactar por email», like a hard bounce. It is a contact-policy change, so it needs the owner.
- **D4. Delivered beats an earlier or same-second soft bounce or deferred,** but not a later hard bounce, block, invalid address or error.
