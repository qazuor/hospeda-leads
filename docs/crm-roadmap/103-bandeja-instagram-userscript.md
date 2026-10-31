# Spec 103 — Bandeja sin asociar, Instagram y user script

Estado: **borrador para revisión del propietario** (31/10/2026). Origen: smoke en producción del 30/10/2026, hallazgos 16 a 21. Tipo: tres correcciones de bugs **implementables sin decisiones del propietario** (19 en el servidor, 18 en Configuración, 20 en el script), un paquete de bugs de la pantalla «Mensajes sin asociar» (16, **sin decisión**), un diagnóstico para las insignias de Instagram (17, **sin decisión**) y tres cambios de producto (rediseño de «Sin asociar», nombres para las insignias de Instagram y el destino de «Contactar» por WhatsApp, **dependen de las decisiones de la sección 12**). Migración: **ninguna** con las recomendaciones; solo la opción 2 de D3 pediría una (`058_*` o el siguiente número libre al implementar: la `056` y la `057` quedan reservadas en forma condicional por las specs 101 y 102).

Parte de la [spec 83](83-registro-automatico-canales.md) (registro automático, «Emails sin asociar»), la [spec 88](88-instagram-direct-webhooks.md) (webhook de Instagram, token cifrado con `INTEGRATION_SECRETS_KEY`, D2: respuestas de Hospeda sin negocio en «Sin asociar»), la [spec 86](86-userscript-chat-badges.md) (insignias de WhatsApp), la [spec 96](96-contact-three-clicks.md) (barrera del script en la computadora), la [spec 97](97-instagram-chat-panel.md) (panel e insignias de Instagram) y la [spec 98](98-sales-material-script-panels.md). Respeta `AGENTS.md` (permisos del servidor en todo camino de escritura; asociar un mensaje no es evidencia de contacto, respuesta ni nada más que la asociación; nunca mandar mensajes reales desde pruebas; secretos nunca en logs ni en pantalla; migraciones inmutables; loading y bloqueo de doble envío; conservar lo elegido ante un error) y `docs/decisiones.md` (línea 231: D2 de la 88; línea 245: un negocio no visible no se nombra; línea 294: `unmatched` queda en administración; línea 346: la elección del destino vive en un helper del cliente por puntero grueso; líneas 378-379 y 393: el script en la última versión es obligatorio en la computadora; línea 396: insignias de Instagram solo para chats aprendidos; línea 380: **siempre el camino más simple para el vendedor**).

## 1. Problema

Hallazgos del smoke, en palabras del propietario:

1. **(16)** La pantalla «Sin asociar» necesita una mejora grande de UI/UX.
2. **(17)** No se ven las etiquetas (insignias) en la lista de chats de Instagram.
3. **(18, bug)** Configuración → Instagram dice «Falta INTEGRATION_SECRETS_KEY» cuando la clave está cargada pero tiene mal formato.
4. **(19, bug)** Panel de WhatsApp (script): dice «Responsable: Sin asignar» cuando en el CRM el responsable es Leandro, y muestra la clave interna `main:contacted` en lugar de «Contactado».
5. **(20, bug)** El panel de Instagram quedó desactualizado hasta recargar la página.
6. **(21)** «Contactar» por WhatsApp pasa por la página intermedia `api.whatsapp.com`.

## 2. Objetivos y no objetivos

### Objetivos

1. El panel de WhatsApp muestra el responsable, «No contactar» y la etapa igual que el CRM, **sin publicar una versión nueva del script** (bloque 1).
2. Configuración distingue «falta la clave», «la clave no es válida» y «la clave no abre el token guardado», sin mostrar nunca la clave ni nada derivado de sus bytes (bloque 2).
3. En «Sin asociar», un admin asocia un mensaje con **un clic** cuando el CRM puede sugerir el negocio, y con una búsqueda clara cuando no; nunca asocia un mensaje con el negocio elegido para otro (bloques 3 y 5).
4. El panel de Instagram muestra datos actuales al cambiar de chat y al volver a la pestaña, sin recargar (bloque 4).
5. Si las insignias de Instagram no aparecen, el panel dice por qué (bloque 4); con D6, aparecen también en chats que el vendedor no abrió con el panel (bloque 7).
6. Desde la computadora, «Contactar» por WhatsApp abre el chat con el texto, sin la página intermedia (bloque 8, D7).

### No objetivos

- Que los vendedores vean «Sin asociar»: sigue siendo de administración (decisión de la línea 294).
- Registrar como respuesta, clasificar o confirmar nada al asociar: el mensaje asociado queda «Por revisar» (`pending_review`), como hoy. Las respuestas de Hospeda (ecos) se siguen moviendo como enviados, igual que hoy (`inbound.ts:21`).
- Mandar mensajes por la API de Meta o desde el script (el script sigue sin enviar nada).
- Insignias de Instagram por nombre del negocio (D6 la descarta).
- Escribir en producción. Ningún bloque toca filas existentes por su cuenta: los mensajes sin asociar se asocian a mano o con «Volver a buscar» (D5) apretado por un admin después del deploy.
- Trabajo solo de accesibilidad (diferido por el propietario).

## 3. Hallazgos

Verificado en `origin/staging` el 31/10/2026 (rama `docs/spec-103-inbox-instagram-userscript`, `00d6485`). Las líneas citadas son de esta rama.

### 3.1 Panel de WhatsApp: responsable, «No contactar» y etapa (hallazgo 19, bug)

**Causa del «Sin asignar» (confirmada en el código).** `GET /_api/userscript/context` con `code` o `phone` lee los negocios con SQL crudo **sin alias**: `SELECT … a.assigned_user_email, a.do_not_contact, a.archived_at, u.display_name AS owner_name …` (`src/endpoints/userscript.ts:51`, ramas de código y de teléfono). La base usa `CamelCasePlugin` (`src/helpers/db.tsx:10-25`), que también renombra las columnas de las consultas crudas: la fila llega con `ownerName`, `doNotContact` y `archivedAt`. Pero el armado de la respuesta lee las claves en snake_case (`userscript.ts:53`: `assignedUserName:a.owner_name`, `doNotContact:a.do_not_contact`, `archived:!!a.archived_at`), que son `undefined`. Prueba de que el plugin renombra lo crudo: `assignPOST` hace `SELECT *` crudo y lee `row.channelDetail`, `row.instagramIgsid` e `item.isOutgoing` (`src/endpoints/inbound.ts:21`), y las consultas crudas del mismo archivo que sí funcionan usan alias entre comillas (`"ownerName"`, `"doNotContact"` en `badges`, `userscript.ts:77`). El panel dibuja `Responsable: ${selected.assignedUserName || "Sin asignar"}` (`userscript/src/ui.ts:190`).

**Consecuencia más grave que el hallazgo: «No contactar» tampoco llega.** `doNotContact` queda `undefined` en todos los negocios. El panel de WhatsApp no muestra el aviso «Este negocio pidió no ser contactado. Los mensajes enviados no se van a registrar.» (`ui.ts:20,194`), el lanzador queda en verde en vez de rojo (`ui.ts:116`) y «Mandar un mensaje» / «Enviar material» no se deshabilitan (`ui.ts:213-215`). El servidor igual frena: preparar un modelo revisa las reglas otra vez (spec 84) y un envío registrado bajo restricción se rechaza (`scripts/test-userscript.ts:126`). Pero el vendedor se entera tarde, y un mensaje que escribe a mano en WhatsApp se envía y **no se registra** sin que el panel lo haya advertido. La tarjeta de la lista de chats sí está bien (consulta con alias, `userscript.ts:77`), por eso la lista y el panel se contradicen. El panel de Instagram está bien (alias en `src/helpers/userscriptInstagram.ts:81`). Ninguna prueba mira estos campos de `context` (`test-userscript.ts` solo los mira en `badges`).

