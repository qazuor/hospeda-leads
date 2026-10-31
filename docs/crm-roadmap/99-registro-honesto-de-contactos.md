# Spec 99 — Registro honesto de contactos

Estado: **cerrada** (31/10/2026). Implementada en cinco PRs mergeados a `staging` con CI verde: #296 (bloque 1), #298 (bloque 2), #300 (bloque 3), #299 (bloque 4) y #297 (bloque 5); todavía no promovida a `main`. Aprobada por el propietario el 30/10/2026 (decisiones D1–D6 de la sección 14 resueltas con la recomendación). Origen: smoke en producción del 30/10/2026 con un usuario común sobre el negocio Cheroga (H1468). Tipo: correcciones de datos y de definición en el servidor (historial, proyección de Negocios, user script, respuestas, pendientes de resultado, tareas) y ajustes de copy y valores por defecto en la UI. Sin endpoint nuevo, sin permiso nuevo. Migración: ninguna obligatoria; una opcional de índice (`056`, sección 12). No reescribe datos de producción: lo histórico se corrige al mostrarlo y cualquier backfill queda como decisión del propietario (sección 14).

Se apoya en las reglas de `AGENTS.md` («Abrir un canal, guardar un borrador o mover una etapa NO es evidencia de contacto…») y de `docs/decisiones.md` (líneas 12, 79 y 177), y en [spec 92](92-instagram-open-chat.md) (confirmación por eco de Instagram), [spec 94](94-instagram-userscript.md) y [spec 96](96-contact-three-clicks.md) (§10.1: una respuesta registrada resuelve el resultado pendiente). La spec 100 rediseña la UI de «Requiere acción»; esta spec **solo** arregla la definición y los datos para que Hoy y la ficha coincidan, sin rediseñar.

## 1. Problema

El smoke mostró ocho lugares donde el CRM registra o muestra contacto de forma deshonesta o inconsistente:

1. El encabezado del negocio dice «Último contacto» sobre un «Mensaje preparado» o un «WhatsApp abierto · envío no confirmado».
2. Un WhatsApp enviado a las 18:20 (confirmado por el panel del user script) quedó guardado a las 18:22, la hora en que se registró, y la conversación quedó desordenada.
3. Envíos confirmados por el user script o por el eco de Instagram aparecen en «Anotá cómo salió» como «Envío confirmado manualmente».
4. «Registrar respuesta» infiere interés por defecto, no reconoce a la persona que escribió, no ofrece el mensaje enviado al que responde y no marca como obligatoria la «Aclaración» de «Otro».
5. Un email recibido sigue «Por revisar» después de haberlo respondido desde el CRM.
6. «Anotá cómo salió» muestra 7 ítems en Hoy y 3 en la solapa Comunicación, y el toast de éxito dice «No hay otro pendiente visible en este contexto» cuando quedan 3.
7. «Posponer» ofrece «Mañana · 31/10» para una tarea que vence el 2/11 (la adelanta) y calcula «En 3 días» desde hoy.
8. Tras «No agendar nada» con motivo «Ya tengo otra tarea agendada», el resumen de la gestión dice «La última acción se guardó con la decisión de terminar por ahora».

## 2. Objetivos y no objetivos

### Objetivos

1. Una sola definición de **evidencia de contacto** (sección 4), en el servidor, usada por el encabezado del negocio y la columna «Último contacto» de Negocios.
2. La hora de un envío visto por el user script es la hora del envío, no la del registro.
3. Toda etiqueta de confirmación nombra la fuente real (vendedor, user script, Instagram).
4. «Registrar respuesta» no infiere nada por defecto y usa los datos que el CRM ya tiene.
5. Un email recibido y respondido desde el CRM deja de estar «Por revisar».
6. Una sola definición de «Anotá cómo salió» y de «Envíos sin confirmar», con los mismos conteos en Hoy y en la ficha; el toast cuenta lo que realmente queda.
7. «Posponer» nunca adelanta una tarea.
8. El resumen de la gestión repite el motivo elegido en «No agendar nada».

### No objetivos

- Rediseñar «Requiere acción» o la tarjeta de Hoy (spec 100).
- Cambiar qué confirma un envío (eco de Instagram, coincidencia del user script, «Sí, lo envié»), el gating de «No contactar» o los permisos.
- Reescribir filas históricas de producción (sección 14).
- Cambiar el user script: ya manda la hora del envío (sección 3.2). Sin versión nueva del script.
- Trabajo solo de accesibilidad (diferido por el propietario).

## 3. Hallazgos

Cada hallazgo tiene: comportamiento actual (con evidencia en código, verificado en `origin/staging` el 30/10/2026), causa raíz, comportamiento propuesto, impacto en datos y tests. Las líneas citadas son de esta rama.

### 3.1 «Último contacto» del encabezado cuenta borradores y aperturas

**Actual.**
- El encabezado (`src/components/CommercialPanel.tsx:125,129`) muestra `historySummary.data.lastContact`: «Último contacto: {title} · {hora}».
- `lastContact` es el evento más reciente del filtro «Contactos» del historial (`src/helpers/businessHistoryServer.ts:57,63`), y ese filtro es `['activity','message','response','communication']` (`src/helpers/historyLabels.ts:11`). Entran tres fuentes que no prueban contacto:
  - **Journal de comunicación** (`businessHistoryServer.ts:36-43`): cualquier acción, incluidas `draft_prepared` («Mensaje preparado»), `draft_cancelled`, `whatsapp_opened_unconfirmed`, `instagram_opened_unconfirmed`, `email_submission_started`, `email_result_uncertain`, `interaction_voided`, `brevo_rejected`, cambios de restricciones y de «No contactar» (títulos en `historyLabels.ts:17-22`).
  - **Actividades** (`businessHistoryServer.ts:17-23`): toda fila de `crm_activities`. Abrir WhatsApp o Instagram **crea una actividad** con resultado «WhatsApp abierto · envío no confirmado» / «Instagram abierto · envío no confirmado» (`src/helpers/communicationService.ts:627` y `:618`, vía `activity()` en `:369-379`); marcar «No se envió» también deja la actividad con «WhatsApp marcado como no enviado» (`:572`).
  - **Mensajes sin actividad** (`businessHistoryServer.ts:25-29`): cualquier estado salvo `draft`/`cancelled`/`voided`, incluidos `whatsapp_opened`, `instagram_opened`, `manual_pending`, `manual_not_done`, `submitting`, `unknown` y `failed`.
- El mismo error está en la columna «Último contacto» de Negocios: `fecha_ultimo_contacto` es `max(crm_activities.occurred_at)` sin filtro (`src/helpers/businessTable.ts:25,47`), así que una apertura de WhatsApp o un «No se envió» la mueven. Afecta también el filtro rápido y la vista del sistema «recientes» (`src/helpers/businessSystemViews.ts:26`), y la regla de prioridad `stale_contact` (`src/helpers/priorityRules.ts:13`).

**Causa raíz.** «Último contacto» se calcula como «último evento del filtro Contactos del historial» y como «última actividad», no como «última evidencia de contacto». El CRM ya tiene una definición honesta en un solo lugar, Primeros pasos (`src/endpoints/work.ts:138`, decisión del 21/10 en `docs/decisiones.md:79`), pero no se reutiliza.

