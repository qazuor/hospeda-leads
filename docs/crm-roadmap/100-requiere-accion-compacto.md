# Spec 100 — «Requiere acción» compacto

Estado: **borrador para revisión del propietario** (31/10/2026). Las decisiones de producto del 30/10 ya están aprobadas (sección 2). Las que quedaban abiertas (sección 14, D1–D8) tienen recomendación: **la implementación avanza con la recomendación salvo que el propietario diga otra cosa**. Origen: smoke en producción del 30/10/2026 con un usuario común sobre el negocio Cheroga (H1468), hallazgos 10, 6 (seguimiento), 34 y 35. Tipo: rediseño de UI de «Requiere acción» (ficha del negocio) y de la tarjeta de Hoy, agrupación y vencimiento calculados al leer en el servidor, acción masiva en el cliente y dos valores por defecto (Para retomar y Próximas acciones). Sin endpoint nuevo, sin permiso nuevo. **Migración: ninguna.** No escribe datos de producción: el vencimiento es una agrupación al leer y no cambia el estado de ningún mensaje.

Parte de la [spec 99](99-registro-honesto-de-contactos.md), ya mergeada: `pendingContactFollowUps` (`{unconfirmed, outcomes}`), las dos listas con los mismos números en Hoy y en la ficha (§3.6) y el toast del editor de trabajo. Respeta `AGENTS.md` («Abrir un canal, guardar un borrador o mover una etapa NO es evidencia…», permisos y «No contactar» en todo camino de escritura, loading y bloqueo de doble envío, nunca reintentar solo un envío de resultado incierto) y `docs/decisiones.md` (líneas 64, 314, 321, 348 y 376).

## 1. Problema

1. **(10)** En la solapa Comunicación del negocio, «Requiere acción» ocupa toda la pantalla por encima de la conversación. Cada envío sin confirmar es una tarjeta grande con el texto preparado, los botones y el material (`RequiresAction.tsx:51-64`); cada contacto sin resultado es una fila más (`PendingOutcomes.tsx:26-29`). Con 4 aperturas y 3 contactos, la conversación queda varias pantallas más abajo.
2. **(6, seguimiento)** El bloque 4 de la spec 99 dejó en Hoy una forma transitoria: la tarjeta «Anotá cómo salió» con un bloque «Envíos sin confirmar · N» adentro (`PendingOutcomes.tsx:32`) y un mosaico «Anotá cómo salió · N sin confirmar» (`TodayStatTiles.tsx:15`). Falta la forma final, coherente con la tira.
3. **(34)** «Para retomar» no muestra la gestión que acabás de cerrar.
4. **(35)** «Próximas acciones» arranca plegada en Hoy.

## 2. Decisiones ya aprobadas (propietario, 30/10/2026)

- **A1.** Una tira compacta con un contador arriba de la conversación («N pendientes · Revisar»), que se despliega con un clic.
- **A2.** Acciones masivas.
- **A3.** Las preguntas viejas vencen solas.
- **A4.** No preguntar por envíos que ya confirmó el user script o el eco de Instagram.
- **A5.** El resultado se pregunta por gestión (conversación), no por cada envío.
- **Condicional, fuera de alcance:** preguntas en línea junto a cada burbuja, solo si visualmente casi no se notan y con prototipo previo (sección 11).

## 3. Objetivos y no objetivos

### Objetivos

1. La conversación queda a la vista al abrir la solapa: «Requiere acción» ocupa una línea mientras no se despliega.
2. Una sola cuenta de «pendientes», calculada en el servidor, igual en Hoy y en la ficha para el mismo negocio (spec 99 §3.6).
3. «Anotá cómo salió» pide un resultado por gestión; un resultado resuelve todos los envíos pendientes de esa gestión.
4. Las preguntas viejas salen de la cuenta y pasan a «Vencidos» (plegado), donde se pueden responder igual. Nada se escribe al vencer.
5. «Sí, se envió» y «No se envió» se pueden contestar para varios envíos a la vez, con confirmación explícita, bloqueos por ítem y resultado por ítem.
6. No se pregunta «¿Lo enviaste?» mientras el script o el eco todavía pueden confirmarlo, ni por algo ya confirmado.
7. Hoy usa los mismos bloques y las mismas palabras que la tira.
8. «Para retomar» muestra la gestión recién cerrada; «Próximas acciones» arranca abierta.

### No objetivos

- Cambiar qué confirma un envío (eco de Instagram, user script, «Sí, se envió»), la definición de evidencia de la spec 99 §4, el gating de «No contactar» o los permisos.
- Preguntas en línea junto a las burbujas (sección 11).
- Acción masiva en Hoy (sección 11) ni sobre «Por revisar».
- Escribir en producción. Vencer una pregunta no cambia `status`, actividad ni journal.
- Trabajo solo de accesibilidad (diferido por el propietario). Se mantienen los `aria-label` existentes porque los usan los tests.

## 4. Hallazgos

Cada hallazgo tiene: comportamiento actual (verificado en `origin/staging` el 31/10/2026, rama `docs/spec-100-requiere-accion`), causa raíz, propuesta, datos y tests. Las líneas citadas son de esta rama.

### 4.1 «Requiere acción» ocupa toda la pantalla (hallazgo 10)