**Causa del `main:contacted`.** Las gestiones abiertas viajan con la clave interna de la etapa: `l.estado AS stage` en `context` de WhatsApp (`userscript.ts:53`) y de Instagram (`userscriptInstagram.ts:115`), y `stage:lead.estado` en los modelos de los dos paneles (`src/helpers/userscriptWhatsappTemplates.ts:52,70`; `src/helpers/userscriptInstagramTemplates.ts:30,35`). El script la muestra tal cual: caja «Gestión abierta» (`ui.ts:193`) y selector «Sobre» del borrador de WhatsApp e Instagram (`userscript/src/compose.ts:122`, `userscript/src/instagramApp/compose.ts:105`). El CRM ya tiene el traductor: `stageLabel` (`src/helpers/crmLabels.ts:12`), que la tarjeta de la lista sí usa (`userscript.ts:77`). En el script, `stage` solo se usa para mostrar (búsqueda en `userscript/src`).

**Propuesto.** Bloque 1, solo servidor (sección 5).

### 3.2 «Falta INTEGRATION_SECRETS_KEY» con la clave cargada (hallazgo 18, bug)

**Actual.**
- `encryptionKey` (`src/helpers/instagram.ts:16`) devuelve `null` tanto si la variable falta como si, decodificada como base64, no da 32 bytes. Nadie distingue los dos casos.
- `GET /_api/integrations/instagram` responde solo `enabled:!!encryptionKey(…)` (`src/endpoints/inboundInstagram.ts:29`) y la pantalla, con `enabled:false`, dice siempre «Falta INTEGRATION_SECRETS_KEY; la integración de perfiles está desactivada.» (`src/components/InstagramIntegration.tsx:9`).
- La insignia dice «Conectado» si hay una fila de token (`configured:!!row`), aunque la clave no sirva o el token esté vencido: con la clave inválida, la pantalla muestra a la vez «Conectado» y el aviso.
- Hay un tercer caso que hoy no se ve: una clave válida **distinta** de la que cifró el token (se rotó). El webhook no puede descifrar (`inboundInstagram.ts:19`, «Instagram token unavailable») y la renovación diaria lo anota como «No se pudo renovar el token de Instagram» (`:31`), que lleva a buscar el problema en Meta.
- Qué da 32 bytes y qué no (probado con `Buffer.from(valor,'base64')`, el mismo cálculo): una clave en **hexadecimal** de 64 caracteres (`openssl rand -hex 32`) da 48 bytes → inválida; base64 entre comillas y base64url dan 32 → **válidas** (Node ignora los caracteres que no son base64). La documentación dice lo contrario sobre las comillas (`docs/COOLIFY_DEPLOY.md:59,254`, `docs/runbook-promocion-produccion.md:74`).
- Efecto en «Sin asociar»: con la clave inválida el webhook no puede pedir el usuario a Meta y guarda los mensajes **sin asociar y con el IGSID numérico como remitente** (`inboundInstagram.ts:19-20`, `address=profile.username?'@'+…:item.igsid`). Es probable que parte de lo que el propietario vio en «Sin asociar» venga de acá (sección 3.3 y D5).

**Propuesto.** Bloque 2, sin decisiones (sección 6). **No se endurece la regla de aceptación**: una clave que hoy funciona en producción tiene que seguir funcionando.

### 3.3 La pantalla «Mensajes sin asociar» (hallazgo 16)

**Qué hace hoy el admin.** Administración → «Mensajes sin asociar» (`/inbound`, solo admin: `src/main.tsx:91`, `src/pages/inbound.tsx`). Una tarjeta por mensaje (`src/components/InboundUnmatchedPanel.tsx:17`) con nombre o dirección, canal, asunto, fecha y 500 caracteres. Para asociar: escribir al menos dos letras en «Buscar negocio», elegir en un `<select>` que muestra solo el nombre, opcionalmente elegir gestión y persona, y «Asociar». El servidor (`inbound.ts:20-21`) lista los 100 más nuevos con `status='unmatched'`; al asociar deja el mensaje «Por revisar» con `match_method='manual'` y, en Instagram, mueve **todo el chat** (todos los sin asociar del mismo IGSID; los ecos pasan a enviados).

**Bugs (sin decisión).**
1. **Estado compartido entre tarjetas.** La búsqueda, el negocio, la gestión y la persona elegidos son un solo estado para toda la página (`InboundUnmatchedPanel.tsx:12`). Escribir en una tarjeta muestra los resultados en todas; elegir un negocio en la tarjeta A habilita «Asociar» en la tarjeta B **con el negocio de A**. Es un camino directo a asociar un mensaje con el negocio equivocado. El error y el «Asociando…» también aparecen en todas.
2. **Gestiones cerradas en el selector.** «Gestión abierta (opcional)» lista todas las no borradas (`:17`, filtra solo `deletedAt`); el servidor rechaza una cerrada con «La gestión debe estar abierta.» (`inbound.ts:21`).
3. **Negocio fusionado.** El servidor acepta un negocio con `merged_into_id` (solo mira `deletedAt`, `inbound.ts:21`).
4. **Negocios homónimos.** El selector muestra solo `nombre` (`:17`): dos «Cabañas del Río» no se distinguen. Falta código y ciudad.
5. **Sin confirmación.** Al asociar, la tarjeta desaparece sin aviso; si era un chat de Instagram, no dice que se movieron varios mensajes (el servidor ya devuelve `associatedChat`).

**Fricción (producto).**
- **Nada se sugiere.** El CRM ya tiene pistas que no usa: el `@usuario` de Instagram contra `perfil_instagram`, el email contra los de negocios y personas (un email llega sin asociar cuando el remitente no pasó la verificación o coincide con varios negocios, `src/helpers/inboundEmail.ts:13-15`), el dominio del remitente contra el email o el sitio del negocio, y el nombre visible contra el nombre del negocio o de la persona.
- **Un chat de Instagram son N tarjetas** (una por mensaje, más los ecos), aunque asociar una mueve todas.
- **No se puede descartar.** `inbound_dismiss` exige un negocio (`src/helpers/communicationService.ts:559-560`): el spam y los avisos automáticos quedan para siempre. El esquema ya admite `dismissed` sin negocio (`migrations/042_userscript_auto_register.sql:11`; `account_id` es nulo, `037_inbound_messages.sql:6`).
- **Se repite.** Asociar no guarda la dirección: el próximo email del mismo remitente o el próximo mensaje del mismo `@usuario` llega otra vez sin asociar, porque el webhook asocia por `perfil_instagram` (`inboundInstagram.ts:20`) y el email por el remitente verificado (`inboundEmail.ts:13`).
- **Mensajes con IGSID.** Los que entraron con la clave inválida (3.2) muestran un número en vez de `@usuario` y no se pueden reconocer a ojo. `crm_instagram_contacts` guarda `username` y `name` por IGSID (`migrations/045_instagram_direct.sql:5`) cuando la consulta a Meta funcionó.
- **Sin filtros ni cantidad.** No hay filtro por canal, ni total, ni un número en la navegación (`src/helpers/appNavigation.ts:27`); el corte de 100 no se avisa.

**Propuesto.** Bloque 3 (bugs, sin decisión), bloques 5 y 6 (D1 a D5). Sección 7.