**Propuesto.**
- Nuevo helper de servidor `src/helpers/contactEvidence.ts` con la definición de la sección 4: constantes TS (`CONTACT_EVIDENCE_STATUSES`) y fragmentos SQL (`contactEvidenceEventsSql(accountIds)` para el encabezado y `lastContactByAccountSql()` agregado por negocio para la proyección).
- `businessHistory` calcula `lastContact` con `contactEvidenceEventsSql` en vez de `historyFilterKinds.contact`. El historial («Qué pasó») **no cambia**: sigue mostrando borradores, aperturas y journal, porque es un registro de lo que pasó, no de contactos.
- `businessTable.ts` reemplaza el join `la` por `lastContactByAccountSql()`. Sigue siendo un agregado por conjunto (sin subconsultas correlacionadas, como pide el comentario de `businessTable.ts:36-40`).
- El encabezado conserva su formato; el título sale de la fila de evidencia (p. ej. «WhatsApp a Ana», «Respuesta recibida», «Llamada»). Sin evidencia: «Sin contactos registrados».
- `work.ts:138` (Primeros pasos) pasa a usar las mismas constantes, sin cambiar su resultado salvo lo que decida el propietario en la pregunta 1.
- Fuera de alcance, mencionado para que no se pierda: `leads_GET.ts:255,258` («contactado» e `inactiveDays`) y `analytics_GET.ts:76,89` también cuentan cualquier actividad. Recomendación: misma corrección en una spec aparte, porque cambia métricas.

**Datos.** Sin migración. Es un cálculo de lectura: lo histórico queda bien solo. Índice opcional `056` en `crm_messages(activity_id)` si el `EXPLAIN` de la proyección empeora (sección 12).

**Tests.**
- Unit `src/helpers/contactEvidence.spec.ts`: la tabla de la sección 4 (cada estado y cada tipo de evento, adentro o afuera), y que las constantes coinciden con las que usa Primeros pasos.
- Unit `src/helpers/businessTable.test.ts`: la expresión de `fecha_ultimo_contacto` ya no es `max(occurred_at)` sin filtro.
- Integración `scripts/test-business-history.ts`: en un negocio con borrador preparado → `lastContact` nulo; abrir WhatsApp → sigue nulo; «Sí, lo envié» → `lastContact` es el envío; luego un borrador nuevo → `lastContact` no cambia; respuesta registrada → `lastContact` es la respuesta; actividad manual con resultado `no_answer` → según pregunta 1.
- Integración `scripts/test-commercial.ts` (o el suite que cubra la lista de Negocios): la columna «Último contacto» no se mueve con `whatsapp_opened` ni con «No se envió».

### 3.2 Un WhatsApp visto por el user script se guarda con la hora de registro

**Actual.**
- El user script **sí manda la hora real**: `parsePrePlainText` lee `data-pre-plain-text` («[18:20, 30/10/2026] Nombre:») y produce `sentAt` en ISO (`userscript/src/selectors.ts:85-94`, usado en `:144-145`). El endpoint lo acepta (`src/endpoints/userscript.ts:35`, `sentAt: z.string().datetime().nullable()`) y `registerOne` lo valida (`src/helpers/userscriptRegister.ts:75-77`).
- El servidor lo usa solo para **elegir** el intento (`matchingPending`, `userscriptRegister.ts:46-55`) y para `created_at` cuando no hay intento (`registerUserscriptSent`, `communicationService.ts:418`). Las tres rutas de escritura guardan la hora del registro:
  - `completeUserscriptOpened` (intento `whatsapp_opened`): `last_interaction_at=now()` (`communicationService.ts:407`); no recibe `sentAt` (llamada en `userscriptRegister.ts:62`).
  - `completeUserscriptManual` (intento `manual_pending`): `last_interaction_at=now()`, `completed_at=now()` (`:384`); tampoco recibe `sentAt` (`userscriptRegister.ts:67`).
  - `registerUserscriptSent` (sin intento): `created_at=sentAt` pero `last_interaction_at=now()` (`:418`).
  - La actividad: `activity()` inserta `occurredAt:new Date()` (`:376`); si la actividad ya existía porque la apertura la creó, solo actualiza `result` y conserva la hora de la **apertura** (`:375`).
- La conversación ordena por `lastInteractionAt ?? createdAt` (`src/helpers/communicationTimeline.ts:119`) y el historial por `coalesce(last_interaction_at, created_at)` (`businessHistoryServer.ts:25`). Resultado: el envío de las 18:20 aparece a las 18:22, después de mensajes que en el chat vinieron antes.
- Precedente correcto: el eco de Instagram guarda la hora del eco en `last_interaction_at` y en `occurred_at` de la actividad (`src/helpers/instagramEcho.ts:73,75`).

**Causa raíz.** `sentAt` no se propaga a las funciones que completan un intento, y `registerUserscriptSent` mezcla `created_at=sentAt` con `last_interaction_at=now()`.

**Propuesto.**
- `completeUserscriptOpened`, `completeUserscriptManual` y `registerUserscriptSent` reciben `sentAt: Date` (RO-RO, como `registerUserscriptSent` ya hace) y guardan `last_interaction_at = sentAt efectivo`.
- `sentAt efectivo` = `min(sentAt, now())` y, para un intento, `max(sentAt, created_at del intento)`: un envío no puede ser anterior a su borrador (la ventana de `matchingPending` admite 10 minutos de desfase de reloj, `userscriptRegister.ts:18,52`). Si el script no manda hora (solo posible en registro manual, no automático: `:75-76`), sigue `now()`.
- `completed_at` y `updated_at` siguen siendo `now()`: dicen cuándo se registró en el CRM (auditoría). El journal `contact_completed` / `contact_resolved` agrega `after.sentAt` para dejar constancia.
- `activity()` acepta un `occurredAt` opcional. Al crear la actividad usa `sentAt efectivo`; si ya existía (creada por la apertura) y no tiene resultado (`outcome IS NULL`), actualiza `occurred_at` además de `result`. Una actividad con resultado anotado no se toca.
- Sin cambios en el user script (ya manda la hora) ni en `matchingPending`.

**Riesgos conocidos.** La hora de WhatsApp tiene precisión de minuto y se interpreta con la zona horaria de la computadora del vendedor (`new Date(año, mes, día, hora, min)` en `selectors.ts:92`). Una computadora fuera de la hora de Argentina corre el envío; el tope `max(…, created_at)` y `min(…, now())` acota el daño. Dos mensajes del mismo minuto empatan; el orden secundario por `key` de la conversación (`communicationTimeline.ts:148`) se mantiene.

**Datos.** Sin migración. Lo histórico no se puede recuperar: la hora real del envío no quedó guardada en ningún lado (ni en `crm_auto_registrations` ni en el id de WhatsApp). Las filas viejas quedan con la hora de registro; no se propone backfill.

**Tests.**
- Integración `scripts/test-userscript.ts`: para cada ruta (`whatsapp_opened`, `manual_pending`, sin intento) con `sentAt` = hace 2 minutos → `last_interaction_at` igual a `sentAt`, `completed_at` ≈ ahora, `occurred_at` de la actividad igual a `sentAt`; `sentAt` 5 minutos antes del borrador → se guarda la hora del borrador; `sentAt` en el futuro dentro de los 10 minutos → se guarda ahora; una actividad que ya tenía resultado no cambia de hora; el pendiente de «Anotá cómo salió» del envío se resuelve con una actividad creada entre `sentAt` y el registro.
- Unit `src/helpers/communicationTimeline.spec.ts`: un enviado con `lastInteractionAt` anterior a un recibido queda antes en la conversación (ya cubierto por el orden; agregar el caso de regresión con las horas del smoke).