**Actual.**
- `CommunicationPanel.tsx:103` monta `<RequiresAction>` entre las restricciones (`:102`) y `<Conversation>` (`:104`), siempre desplegado.
- `RequiresAction` (`src/components/communication/RequiresAction.tsx:110-133`) arma:
  - un título «Requiere acción · N» (`:125`) y un resumen `actionSummary` (`:127`; `communicationTimeline.ts:222-224`);
  - las entradas «Por revisar» (`ReviewEntry`, `:25-32`): una línea que lleva a la burbuja (correcto, ya compacto);
  - las entradas «¿Lo enviaste?»: `ConfirmEntry` (`:51-64`), una tarjeta completa con texto preparado (`ClampedText` de 3 líneas), material, «Sí, se envió» / «No se envió», «Copiar y abrir de nuevo» y «Corregir cómo salió»; o `PendingConfirmEntry` (`:70-80`) cuando el mensaje no está cargado;
  - además, aperturas cargadas que el servidor deja afuera y el usuario puede contestar (`uncounted`, `:116`), sin contar;
  - `UnconfirmedMaterialEntry` (`:87-96`) para material de aperturas ajenas (no cuenta);
  - `PendingOutcomes` (`:131`) con una fila por envío sin resultado.
- La cuenta es `review.length + unconfirmed.count + outcomes.count` (`:122`): envíos, no gestiones.
- Nada vence: una apertura de hace tres semanas sigue arriba de todo, contando.
- Una apertura de WhatsApp recién hecha aparece al instante como «¿Lo enviaste?», aunque en la computadora el script (obligatorio desde la spec 96, `docs/decisiones.md:376` y siguientes) la confirma solo en segundos. Para Instagram ya existe una espera de 15 minutos (`INSTAGRAM_ECHO_WAIT_MS`, `src/helpers/instagramChat.ts:15`; filtro en `communicationService.ts:488`).

**Causa raíz.** «Requiere acción» se diseñó como lista de tareas siempre abierta (spec 91 §9) y la spec 92 le sumó las tarjetas completas de los envíos sin confirmar (`docs/decisiones.md:348`). No hay estado plegado, ni agrupación por gestión, ni vencimiento, ni espera para el script de WhatsApp.

**Propuesto.** Ver sección 5 (tira), 6 (agrupación), 7 (vencimiento), 8 (masivo) y 9 (no preguntar lo confirmado).

**Datos.** Sin migración. Todo es lectura salvo las escrituras que ya existen (`outcome`, editor de trabajo).

**Tests.** Sección 12.

### 4.2 Forma final de Hoy (hallazgo 6, seguimiento de la spec 99)

**Actual.**
- `TodayList.tsx:41` muestra `PendingOutcomes` con `outcomes` y, adentro, el bloque «Envíos sin confirmar · N» (`PendingOutcomes.tsx:32`). El encabezado de la tarjeta es «Anotá cómo salió» aunque solo haya envíos sin confirmar.
- El mosaico (`TodayStatTiles.tsx:15`) dice «Anotá cómo salió · N sin confirmar» con valor `outcomes` (envíos), y `dayProgress` suma los dos como `waiting` (`:14`).
- Cada fila sin confirmar abre `OutcomeAfterContact`, que pregunta «¿Lo enviaste?» y después el resultado.

**Causa raíz.** Forma transitoria declarada en la spec 99 §3.6 («La forma final la define la spec 100»).

**Propuesto** (D8). Tarjeta **«Pendientes de contacto · N»** con los mismos bloques y palabras que la tira (sin «Por revisar», que en Hoy ya es el panel «Respuestas nuevas»):
- «¿Lo enviaste? · N»: una fila por envío, como hoy, con «Sí, se envió», «No se envió» (para aperturas de WhatsApp o Instagram) o «Anotá cómo salió» (intento manual, que necesita su resultado).
- «Anotá cómo salió · N»: una fila por gestión (sección 6), con «Anotá cómo salió».
- «Vencidos · N»: plegado (sección 7).
- Cada fila nombra el negocio (`showBusiness`, como hoy) y tiene «Ver en el negocio» (`/accounts/{id}?section=communication&pending=open`).
- Mosaico: **«Pendientes de contacto»** con valor `unconfirmed.count + outcomes.groupCount` (sin vencidos); habilitado si es mayor que 0; lleva a `#today-outcomes`. Se elimina el texto «· N sin confirmar».
- `dayProgress` recibe `waiting = unconfirmed.count + outcomes.groupCount` (los vencidos no frenan «¡Terminaste por hoy!»).

**Datos.** Sin migración.

**Tests.** `TodayStatTiles.spec.tsx`, `PendingOutcomes.spec.tsx` (o el componente nuevo, sección 10), `scripts/test-work.ts`.

### 4.3 «Para retomar» oculta la gestión recién cerrada (hallazgo 34)

**Actual.**
- `ReactivationContent` (`src/pages/reactivation.tsx:21`) arranca con `handled='no'` («Sin acción creada», `:29`) y `to=localDay()` («Hasta» = hoy).
- El servidor (`src/endpoints/pipeline.ts:55`) traduce `handled='no'` a `e.task_id IS NULL AND e.related_lead_id IS NULL`; el valor por defecto del esquema también es `'no'` (`:24`).
- Cerrar una gestión con fecha de recontacto **crea siempre** la tarea «Recontactar según lo acordado» y la guarda en `e.task_id` (`pipeline.ts:193-194`), salvo No contactar. Por lo tanto, una gestión cerrada con fecha nunca entra en «Sin acción creada».
- Segunda causa, verificada en código: la fecha de recontacto suele ser futura y el filtro «Hasta = hoy» (`e.recontact_date<=hoy`, `pipeline.ts:53`) también la esconde. Aunque se arreglara solo `handled`, la gestión recién cerrada seguiría oculta hasta su fecha.