### 3.4 Panel de Instagram desactualizado (hallazgo 20, bug)

`userscript/src/instagramApp/start.ts` sigue el camino de la página con un sondeo de 500 ms y pide el contexto del negocio por usuario. Tres causas posibles, que el código permite y no se excluyen entre sí:

| # | Hipótesis | Evidencia | Cómo se confirma |
| --- | --- | --- | --- |
| H1 | **El contexto nunca se vuelve a pedir mientras el chat no cambia**, y al volver a un chat se usa el guardado de hasta 60 s | `ensureContext` pide solo si cambió el usuario (`start.ts:140-143`); `loadContext` usa el caché de 60 s (`:42,124-126`); no hay `visibilitychange` en el módulo de Instagram (el de WhatsApp tampoco refresca el contexto: `main.ts:44-48,133`). Si el vendedor cambia algo en el CRM (asocia, crea el negocio con «Buscar o crear», cambia de etapa) y vuelve a la pestaña, el panel sigue igual hasta recargar | Cambiar la etapa en el CRM con el chat abierto y volver |
| H2 | **El panel no se redibuja mientras el foco está en un control del panel** | `render` sale sin dibujar si `isEditing()` (`:66,147`): un `<select>` del panel con foco (elegir entre varios negocios, «Tema») deja el panel congelado, también al pasar a otro chat | Elegir en el selector de negocios y cambiar de chat sin hacer clic en otro lado |
| H3 | **Encabezado viejo justo después de cambiar de chat** | `proveThread` lee el panel de conversación en el momento (`userscript/src/instagram/thread.ts:52-70`); si Instagram todavía muestra el encabezado anterior, la prueba da el usuario anterior con el `threadId` nuevo y se carga ese contexto. Se corrige solo al tick siguiente, salvo que H2 congele el panel. `learn()` vuelve a probar en el mismo DOM (`start.ts:87`), así que también podría guardar el chat nuevo con el usuario anterior | Prueba de unidad con un DOM que cambia el camino antes que el encabezado |

**Propuesto.** Bloque 4 (sección 8): las tres correcciones, sin decisión. Requiere una versión nueva del script (1.7.1).

### 3.5 Insignias en la lista de chats de Instagram (hallazgo 17)

**Cómo funciona (decisión de la línea 396, spec 97 §15).** La lista de Instagram muestra solo el nombre visible. El script marca una fila solo si ese nombre coincide exactamente con **un** chat aprendido; un chat se aprende cuando el vendedor lo abre con el panel, el encabezado prueba el usuario, el usuario tiene un negocio visible y está logueada la cuenta de Hospeda (`start.ts:82-95`). El servidor devuelve solo chats aprendidos con `display_name` (`src/helpers/userscriptInstagramInbox.ts:37-43`; la columna existe desde la migración 054, desplegada el 30/10).

**Causas posibles de «no se ven», de más a menos probable** (no hay registro de producción para elegir):

| # | Causa | Evidencia |
| --- | --- | --- |
| C1 | **Casi no hay chats aprendidos todavía**: desde el deploy del 30/10 solo cuentan los chats que cada vendedor abrió con el panel 1.7.0 y que tienen negocio | Es el diseño de la 97 §15; el smoke fue el mismo día |
| C2 | La cuenta logueada no se reconoce (`loggedInUsername` lee el enlace «Perfil» y la foto, `thread.ts:85-94`) o `INSTAGRAM_ACCOUNT_USERNAME` no coincide: las insignias se quitan sin aviso (`start.ts:116`) | Depende del DOM real de Instagram |
| C3 | El DOM de la lista cambió y `inboxChatRows` no encuentra filas (`userscript/src/instagram/inbox.ts:46-58`: `[role="button"]` con avatar) | Probado solo con fixtures |
| C4 | El nombre del encabezado guardado no es el de la lista (nombre recortado, emoji, nombre vs usuario) | Comparación exacta, `inbox.ts`, `userscriptInstagramInbox.ts:29` |
| C5 | Interruptor apagado o script sin conexión | `start.ts:113-114` |

**Propuesto.** Diagnóstico visible en el panel (bloque 4, sin decisión) para saber cuál es, y nombres desde el webhook (bloque 7, D6) para atacar C1, que es la causa probable y es de diseño, no un bug.

### 3.6 «Contactar» por WhatsApp pasa por `api.whatsapp.com` (hallazgo 21)

**Actual.** Al despachar un WhatsApp, el servidor devuelve `https://wa.me/<dígitos>?text=<mensaje>` (`src/helpers/communicationService.ts:693`). El composer abre una pestaña `about:blank` dentro del clic, le corta el `opener` y después la manda a esa URL (`src/components/MessageComposer.tsx:89,114-118`, y `:62` al recibir la respuesta). En la computadora, `wa.me` redirige a la página intermedia de `api.whatsapp.com` («Continuar al chat» y luego «usar WhatsApp Web»), que termina en `web.whatsapp.com/send?phone=…&text=…`. Es lo observado en el smoke; el detalle de esa página depende de WhatsApp y se confirma en el prototipo (bloque 8, paso 0).

**Qué necesita el script.** Nada en particular: corre en `https://web.whatsapp.com/*` y se engancha al chat que esté abierto, venga de donde venga. Lo que importa es terminar **en WhatsApp Web**: la aplicación de escritorio (`whatsapp://`) no corre el script (`src/content/user-guide.json:1676`), así que ahí no hay panel, ni registro automático, ni la confirmación de 5 minutos de la spec 100 D7. En la computadora el script está garantizado (barrera de la spec 96).

**Restricción conocida de WhatsApp Web** (a confirmar en el prototipo): una sola pestaña activa por sesión; abrir otra muestra «WhatsApp está abierto en otra ventana» con «Usar aquí». Por eso cada `wa.me` en una pestaña nueva, además de la página intermedia, suma una segunda pestaña de WhatsApp Web.

**Precedente.** Instagram resolvió lo mismo con un helper del cliente por puntero grueso (`instagramTarget`, decisión de la línea 346; `isCoarsePointer` en `src/components/InstagramOpenChat.tsx:39`): el servidor devuelve lo validado y el cliente elige el destino. En el celular, `wa.me` abre la aplicación directo y está bien.

**Propuesto.** Bloque 8 (D7). Sección 10.

## 4. Resumen de bloques

| Bloque | Hallazgo | Tipo | ¿Necesita decisión? | Script nuevo | Migración |
| --- | --- | --- | --- | --- | --- |
| 1 | 19 | Bug (servidor) | **No** | No | No |
| 2 | 18 | Bug | **No** | No | No |
| 3 | 16 (bugs) | Bug | **No** | No | No |
| 4 | 20 y 17 (diagnóstico) | Bug | **No** | Sí, 1.7.1 | No |
| 5 | 16 | Producto (UX) | **Sí: D1, D2, D3, D4** | No | No (sí con D3 opción 2) |
| 6 | 16 | Producto | **Sí: D5** | No | No |
| 7 | 17 | Producto | **Sí: D6** | No | No |
| 8 | 21 | Producto | **Sí: D7** | No (sí con D7 opción 3) | No |

Los bloques son independientes. El 5 se apoya en el 3 (lo reemplaza visualmente); si el 5 se aprueba antes, el 3 se hace dentro del 5. El 6 es útil recién con el 2 desplegado y la clave corregida.

## 5. Panel de WhatsApp (bloque 1, sin decisiones)