### 3.3 Las etiquetas de confirmación no dicen la fuente real

**Actual.**
- `messageLabels.manual_sent` es «Envío confirmado manualmente» (`src/helpers/messageLabels.ts:1`).
- «Anotá cómo salió» (`src/components/PendingOutcomes.tsx:18`) muestra `messageLabels[item.status]`: todo `manual_sent` dice «manualmente», lo haya confirmado el vendedor, el user script o el eco de Instagram. `PendingContactOutcome` no trae los datos para distinguir (`communicationService.ts:455`, select en `:465`: sin `external_id`, `destination_detail` ni `owner_email`).
- La burbuja de la conversación usa `sentStatusLabel` (`communicationTimeline.ts:47`), que distingue el eco de Instagram (`ECHO_STATUS`) y el intento confirmado por Instagram («Enviado · confirmado por Instagram», `:38`), pero **no** el user script: un WhatsApp confirmado por el script también dice «Envío confirmado manualmente» (solo agrega «Registrado automáticamente» si fue registro automático, `ConversationItem.tsx:176`).
- En el servidor, las tres rutas del user script guardan «Envío confirmado manualmente» como resultado de la actividad y de la tarea (`communicationService.ts:385-386`, `:408-409`, `:420`). El eco de Instagram ya usa su propio texto, `ECHO_CONFIRMED_RESULT` = «Envío confirmado por Instagram» (`instagramEcho.ts:22`).

**Causa raíz.** La etiqueta sale solo del `status`, y `manual_sent` cubre tres fuentes. El dato que distingue la fuente ya existe: en WhatsApp solo el user script escribe `external_id` (`communicationService.ts:384,400,407,418`); en Instagram, el `mid` del eco (`instagramEcho.ts:61,73`) y el dueño `INSTAGRAM_ECHO_OWNER` para ecos sueltos.

**Propuesto.**
- Un único helper puro `sendConfirmationLabel(message)` en `communicationTimeline.ts` (reemplaza a `sentStatusLabel` y lo usan la burbuja, «Anotá cómo salió», la Bandeja `InboxDetail.tsx:82` y el aviso de contacto reciente si muestran un `manual_sent`):

  | Caso | Etiqueta |
  | --- | --- |
  | Eco suelto de Instagram (`owner_email = INSTAGRAM_ECHO_OWNER`) | `ECHO_STATUS` (sin cambios) |
  | Intento de Instagram con `external_id` | «Enviado · confirmado por Instagram» (sin cambios) |
  | WhatsApp `manual_sent` con `external_id` | **«Enviado · confirmado por el script de WhatsApp»** (nuevo) |
  | `manual_sent` sin `external_id` (cualquier canal salvo llamada) | «Envío confirmado manualmente» |
  | Llamada | `callResultLabel` (sin cambios) |
  | Otros estados | `messageLabels[status]` (sin cambios) |

- `PendingContactOutcome` suma `externalId`, `destinationDetail` y `ownerEmail`; `PendingOutcomes.tsx` usa el helper.
- Servidor: constante `USERSCRIPT_CONFIRMED_RESULT` = «Envío confirmado por el script de WhatsApp» para actividad y tarea en las tres rutas del user script.
- Historial: `present()` en `businessHistoryServer.ts:10` deriva la etiqueta del mensaje vinculado cuando la actividad tiene un mensaje con `external_id`, así las actividades viejas con «Envío confirmado manualmente» se muestran bien sin tocar la fila.

**Datos.** Sin migración. La burbuja y «Anotá cómo salió» se corrigen solos para filas históricas (la etiqueta se deriva). Los textos guardados en `crm_activities.result` y `crm_tasks.result` de envíos viejos del script siguen diciendo «manualmente»; se corrigen al mostrar donde hay mensaje vinculado. Reescribirlos sería un backfill de producción: pregunta 6.

**Tests.**
- Unit `src/helpers/communicationTimeline.spec.ts`: la tabla de arriba, fila por fila.
- Unit `src/components/PendingOutcomes.spec.tsx` (nuevo): un pendiente de WhatsApp con `externalId`, uno de Instagram con `externalId` y uno sin → las tres etiquetas.
- Integración `scripts/test-userscript.ts`: el resultado de la actividad y de la tarea es `USERSCRIPT_CONFIRMED_RESULT` en las tres rutas. `scripts/test-instagram-open-chat.ts`: el pendiente de un intento confirmado por eco trae `externalId`.

### 3.4 «Registrar respuesta» infiere y no usa lo que sabe

**Actual** (`src/components/ResponseRecordDialog.tsx`).
- **Resultado por defecto «Respondió, le interesa».** `responseCategory` arranca en `'interested'` (`:38`) y se resetea a `'interested'` en cada apertura (`:47`). La etiqueta sale de `contactOutcomes.interested` (`ResponseCorrectionForm.tsx:16`). Por spec 96 §10.1, guardar la respuesta además **resuelve automáticamente** el «Anotá cómo salió» del envío con ese resultado: un vendedor apurado deja registrado interés que nadie expresó.
- **«¿De quién vino?» siempre «El negocio (no sé quién)».** Con mensaje recibido, la apertura fija `setResponseContact('')` (`:49`). El cliente ni siquiera recibe la persona: el `SELECT` de recibidos de Comunicación no trae `contact_id` (`src/endpoints/communication.ts:61`) y el tipo `InboundMessage` no lo tiene (`communication.schema.ts:66`). Un email entrante sí puede venir con persona (`inboundEmail.ts:11-13,21`); un WhatsApp del user script nunca (`userscriptRegister.ts:33`, sin `contact_id` ni comparación de teléfono contra personas).
- **«¿Responde a un mensaje que mandaste?» no lista el envío.** El filtro exige `String(msg.contactId??'')===responseContact` (`:68`): con «El negocio» elegido solo aparecen mensajes **sin** persona, así que un WhatsApp o email enviado a una persona del negocio no aparece. Además lista estados que no son envíos (`whatsapp_opened`, `manual_not_done`, `failed`…), porque solo excluye `draft`/`cancelled`/`voided`.
- **Con mensaje recibido, esos dos campos no se guardan.** `inbound_register` solo manda categoría, resumen y aclaración (`:60`; esquema en `communication.schema.ts:24`); el servidor toma `contact_id` y `linked_message_id` de la fila recibida (`communicationService.ts:504`). Lo que el vendedor elige en pantalla se descarta en silencio.
- **«Aclaración» no dice que es obligatoria.** La etiqueta es «Aclaración (contame)» (`:72`), pero guardar está deshabilitado sin ella (`:81`), con un motivo genérico («Completá el nombre, el resumen y las confirmaciones…»). «Resumen» sí dice «(obligatorio)» (`:73`).

**Causa raíz.** Valores por defecto pensados para ahorrar clics que terminan infiriendo; el cliente no recibe `contact_id` del recibido; el filtro de mensajes ata la lista a la persona elegida; `inbound_register` no acepta correcciones.