**Causa raíz.** Los filtros por defecto son anteriores a la tarea automática del cierre (decisión del 21/10, `docs/decisiones.md`, «Recontacto al cerrar una gestión»): hoy casi toda gestión nueva tiene «Acción creada».

**Propuesto** (D5). Por defecto «Estado de retoma: **Todos**» y «Hasta» **vacío**. El orden ya es por fecha de recontacto ascendente (`pipeline.ts:59`), así que lo más próximo sigue primero. La fila ya muestra el estado de la tarea y «Abrir tarea» (`reactivation.tsx:30`). El esquema del servidor pasa a `default('all')` para que un pedido sin `handled` se comporte igual que la pantalla. «Limpiar filtros», si existe o se agrega, vuelve a estos valores.

**Datos.** Sin migración.

**Tests.** `scripts/test-pipeline.ts`: sin `handled` → incluye un cierre con tarea automática y fecha futura. E2E `tests/browser/reactivation-guidance.e2e.ts`: después de cerrar con fecha a 30 días, la gestión aparece sin tocar filtros.

### 4.4 «Próximas acciones» arranca plegada (hallazgo 35)

**Actual.** `TodayList.tsx:37` envuelve el bucket `upcoming` en `<Disclosure>` sin `open`, y `Disclosure` arranca cerrado por defecto (`src/components/Disclosure.tsx:14-15`). Los e2e lo abren a mano (`tests/browser/work.e2e.ts:23`, `tests/browser/pending-continuity.e2e.ts:16`).

**Causa raíz.** Valor por defecto de `Disclosure`.

**Propuesto** (D6). `<Disclosure open className={ws.upcoming} …>`: arranca abierta y se puede plegar. No se recuerda la preferencia (KISS). `Disclosure` ya separa el valor inicial del estado del usuario (`:15,20`): pasar `open` constante no impide plegarla.

**Datos.** Sin migración.

**Tests.** Unit nuevo `src/components/TodayList.spec.tsx`: «Próximas acciones» visible sin clic y plegable. E2E: `work.e2e.ts:23` y `pending-continuity.e2e.ts:16` dejan de hacer clic para abrir (si no, la pliegan).

## 5. La tira «Requiere acción»

### 5.1 Plegada (estado al montar)

Componente nuevo `src/components/communication/RequiresActionStrip.tsx`, que reemplaza el contenido de `RequiresAction` (el archivo `RequiresAction.tsx` conserva las entradas y exporta la tira; `CommunicationPanel.tsx:103` no cambia de lugar).

- Una sola línea, `<section aria-label="Requiere acción">` (se mantiene el nombre de la región: lo usan los e2e).
- Contenido: icono, **«N pendientes»** (1: «1 pendiente») y el botón **«Revisar»** (`aria-expanded`). En contenedores de 600 px o más, a la derecha y en gris, el desglose: «1 mensaje por revisar · 2 envíos sin confirmar · 1 gestión sin resultado» (`actionSummary` con el tercer término en gestiones).
- N = `review` + `unconfirmed.count` + `outcomes.groupCount`. No cuenta vencidos, ni aperturas que el servidor deja afuera (`uncounted`), ni material de aperturas ajenas.
- Sin pendientes contados pero con vencidos, aperturas no contadas o material: línea gris «Sin pendientes · 2 vencidos» (o «· 1 envío esperando confirmación», «· material en un envío sin confirmar») con «Ver».
- Sin nada de lo anterior: **no se muestra nada** (se elimina «Nada pendiente…», `RequiresAction.tsx:126`).
- Alto máximo plegada: una línea de 44 px (botón táctil).

### 5.2 Desplegada

Al tocar «Revisar» (o al llegar con `?pending=open`, sección 5.4), la tira se abre en el mismo lugar con encabezado «Requiere acción · N» y «Ocultar». Bloques, en este orden, cada uno solo si tiene ítems:

1. **«Por revisar · N»**: `ReviewEntry` sin cambios (una línea que lleva a la burbuja; las acciones siguen en la burbuja, `docs/decisiones.md:321`).
2. **«¿Lo enviaste? · N»**: `ConfirmEntry` compacto:
   - línea 1: canal, «{Abriste|Se abrió} WhatsApp para {destinatario} · {fecha hora}»;
   - línea 2: botones «Sí, se envió» / «No se envió» (y «Copiar y abrir de nuevo» en Instagram);
   - el texto preparado y el material pasan a un `Disclosure` «Ver mensaje y material» cerrado (el material conserva «Revocar enlace», `docs/decisiones.md:349`);
   - casilla de selección cuando el ítem es elegible para la acción masiva (sección 8).
   - `PendingConfirmEntry` (mensaje no cargado o intento manual) queda como está, más compacto (una línea + botón).
   - Las aperturas en espera (Instagram esperando el eco o WhatsApp esperando el script, sección 9) se listan al final del bloque, sin contar, con su estado de espera y los mismos botones (como hoy en Instagram).
3. **«Anotá cómo salió · N»**: una fila por gestión (sección 6).
4. **«Vencidos · N»**: `Disclosure` cerrado (sección 7).
5. Material de aperturas ajenas (`UnconfirmedMaterialEntry`), sin contar, como hoy.

Al resolver el último pendiente contado, la tira vuelve a plegada (o desaparece si no queda nada). Toda acción invalida `['communication']` y `['work']`, como hoy (`ConfirmSendButtons.tsx:21`), así Hoy se actualiza.

### 5.3 Celular (390 px)

D4: misma posición, plegada en una línea: «3 pendientes» a la izquierda y «Revisar» a la derecha; sin desglose. Desplegada ocupa el ancho del panel; los botones de cada entrada pasan a columna si no entran (CSS existente de `actionButtons`). Sin barra fija ni hoja inferior.