1. **Alias en `context`.** Las dos consultas de `userscript.ts:51` usan alias entre comillas (`a.do_not_contact AS "doNotContact"`, `a.archived_at AS "archivedAt"`, `a.assigned_user_email AS "assignedUserEmail"`, `u.display_name AS "ownerName"`) y el armado de `:53` lee esas claves, con un tipo de fila explícito en lugar de `sql<any>` (así el compilador avisa la próxima vez).
2. **Etapa legible.** En `context` (WhatsApp e Instagram) y en los modelos de los dos paneles, `stage` pasa a llevar `stageLabel(estado)` y se agrega `stageKey` con la clave. `stage` es solo de presentación en el script (3.1), así que **el arreglo llega a los scripts 1.7.0 instalados sin publicar versión**. `stageKey` queda para usos futuros.
3. **Consistencia.** Con el responsable bien cargado, «Sin asignar» solo aparece cuando el negocio de verdad no tiene responsable. Unificar el texto con la tarjeta de la lista («Sin responsable», `badgeCard.ts:79`) va en el bloque 4 (es copy del script).
4. Revisión del resto de `src/endpoints/userscript*.ts` y `src/helpers/userscript*.ts` buscando el mismo patrón (`sql<any>` + lectura en snake_case); lo que aparezca se corrige en el mismo PR con su prueba.

## 6. Estado de la clave de integraciones (bloque 2, sin decisiones)

**Servidor.**
- `encryptionKeyStatus(value)` en `src/helpers/instagram.ts`, puro: `{status:'missing'}` si falta o está vacía; `{status:'invalid', hint:'hex'|null}` si no da 32 bytes (`hint:'hex'` solo si el valor recortado es `^[0-9a-fA-F]{64}$`); `{status:'ok', key}` si da 32 bytes. `encryptionKey` pasa a usarlo y **acepta exactamente lo mismo que hoy**.
- `GET /_api/integrations/instagram` agrega `keyStatus` (`'missing'|'invalid'|'ok'`), `keyHint` (`'hex'|null`) y `tokenReadable` (`true|false|null`): con clave válida y token guardado, intenta descifrarlo y devuelve solo si se pudo. **Nunca** devuelve la clave, su largo, sus primeros caracteres ni el token. `enabled` se conserva por compatibilidad.
- `integrationPOST` responde 503 con el texto que corresponda (falta / no válida). La renovación diaria escribe en el log «missing» o «invalid» por separado y, si descifrar falla con una clave válida, guarda `last_error` «La clave cambió: el token guardado no se puede leer.» en lugar de «No se pudo renovar…».

**Pantalla (`InstagramIntegration.tsx`).**
- Insignia: «Conectado» solo con clave válida, token legible y sin vencer; «Vencido» si `expiresAt` pasó; «Con problemas» con cualquier otro problema con token guardado; «Sin conexión» sin token.
- Avisos (uno solo, el primero que aplique):
  - Falta: «Falta INTEGRATION_SECRETS_KEY en el servidor. Sin ella no se puede guardar el token ni reconocer los perfiles de Instagram.»
  - No válida: «INTEGRATION_SECRETS_KEY está cargada pero no es válida: tiene que ser base64 de 32 bytes (se genera con `openssl rand -base64 32`).» Con `keyHint:'hex'` se suma: «Parece estar en hexadecimal: generala de nuevo en base64.»
  - No abre el token: «La clave cambió desde que se guardó el token y ya no lo puede leer. Volvé a pegar el token.»
- Docs: corregir `COOLIFY_DEPLOY.md`, `runbook-promocion-produccion.md` y `pendientes.md` (las comillas no invalidan la clave; el mensaje engañoso queda resuelto).

## 7. «Mensajes sin asociar» (bloques 3, 5 y 6)

### 7.1 Bugs (bloque 3, sin decisión)

- Cada tarjeta es un componente con su propio estado (búsqueda, negocio, gestión, persona, envío y error). Asociar en una tarjeta no habilita ni bloquea otra.
- El selector de gestión lista solo las abiertas (misma regla que el servidor: clasificación `open`).
- El servidor rechaza un negocio fusionado («Ese negocio se fusionó con otro. Elegí el negocio que quedó.») además del borrado.
- El selector de negocio muestra «H123 · Nombre · Ciudad».
- Al asociar: toast «Mensaje asociado a H123 · Nombre.» o, en Instagram, «Chat asociado a H123 · Nombre: se movieron N mensajes.» (el servidor ya devuelve `associatedChat`; suma la cantidad).

### 7.2 La pantalla nueva (bloque 5, D1 a D4)

Recomendación D1, opción 1: **una tarjeta por conversación, con el negocio sugerido y «Asociar» de un clic.**

**Cada tarjeta** (de arriba a abajo):
1. Quién: «@usuario» o el email (y el nombre visible). Canal con ícono. «N mensajes · último el 30/10 a las 14:05». Si el remitente es un IGSID sin usuario: «Instagram sin usuario (la clave de integraciones no estaba bien cuando llegó)».
2. El último mensaje (hasta 500 caracteres), con «Ver los N mensajes» que despliega el resto (los ecos como «Respuesta de Hospeda»).
3. **Sugerencia** (si hay): «¿Es de **H123 · Cabañas del Río** (Colón)?» con el motivo en una línea: «El @usuario está cargado en el Instagram del negocio», «El email es de la persona Marta Gómez», «Mismo dominio que el sitio del negocio», «Nombre parecido». Si el email no pasó la verificación del remitente: «El remitente no está verificado: confirmá que sea quien dice antes de asociar.».
4. Botón primario **«Asociar a H123»**. Gestión: la única abierta del negocio; si hay varias o ninguna, «Sin gestión» y un enlace «Elegir gestión» que despliega el selector. Persona: la de la coincidencia, si la hay.
5. «Otro negocio» (o, sin sugerencia, directamente): buscador con «H123 · Nombre · Ciudad», gestión abierta y persona opcionales, «Asociar».
6. «⋯» → «Descartar» (D3).
7. Con D4: casilla bajo el botón (sección 7.4).

**Lista.** Filtro «Canal» (Todos, Email, Instagram); primero las que tienen sugerencia, después por fecha. Encabezado «N conversaciones sin asociar» (y «mostrando las 100 más recientes» si se corta). La entrada de navegación muestra el número (solo admin; se actualiza con el dominio en vivo `communication`).

**Agrupado (D2, opción 1).** Instagram por IGSID (como ya asocia el servidor). Email por remitente: la tarjeta lista los mensajes y todos vienen tildados; se puede destildar uno antes de asociar (para un remitente genérico que escribe por varios negocios). El servidor recibe la lista de ids.

**Sugerencias (servidor, `src/helpers/inboundSuggestions.ts`, puro sobre filas leídas).** Como mucho 3 por tarjeta, en este orden, sin negocios borrados ni fusionados (los archivados se marcan «archivado»):
1. Instagram: usuario (del mensaje o de `crm_instagram_contacts`) igual a `perfil_instagram` normalizado (misma regla que el webhook, `normalizeInstagramUsername`). Si hay varios negocios, se listan todos y no hay botón de un clic.
2. Email: igual al de un negocio o una persona (`lower`), con el aviso si no está verificado.
3. Email: mismo dominio que el email o el sitio del negocio o de una persona, excluyendo proveedores gratuitos (lista fija: gmail, hotmail, outlook, yahoo, live, icloud y los `.com.ar` de esos).
4. Nombre visible contenido en el nombre del negocio o de una persona, o al revés, con `normalizeSearchText` (sin tildes, ñ distinta de n), solo con 4 o más caracteres. Etiqueta «Posible»; nunca un clic sin mirar: el botón dice «Asociar a H123» igual, pero la tarjeta lo muestra como posible.