**Propuesto.**
- **Resultado:** arranca vacío, con una opción deshabilitada «Elegí qué respondió». Guardar queda deshabilitado hasta elegir, con motivo «Elegí qué respondió.». El esquema del servidor no cambia (la categoría sigue obligatoria).
- **De quién vino:**
  - `communication.ts:61` suma `i.contact_id`; `InboundMessage` suma `contactId`.
  - La apertura preselecciona `inbound.contactId` si existe y la persona no está borrada.
  - Si no hay `contact_id`, el cliente busca una sola persona activa del negocio cuyo teléfono (WhatsApp) o email (email) coincida con `fromAddress`, con la regla de identidad de teléfonos `samePhone` (ver abajo; no el predicado de búsqueda `phoneSearchSql`), y el email sin distinguir mayúsculas. Si coinciden cero o más de una, queda «El negocio (no sé quién)». Nunca se adivina entre varias.
  - Servidor: al guardar un WhatsApp entrante del user script, `registerInbound` intenta la misma coincidencia única por teléfono y guarda `contact_id`. Si no hay coincidencia única, queda nulo (como hoy).
  - Identidad, no búsqueda: dos teléfonos son la misma línea si sus dígitos son iguales, o si ambos tienen al menos 10 dígitos y coinciden los últimos 10 (cubre los prefijos +54, 9 y 0; 341-4123456 y 351-4123456 son distintos). Helper puro compartido `samePhone` (`src/helpers/phoneIdentity.ts`), usado por el servidor y por el cliente.
- **Responde a:** la lista muestra los envíos reales del negocio (mensajes con estado de evidencia de la sección 4: `manual_sent`, `accepted`, `delivery_confirmed`, `replied`, `rejected`) en la gestión elegida, **sin** filtrar por persona; cada opción dice canal, destinatario y fecha y hora. Si hay una persona elegida, sus envíos van primero. Con mensaje recibido se preselecciona `linkedMessageId` (ya lo hace) y, si no hay, el envío más reciente del mismo canal a esa dirección, solo si es único en las últimas 72 h (`recentContactHours`). Elegir un envío ya no pisa la persona elegida a mano.
- **`inbound_register` acepta `leadId`, `contactId` y `linkedMessageId` opcionales.** Un campo **omitido** (`undefined`) usa el valor de la fila recibida (clientes viejos, comportamiento anterior); un **`null` explícito** lo limpia: respuesta del negocio («El negocio»), «No, es una respuesta nueva» o «Ninguna (todo el negocio)». El cliente manda siempre exactamente lo que muestra la pantalla (`null` cuando muestra esas opciones). El servidor valida que la gestión sea del negocio y no esté borrada (con la misma regla de acceso que `response_create`), que la persona sea del negocio y no esté borrada, y que el mensaje sea del negocio, un envío real y, con gestión elegida, de esa gestión (sin gestión, cualquier envío del negocio, como lista «Responde a»). Así, un recibido con `contact_id`=Ana y `linked_message_id`=M registrado como «El negocio» + «No, es una respuesta nueva» no guarda ni Ana ni M, y no resuelve el «Anotá cómo salió» de M por el vínculo de la fila (la atribución por gestión de la spec 96 §10.1 sigue aplicando). Una persona guardada en la fila que después se borró se muestra como «El negocio» y se manda `null`. Al cambiar «¿Sobre qué gestión?» se limpia el envío elegido si deja de estar en la lista. Lo que se ve en pantalla es lo que se guarda.
- **Aclaración:** etiqueta «Aclaración (obligatorio)», `required`, y motivo de deshabilitado específico «Contá la aclaración de «Otro».». El motivo genérico se reemplaza por el primer faltante concreto (resultado, nombre, resumen, aclaración, confirmación de No contactar, fecha del recordatorio).

**Datos.** Sin migración (`crm_inbound_messages.contact_id` ya existe: `inboundEmail.ts:21`). Los recibidos viejos sin persona siguen sin persona; la coincidencia del cliente los cubre al registrar.

**Tests.**
- Unit `src/components/ResponseRecordDialog.spec.tsx`: abre sin resultado y no deja guardar; con `inbound.contactId` preselecciona la persona; sin él y con un teléfono que coincide con una sola persona la preselecciona, con dos no; la lista de «Responde a» incluye un WhatsApp enviado a una persona con «El negocio» elegido y excluye `whatsapp_opened`/`manual_not_done`; «Otro» muestra «(obligatorio)» y el motivo específico; `inbound_register` manda `contactId` y `linkedMessageId`.
- Integración `scripts/test-communication.ts`: `inbound_register` con persona de otro negocio o borrada, mensaje `whatsapp_opened` u otro negocio, gestión de otro negocio o en la papelera, o envío de otra gestión que la elegida → error; con valores válidos → la respuesta guarda los elegidos (incluida la gestión); campos omitidos → usa los de la fila; `null` explícitos → no guarda persona, envío ni gestión y no resuelve el envío de la fila; persona borrada en la fila → con `null` se guarda sin persona.
- Integración `scripts/test-userscript.ts`: un WhatsApp entrante cuyo teléfono coincide con una sola persona guarda `contact_id`; con dos personas, nulo.

### 3.5 Un email respondido desde el CRM sigue «Por revisar»

**Actual.**
- Responder un recibido (`inbound_reply` → `sendInboundReply`, `src/helpers/emailReply.ts:14-60`) crea el mensaje, el outbox con `inbound_message_id` (`:48`) y, si Brevo acepta, una actividad «Respuesta al email entrante …» (`:58`). **No toca** `crm_inbound_messages.status`, que sigue en `pending_review` (permite responder en `pending_review` o `registered`, `:24`).
- «Por revisar» y los contadores miran solo `status='pending_review'`: etiqueta de la burbuja (`communicationTimeline.ts:133`), «Requiere acción» (`:184`), pendientes de la Bandeja (`src/helpers/inboxQueries.ts:93`) y el contador de Hoy (`src/endpoints/inbound.ts:18`).

**Causa raíz.** La respuesta desde el CRM no se considera al calcular si un recibido espera revisión.

**Propuesto** (recomendación de la pregunta 4, sin migración).
- Un recibido está **«Por revisar»** si `status='pending_review'` **y** no tiene una respuesta del CRM con evidencia de envío: no existe `crm_messages m JOIN email_outbox o ON o.id=m.outbox_id` con `o.inbound_message_id=i.id` y `m.status IN ('accepted','delivery_confirmed','replied')`. Un envío `submitting`, `unknown` o `failed` no cuenta: el recibido sigue «Por revisar».
- Helper SQL compartido `inboundAwaitingReviewSql(alias)` en `src/helpers/inboundReview.ts`, usado por Comunicación (que suma el campo `repliedAt` al recibido), la Bandeja (`inboxQueries.ts:93`) y Hoy (`inbound.ts:18`). En el cliente, `requiresAction` y las etiquetas usan `repliedAt` en vez de mirar solo el estado.
- La burbuja de un recibido respondido muestra «Respondido desde el CRM» en lugar de «Por revisar». «Registrar respuesta» sigue disponible para clasificarlo (opcional): responder no es clasificar, y no se infiere categoría ni resultado.
- `status` no cambia: `registered` sigue significando «se registró una respuesta clasificada».

**Datos.** Sin migración. Los recibidos históricos ya respondidos dejan de estar «Por revisar» al desplegar, porque el cálculo es de lectura; no hay escritura en producción.