### 5.4 Llegar con la tira abierta

`?pending=open` en la URL del negocio abre la tira al montar. Lo usan «Ver en el negocio» de Hoy (4.2) y «Ver en Comunicación» del toast (`WorkEditor.tsx:46`, href `/accounts/{id}?section=communication&pending=open`). Sin el parámetro, siempre arranca plegada.

## 6. «Anotá cómo salió» por gestión

### Actual

Una fila por envío (`PendingOutcomes.tsx:26`), cada una con su «Anotá cómo salió», que abre `OutcomeAfterContact` con ese `messageId`. El servidor ya resuelve en grupo: un envío con evidencia sale de la lista cuando existe **cualquier** actividad con resultado del mismo negocio y la misma gestión creada después del envío (`communicationService.ts:492`). Es decir, anotar el resultado de un envío ya resuelve los anteriores de esa gestión; la UI no lo dice y los muestra como preguntas separadas.

### Propuesto (D2)

- **Grupo** = (negocio, gestión, tarea delegada). Sin gestión = un grupo «Sin gestión» por negocio. Los mensajes delegados (`delegated_task_id`, solo los ve un admin) forman su propio grupo por tarea, para no mezclar la regla de la spec 96 (`resolveMessageForWork`, `communicationService.ts:443-447`).
- **Fila del grupo**: «{Gestión o «Sin gestión»}» · «{N} envíos sin resultado» y debajo, en gris, una línea por envío: «{Canal} · {destinatario} · {fecha hora} · {etiqueta de confirmación}» (`sentStatusLabel`, ya distingue manual, script e Instagram). Máximo 3 líneas visibles y «+N más».
- **Un botón «Anotá cómo salió»** por grupo. Abre `OutcomeAfterContact` con el envío **más reciente** del grupo (`outcomeContact(newest)`), sus personas y su propósito. La ayuda del diálogo dice «Este resultado vale para los {N} envíos de esta gestión.» cuando N > 1.
- Al guardar, la actividad queda vinculada al envío más reciente (como hoy) y el servidor resuelve los demás por la regla de `:492` (creada después de todos los envíos del grupo). **Sin cambio en el servidor para resolver.**
- Grupo «Sin gestión» con propósitos mezclados (comercial y acompañamiento): se usa el propósito del más reciente; la regla del servidor resuelve todos igual. Riesgo aceptado (sección 13).
- **Conteo**: «Anotá cómo salió · N» y la tira cuentan **grupos** (`outcomes.groupCount`, servidor). `outcomes.count` (envíos) se mantiene en la respuesta para compatibilidad.

### Servidor

`pendingContactFollowUps` (`communicationService.ts:480-497`):
- `PendingContactOutcome` suma `delegatedTaskId:string|null`.
- `ContactFollowUpList` suma `groupCount:number` (para `unconfirmed` es igual a `count`).
- El límite de `outcomes` pasa a contarse por grupos: `dense_rank()` de los grupos por su envío más reciente (`max(last_interaction_at) OVER (PARTITION BY account_id, lead_id, delegated_task_id)`), y se devuelven todos los envíos de los primeros `limit` grupos. Así un grupo nunca llega cortado al cliente.
- Helper puro nuevo `groupOutcomeFollowUps(items)` en `src/helpers/contactFollowUpGroups.ts`: arma los grupos en el cliente (Hoy y ficha) a partir de `items`, ordenados por el más reciente, con desempate por id.

## 7. Vencimiento (lectura, sin escritura)

### Reglas

- Una pregunta **vence** cuando pasa el umbral (D1) contado desde `last_interaction_at` con el reloj de la base (`now()`), para que Hoy y la ficha den lo mismo:
  - «¿Lo enviaste?» (`unconfirmed`): **72 horas** (`UNCONFIRMED_STALE_HOURS = 72`, igual que `recentContactHours`).
  - «Anotá cómo salió» (`outcomes`): **7 días** desde el envío **más reciente del grupo** (`OUTCOME_STALE_DAYS = 7`). Un grupo vence entero o no vence: si llegó un envío nuevo a esa gestión, todo el grupo vuelve a la cuenta.
  - «Por revisar»: **no vence** (es un mensaje real del negocio; ver D1).
- Constantes en `src/helpers/contactOutcome.ts`, junto a `UNCONFIRMED_FOLLOW_UP_STATUSES` (`:10`).
- Vencer **no escribe nada**: ni `status`, ni actividad, ni journal, ni tarea. Es una partición del `SELECT`.
- Un ítem vencido sale de la cuenta (tira, mosaico, `dayProgress`, toast) y aparece en **«Vencidos · N»**, plegado, con los mismos botones. Contestarlo hace lo mismo que contestarlo antes de vencer.
- Copy del bloque: título «Vencidos · N»; ayuda «Preguntas de más de 3 días (envíos sin confirmar) o 7 días (gestiones sin resultado). No cuentan como pendientes, pero podés responderlas igual.»

### Servidor

`ContactFollowUps` pasa a `{unconfirmed, outcomes, expired:{unconfirmed:ContactFollowUpList; outcomes:ContactFollowUpList}}`. En el `WITH f` se agrega `stale` (por ítem en `unconfirmed`, por grupo en `outcomes`) y la ventana `r` particiona por `(unconfirmed, stale)` en vez de solo `unconfirmed` (`:493`). `unconfirmed` y `outcomes` contienen solo lo no vencido. Mismo límite por lista. Los clientes viejos que leen `unconfirmed`/`outcomes` ven solo lo vigente: es el comportamiento buscado.

