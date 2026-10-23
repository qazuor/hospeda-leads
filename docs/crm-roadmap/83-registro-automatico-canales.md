# Registro automático de canales: email entrante, respuestas en hilo y user script de WhatsApp/Instagram

**Estado:** Propuesto; no implementado
**Fecha:** 2026-10-22
**Base:** `staging` en `e42bd6d` (PR #213)
**Reemplaza:** `docs/prd-whatsapp-coexistence.md` (eliminado; Coexistence queda como opción futura en `docs/decisiones.md`)

## 1. Problema

Hoy el CRM registra solo una parte de lo que pasa con un negocio:

| Canal | Salida | Respuesta del negocio |
|---|---|---|
| Email | Automática (Brevo API + webhook de eventos) | Manual (`response_create`). El email llega al catch-all de Cloudflare y termina en la casilla del propietario. |
| WhatsApp | Manual: el CRM abre el chat, el vendedor confirma (`manual_pending` → `manual_complete`) | Manual |
| Instagram / redes | Manual | Manual |

Consecuencias: las respuestas se pierden o se cargan tarde, el vendedor no responde desde el CRM y la ficha del negocio no muestra la conversación real.

## 2. Objetivo

1. Toda respuesta por email a un mensaje del CRM aparece en el negocio correcto sin carga manual.
2. El vendedor responde desde el CRM y la respuesta llega **en el mismo hilo** del negocio.
3. Los mensajes de WhatsApp (y luego Instagram) se registran desde el navegador del vendedor con un clic, sin copiar y pegar.
4. Cada mensaje entrante queda asociado al negocio y a su responsable; lo que no se puede asociar con certeza queda visible para revisar, nunca se asocia "al azar".

## 3. Principios

- **Fallar hacia el lado seguro.** El email entrante se reenvía a la casilla del propietario **antes** de cualquier otro paso. Si el CRM está caído, no se pierde nada.
- **Recibir no es clasificar.** Que llegue un mensaje es un hecho y se registra solo. La categoría de la respuesta (interesado, más adelante, rechazo, No contactar…) la decide una persona. Coherente con «No inferir contacto, respuesta, aceptación…» de `AGENTS.md`.
- **El user script lee; nunca escribe ni envía.** No hace clics, no envía mensajes, no cambia etiquetas ni contactos en WhatsApp/Instagram. Todo envío lo hace la persona.
- **Sin asociación ambigua.** Si un mensaje coincide con más de un negocio o con ninguno, queda "Sin asociar" para que alguien lo resuelva.
- **Permisos del servidor.** Ver, responder o registrar respetan `assertBusinessAccess`, las reglas de gestión y las restricciones No contactar existentes.
- **Idempotencia.** Reintentos del Worker o clics repetidos en el user script no duplican mensajes.

## 4. Fases y orden

| Fase | Entrega | Depende de |
|---|---|---|
| F0 | Preparación operativa (WhatsApp Business, etiquetas, claves) | — |
| F1 | Email entrante: Cloudflare Email Worker → CRM | F0 (token) |
| F2 | Responder email desde el CRM en el mismo hilo (SMTP de Brevo) | F1 |
| F3 | User script (Tampermonkey) para WhatsApp Web (semi-automático) | modelo de F1 |
| F4 | User script para Instagram Direct | F3 |
| F5 (opcional) | Captura automática en el user script, sin clic | F3 estable 2–4 semanas |

Cada fase es un PR (o una cadena corta) mergeable por separado.

## 5. Modelo de datos (migración nueva, `037_inbound_messages.sql`)

### 5.1 `crm_inbound_messages` (nueva)

Un registro por mensaje recibido, de cualquier canal.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `channel` | text | `email`, `whatsapp`, `social` (mismos valores que `crm_messages`) |
| `channel_detail` | text null | `instagram` cuando `channel='social'` |
| `external_id` | text | Message-ID del email o id del mensaje de WhatsApp/Instagram. `UNIQUE(channel, external_id)` |
| `account_id` | bigint null FK `crm_accounts` | null = Sin asociar |
| `lead_id` | bigint null FK `leads` ON DELETE SET NULL | solo si la gestión es inequívoca |
| `contact_id` | bigint null FK `crm_contacts` ON DELETE SET NULL | |
| `linked_message_id` | uuid null FK `crm_messages` ON DELETE SET NULL | el saliente al que responde |
| `match_method` | text | `in_reply_to`, `references`, `sender_email`, `phone`, `crm_code`, `instagram_handle`, `manual`, `none` |
| `from_address` | text | email, teléfono E.164 o usuario |
| `from_name` | text | |
| `subject` | text | email |
| `text_body` | text | limitado a 50 000 caracteres |
| `html_body` | text null | email; se muestra **sanitizado** |
| `headers` | jsonb | subset: Message-ID, In-Reply-To, References, Auto-Submitted, Precedence, X-Autoreply, To, Cc, Date |
| `attachments` | jsonb | solo metadata (nombre, tipo, tamaño); los archivos no se guardan en v1 |
| `is_automatic` | boolean | auto-respuestas ("fuera de oficina"); no cuentan como respuesta |
| `received_at` | timestamptz | fecha del mensaje |
| `status` | text | `unmatched`, `pending_review`, `registered`, `dismissed` |
| `response_id` | uuid null FK `crm_communication_responses` | se completa al clasificar |
| `source` | text | `email_worker`, `userscript` |
| `captured_by_email` | text null FK `users(email)` | quien lo registró con el user script |
| `created_at`, `updated_at` | timestamptz | |

Índices: `(account_id, received_at DESC)`, `(status) WHERE status IN ('unmatched','pending_review')`. Triggers de auditoría y `bump_crm_live_domain('communication')` como el resto de comunicación.

### 5.2 Cambios en tablas existentes

- `email_outbox`: `transport text NOT NULL DEFAULT 'api' CHECK (transport IN ('api','smtp'))`, `in_reply_to text`, `references_header text`, `inbound_message_id uuid FK crm_inbound_messages`.
- `crm_communication_journal`: `entity_type` suma `'inbound'`. Acciones nuevas: `inbound_received`, `inbound_matched`, `inbound_registered`, `inbound_dismissed`, `email_reply_sent`.
- `crm_communication_responses`: sin cambios de estructura. Al clasificar un entrante se crea una respuesta normal con `exact_text` = texto recibido y `linked_message_id` del saliente.
- `crm_userscript_tokens` (nueva, F3): `id`, `user_id`, `token_hash` (sha256), `label`, `created_at`, `last_used_at`, `revoked_at`. El token se muestra una sola vez.

No se edita ninguna migración aplicada.

## 6. F1: email entrante

### 6.1 Recorrido

```
Negocio responde a leo@hospeda.com.ar (Reply-To del email enviado por el CRM)
  → Cloudflare Email Routing (catch-all y reglas específicas que hoy reenvían a Gmail)
  → Email Worker "hospeda-inbound"
      1. message.forward(<casilla del propietario>)   ← siempre primero
      2. parsear (postal-mime), recortar tamaños
      3. POST https://<crm>/_api/inbound/email  (Authorization: Bearer INBOUND_EMAIL_TOKEN)
  → CRM: deduplica por Message-ID, asocia, guarda, avisa al responsable
```

Hoy el `Reply-To` de los emails del CRM es el `sender_email` del vendedor o, si no tiene, `brevo_reply_to_email` (`communicationService.ts`, armado de `email_outbox`). Las dos direcciones son de `hospeda.com.ar`, así que llegan al catch-all.

### 6.2 Worker

- Vive en este repo, en `workers/inbound-email/` (Wrangler, TypeScript, sin dependencias del servidor). Deploy manual por el propietario; no entra al deploy de Coolify.
- Secrets: `INBOUND_EMAIL_TOKEN` (≥32 caracteres), `FORWARD_TO`, `CRM_INBOUND_URL`.
- Orden: el Worker copia el email en memoria (como el ejemplo oficial de Cloudflare, que lee `raw` antes de `forward`) y reenvía a Gmail antes de llamar al CRM; si la lectura falla, reenvía igual. Si `forward` falla, reintenta una vez y después lanza el error para que Email Routing lo informe en lugar de perder el mensaje en silencio. Cualquier error posterior al reenvío se registra en los logs del Worker y **no** rechaza el mensaje (`setReject` nunca se usa).
- El filtro usa el destinatario de sobre (`message.to`): Email Routing ejecuta el Worker por cada destinatario del dominio, incluidos los que van en Cc.
- Si el CRM responde 5xx o hay timeout: hasta 2 reintentos con espera corta dentro del mismo evento. Si siguen fallando, el email ya está en Gmail; queda logueado para reingesta manual (ver 6.5).
- Tamaño: cuerpo de texto ≤ 50 000 caracteres, HTML ≤ 200 000; adjuntos solo metadata. Payload total ≤ 1 MB.
- Solo pasa al CRM el correo dirigido (To o Cc) a casillas de usuarios del CRM (`users.sender_email`) o a la dirección de respuesta general (`brevo_reply_to_email`). El Worker obtiene esa lista del CRM (`GET /_api/inbound/addresses`, mismo token, cacheada 10 minutos). El resto solo se reenvía a Gmail. Decisión del 22/10/2026.

### 6.3 Endpoint `POST /_api/inbound/email`

- Exento del origin guard (como `/_api/brevo/events`), autenticado con Bearer + `timingSafeEqual`, 503 si el token no está configurado.
- Zod sobre el payload: `messageId`, `inReplyTo`, `references[]`, `from {email,name}`, `to[]`, `cc[]`, `subject`, `date`, `text`, `html`, `headers`, `attachments[]`.
- Idempotente: `INSERT … ON CONFLICT (channel, external_id) DO NOTHING`; responde 200 también si ya existía.
- Errores transitorios de DB → 503 con `Retry-After`; payload inválido → 400 (mismo criterio que el webhook de Brevo).

### 6.4 Asociación (en orden; la primera que da un único negocio gana)

1. `In-Reply-To` = `email_outbox.message_id` (comparando sin `<>`) → negocio, gestión y contacto del `crm_messages` vinculado. `match_method='in_reply_to'`.
2. Algún id de `References` coincide con un `email_outbox.message_id` o con un `crm_inbound_messages.external_id` ya asociado. `references`.
3. Solo con autenticación del remitente según `Authentication-Results`: `dmarc=pass` para el dominio del `From`, o `spf=pass` para un remitente de sobre del mismo dominio o de un subdominio (nunca de un dominio padre). En ese caso, el email del remitente coincide exactamente (sin mayúsculas) con el email de **un solo** negocio o persona activa. `sender_email`. La gestión solo se completa si el negocio tiene exactamente una gestión abierta.
4. Si no: `account_id = null`, `status='unmatched'`.

El `From` no está autenticado: sin esa evidencia, un tercero podría hacerse pasar por un negocio, así que el mensaje queda Sin asociar. `In-Reply-To`/`References` no lo exigen porque requieren conocer el Message-ID de un email del CRM, que solo tiene quien lo recibió.

**A verificar en la prueba real:** si Email Routing entrega `Authentication-Results` al Worker y con qué identificador del servidor de autenticación. Si no lo entrega, la asociación por remitente no ocurre y esos mensajes quedan Sin asociar. El Worker solo pasa el `Authentication-Results` de más arriba y solo si su identificador coincide con `TRUSTED_AUTHSERV_ID`; mientras esa variable esté vacía, la asociación por remitente está desactivada.

Si una etapa apunta a más de un negocio, la asociación se detiene ahí y el mensaje queda Sin asociar: una evidencia más débil no desempata.

Auto-respuestas: `Auto-Submitted` distinto de `no`, `X-Autoreply`, `Precedence: auto_reply|bulk|junk` → `is_automatic=true`. Se asocian igual, pero no generan aviso ni cuentan como respuesta.

Un entrante asociado queda `pending_review`. El estado del `crm_messages` vinculado **no cambia** hasta que alguien clasifica la respuesta (hoy `replied` lo pone `response_create`; se mantiene).

### 6.5 UI

- **Ficha del negocio → Comunicación:** los entrantes aparecen en la línea de tiempo junto a los salientes, con remitente, asunto, extracto y "Ver completo". El HTML se muestra sanitizado (sin scripts, sin imágenes remotas por defecto, con "Mostrar imágenes").
- **Acciones sobre un entrante:** "Registrar respuesta" (abre el formulario de respuesta existente con categoría a elegir y `exact_text` precargado), "Responder" (F2), "No es una respuesta" (`dismissed`, pide motivo corto).
- **Hoy:** bloque "Respuestas nuevas" con los `pending_review` de negocios donde el usuario es responsable. Admin ve además los `unmatched`.
- **Sin asociar (admin):** lista con buscador de negocio para asociar a mano (`match_method='manual'`, queda en el journal). Incluye "Reingresar" para pegar el código fuente de un email que el Worker no pudo entregar.

### 6.6 Validación F1

- Unitarias: parser de headers, reglas de asociación (cada rama y la ambigua), detección de auto-respuestas, idempotencia.
- Integración (DB local descartable): endpoint con token válido/ inválido/ ausente, duplicado, tamaño excedido, error transitorio.
- Worker: test con `@cloudflare/vitest-pool-workers` o mock del `ForwardableEmailMessage` verificando que `forward` se llama primero y aunque el CRM falle.
- Prueba real: responder desde Gmail a un email del CRM en el entorno de prueba y verificar asociación.

## 7. F2: responder desde el CRM en el mismo hilo

### 7.1 Evidencia

La API transaccional de Brevo no acepta headers estándar (`In-Reply-To`, `References`). Prueba real del 22/10/2026 con el relay SMTP (`smtp-relay.brevo.com:587`, STARTTLS): Brevo conservó `Message-ID`, `In-Reply-To` y `References`; Gmail agrupó los dos mensajes en una conversación; DKIM (`hospeda.com.ar`, selector `brevo2`), SPF y DMARC pasaron.

Efectos observados de Brevo: agregó `List-Unsubscribe` + `List-Unsubscribe-Post` y convirtió el texto plano en HTML (seguimiento). **A verificar en la implementación** si se pueden desactivar por envío para respuestas 1 a 1.

### 7.2 Comportamiento

- "Responder" en un entrante de email abre el editor TipTap con:
  - Para: remitente del entrante (editable solo por admin).
  - Asunto: `Re: <asunto>` (sin duplicar `Re:`).
  - Cuerpo vacío arriba; debajo, el historial citado ("El <fecha>, <remitente> escribió:" + texto en `blockquote`).
- Layout liviano aprobado: sin cabecera de marca, solo la firma del vendedor (`buildHospedaEmailHtml` con variante `reply`).
- Envío por SMTP de Brevo con `Message-ID` propio `<uuid@hospeda.com.ar>`, `In-Reply-To` = Message-ID del entrante, `References` = References del entrante + su Message-ID.
- Se registra como `crm_messages` (canal email) + `email_outbox` con `transport='smtp'`, `inbound_message_id` y `message_id` = el propio. Los eventos del webhook de Brevo se siguen reconciliando por `message_id`.
- Mismos permisos, bloqueo de doble envío y estados (`submitting`, `accepted`, `unknown`, `failed`) que el envío actual. No se reintenta automáticamente un envío incierto.
- **No contactar (decisión del 22/10/2026):** si el negocio tiene la restricción activa y escribió primero, se permite **solo responder**: únicamente con "Responder" sobre un entrante recibido mientras la restricción está activa, al remitente de ese entrante y en su hilo. La restricción no se levanta ni habilita otros envíos (primer contacto, plantillas, WhatsApp asistido). El editor muestra el aviso «Este negocio pidió no ser contactado. Solo podés responder a su mensaje.» y el journal registra `email_reply_under_restriction`. Para F3 el banner muestra el mismo aviso; el user script no envía, así que no hay bloqueo técnico en WhatsApp.

### 7.3 Configuración

- Env: `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY` (clave SMTP **propia del CRM**, revocable sin afectar al portal), `BREVO_SMTP_PORT` (587; 2525 si el VPS bloquea 587).
- Dependencia: `nodemailer`, aprobada por el propietario el 22/10/2026.
- Impacto en otras instancias del VPS: ninguno técnico. El portal envía por la API de Brevo, no por SMTP. Se comparten cuota y reputación de la cuenta Brevo, igual que hoy.

### 7.4 Validación F2

- Unitarias: armado de asunto, headers de hilo, cita del historial, sanitizado.
- Integración: envío contra un servidor SMTP falso local (no Brevo), estados de outbox, permisos y No contactar.
- Prueba real: responder a un email de prueba y verificar el hilo en Gmail y en otro cliente (Outlook).

## 8. F3: user script (Tampermonkey) para WhatsApp Web

### 8.1 Operación del número (F0)

- Un número de Hospeda con **WhatsApp Business**. El teléfono del propietario es el principal; los 4 vendedores usan dispositivos vinculados (WhatsApp permite hasta 4, sin margen para un quinto).
- Etiquetas de WhatsApp Business por vendedor ("Leo", "Ana"…) y por estado ("Primer contacto", "Respondió"), aplicadas a mano.
- Volumen de contactos en frío gradual, mensajes del catálogo con variación, y un número de reserva en caso de restricción.
- WhatsApp Web no indica qué dispositivo vinculado envió cada mensaje: la autoría de un saliente es de quien lo registra; si no se puede saber, se registra como "Número Hospeda".

### 8.2 Identificación del negocio

- **Código CRM:** `H` + `crm_accounts.id` (ej. `H1234`).
- En la ficha, botón "Copiar nombre para agendar" → `Cabañas del Río · H1234`. El vendedor agenda el contacto con ese nombre.
- El user script busca el código en el título del chat con `/·\s*H(\d+)\s*$/`.
- Si no hay código: busca el teléfono del chat (normalizado E.164) entre teléfonos y WhatsApp de negocios y personas. Una coincidencia única asocia; varias → el vendedor elige; ninguna → "Sin asociar".
- Al abrir un chat desde el CRM (`web.whatsapp.com/send?phone=…`), el user script recuerda durante la sesión qué negocio abrió ese teléfono, para no depender de que el contacto ya esté agendado.

### 8.3 Funciones del user script (v1, semi-automático)

1. **Banner en el chat:** nombre del negocio, responsable, gestión y etapa, y aviso rojo si hay restricción No contactar. Enlace "Abrir en CRM".
2. **"Registrar en CRM":** lee los mensajes visibles del chat que todavía no están en el CRM y muestra una vista previa:
   - Salientes → `crm_messages` canal `whatsapp`, estado `manual_sent`. Si existe un `manual_pending` de ese negocio, lo completa en lugar de crear otro.
   - Entrantes → `crm_inbound_messages` `pending_review`, asignados al negocio.
   - El vendedor confirma; nada se guarda sin confirmación.
3. **Deduplicación:** por el id del mensaje de WhatsApp (atributo `data-id` del nodo; incluye dirección, chat e id). `UNIQUE(channel, external_id)` en el servidor.
4. **Estado:** ícono con "Conectado como …", último registro, y error claro si WhatsApp Web cambió y no se puede leer el chat ("No pude leer este chat. Registrá a mano desde el CRM.").

No hace: enviar, hacer clics, cambiar etiquetas o nombres, leer chats que no se abren, ni capturar medios (solo "[imagen]", "[audio]" con duración, etc.).

### 8.4 Arquitectura

Decisión del 22/10/2026: **user script para Tampermonkey** en lugar de una extensión propia. Motivos: se instala con un link, se actualiza solo, el mismo archivo sirve en Chrome, Edge y Firefox, y no pasa por la revisión de la Chrome Web Store ni por la firma de Mozilla.

- Código en `userscript/` dentro de este repo, TypeScript, compilado con Vite a un único archivo `hospeda-crm.user.js` (IIFE con el bloque `// ==UserScript==`).
- Metadatos:
  - `@match https://web.whatsapp.com/*` (F3) y `@match https://www.instagram.com/direct/*` (F4).
  - `@grant GM_xmlhttpRequest`, `GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`; `@connect <dominio del CRM>`.
  - `@version` semántica; `@updateURL` y `@downloadURL` apuntan a `https://<crm>/userscripts/hospeda-crm.user.js`.
- Solo APIs `GM_*` estándar, sin funciones propias de un navegador, para que corra también en Violentmonkey.
- El CRM sirve el archivo como estático público. No contiene secretos; el token lo carga cada vendedor.
- Selectores DOM aislados en un único módulo con tests sobre fixtures HTML guardados, para corregir rápido cuando WhatsApp cambie.
- Llamadas al CRM con `GM_xmlhttpRequest` (no `fetch` de la página): no dependen de CORS y no exponen el token al código de WhatsApp.
- Autenticación: token personal generado en "Mi perfil → User script" (`crm_userscript_tokens`, guardado con hash, revocable, `last_used_at`). El vendedor lo pega una vez desde el menú de Tampermonkey (`GM_registerMenuCommand` → "Configurar token") y queda en `GM_setValue`. No usa cookies de sesión del CRM.
- Endpoints nuevos, autenticados con el token (`Authorization: Bearer`), exentos del origin guard:
  - `GET /_api/userscript/context?code=H1234` o `?phone=+549…` → negocio, responsable, gestiones abiertas, restricciones y versión mínima admitida.
  - `POST /_api/userscript/register` → lote de mensajes (≤ 50) con `external_id`, dirección, texto, hora; respuesta por mensaje: `created` / `duplicate` / `rejected` con motivo.
- Versión mínima: si `@version` es menor que la que informa el CRM, el script muestra «Actualizá el script desde el menú de Tampermonkey» y no registra.
- Instalación (guía en `userscript/README.md`):
  1. Instalar Tampermonkey (Chrome, Edge o Firefox).
  2. Solo en Chrome/Edge 138 o posterior: en los detalles de Tampermonkey activar "Permitir scripts de usuario" (o el modo desarrollador). Firefox no lo pide.
  3. Abrir el link del script desde el CRM e instalar.
  4. Cargar el token desde el menú de Tampermonkey.
- Dependencia operativa: Tampermonkey es de terceros y tiene acceso a las páginas donde corre. Alternativa de código abierto compatible: Violentmonkey.

### 8.5 Riesgos

- **Términos de WhatsApp:** prohíben medios automatizados o no autorizados. El user script solo lee lo que la persona ya ve y nunca envía ni automatiza, lo que reduce el riesgo pero no lo elimina. Decisión del propietario del 22/10/2026: avanzar con un registro desde el navegador (primero se eligió extensión, después user script). El PRD de Coexistence anterior la descartaba; se elimina y Coexistence queda como alternativa futura.
- **Fragilidad:** WhatsApp Web cambia su DOM sin aviso. Mitigación: selectores aislados, fixtures, mensaje de error explícito y el registro manual del CRM siempre disponible.
- **Privacidad:** solo se leen chats que la persona abre y que se asocian a un negocio; los mensajes se guardan con los mismos permisos que el resto de comunicación.

### 8.6 Validación F3

- Unitarias: parser de código y teléfono, extracción de mensajes sobre fixtures, deduplicación.
- Integración: endpoints con token válido/revocado, permisos por negocio, lote con duplicados, No contactar.
- Prueba manual guiada con un vendedor sobre un chat de prueba, en 1280 px.

## 9. F4: Instagram Direct

Mismo user script, con `@match https://www.instagram.com/direct/*`. Asociación por el usuario de Instagram del negocio (`crm_accounts.perfil_instagram`, normalizado a usuario sin `@` ni URL). Banner y "Registrar en CRM" iguales a F3, canal `social` con `channel_detail='instagram'`. Instagram cambia su DOM con más frecuencia que WhatsApp: se especifica en detalle al terminar F3.

## 10. F5 (opcional): captura automática

Con F3 estable, el user script puede encolar sola los mensajes nuevos de chats asociados mientras el vendedor los mira, sin clic. Sigue sin enviar ni escribir nada. Se decide con datos de uso de F3.

## 11. Decisiones (propietario, 22/10/2026)

1. **Cliente SMTP:** `nodemailer`.
2. **No contactar:** se permite solo responder a un mensaje que el negocio inició (ver 7.2); no se levanta la restricción.
3. **Retención:** indefinida, igual que el resto de comunicación.
4. **Distribución:** user script para Tampermonkey, servido y actualizado desde el CRM, con control de versión mínima (ver 8.4). Reemplaza la elección previa de extensión descomprimida.
5. **Direcciones que pasa el Worker:** solo casillas de usuarios del CRM y la dirección de respuesta general (ver 6.2).

## 12. Fuera de alcance

- WhatsApp Cloud API, Coexistence o proveedores BSP.
- Guardar adjuntos y medios.
- Envío automático desde el user script.
- Extensión de navegador propia (Chrome Web Store, `.crx` con políticas de empresa).
- Bandeja de email completa (carpetas, búsqueda tipo cliente de correo).
- Cambiar el envío de primeros contactos de la API al SMTP.

## 13. Pasos del propietario

- F1: crear el Worker con Wrangler (o desde el panel), cargar secrets, asignarlo al catch-all y a las reglas específicas de direcciones de vendedores en Email Routing, y verificar que el reenvío a Gmail siga funcionando.
- F2: generar una clave SMTP de Brevo para el CRM y cargarla en Coolify.
- F0/F3: pasar el número a WhatsApp Business, vincular los 4 dispositivos e instalar Tampermonkey y el user script en cada PC con su token.