**Tests.**
- Unit `src/helpers/communicationTimeline.spec.ts`: un recibido `pending_review` con `repliedAt` no entra en `requiresAction` y lleva la etiqueta «Respondido desde el CRM».
- Integración `scripts/test-inbound-email-reply.ts`: responder con SMTP aceptado → el recibido sale de «Por revisar» en Comunicación, Bandeja y Hoy; con resultado incierto o rechazado → sigue; registrar la respuesta después sigue funcionando. `scripts/test-inbox.ts`: el contador de pendientes no cuenta el respondido.

### 3.6 «Anotá cómo salió»: dos conteos y un toast que no cuenta

**Actual.**
- Las dos vistas llaman a la misma función, `pendingContactOutcomes` (`communicationService.ts:464-477`): Hoy sin filtro de negocio (`src/endpoints/work.ts:131`, solo en modo `day`, máximo 20), Comunicación con el negocio y, si hay, la gestión (`src/endpoints/communication.ts:67`).
- La lista incluye **envíos sin confirmar** (`whatsapp_opened`, `instagram_opened` pasados los 15 minutos de espera del eco, y `manual_pending`: `OUTCOME_READY_STATUSES` en `src/helpers/contactOutcome.ts:8`).
- Hoy los muestra todos en la tarjeta «Anotá cómo salió» (`src/components/TodayList.tsx:41`), los sin confirmar con «Envío sin confirmar» (`PendingOutcomes.tsx:18`), y el mosaico cuenta todos (`src/pages/my-day.tsx:56`).
- Comunicación **saca** de esa tarjeta las aperturas que ya muestra como «¿Lo enviaste?» (`src/components/communication/RequiresAction.tsx:90-92,100`) y las lista como entradas de confirmación, que salen de otro cálculo en el cliente (`requiresAction`, `communicationTimeline.ts:183-186`: aperturas de los mensajes cargados, propias o de cualquiera si es admin; ese cálculo no aplica la ventana de `crm_contact_outcome_since` ni las exclusiones por «No contactar» o gestión cerrada del servidor).
- Con los datos del smoke, la explicación consistente con el código es: 7 en Hoy = 3 confirmados sin resultado + 4 aperturas sin confirmar; Comunicación muestra las 4 aperturas arriba como «¿Lo enviaste?» y 3 en «Anotá cómo salió». **No verificado contra los datos de producción** (no hay acceso); si los 7 incluían otros negocios, Hoy además mezcla negocios porque no filtra.
- **Toast.** Después de guardar desde el editor de trabajo, «Próximo pendiente» se calcula solo con **tareas** del mismo negocio y exactamente la misma gestión (`src/components/WorkEditor.tsx:124`, `pendingWork(...filter(t=>t.accountId===accountId&&t.leadId===(leadId||null)))`), con un `getWork` en modo `detail`, que no trae `pendingOutcomes` (`work.ts:131`). Si no quedan tareas, dice «No hay otro pendiente visible en este contexto.» aunque queden contactos por anotar.

**Causa raíz.** «Anotá cómo salió» mezcla dos cosas (contacto confirmado sin resultado y envío sin confirmar) y cada vista las separa distinto; el toast ignora los contactos pendientes.

**Propuesto** (recomendación de la pregunta 3).
- **Una sola definición, en el servidor.** `pendingContactOutcomes` pasa a `pendingContactFollowUps` y devuelve dos listas con los mismos filtros de dueño, permisos, ventana y exclusiones que hoy:
  - `unconfirmed` — «Envíos sin confirmar»: `whatsapp_opened`, `instagram_opened` (pasada la espera del eco) y `manual_pending`. Se resuelven con «Sí, se envió / No se envió» (o el resultado del intento manual).
  - `outcomes` — «Anotá cómo salió»: contactos con evidencia (`manual_sent`, `manual_no_contact`, `accepted`, `delivery_confirmed`, `replied`, `rejected`) sin resultado anotado.
  - Mismo `ORDER BY` y límite por lista; el conteo total de cada lista viene aparte (`count`) para no depender del límite.
- **Hoy** (`work.ts` modo `day`) y **Comunicación** (`communication.ts:67`) devuelven el mismo objeto; Comunicación filtrado por negocio (y gestión si corresponde).
- **Vistas, sin rediseño:**
  - Comunicación: las entradas «¿Lo enviaste?» salen de `unconfirmed` del servidor (buscando el `Message` completo en `data.messages` para texto y material; si no está cargado, una entrada mínima con destinatario y hora). El registro de material de aperturas ajenas (`UnconfirmedMaterialEntry`) sigue saliendo del cliente porque no es una acción pendiente. «Anotá cómo salió» muestra `outcomes`.
  - Hoy: la tarjeta «Anotá cómo salió» muestra solo `outcomes`; debajo, en la misma tarjeta, un bloque «Envíos sin confirmar · N» con `unconfirmed` y el mismo botón que hoy (abre `OutcomeAfterContact`, que ya pregunta «¿Lo enviaste?»). El mosaico muestra los dos números. La forma final la define la spec 100.
  - Con el mismo usuario y el mismo negocio, los números de Hoy (filtrando ese negocio) y de la ficha son iguales por construcción.
- **Toast** (`WorkEditor.tsx:124`): `getWork` en modo `detail` con `accountId` también devuelve `followUps` (las dos listas de ese negocio). El toast cuenta tareas y contactos pendientes del negocio:
  - Con tareas: como hoy («Próximo pendiente: …»).
  - Sin tareas y con contactos: «Quedan N contactos por anotar en este negocio.» con acción «Ver en Comunicación» (`/accounts/{id}?section=communication`).
  - Solo sin nada de lo anterior: «No hay otro pendiente en este negocio.» (sin «visible»).
  - El filtro de tareas deja de exigir la misma gestión exacta: cuenta las de la gestión y las generales del negocio, como `pendingWork(tasks, leadId, true)`.

**Datos.** Sin migración. Solo lectura.

**Tests.**
- Unit `src/helpers/contactOutcome.spec.ts`: la partición de estados entre `unconfirmed` y `outcomes` cubre `OUTCOME_READY_STATUSES` sin solaparse.
- Unit `src/components/communication/RequiresAction.spec.tsx` (nuevo) o `CommunicationPanel.review.spec.tsx`: con `followUps` de 4 sin confirmar y 3 contactos → 4 entradas «¿Lo enviaste?» y «Anotá cómo salió · 3».
- Unit `src/components/WorkEditor` (spec nuevo o el existente que cubra el toast): sin tareas y con 3 contactos → «Quedan 3 contactos por anotar…»; sin nada → «No hay otro pendiente en este negocio.».
- Integración `scripts/test-work.ts`: mismo usuario y mismos datos → Hoy filtrado por el negocio y Comunicación devuelven las mismas listas y conteos; `detail` con `accountId` devuelve `followUps`. `scripts/test-communication.ts`: los casos actuales de `pendingContactOutcomes` migrados a la nueva forma.

### 3.7 «Posponer» puede adelantar una tarea

**Actual.**
- `postponeOptions` (`src/components/TaskPostponeMenu.tsx:15-19`) usa `shortcutDates(now)` (`src/helpers/workDates.ts:33-37`): mañana, hoy + 3 y el próximo lunes, todo **desde hoy**. Solo descarta el día igual al vencimiento. Para una tarea que vence el 2/11, el 30/10 ofrece «Mañana · 31/10» (la adelanta) y «En 3 días · 2/11» se descarta por igual; en otros días ofrece «En 3 días» anterior al vencimiento.
- «Elegir fecha…» permite cualquier día desde hoy (`:48,56`), también anterior al vencimiento, y la descripción dice «hoy vence el {fecha}» aunque venza otro día (`:55`).
- El servidor (`task_reschedule`, `src/endpoints/work.ts:258-267`) solo verifica concurrencia y coherencia fecha/hora; no la dirección. «Deshacer» usa la misma acción para volver a la fecha original (`TaskPostponeMenu.tsx:44`).