**Asociar** (servidor, `assignPOST` extendido; contrato aditivo): acepta `ids` (lista del grupo) además de `id`. Mismas reglas y mismo bloqueo por negocio que hoy, en una transacción: todos los mensajes del grupo que sigan `unmatched` pasan a `pending_review` con `match_method='manual'`, cada uno con su `inbound_matched` en el journal. Un id que ya no está sin asociar se informa («Este mensaje ya se asoció o se descartó.») y los demás siguen. **No registra respuesta, no completa tareas, no cambia etapas ni marca contacto.**

**Mensajes con IGSID.** Si la clave y el token están bien (bloque 2), la tarjeta ofrece «Buscar el usuario en Instagram»: el servidor consulta a Meta ese IGSID (mismo helper y tiempos del webhook, `contact` en `inboundInstagram.ts:17`), actualiza `crm_instagram_contacts` y la dirección de los mensajes del chat, y vuelve a calcular la sugerencia. Solo admin; con el token vencido o la clave mal, el botón se deshabilita con el motivo.

### 7.3 Descartar (D3, opción 1)

- «Descartar» pide un motivo de una lista («Spam o publicidad», «Aviso automático», «No es de un negocio», «Otro» con texto) y confirma: «Se descartan N mensajes de {remitente}. No se borran: quedan en «Descartados».».
- Servidor: acción nueva `unmatched_dismiss` (solo admin) que pasa los `unmatched` del grupo a `dismissed`, sin negocio, con el motivo en el journal (`inbound_dismissed`). No toca mensajes ya asociados.
- Filtro «Descartados» en la misma pantalla, con «Volver a sin asociar» (`dismissed` sin negocio → `unmatched`, journal `inbound_restored`). Un descartado con negocio (el «No es una respuesta» de la ficha) no aparece ahí.
- Los descartados sin negocio no cuentan en el número de la navegación ni en ninguna lista de vendedores (ya quedan afuera: no tienen negocio).

### 7.4 Asociar también los próximos (D4, opción 1)

Debajo de «Asociar a H123», una casilla que solo aparece si el dato **no está cargado** en el destino:
- Instagram: «Guardar @usuario como Instagram del negocio, así los próximos mensajes se asocian solos.», si `perfil_instagram` está vacío. Marcada por defecto.
- Email: «Guardar este email en {persona}» si se eligió una persona sin email; si no hay persona, «Guardar este email en el negocio» si el negocio no tiene email. Marcada por defecto solo si el remitente está verificado.
- Nunca pisa un valor cargado (si hay otro Instagram o email, no se ofrece; el admin lo cambia en la ficha). Se escribe en la misma transacción que la asociación, por el mismo camino de edición de negocio y persona (normalización, validación y journal de siempre), como admin. Si la escritura falla, la asociación no se hace y el error queda en la tarjeta con lo elegido intacto.
- Guardar el dato no es evidencia de contacto ni cambia el estado del negocio.

### 7.5 Volver a buscar (bloque 6, D5, opción 1)

Botón en el encabezado: **«Volver a buscar negocios»**. El servidor corre sobre los sin asociar (como mucho 50 por clic, los más nuevos primero) **las mismas reglas automáticas de cuando llegaron**, nada más: Instagram, pedir el usuario a Meta si falta (con token y clave bien) y asociar si `perfil_instagram` coincide con un solo negocio; email, asociar si el remitente verificado coincide con un solo negocio (`chooseInboundMatch`). Lo que asocia queda «Por revisar» con el `match_method` de la regla y el admin como actor en el journal. Resultado: «Se asociaron N; quedan M sin asociar.». Sirve sobre todo para los mensajes que entraron con la clave mal (3.2), una vez corregida. No usa las sugerencias débiles (dominio, nombre). Las consultas a Meta se simulan en las pruebas.

## 8. Script 1.7.1: panel de Instagram al día y diagnóstico de insignias (bloque 4, sin decisiones)

**Panel al día (20).**
1. **Revalidar** (H1). Al entrar a un chat se muestra lo guardado y, si tiene más de 10 s, se pide de nuevo en segundo plano. También se pide de nuevo al volver a la pestaña (`visibilitychange` a visible, como mucho una vez cada 10 s) y después de preparar un borrador o material desde el panel. El caché de 60 s queda solo para no repetir pedidos en el mismo chat.
2. **El foco no congela** (H2). `isEditing()` solo frena el redibujo si el chat no cambió desde el último dibujo; un cambio de chat redibuja siempre (y el control pierde el foco, que es lo esperable).
3. **Encabezado viejo** (H3). Después de un cambio de camino, una prueba de chat vale recién cuando da lo mismo en dos ticks seguidos (500 ms). `learn()` usa la misma prueba estable, así nunca guarda un chat con el usuario del anterior.
4. **WhatsApp igual.** El panel de WhatsApp también pide de nuevo el contexto del chat abierto al volver a la pestaña (`main.ts:133` hoy solo busca actualizaciones). Mismo problema, misma solución, mismo PR.

**Diagnóstico de insignias (17).** En «Ajustes» del panel de Instagram, sección «Insignias», una línea con el estado y, si no hay ninguna, el motivo (el primero que aplique):
- «Apagadas.»
- «Sin conexión con el CRM.»
- «No pudimos confirmar que esta sea la cuenta de Hospeda (@{INSTAGRAM_ACCOUNT_USERNAME}).»
- «No encontramos la lista de chats en esta página.»
- «El CRM todavía no conoce chats con nombre: abrí cada chat una vez con el panel.» (con D6: «…todavía no tiene nombres para tus chats.»)
- Si hay: «{N} chats conocidos · {M} marcados en esta lista.»
Solo números y motivos: ningún nombre, usuario ni texto de chats. Lo mismo, en una línea, en `console.debug` con el prefijo `[Hospeda]`, para que el propietario lo copie.

**Copy.** «Responsable: Sin asignar» pasa a «Sin responsable», como la tarjeta de la lista.

**Publicación.** Versión 1.7.1. La barrera de la spec 96 exige la última versión en la computadora: se publica con el resto del lote y ese día se avisa a los vendedores que fuercen «Buscar actualizaciones» (mismo procedimiento que la 1.7.0). `USERSCRIPT_MIN_VERSION` no cambia.

## 9. Nombres para las insignias de Instagram (bloque 7, D6)

Recomendación D6, opción 1: **sumar como fuente el nombre que Meta ya nos dio por el webhook.**

- `crm_instagram_contacts` guarda `username` y `name` (el nombre del perfil) de cada persona que escribió a Hospeda (`inboundInstagram.ts:17`). Para la lista de Instagram, el nombre visible de una fila es ese mismo nombre del perfil (o el usuario si no tiene). Confirmarlo con el diagnóstico del bloque 4 antes de implementar.
- `instagramInboxThreads` suma, a los chats aprendidos, los usuarios de `crm_instagram_contacts` con `name` (o, sin `name`, el `username`) que tengan un negocio visible, con la misma regla de nombres únicos de la 97 §15 (el conteo de homónimos se hace sobre las dos fuentes juntas, antes de filtrar por visibilidad; un chat aprendido gana sobre el nombre de Meta para el mismo usuario).
- Solo servidor: el script 1.7.0 ya marca lo que la lista trae. Sin migración (la tabla existe; si la consulta por usuario se vuelve lenta, se mide antes de agregar un índice).
- Privacidad: el dato ya está en la base y solo se muestra como la insignia de siempre, a quien puede ver el negocio.