`work.schema.ts:51-52` y `communication.schema.ts` re-exportan el tipo nuevo; `communication.ts:68` y `work.ts:136` no cambian la llamada.

## 8. Acción masiva

### Alcance (D3)

| Bloque | Acción masiva | Por qué |
| --- | --- | --- |
| «¿Lo enviaste?» (aperturas de WhatsApp e Instagram) | **«Sí, se enviaron (N)»** y **«No se enviaron (N)»** sobre los seleccionados | Es donde se acumulan; la respuesta suele ser la misma para todos |
| «¿Lo enviaste?» (intento manual, `manual_pending`) | No | Necesita su resultado propio (`manual_complete` / `OutcomeAfterContact`) |
| «Anotá cómo salió» | No entre gestiones | Cada gestión necesita su «¿Cómo sigue?» (decisión 2B, `docs/decisiones.md:64`); la agrupación por gestión ya es la reducción |
| «Por revisar» | No | Clasificar exige leer cada mensaje |
| «Vencidos» | La misma que «¿Lo enviaste?» para sus aperturas | Mismas reglas |

Solo en la ficha del negocio. En Hoy, botones por fila (sección 11).

### Elegibilidad por ítem

Un ítem tiene casilla si: es una apertura (`isConfirmableOpen`), el usuario puede contestarla (`canConfirmSend`, `ConfirmSendButtons.tsx:11`) y no está esperando el eco o el script (sección 9). La barra masiva aparece con **2 o más** elegibles. Todas las casillas arrancan **sin marcar**; un enlace «Seleccionar todos ({N})» las marca.

### Confirmación (paso obligatorio)

Al tocar «Sí, se enviaron (N)» se abre un `CrmDialog`:
- Título: «¿Confirmás que enviaste estos {N} mensajes?» («No se enviaron»: «¿Confirmás que estos {N} mensajes no se enviaron?»).
- Lista de lo que se va a marcar: canal · destinatario · fecha hora · gestión.
- Lista aparte «No se van a marcar», con el motivo por ítem de `confirmSendBlockReason` (`communicationRecipient.ts:44-53`): papelera, No contactar, archivado, gestión cerrada, restricción del canal. Solo aplica a «Sí, se enviaron»; «No se enviaron» no tiene esos bloqueos (como el botón individual, `ConfirmSendButtons.tsx:28`).
- Texto: «Marcar como enviado es tu confirmación: queda registrado como contacto.» / «Marcarlos como no enviados los saca de los pendientes.»
- Botones: «Sí, marcar {N}» y «Volver». Si todos están bloqueados, el botón queda deshabilitado con el motivo «Ninguno se puede marcar como enviado.».

### Ejecución

- Implementación (D3, recomendación): **en el cliente**, una llamada por ítem a la acción existente `outcome` (`communication.schema.ts:34`), **en secuencia**, con `useGuardedMutation`. Cada llamada pasa por los mismos controles del servidor que el botón individual (`communicationService.ts:591-606`: permiso con `messageFor`, solo aperturas, `assertAccountContactAllowed` para «Sí»). Sin endpoint ni acción nueva.
- Durante la ejecución: diálogo bloqueado, botón «Guardando 2 de 4…», casillas y botones individuales deshabilitados (doble envío imposible).
- Al terminar, el diálogo muestra el resultado **por ítem**: «Marcado como enviado», «Marcado como no enviado», «Ya estaba confirmado (por el script o Instagram)» o el mensaje de error del servidor. Toast resumen: «3 de 4 marcados. 1 no se pudo marcar.».
- **Nunca se reintenta solo.** Un ítem que falló (incluido un error de red, cuyo resultado es incierto) queda en la lista con su error; para volver a intentarlo, el vendedor lo elige de nuevo después de la recarga, que muestra el estado real.
- Servidor, cambio mínimo: en `outcome`, si el mensaje ya está `manual_sent`, lanzar `CommunicationConflict('Este envío ya estaba confirmado.')` en vez del error genérico de `:594`, para que el cliente lo muestre como información y no como falla.

## 9. No preguntar lo que ya se confirmó (A4)

Interpretación de la decisión A4 (D7 la precisa):

1. **«¿Lo enviaste?» nunca lista algo confirmado.** La lista contada sale del servidor (`unconfirmed`), que solo trae `whatsapp_opened`, `instagram_opened` y `manual_pending`; un envío confirmado por el script o el eco ya es `manual_sent`. La tira se recarga al volver el foco a la pestaña (valor por defecto de TanStack Query; verificar que `CommunicationPanel.tsx:68` no lo desactive) y al terminar cada espera.
2. **Espera del script de WhatsApp.** Como Instagram (15 min de eco), una apertura de WhatsApp de menos de **5 minutos** (`WHATSAPP_SCRIPT_WAIT_MS = 5*60_000`, en `src/helpers/contactOutcome.ts`) no entra en `unconfirmed`: el filtro de `communicationService.ts:488` suma `OR (m.status='whatsapp_opened' AND m.last_interaction_at>now()-…)`. En la tira aparece sin contar, al final de «¿Lo enviaste?», con el estado «Esperando que el script de WhatsApp confirme el envío» y los mismos botones. El hook `useInstagramWaitNow` (`useInstagramWait.ts:9`) se generaliza a `useConfirmWaitNow` para recargar al terminar cualquiera de las dos esperas.
3. **«Anotá cómo salió» no pregunta por envío.** Un envío confirmado por el script o el eco no genera una pregunta propia: es una línea dentro del grupo de su gestión (sección 6), con su etiqueta de fuente.
4. Si al contestar el envío ya estaba confirmado, el servidor responde «Este envío ya estaba confirmado.» (sección 8) y se muestra como información.