**Causa raíz.** La base de cálculo es hoy, no el vencimiento, y no hay regla «nunca antes».

**Propuesto** (recomendación de la pregunta 2).
- Base = `max(vencimiento, hoy)` en días de Argentina. Tarea vencida o de hoy: base hoy. Tarea futura: base su vencimiento.
- Opciones, todas posteriores a la base:
  - base hoy: «Mañana · {base+1}», «En 3 días · {base+3}», «Lunes · {próximo lunes}» (como hoy);
  - base futura: «Un día más · {base+1}», «3 días más · {base+3}», «Lunes siguiente · {primer lunes posterior a la base}».
  - Se mantienen la deduplicación y el descarte del día actual de la tarea.
- «Elegir fecha…»: `min` = base + 1 si la tarea es futura, hoy si está vencida o es de hoy (posponer una tarea de hoy a hoy no tiene sentido: el motivo actual «Esa ya es la fecha de la tarea.» lo cubre). La descripción dice «vence el {fecha}» («hoy vence» solo si es hoy; «venció el» si está vencida).
- Mover una tarea a una fecha anterior sigue siendo posible desde «Cambiar fecha o datos» del editor: posponer no es reprogramar.
- Servidor: `task_reschedule` suma un campo opcional `kind:'postpone'|'undo'`. Con `postpone` rechaza `dueDate` anterior a `max(fecha actual de la tarea, hoy)` («Posponer no puede adelantar la tarea.»). `undo` (y llamadas sin `kind`, por compatibilidad) mantienen la regla actual, porque «Deshacer» vuelve a una fecha anterior a propósito.

**Datos.** Sin migración.

**Tests.**
- Unit `src/components/TaskPostponeMenu.spec.tsx`: tarea que vence el 2/11 el 30/10 → «Un día más · 3/11», «3 días más · 5/11», «Lunes siguiente · 9/11»; tarea vencida → base hoy; ninguna opción anterior a la base (propiedad sobre varias fechas); `min` del selector; copy «vence / hoy vence / venció».
- Unit `src/helpers/workDates.spec.ts`: helper nuevo `postponeBase` y `shortcutDates` con base explícita.
- Integración `scripts/test-work.ts`: `task_reschedule` con `kind:'postpone'` y fecha anterior → error; `undo` a la fecha original → ok.

### 3.8 El resumen de la gestión ignora el motivo de «No agendar nada»

**Actual.**
- Guardar con «No agendar nada» exige un motivo (`work.ts:225-226`; presets en `src/content/vocabulary.ts:30`: «Ya tengo otra tarea agendada», «La gestión ya está cerrada», «El negocio no quiere seguir por ahora», «Otro (contame)») y lo guarda en `continuation_reason` (`work.ts:246-249,289-295`).
- El resumen («Próximo paso», `src/components/NextWork.tsx:33`) llama a `nextStep` con `finished` = la última actividad visible tiene `continuation==='done'`, sin pasar el motivo. `nextStep` devuelve un texto fijo: «Por ahora no hay otro paso» / «La última acción se guardó con la decisión de terminar por ahora…» (`src/helpers/nextStep.ts:12`).
- Con «Ya tengo otra tarea agendada», si esa tarea es del negocio en general o de otra gestión, `pendingWork(tasks, leadId, classification==='won')` no la ve (`nextStep.ts:10`, `NextWork.tsx:33`) y aparece el texto de «terminar», que contradice lo que eligió el vendedor.
- El historial repite el problema: «Se decidió terminar por ahora» para todo `done` (`src/components/BusinessHistory.tsx:16,43`), y el `SELECT` de actividades del historial no trae `continuation_reason` (`businessHistoryServer.ts:17`).

**Causa raíz.** El copy de `done` es único y no recibe el motivo; la búsqueda de la tarea mencionada se limita a la gestión.

**Propuesto.**
- `nextStep` recibe `finishedReason` (el `continuationReason` de esa actividad) y elige el texto:

  | Motivo | Título | Ayuda |
  | --- | --- | --- |
  | «Ya tengo otra tarea agendada» con una tarea pendiente visible del negocio (otra gestión o general) | «Tu próximo paso está en otra tarea» | «Elegiste no agendar nada porque ya tenías otra tarea: {título} · {fecha}.» con enlace a la tarea |
  | «Ya tengo otra tarea agendada» sin tarea visible | «No encontramos la otra tarea» | «Elegiste no agendar nada porque ya tenías otra tarea, pero no vemos una pendiente en este negocio. Puede estar a nombre de otra persona. Revisá o agendá una.» |
  | «La gestión ya está cerrada» | «Gestión cerrada» | «Elegiste no agendar nada porque la gestión ya está cerrada.» |
  | «El negocio no quiere seguir por ahora» | «Sin próximo paso por ahora» | «Elegiste no agendar nada: el negocio no quiere seguir por ahora.» |
  | Otro texto | «Sin próximo paso por ahora» | «Elegiste no agendar nada: «{motivo}».» |
  | Sin motivo (filas viejas) | texto actual | texto actual |

- Para la búsqueda de la otra tarea, `NextWork` usa las tareas pendientes visibles del negocio (`work.data.tasks` ya trae el negocio cuando no hay `leadId`; con `leadId`, una consulta `getWork` de detalle por `accountId`, o ampliar la consulta existente a todo el negocio y filtrar en el cliente).
- Historial: el `SELECT` de actividades suma `a.continuation_reason`, y `BusinessHistory` muestra «No se agendó nada · {motivo}» para `done`.

**Datos.** Sin migración. Las filas viejas ya tienen `continuation_reason` (columna de la migración 027); las que no lo tengan muestran el texto actual.

**Tests.**
- Unit `src/helpers/nextStep.spec.ts`: cada fila de la tabla.
- Unit de `NextWork`/`BusinessHistory` (spec nuevo o existente): con motivo «Ya tengo otra tarea agendada» y una tarea general → muestra la tarea; sin tarea → «No encontramos la otra tarea».
- Integración `scripts/test-business-history.ts`: el evento de actividad trae `continuationReason`.

## 4. Definición compartida: evidencia de contacto

Usada por el encabezado del negocio (3.1), la columna «Último contacto» de Negocios (3.1) y Primeros pasos (`work.ts:138`). Parte de la decisión del 21/10 (`docs/decisiones.md:79`) y la extiende con lo que el cliente nos manda.