## 10. «Contactar» por WhatsApp sin página intermedia (bloque 8, D7)

**Paso 0, prototipo (30 minutos, sin código en `main`).** En Chrome, Edge y Firefox con el script instalado, confirmar: (a) que `https://web.whatsapp.com/send?phone=<dígitos>&text=<texto>` abre el chat con el texto escrito y sin página intermedia; (b) qué pasa con otra pestaña de WhatsApp Web abierta («Usar aquí»); (c) si `window.open(url,'hospeda-whatsapp')` reusa la pestaña abierta antes por el CRM, también después de cortarle el `opener`; (d) que el script detecta el chat y registra como hoy. El resultado decide entre las opciones 1 y 2 de D7.

Recomendación D7, opción 2 (con la 1 como respaldo si el prototipo falla en (c)):
- Un helper del cliente `whatsappTarget({url, coarse})` (junto a `instagramTarget`): con puntero grueso devuelve el `wa.me` del servidor sin cambios; en la computadora lo convierte en `https://web.whatsapp.com/send?phone=<dígitos>&text=<texto>`. **Sin cambio de contrato** en el servidor.
- `MessageComposer` abre la pestaña con nombre `hospeda-whatsapp` en lugar de `_blank`: el primer «Contactar» la abre y los siguientes la reusan (WhatsApp Web se recarga en esa pestaña con el chat nuevo). Mismo flujo de hoy: la pestaña se abre dentro del clic y un despacho fallido la cierra.
- El toast de «WhatsApp abierto» suma, la primera vez: «Usá esta pestaña de WhatsApp para tus contactos del CRM.».
- Celular sin cambios.

## 11. Permisos y contratos

- «Sin asociar» sigue siendo **solo admin** en el servidor: listar, asociar (`assignPOST`), descartar y restaurar (`unmatched_dismiss`, `unmatched_restore`), «Buscar el usuario en Instagram» y «Volver a buscar negocios». Guardar el Instagram o el email (D4) pasa por las reglas de edición del negocio y la persona como admin.
- Asociar sigue sin mirar «No contactar» (asociar no es contactar) y deja el mensaje «Por revisar»; las acciones posteriores («Registrar respuesta», «Responder») conservan sus controles de siempre.
- Configuración de Instagram: solo admin, como hoy. La respuesta nueva no incluye ningún dato de la clave ni del token.
- Contratos, todos aditivos: `stageKey` (y `stage` con la etiqueta) en `context` y modelos del script; `keyStatus`, `keyHint`, `tokenReadable` en la integración; `ids` en `assignPOST` y la cantidad movida en su respuesta; grupos y sugerencias en `GET /_api/inbound/unmatched` (con `channel` y `dismissed` como filtros); acciones nuevas de descarte, restauración, búsqueda del usuario y «Volver a buscar» (registradas a mano en `src/server/app.ts`); más usuarios en `instagram/threads` (D6).
- Los negocios no visibles no cambian de regla: las sugerencias son para admin (ve todo); la lista de Instagram del vendedor sigue filtrando por visibilidad (`userscriptInstagramInbox.ts:46`).
- Secretos: ninguna respuesta, log, toast ni prueba imprime la clave, el token, sus largos o prefijos.

## 12. Decisiones abiertas

1. **D1 — Forma de «Sin asociar».**
   - **Opción 1:** tarjeta por conversación con sugerencia y «Asociar a H123» de un clic; buscador para el resto (7.2).
     - Pro: el caso común es un clic; el motivo de la sugerencia deja ver por qué; reusa los componentes de siempre.
     - Contra: lógica de sugerencias nueva en el servidor, con sus pruebas.
     - Impacto: `InboundUnmatchedPanel` se reescribe; `unmatchedGET` y `assignPOST` se extienden; sin migración.
   - **Opción 2:** tabla con selección y un panel lateral para asociar (tipo Bandeja).
     - Pro: mucho volumen a la vista.
     - Contra: más clics por mensaje y otra pantalla que aprender; con pocos mensajes por día no compensa.
   - **Opción 3:** solo los arreglos del bloque 3.
     - Pro: mínimo.
     - Contra: no cumple «mejora grande»; sigue sin sugerencias ni descarte.
   - **Recomendación: opción 1** (línea 380: camino más simple).
2. **D2 — Agrupar emails por remitente.**
   - **Opción 1:** una tarjeta por remitente, todos tildados, se puede destildar.
     - Pro: un remitente con cinco emails es un clic; igual que Instagram por chat.
     - Contra: un remitente genérico (una plataforma) mezcla negocios; se resuelve destildando.
   - **Opción 2:** una tarjeta por email (como hoy).
     - Pro: sin riesgo de arrastrar un email ajeno.
     - Contra: repetir lo mismo N veces.
   - **Recomendación: opción 1.**
3. **D3 — Descartar sin negocio.**
   - **Opción 1:** «Descartar» con motivo, visible en «Descartados», reversible (7.3).
     - Pro: limpia la lista sin perder nada; sin migración.
     - Contra: un descarte por error queda escondido hasta que alguien mire «Descartados».
   - **Opción 2:** la opción 1 más «Descartar siempre lo de este remitente» (lista de remitentes ignorados).
     - Pro: el spam recurrente no vuelve.
     - Contra: tabla nueva (migración `058_*` o la siguiente libre); el riesgo de ignorar a un cliente real de por vida.
   - **Opción 3:** sin descarte.
     - Contra: el spam se acumula para siempre.
   - **Recomendación: opción 1.** La 2 se reconsidera si el volumen de spam lo pide.
4. **D4 — Guardar la dirección en el negocio al asociar.**
   - **Opción 1:** casilla, solo si el dato está vacío, marcada por defecto (email: solo si el remitente está verificado); nunca pisa (7.4).
     - Pro: el próximo mensaje se asocia solo; el admin lo ve y lo puede destildar.
     - Contra: un admin apurado puede guardar un Instagram que no es del negocio (queda en el journal y se corrige en la ficha).
   - **Opción 2:** no guardar nada (como hoy).
     - Contra: el mismo remitente vuelve a «Sin asociar» cada vez.
   - **Opción 3:** guardar siempre, sin casilla.
     - Contra: escritura en el negocio sin que el admin la vea.
   - **Recomendación: opción 1.**
5. **D5 — Asociación en masa.**
   - **Opción 1:** «Volver a buscar negocios»: las reglas automáticas de siempre, otra vez, sobre los sin asociar (7.5).
     - Pro: resuelve en un clic lo que entró mal por la clave; no agrega criterio nuevo; nada se asocia por una sugerencia débil.
     - Contra: consultas a Meta (límite de 50 por clic).
   - **Opción 2:** seleccionar tarjetas con sugerencia exacta y «Asociar sugeridos (N)», con paso de confirmación y ejecución por ítem (como la spec 100 D3).
     - Pro: masivo de verdad sobre lo que el admin ve.
     - Contra: más interfaz; con un clic por tarjeta ya es rápido.
   - **Opción 3:** nada masivo.
   - **Recomendación: opción 1.** La 2 queda como seguimiento si después del bloque 6 sigue habiendo volumen.