## 10. Componentes y funciones (resumen para implementar)

| Pieza | Archivo | Cambio |
| --- | --- | --- |
| Constantes de vencimiento y espera | `src/helpers/contactOutcome.ts` | `UNCONFIRMED_STALE_HOURS`, `OUTCOME_STALE_DAYS`, `WHATSAPP_SCRIPT_WAIT_MS` |
| Consulta de pendientes | `src/helpers/communicationService.ts:480-497` | `stale`, `expired`, `groupCount`, `delegatedTaskId`, límite por grupos, espera de WhatsApp |
| Tipos | `communicationService.ts:466-468`, `work.schema.ts:51-52`, `communication.schema.ts` | `ContactFollowUps` con `expired`; `ContactFollowUpList.groupCount` |
| Agrupación | `src/helpers/contactFollowUpGroups.ts` (nuevo) | `groupOutcomeFollowUps`, `pendingCount({review,followUps})` (la cuenta N compartida) |
| Resumen | `src/helpers/communicationTimeline.ts:222-224` | `actionSummary` cuenta gestiones en el tercer término («gestión sin resultado»); estado de espera del script (`isWaitingForScript`) |
| Tira | `src/components/communication/RequiresActionStrip.tsx` (nuevo) + `RequiresAction.tsx` | plegada/desplegada, `?pending=open`, bloques |
| Entrada compacta | `RequiresAction.tsx:51-64` | texto y material en «Ver mensaje y material»; casilla |
| Masivo | `src/components/communication/BulkConfirmSends.tsx` (nuevo) | barra, diálogo, ejecución en secuencia, resultado por ítem |
| Grupos de resultado | `src/components/PendingOutcomes.tsx` | fila por grupo; bloques «¿Lo enviaste?», «Anotá cómo salió», «Vencidos»; título de Hoy «Pendientes de contacto» |
| Hoy | `TodayList.tsx:41,37`, `TodayStatTiles.tsx:14-15`, `my-day.tsx:56` | tarjeta, mosaico, `waiting`, «Próximas acciones» abierta |
| Toast | `src/components/WorkEditor.tsx:41-47` | cuenta `unconfirmed.count + outcomes.groupCount`; copy «Queda 1 pendiente de contacto en este negocio.» / «Quedan N pendientes de contacto en este negocio.»; href con `&pending=open` |
| Servidor `outcome` | `communicationService.ts:594` | conflicto «Este envío ya estaba confirmado.» |
| Para retomar | `src/pages/reactivation.tsx:21`, `src/endpoints/pipeline.ts:24` | `handled='all'`, `to=''` |

Copy nuevo (UI, español): «N pendientes» / «1 pendiente», «Revisar», «Ocultar», «Requiere acción · N», «Por revisar · N», «¿Lo enviaste? · N», «Anotá cómo salió · N», «{N} envíos sin resultado», «+N más», «Este resultado vale para los {N} envíos de esta gestión.», «Vencidos · N» y su ayuda, «Ver mensaje y material», «Esperando que el script de WhatsApp confirme el envío», «Seleccionar todos ({N})», «Sí, se enviaron (N)», «No se enviaron (N)», textos del diálogo (sección 8), «Guardando {i} de {N}…», «Ya estaba confirmado (por el script o Instagram)», «Sin pendientes · …», «Pendientes de contacto», «Ver en el negocio».

## 11. Fuera de alcance, para specs futuras

- **Preguntas en línea junto a cada burbuja** (decisión condicional del 30/10): solo si un prototipo demuestra que casi no se notan. Hoy no aplica, porque los envíos sin confirmar no están en la conversación (`docs/decisiones.md:348`); habría que revisar esa decisión primero.
- Acción masiva en Hoy (los bloqueos por ítem necesitan los datos de cada negocio, que Hoy no carga).
- Recordar por usuario si la tira o «Próximas acciones» quedaron abiertas.
- Vencimiento configurable desde Configuración.

## 12. Plan de tests

Regresión primero (regla del repo): cada bloque arranca con un test que reproduce el caso del smoke y falla.