| Evento | ¿Cuenta? | Fecha que se usa |
| --- | --- | --- |
| Mensaje `manual_sent` (WhatsApp, Instagram, email manual, red social, otro) | Sí | `last_interaction_at` (3.2); fuente desde journal, no `external_id` solo |
| Llamada `manual_sent` («Llamada realizada») | Sí | `last_interaction_at` |
| Email `accepted` o `delivery_confirmed` | Sí (precedente de Primeros pasos; ver pregunta 1) | `last_interaction_at`, o la hora de aceptación del outbox |
| Mensaje `replied` o `rejected` (respuesta o rechazo registrado sobre el envío) | Sí | `last_interaction_at` |
| Respuesta registrada (`crm_communication_responses`) | Sí | `occurred_at` |
| Mensaje recibido no anulado ni descartado (`pending_review`, `registered`) y no automático | Sí (ver pregunta 1) | `received_at` |
| Actividad con `outcome` distinto de `no_answer` y sin mensaje vinculado (`interested`, `later`, `replied`, `not_interested`, `do_not_contact`, `other`, `delivered`, `needs_help`, `awaiting_confirmation`, `care_completed`) | Sí | `occurred_at` |
| Actividad vinculada a un mensaje | Solo si el mensaje es evidencia, cualquiera sea el resultado | `occurred_at` |
| Actividad histórica con `outcome IS NULL` y sin mensaje vinculado (contacto manual) | Sí | `occurred_at` |
| Actividad histórica con `outcome IS NULL` y mensaje vinculado | Solo si el mensaje es evidencia | `occurred_at` |
| `manual_no_contact` («No atendió») o actividad con resultado `no_answer` | **No** (intento, no contacto; ver pregunta 1) | — |
| `draft`, `cancelled`, `voided`, `whatsapp_opened`, `instagram_opened`, `manual_pending`, `manual_not_done`, `submitting`, `unknown`, `failed` | **No** | — |
| Cualquier fila del journal de comunicación (borrador preparado o descartado, apertura, envío en curso, incierto, restricciones, No contactar…) | **No** (el journal es auditoría; inbound usa la fecha del mensaje) | — |
| Aperturas o clicks de email (spec 93) | **No** (ya decidido, `docs/decisiones.md:356`) | — |
| Cambio de etapa, cambio de datos | **No** | — |

Reglas de alcance: igual que hoy, se ignoran negocios fusionados y gestiones borradas (filtros de `businessHistoryServer.ts:22-23,28,34`).

## 5. Reglas que no cambian

- Abrir un canal, preparar un borrador o mover una etapa no prueba contacto, respuesta, aceptación, pago ni entrega.
- Lo que confirma un envío: «Sí, lo envié», el user script (mensaje visto en el chat + coincidencia con el borrador, `docs/decisiones.md:177`) y el eco de Instagram (spec 92). Esta spec solo corrige cómo se etiqueta y con qué hora se guarda.
- Una respuesta registrada resuelve el pendiente del envío (spec 96 §10.1) y no confirma un envío sin confirmar.
- Permisos y «No contactar» en todo camino de escritura (`inbound_register` con persona o mensaje elegidos pasa por las mismas validaciones).
- Fechas en días de Argentina con los helpers de `crmDates.tsx` / `workDates.ts`.
- El historial «Qué pasó» sigue mostrando todo lo que pasó, incluidos borradores y aperturas.

## 6. Riesgos

- **Rendimiento de la lista de Negocios.** El nuevo agregado une actividades con mensajes. Medir con `EXPLAIN ANALYZE` sobre una copia con volumen real; si empeora, migración `056` con índice parcial en `crm_messages(activity_id) WHERE activity_id IS NOT NULL` (sección 12).
- **«Último contacto» va a retroceder** en negocios donde lo último fue una apertura o un borrador. Es la corrección buscada, pero los vendedores lo van a notar; avisarlo en la nota de despliegue.
- **Zona horaria de la computadora** del vendedor en la hora del user script (3.2).
- **Coincidencia de persona por teléfono** (3.4): un teléfono compartido por dos personas no preselecciona nada, a propósito.
- **Compatibilidad del toast y de Hoy** con la spec 100: esta spec cambia la forma de los datos (`followUps`); la spec 100 tiene que partir de ella.

## 7. Plan de tests (resumen)

| Hallazgo | Unit (`*.spec.ts(x)`) | Integración (`scripts/test-*.ts`) |
| --- | --- | --- |
| 3.1 | `contactEvidence.spec.ts` (nuevo), `businessTable.test.ts` | `test-business-history.ts`, `test-commercial.ts` |
| 3.2 | `communicationTimeline.spec.ts` | `test-userscript.ts` |
| 3.3 | `communicationTimeline.spec.ts`, `PendingOutcomes.spec.tsx` (nuevo) | `test-userscript.ts`, `test-instagram-open-chat.ts` |
| 3.4 | `ResponseRecordDialog.spec.tsx` | `test-communication.ts`, `test-userscript.ts` |
| 3.5 | `communicationTimeline.spec.ts` | `test-inbound-email-reply.ts`, `test-inbox.ts` |
| 3.6 | `contactOutcome.spec.ts`, `RequiresAction.spec.tsx` (nuevo) o `CommunicationPanel.review.spec.tsx`, spec del toast de `WorkEditor` | `test-work.ts`, `test-communication.ts` |
| 3.7 | `TaskPostponeMenu.spec.tsx`, `workDates.spec.ts` | `test-work.ts` |
| 3.8 | `nextStep.spec.ts`, spec de `NextWork`/`BusinessHistory` | `test-business-history.ts` |

Regresión primero (regla del repo): cada hallazgo arranca con un test que reproduce el caso del smoke y falla. Suites e2e (`npm run test:browser`) que tocan Hoy, Comunicación y «Registrar respuesta» se actualizan si cambian textos.

## 8. Orden de implementación sugerido

Cada bloque es un PR a `staging` con typecheck, `npm test`, build y las integraciones del bloque verdes.

1. **Evidencia de contacto** (3.1, sección 4) y **etiquetas** (3.3): base compartida, solo lectura más textos del servidor.
2. **Hora del user script** (3.2).
3. **Respuestas** (3.4) y **recibido respondido** (3.5).
4. **Pendientes y toast** (3.6).
5. **Posponer** (3.7) y **motivo de «No agendar nada»** (3.8): independientes, pueden ir en paralelo con 1–4.

## 9. Aceptación

- Cheroga (o un negocio de prueba equivalente): preparar un borrador y abrir WhatsApp no cambian «Último contacto» del encabezado ni de la lista; «Sí, lo envié» sí.
- Un envío visto por el script a las 18:20 y registrado a las 18:22 aparece a las 18:20, en orden, y dice «Enviado · confirmado por el script de WhatsApp» en la burbuja y en «Anotá cómo salió».
- Un intento de Instagram confirmado por eco dice «Enviado · confirmado por Instagram» en las dos partes.
- «Registrar respuesta» abre sin resultado; con un WhatsApp entrante de una persona cargada la preselecciona; lista el WhatsApp enviado a esa persona; «Otro» marca la aclaración como obligatoria.
- Un email respondido desde el CRM (aceptado) sale de «Por revisar» en la ficha, la Bandeja y Hoy.
- Mismo usuario y negocio: Hoy y la ficha muestran los mismos números de «Anotá cómo salió» y «Envíos sin confirmar»; el toast dice cuántos contactos quedan.
- «Posponer» de una tarea que vence el 2/11 no ofrece ninguna fecha anterior al 3/11.
- «No agendar nada» con «Ya tengo otra tarea agendada» muestra esa tarea o avisa que no está visible.
- `npm run typecheck`, `npm test`, `npm run build` y las integraciones listadas en verde; CI verde en el SHA del PR.

## 10. Decisiones que tomó esta spec (valores por defecto)