6. **D6 — De dónde salen los nombres para las insignias de Instagram.**
   - **Opción 1:** también del nombre de perfil que Meta dio por el webhook (`crm_instagram_contacts`), con la regla de nombres únicos (sección 9).
     - Pro: insignias en los chats de todos los que escribieron, sin abrirlos uno por uno; solo servidor, llega al script 1.7.0.
     - Contra: depende de que el nombre de Meta sea el que muestra la lista (se confirma con el diagnóstico); amplía la decisión de la línea 396 («solo chats aprendidos»).
   - **Opción 2:** solo chats aprendidos (como hoy), más el diagnóstico.
     - Pro: nada nuevo.
     - Contra: si la causa es C1, las insignias aparecen de a poco, chat por chat.
   - **Opción 3:** comparar el nombre de la fila con el nombre del negocio.
     - Contra: el nombre de una persona no es el de su negocio; falsos positivos. Descartada.
   - **Recomendación: opción 1**, después de ver el diagnóstico en producción.
7. **D7 — Destino de «Contactar» por WhatsApp en la computadora.**
   - **Opción 1:** `web.whatsapp.com/send?phone=…&text=…` en una pestaña nueva cada vez.
     - Pro: sin página intermedia; un cambio chico en el cliente.
     - Contra: una pestaña de WhatsApp Web por contacto, con «Usar aquí» si hay otra abierta.
   - **Opción 2:** lo mismo, en una pestaña con nombre que el CRM reusa (sección 10).
     - Pro: sin página intermedia y una sola pestaña de WhatsApp para el CRM.
     - Contra: WhatsApp Web se recarga en cada contacto (unos segundos); depende de que el navegador reuse la pestaña (paso 0); si el vendedor tiene su propia pestaña de WhatsApp Web abierta, la primera vez aparece «Usar aquí».
   - **Opción 3:** traspaso al script: el CRM deja `{teléfono, texto}` con un nonce de un solo uso (como Instagram, spec 94 D6) y la pestaña de WhatsApp Web que ya tiene el vendedor se navega sola al chat.
     - Pro: usa la pestaña de siempre, sin «Usar aquí».
     - Contra: el navegador no deja traer esa pestaña al frente (el vendedor la busca a mano); traspaso nuevo con su análisis de seguridad; versión nueva del script; sin pestaña abierta hace falta la opción 1 igual.
   - **Opción 4:** `whatsapp://` (aplicación de escritorio).
     - Contra: el script no corre ahí: sin panel, sin registro automático, sin la confirmación de la spec 100 D7. Descartada.
   - **Opción 5:** dejar `wa.me`.
     - Contra: la página intermedia y una segunda pestaña.
   - **Recomendación: opción 2** si el paso 0 la confirma; si no, opción 1.

## 13. Componentes y funciones

| Pieza | Archivo | Cambio | Bloque |
| --- | --- | --- | --- |
| Contexto WhatsApp | `src/endpoints/userscript.ts:51,53` | alias, tipo de fila, `stage` con etiqueta y `stageKey` | 1 |
| Etapa en Instagram y modelos | `src/helpers/userscriptInstagram.ts:115`, `userscriptWhatsappTemplates.ts:70`, `userscriptInstagramTemplates.ts:35` | `stageLabel` y `stageKey` | 1 |
| Estado de la clave | `src/helpers/instagram.ts:16` | `encryptionKeyStatus` puro; `encryptionKey` igual | 2 |
| Integración | `src/endpoints/inboundInstagram.ts:29-31` | `keyStatus`, `keyHint`, `tokenReadable`; textos y logs separados | 2 |
| Pantalla de integración | `src/components/InstagramIntegration.tsx:8-9` | insignia y avisos | 2 |
| Tarjeta sin asociar | `src/components/InboundUnmatchedPanel.tsx` → `InboundUnmatchedCard.tsx` (nuevo) | estado por tarjeta, gestiones abiertas, código y ciudad, toast | 3 |
| Asociar | `src/endpoints/inbound.ts:21` | rechaza fusionados; `ids`; cantidad movida; D4 | 3, 5 |
| Listado agrupado | `src/endpoints/inbound.ts:20`, `src/helpers/inboundSuggestions.ts` (nuevo, puro) | grupos, sugerencias, filtros, total | 5 |
| Descartar y restaurar | `src/endpoints/inbound.ts`, `src/server/app.ts` | `unmatched_dismiss`, `unmatched_restore` | 5 |
| Número en navegación | `src/helpers/appNavigation.ts:27`, `AppLayout.tsx` | conteo solo admin | 5 |
| Usuario de un IGSID y «Volver a buscar» | `src/endpoints/inboundInstagram.ts:17`, `src/helpers/inboundEmail.ts`, `src/endpoints/inbound.ts` | reusar `contact` y `chooseInboundMatch` | 5, 6 |
| Panel de Instagram | `userscript/src/instagramApp/start.ts:42,66,82-95,124-147,236` | revalidar, foco, prueba estable | 4 |
| Panel de WhatsApp | `userscript/src/main.ts:44-48,133`, `userscript/src/ui.ts:190` | revalidar al volver; «Sin responsable» | 4 |
| Diagnóstico de insignias | `userscript/src/instagramApp/panel.ts` (Ajustes), `start.ts:110-121` | estado y motivo | 4 |
| Nombres de Meta | `src/helpers/userscriptInstagramInbox.ts:37-63` | segunda fuente con la regla de únicos | 7 |
| Destino de WhatsApp | `src/components/InstagramOpenChat.tsx` (o helper nuevo), `MessageComposer.tsx:62,89,114-118` | `whatsappTarget`, pestaña con nombre | 8 |

## 14. Plan de tests

Regresión primero: cada bloque arranca con una prueba que reproduce el caso del smoke y falla.