| Tema | Unit (`*.spec.ts(x)`) | Integración (`scripts/test-*.ts`) | E2E (`tests/browser/*.e2e.ts`) |
| --- | --- | --- | --- |
| Vencimiento y grupos (servidor) | `contactOutcome.spec.ts` (constantes), `contactFollowUpGroups.spec.ts` (nuevo) | `test-work.ts`: con `last_interaction_at` movido en la base de test, una apertura de 73 h va a `expired.unconfirmed`, un grupo con un envío de 8 días y otro de 1 día queda vigente entero, uno de 8 días vence; Hoy (filtrando el negocio) y Comunicación devuelven las mismas listas, `groupCount` y `expired`; el límite corta por grupos; vencer no cambia `status` ni crea filas de journal | — |
| Espera del script | `communicationTimeline.spec.ts` (`isWaitingForScript`) | `test-userscript.ts`: apertura de WhatsApp de 1 minuto no está en `unconfirmed`; a los 6 minutos sí; confirmada por el script dentro de la espera, nunca aparece | — |
| Tira | `RequiresActionStrip.spec.tsx` (nuevo): plegada por defecto con «N pendientes»; N no cuenta vencidos ni no contados; sin nada no renderiza; `?pending=open` la abre; bloques en orden; «Ocultar» | — | `business-contact.e2e.ts`, `contact-three-clicks.e2e.ts:63`, `instagram-open-chat.e2e.ts:89-114`, `material-composer.e2e.ts:78`, `communication-resources.e2e.ts:16`: agregar «Revisar» antes de buscar entradas (helper `openRequiresAction(page)` en `tests/browser/helpers/`) |
| Masivo | `BulkConfirmSends.spec.tsx` (nuevo): casillas solo en elegibles, barra con 2+, diálogo lista lo que se marca y lo bloqueado con su motivo, «Sí, marcar» deshabilitado si todo está bloqueado, llamadas en secuencia, doble clic no duplica, falla parcial por ítem, sin reintento automático | `test-communication.ts`: `outcome` sobre un `manual_sent` → «Este envío ya estaba confirmado.»; tres aperturas con una en negocio No contactar → dos ok, una rechazada por el servidor | Nuevo `requires-action-strip.e2e.ts`: 390 px, una línea; desplegar; marcar 2 aperturas con «Sí, se enviaron», confirmar, ver resultado y la tira actualizada; Hoy muestra el mismo número |
| Grupos de resultado | `PendingOutcomes.spec.tsx`: un grupo con 3 envíos (manual, script, Instagram) muestra las 3 etiquetas y un botón; ayuda «vale para los 3 envíos» | `test-work.ts`: anotar el resultado del más reciente resuelve los 3 (regla existente, `:492`) | — |
| Hoy | `TodayStatTiles.spec.tsx`: mosaico «Pendientes de contacto» = sin confirmar + grupos; sin «· N sin confirmar»; `TodayList.spec.tsx` (nuevo): «Próximas acciones» abierta | `test-work.ts` (arriba) | `work.e2e.ts:23`, `pending-continuity.e2e.ts:16`: no hacer clic para abrir |
| Toast | `WorkEditor.spec.tsx`: cuenta grupos; copy nuevo; href con `&pending=open` | — | — |
| Para retomar | — | `test-pipeline.ts`: sin `handled` → incluye cierre con tarea automática y fecha futura | `reactivation-guidance.e2e.ts`: gestión recién cerrada visible con los filtros por defecto |

También se actualizan `scripts/test-instagram-open-chat.ts:126,205` y `scripts/test-userscript.ts:188,374` a la forma nueva de `followUps` (solo lectura de campos). Suite de navegador completa antes del merge (`npm run build && npm start`, luego `npm run test:browser`; ~10 minutos).

## 13. Riesgos

- **Un resultado para varios envíos.** Si en la misma gestión un envío salió bien y otro no, el vendedor anota uno solo. Es lo aprobado (A5) y ya es lo que hace el servidor (`:492`); la ayuda del diálogo lo dice.
- **Grupo «Sin gestión» con propósitos mezclados**: se usa el del más reciente.
- **Vencidos olvidados.** Un ítem vencido no molesta más; si nadie lo contesta, queda sin confirmar para siempre. Es honesto (no se infiere nada) y sigue a la vista en «Vencidos».
- **Espera de 5 minutos en el celular**, donde no hay script: la pregunta aparece 5 minutos más tarde. Aceptable.
- **Masivo en el cliente**: si se cierra la pestaña a mitad, quedan marcados los que ya respondió el servidor; la recarga muestra el estado real. No hay estado intermedio inconsistente porque cada ítem es su propia transacción.
- **E2E**: varios suites cambian por el paso «Revisar»; un helper común acota el cambio.

## 14. Decisiones abiertas (recomendación; se implementa con ella salvo indicación del propietario)

1. **D1 — Umbral de vencimiento y si difiere por bloque.**
   - Opción A: 72 h para todo («¿Lo enviaste?», «Anotá cómo salió» y «Por revisar»). Pro: una sola regla. Contra: un resultado suele llegar con la respuesta del negocio, días después; y vencer «Por revisar» esconde mensajes reales del negocio.
   - Opción B: 72 h para «¿Lo enviaste?», 7 días para «Anotá cómo salió» (desde el envío más reciente del grupo), «Por revisar» no vence. Pro: a los 3 días nadie recuerda si mandó un WhatsApp; un resultado tiene sentido durante una semana; un mensaje recibido nunca se esconde. Contra: dos umbrales que explicar (la ayuda de «Vencidos» los dice).
   - Opción C: 7 y 14 días. Pro: menos preguntas perdidas. Contra: la tira sigue llena con lo viejo, que es el problema del smoke.
   - **Recomendación: B.**
2. **D2 — Qué significa «por gestión» en «Anotá cómo salió».**
   - Opción A: una fila por gestión que lista sus envíos y un solo resultado que los resuelve todos. Pro: el camino más simple; el servidor ya lo hace (`:492`); cuenta gestiones. Contra: un resultado único para envíos distintos.
   - Opción B: una fila por gestión, pero el resultado resuelve solo el más reciente y los demás siguen pendientes. Contra: contradice la regla del servidor y vuelve a llenar la lista.
   - Opción C: filas por envío agrupadas bajo un título de gestión, cuenta en envíos. Contra: no reduce preguntas.
   - **Recomendación: A.**
3. **D3 — Acciones masivas por bloque e implementación.**
   - Conjunto: A) solo «Sí/No se enviaron» en «¿Lo enviaste?» (y «Vencidos»), en la ficha; B) además resultado masivo entre gestiones; C) además descartar «Por revisar» en masa. B rompe «¿Cómo sigue?» por gestión (2B); C clasifica sin leer.
   - Implementación: i) en el cliente, llamadas en secuencia a `outcome` (sin contrato nuevo, mismos controles del servidor por ítem); ii) acción nueva `outcome_bulk` con una transacción por ítem y resultado por ítem (un solo pedido, pero contrato y tests nuevos).
   - **Recomendación: A con i.** Seleccionados sin marcar al inicio, confirmación con la lista y los bloqueos.