- **D1.** La evidencia de contacto se define en el servidor, en un solo helper, y Primeros pasos lo reutiliza.
- **D2.** El historial «Qué pasó» no se filtra: solo cambia el cálculo de «Último contacto».
- **D3.** La hora guardada de un envío del script es `max(min(sentAt, ahora), creación del intento)`; `completed_at` sigue siendo la hora de registro.
- **D4.** La fuente de confirmación se deriva de `external_id` (WhatsApp) y del `mid`/dueño del eco (Instagram); no hace falta columna nueva.
- **D5.** «Registrar respuesta» nunca adivina entre varias personas.
- **D6.** «Posponer» y «Cambiar fecha» son acciones distintas: solo «Posponer» tiene la regla «nunca antes».

## 11. Fuera de alcance, para specs futuras

- «Contactado» e `inactiveDays` de `leads_GET.ts:255,258` y las métricas de `analytics_GET.ts:76,89` siguen contando cualquier actividad (3.1).
- Rediseño de «Requiere acción» y de la tarjeta de Hoy (spec 100).

## 12. Migraciones

Ninguna obligatoria. Opcional, solo si el `EXPLAIN` de 3.1 lo justifica: `migrations/056_messages_activity_index.sql` con `CREATE INDEX crm_messages_activity_id ON crm_messages(activity_id) WHERE activity_id IS NOT NULL;`. Las migraciones aplicadas no se editan.

## 13. Datos históricos

| Hallazgo | Qué pasa con lo histórico | ¿Escritura en producción? |
| --- | --- | --- |
| 3.1 | Se corrige solo (cálculo de lectura). | No |
| 3.2 | No se puede corregir: la hora real no quedó guardada. Queda la hora de registro. | No |
| 3.3 | Burbuja, pendientes e historial se corrigen al mostrar. Los textos guardados en `crm_activities.result` / `crm_tasks.result` siguen diciendo «manualmente». | Solo si el propietario aprueba el backfill (pregunta 6) |
| 3.4 | Los recibidos sin persona se cubren con la coincidencia del cliente al registrar. | No |
| 3.5 | Se corrige solo (cálculo de lectura). | No |
| 3.6–3.8 | Se corrigen solos. | No |

## 14. Decisiones (propietario, 30/10/2026)

El propietario aprobó la recomendación de las seis: **D1 = A, D2 = A, D3 = A, D4 = A, D5 = B, D6 = A**. El detalle de cada opción queda abajo como registro.

1. **¿Qué cuenta como «Último contacto» en los bordes?** La tabla de la sección 4 deja tres casos discutibles: (a) un intento sin respuesta (`manual_no_contact`, resultado «No atendió»); (b) un email solo aceptado por Brevo, sin entrega confirmada; (c) un mensaje recibido que todavía no se registró.
   - Opción A: contar solo lo que prueba que hubo comunicación en alguna dirección: (b) y (c) sí, (a) no.
   - Opción B: contar también los intentos (a). Es más «actividad» que «contacto».
   - Opción C: contar solo envíos entregados y respuestas: (b) y (c) no.
   - **Recomendación: A.** Coincide con Primeros pasos (que ya cuenta `accepted` y excluye `no_answer`), y un mensaje que nos mandó el negocio es contacto aunque nadie lo haya clasificado. Además: aplicar la misma regla a la columna de Negocios (sección 3.1), no solo al encabezado.

2. **Base de «Posponer».**
   - Opción A: base = `max(vencimiento, hoy)`, con etiquetas relativas a la base («Un día más», «3 días más», «Lunes siguiente») para tareas futuras.
   - Opción B: base siempre hoy, ocultando las opciones anteriores o iguales al vencimiento (para una tarea a 5 días casi no quedarían opciones rápidas).
   - Opción C: base siempre el vencimiento, también para tareas vencidas (posponer una tarea vencida hace un mes la deja vencida).
   - **Recomendación: A.** Nunca adelanta, una tarea vencida pasa a futuro y las opciones rápidas siempre existen.

3. **¿Los envíos sin confirmar van dentro de «Anotá cómo salió»?**
   - Opción A: dos grupos en las dos vistas, «Anotá cómo salió» (contactos confirmados sin resultado) y «Envíos sin confirmar» (aperturas e intentos manuales), con la misma definición del servidor.
   - Opción B: un solo grupo con los dos tipos también en la ficha (como Hoy hoy).
   - Opción C: dejarlo como está y solo alinear los números.
   - **Recomendación: A.** Son dos preguntas distintas («¿lo enviaste?» y «¿cómo salió?»), la ficha ya las separa y es el camino más simple para el vendedor. La spec 100 define el diseño final.

4. **Email recibido y respondido desde el CRM.**
   - Opción A: deja de estar «Por revisar» por cálculo (respuesta con evidencia de envío) y muestra «Respondido desde el CRM»; clasificarlo queda opcional. Sin migración.
   - Opción B: estado nuevo `replied` en `crm_inbound_messages` (migración 056 y cambio de `CHECK`), escrito al aceptarse la respuesta.
   - Opción C: después de responder, abrir «Registrar respuesta» para clasificarlo en el momento; sigue «Por revisar» hasta que se clasifique.
   - **Recomendación: A.** Arregla también lo histórico sin escribir en producción y no obliga a clasificar algo que el vendedor ya atendió. La C agrega un paso al vendedor.

5. **«Ya tengo otra tarea agendada» sin tarea visible.**
   - Opción A: solo copy honesto en el resumen (sección 3.8).
   - Opción B: además, al guardar, avisar en el editor si no hay ninguna tarea pendiente del negocio visible para el vendedor («No vemos otra tarea pendiente. ¿Querés agendar una?»), sin bloquear.
   - Opción C: bloquear el motivo si no hay tarea.
   - **Recomendación: B.** Evita el error en el momento sin bloquear, porque la tarea puede estar a nombre de otra persona que el vendedor no ve.

6. **Backfill de textos de resultado del user script.** Las actividades y tareas viejas confirmadas por el script dicen «Envío confirmado manualmente» en `result`.
   - Opción A: no tocar; corregir al mostrar donde hay mensaje vinculado (sección 3.3).
   - Opción B: backfill acotado (`UPDATE … WHERE` mensaje WhatsApp con `external_id` y `result='Envío confirmado manualmente'`), con runbook revisado y alcance aprobado, ejecutado por el operador.
   - **Recomendación: A.** El texto guardado no se usa para lógica, y la corrección al mostrar cubre burbuja, pendientes e historial. Un backfill de producción necesita runbook y aprobación aparte, y no está justificado por un texto.

### Decisiones adicionales (propietario, 30/10/2026)

- **E1.** Si primero se confirmó manualmente y luego se vinculó el envío mediante el userscript o el eco de Instagram (`contact_linked` / `linked:true`, solo agrega `external_id`), se conserva la atribución manual. La fuente se deriva de los eventos de confirmación del journal (`contact_completed` / `contact_resolved` por script o eco, frente a `contact_linked`); `external_id IS NOT NULL` no basta. Aplica a burbujas (`sentStatusLabel`), «Anotá cómo salió», historial y resultado de tareas en `work.ts`. Sin cambio de esquema.
- **E2.** Una actividad histórica con `outcome IS NULL` cuenta solo si no tiene mensaje vinculado; cubre contactos anotados manualmente. La misma regla aplica al encabezado, Negocios y Primeros pasos.
- **E3.** Un inbound con `is_automatic = true` (respuesta automática o fuera de oficina) no cuenta como evidencia en el encabezado ni en Negocios.