| Tema | Unit (`*.spec.ts(x)`) | Integración (`scripts/test-*.ts`) | E2E (`tests/browser/*.e2e.ts`) |
| --- | --- | --- | --- |
| 19 | `ui.spec`/`userscript.spec.ts`: con `assignedUserName` y `doNotContact:true` el panel muestra el responsable, el aviso y los botones deshabilitados (fija el contrato del lado del script) | `test-userscript.ts`: `context?phone=` y `?code=` de un negocio con responsable devuelven `assignedUserName` = su nombre (hoy `undefined`: falla), `doNotContact:true` con No contactar, `archived:true` archivado; `leads[].stage` = «Contactado» y `stageKey` = `main:contacted`; igual en `context?instagram=` y en los modelos de los dos paneles | — |
| 18 | `instagram.spec.ts`: `encryptionKeyStatus` falta, vacía, hex de 64 (con `hint:'hex'`), largo incorrecto, base64 válida, entre comillas (válida, como hoy), base64url (válida). `InstagramIntegration.spec.tsx`: cada aviso y cada insignia; ninguno contiene la clave | `test-instagram.ts`: `GET` con clave inválida → `keyStatus:'invalid'`, con otra clave válida → `tokenReadable:false`; el cuerpo no contiene la clave ni el token; la renovación con clave cambiada guarda el texto nuevo | — |
| 16 bugs | `InboundUnmatchedPanel.spec.tsx`: dos tarjetas, buscar y elegir en una no habilita «Asociar» en la otra (hoy sí: falla); gestión cerrada fuera del selector; código y ciudad; toast con cantidad | `test-inbound-email-ui.ts` o `test-inbox.ts`: asociar a un negocio fusionado → 400 | `inbound-unmatched.e2e.ts` (nuevo): asociar en la segunda tarjeta asocia ese mensaje con ese negocio |
| 16 pantalla | `inboundSuggestions.spec.ts`: Instagram exacto, varios negocios sin un clic, email exacto no verificado con aviso, dominio excluyendo proveedores gratuitos, nombre con tildes iguales y ñ distinta, menos de 4 letras sin sugerencia, sin borrados ni fusionados, máximo 3. Tarjeta: un clic, «Elegir gestión», destildar un email, «Descartar» con motivo, casilla D4 solo con el dato vacío | `test-inbound-email-ui.ts`/`test-instagram.ts`: listado agrupado y total; `ids` asocia solo los sin asociar e informa el resto; journal por mensaje; vendedor → 403 en todo; descartar sin negocio y restaurar; D4 guarda el Instagram vacío, no pisa uno cargado, y una falla de escritura no asocia; ningún mensaje asociado queda distinto de `pending_review` (ni respuesta, ni tarea, ni etapa) | `inbound-unmatched.e2e.ts`: un email con persona coincidente se asocia con un clic y aparece «Por revisar» en la ficha; descartar y restaurar |
| 16 masivo | — | `test-instagram.ts`: «Volver a buscar» con el fetch de Meta simulado asocia un IGSID cuyo usuario coincide con un negocio, deja uno ambiguo, respeta el límite de 50; email verificado único se asocia, no verificado no | — |
| 20 | `start.spec.ts`: volver a la pestaña pide el contexto otra vez; volver a un chat con caché de más de 10 s lo revalida; con foco en el selector, cambiar de chat redibuja (hoy no: falla); un encabezado viejo tras el cambio de camino no carga ni aprende el usuario anterior. WhatsApp: `visibilitychange` revalida el chat abierto | — | — |
| 17 diag. | `panel.spec.ts`: cada motivo y el conteo; sin nombres ni usuarios en el texto | — | — |
| 17 nombres | `userscriptInstagramInbox` (unit con filas): nombres de Meta, homónimo entre fuentes no marca, aprendido gana, negocio oculto no aparece | `test-userscript.ts`: `instagram/threads` devuelve el usuario con nombre de Meta para el vendedor que ve el negocio y no para otro | — |
| 21 | `whatsappTarget.spec.ts`: puntero grueso → `wa.me` igual; fino → `web.whatsapp.com/send` con el número y el texto codificado (tildes, saltos, `&`). `MessageComposer.spec.tsx`: `window.open` con `hospeda-whatsapp` dentro del clic; un despacho fallido la cierra | — | `whatsapp-contact.e2e.ts` (o el existente de contacto): `window.open` interceptado recibe `web.whatsapp.com/send…`; **ninguna prueba abre WhatsApp real** |

Suite de navegador completa antes del merge de cada bloque con UI (`npm run build && npm start`, luego `npm run test:browser`; unos 10 minutos). Las consultas a Meta y a Brevo se simulan siempre; ninguna prueba manda un mensaje real.

## 15. Riesgos

- **Bloque 1 cambia lo que ven los vendedores sin tocar el script:** desde el deploy, el panel de WhatsApp deshabilita «Mandar un mensaje» en los negocios con No contactar (antes no lo hacía). Es lo correcto; avisarlo a los vendedores.
- **Sugerencias débiles** (dominio, nombre) pueden apuntar mal: se muestran como «Posible», con el motivo, y nunca se usan en «Volver a buscar».
- **D4 escribe en el negocio:** acotado a datos vacíos, con casilla visible, journal y la validación de siempre.
- **Script 1.7.1:** la barrera obliga a todos a actualizar el mismo día; mismo procedimiento que la 1.7.0.
- **DOM de Instagram y WhatsApp Web:** el diagnóstico y el prototipo existen justamente porque no se puede verificar desde el código.
- **`web.whatsapp.com/send` no está documentado como API pública** (sí `wa.me`). Si WhatsApp lo cambia, el respaldo es volver a `wa.me` desde el helper (un cambio de una línea).
- **D6** depende de que el nombre de Meta coincida con el de la lista; el diagnóstico lo confirma antes.

## 16. Orden de implementación (PRs a `staging`)

Cada bloque con typecheck, `npm test`, build y sus integraciones en verde, y CI verde en el SHA del PR. Los bloques son independientes.

1. **Bloque 1, hallazgo 19 (sin decisiones, solo servidor):** el de más valor (también arregla No contactar en el panel). Regresión en `test-userscript.ts` primero.
2. **Bloque 2, hallazgo 18 (sin decisiones).**
3. **Bloque 3, bugs de «Sin asociar» (sin decisiones).** Si D1 se aprueba antes de empezarlo, va dentro del bloque 5.
4. **Bloque 4, script 1.7.1 (sin decisiones):** panel de Instagram al día, revalidar en WhatsApp, diagnóstico de insignias, «Sin responsable».
5. **Bloque 5, «Sin asociar» nueva (espera D1, D2, D3, D4).**
6. **Bloque 6, «Volver a buscar negocios» (espera D5).** Útil con el bloque 2 desplegado y la clave corregida.
7. **Bloque 7, nombres de Meta para las insignias (espera D6 y el diagnóstico del bloque 4 en producción).**
8. **Bloque 8, destino de WhatsApp (espera D7 y el paso 0).**

## 17. Aceptación

- En el panel de WhatsApp de un negocio cuyo responsable es Leandro dice «Responsable: Leandro»; un negocio con No contactar muestra el aviso y deshabilita los botones; las gestiones dicen «Contactado», no `main:contacted`; todo con el script 1.7.0 instalado.
- Con `INTEGRATION_SECRETS_KEY` en hexadecimal, Configuración dice que no es válida y sugiere base64; sin la variable, que falta; con otra clave válida, que no puede leer el token. Ninguna pantalla, respuesta ni log muestra la clave.
- En «Sin asociar», elegir un negocio en una tarjeta nunca afecta a otra; no se ofrecen gestiones cerradas.
- (Con D1–D4) Un email de una persona cargada se asocia con un clic desde su sugerencia; un chat de Instagram es una sola tarjeta; un spam se descarta con motivo y se puede restaurar; con la casilla, el próximo mensaje del mismo `@usuario` llega asociado solo.
- (Con D5) Corregida la clave, «Volver a buscar negocios» asocia los mensajes de Instagram que entraron con IGSID y cuyo usuario está en un solo negocio.
- Con el script 1.7.1, el panel de Instagram muestra el cambio de etapa hecho en el CRM al volver a la pestaña, y el negocio correcto al cambiar de chat, sin recargar; «Ajustes» explica por qué no hay insignias si no las hay.
- (Con D6) Los chats de personas que escribieron por el webhook y tienen negocio muestran insignia sin haberlos abierto.
- (Con D7) En la computadora, «Contactar» por WhatsApp abre el chat con el texto escrito, sin `api.whatsapp.com`; en el celular sigue abriendo la aplicación.
- `npm run typecheck`, `npm test`, `npm run build`, las integraciones listadas y `npm run test:browser` en verde; CI verde en el SHA de cada PR.

## 18. Migraciones y datos

- Con las recomendaciones, **ninguna migración**: `dismissed` sin negocio ya lo admite el esquema (`042_userscript_auto_register.sql:11`), `crm_instagram_contacts` ya existe (`045`) y el resto son lecturas o columnas existentes.
- Solo D3 opción 2 pediría una tabla nueva de remitentes ignorados: `058_*` o el siguiente número libre al implementar (la `056` y la `057` quedan reservadas en forma condicional por las specs 101 y 102). No se edita ninguna migración aplicada.
- Ningún bloque escribe en producción por su cuenta. Asociar, descartar, guardar un Instagram o un email y «Volver a buscar» son acciones de un admin desde la pantalla, después del deploy, cada una con su journal. Corregir `INTEGRATION_SECRETS_KEY` en Coolify (si hiciera falta) es tarea del propietario; si se cambia la clave, hay que volver a pegar el token.