4. **D4 — Tira en el celular (390 px).**
   - Opción A: mismo lugar, una línea («N pendientes» + «Revisar»), sin desglose. Pro: igual que en la computadora, no tapa nada. Contra: el desglose queda para desplegada.
   - Opción B: barra fija abajo. Contra: tapa el pie de la conversación y el compositor.
   - Opción C: dentro del encabezado de «Conversación». Contra: mezcla dos cosas y el encabezado ya está lleno.
   - **Recomendación: A.**
5. **D5 — «Para retomar».**
   - Opción A: por defecto «Todos» y «Hasta» vacío, orden por fecha. Pro: la gestión recién cerrada aparece; lo próximo sigue primero. Contra: lista más larga.
   - Opción B: solo «Todos», con «Hasta = hoy». Contra: no arregla el caso (la fecha suele ser futura).
   - Opción C: dejar los filtros y avisar al cerrar «Lo vas a ver en Para retomar el {fecha}». Contra: el vendedor sigue sin encontrarla hoy.
   - **Recomendación: A.**
6. **D6 — «Próximas acciones».**
   - Opción A: abierta por defecto, plegable. Pro: lo pedido, un cambio de una línea. Contra: Hoy más largo (ya paginado de a 25).
   - Opción B: abierta solo si no hay vencidas ni para hoy. Contra: cambia según el día; confunde.
   - Opción C: recordar la elección por usuario. Contra: estado extra para un problema simple.
   - **Recomendación: A.**
7. **D7 — «No preguntar lo confirmado» en WhatsApp.**
   - Opción A: espera de 5 minutos para aperturas de WhatsApp antes de contarlas (como los 15 de Instagram), listadas sin contar y contestables. Pro: el script (obligatorio en la computadora) confirma antes y la pregunta nunca aparece. Contra: en el celular la pregunta llega 5 minutos tarde.
   - Opción B: sin espera (como hoy). Contra: pregunta por algo que el script va a confirmar en segundos.
   - Opción C: espera solo si el token del vendedor está conectado. Contra: el servidor no sabe desde qué dispositivo se abrió; más lógica.
   - **Recomendación: A.**
8. **D8 — Forma final de Hoy.**
   - Opción A: tarjeta «Pendientes de contacto» con «¿Lo enviaste?», «Anotá cómo salió» (por gestión) y «Vencidos»; mosaico «Pendientes de contacto» = sin confirmar + grupos. Pro: mismas palabras y números que la tira. Contra: cambia un nombre conocido.
   - Opción B: dos tarjetas y dos mosaicos separados. Contra: más espacio y otro número que conciliar.
   - Opción C: dejar la forma transitoria. Contra: el encabezado «Anotá cómo salió» miente cuando solo hay envíos sin confirmar.
   - **Recomendación: A.**

## 15. Orden de implementación (PRs a `staging`)

Cada bloque con typecheck, `npm test`, build y sus integraciones en verde; CI verde en el SHA del PR.

1. **Servidor: vencimiento, grupos y espera** (secciones 6, 7 y 9; `pendingContactFollowUps`, tipos, constantes, conflicto de `outcome`). Integraciones `test-work.ts`, `test-userscript.ts`, `test-communication.ts`, `test-instagram-open-chat.ts`. La UI actual sigue funcionando (lee `unconfirmed`/`outcomes`).
2. **Tira en la ficha** (sección 5 y entrada compacta) con grupos de resultado y «Vencidos», sin masivo. E2E con el helper `openRequiresAction`.
3. **Acción masiva** (sección 8).
4. **Hoy y toast** (4.2, 5.4, toast).
5. **Para retomar y Próximas acciones** (4.3, 4.4): independiente, puede ir en paralelo con 1–4.

## 16. Aceptación

- En Cheroga (o un negocio de prueba equivalente) con 4 aperturas, 3 contactos sin resultado en 2 gestiones y 1 recibido por revisar, la solapa Comunicación muestra una línea «7 pendientes · Revisar» (1 + 4 + 2) y la conversación a la vista sin desplazar, también a 390 px.
- «Revisar» despliega los bloques en orden; «Anotá cómo salió · 2» tiene una fila por gestión y un resultado anotado resuelve todos los envíos de esa gestión.
- Una apertura de hace 4 días y una gestión con su último envío de hace 8 días no cuentan y están en «Vencidos», contestables; no cambió ningún estado en la base.
- Una apertura de WhatsApp confirmada por el script en el primer minuto nunca aparece como «¿Lo enviaste?».
- «Sí, se enviaron» sobre 3 aperturas, una con restricción de canal: el diálogo lista 2 a marcar y 1 bloqueada con su motivo; se marcan 2, el resultado se informa por ítem, nada se reintenta solo.
- Hoy muestra «Pendientes de contacto» con el mismo número que la tira de ese negocio (sin «Por revisar»); el toast cuenta lo mismo y abre la tira desplegada.
- «Para retomar» muestra una gestión recién cerrada con fecha a 30 días sin tocar filtros; «Próximas acciones» aparece abierta.
- `npm run typecheck`, `npm test`, `npm run build`, las integraciones listadas y `npm run test:browser` en verde; CI verde en el SHA de cada PR.

## 17. Migraciones y datos

Ninguna migración. Todo lo nuevo es cálculo de lectura (vencimiento, grupos, espera) o usa escrituras existentes (`outcome`, editor de trabajo). Lo histórico se agrupa y vence solo al leer; no hay backfill ni escritura en producción.
