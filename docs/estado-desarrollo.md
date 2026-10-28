# Estado del CRM — corte al 28 de octubre de 2026

## Spec 94 — pegar el mensaje en Instagram Web con el user script — implementada en `feat/instagram-userscript-94` (sin push ni PR) — 28/10/2026

- **Un solo script (D1):** el «Hospeda CRM» pasa a la 1.4.0 con `@match https://www.instagram.com/*`; `main.ts` elige el módulo por host (`siteFor`). El módulo `userscript/src/instagram/` está aislado: no lee el token ni otros valores de GM (solo la clave del traspaso, vía `HandoffStore`), no hace pedidos y no corre lógica de WhatsApp. Al actualizar, Tampermonkey pide aprobar instagram.com una vez.
- **Traspaso de un solo uso (D6, tras revisión de seguridad):** en la computadora, con el script ≥ 1.4.0 en la página, «Abrir Instagram» y «Copiar y abrir de nuevo» generan un nonce de 128 bits, lo pasan al script por `postMessage` (misma ventana y origen) con usuario, vencimiento de 2 min y hash del texto, y abren `https://www.instagram.com/<usuario>/#hospeda=<nonce>`. En Instagram el script actúa solo si coinciden nonce, vencimiento y perfil, y borra el traspaso antes de actuar. Sin script, el perfil se abre sin marcador, como antes.
- **En Instagram:** busca «Enviar mensaje» / «Message» por nombre accesible, espera el chat (15 s), no pega si ya hay texto, lee el portapapeles y pega solo si coincide con el hash (evento `paste` con `DataTransfer`, respaldo `execCommand('insertText')`). Nunca envía. Si algo falla, aviso en castellano y pegado manual.
- **CRM:** toast según haya traspaso («El script de Hospeda abre el chat y lo pega…» o «Con el user script de Hospeda se pega solo.»), nota en `/userscript`, artículo nuevo de la guía y `guia-de-uso.md` regenerada.
- **Validación local:** `npm run typecheck` (app y userscript), `npx vitest run --maxWorkers=4` (217 archivos, 1752 tests), `npm run build` (incluye el userscript y `verify-userscript-build.mjs`). Playwright contra un servidor propio en el puerto 3024: `guide.e2e.ts` y `command-palette.e2e.ts` en verde, más una prueba local descartable que cargó el script construido en la página del CRM y en un perfil de Instagram simulado (rutas interceptadas, nada salió a instagram.com): pegó con traspaso válido, no envió, ignoró `#hospeda` suelto, nonce ajeno, nonce reusado y otro perfil, y no pegó con el portapapeles cambiado. **No se corrió** `instagram-open-chat.e2e.ts`: escribe la fila `crm_integration_secrets` de la base local, que no había que tocar; queda para CI (se actualizó solo su comentario de URL, que no cambia sin script).

## Spec 93 — email: entrega, aperturas y clicks — implementada en `feat/email-engagement-93` (apilada sobre la 92, sin PR todavía) — 27/10/2026

- **Webhook de Brevo:** la conciliación (`reconcileEvents`) corre solo con un evento terminal nuevo o con eventos huérfanos; aperturas, clicks, spam, `deferred`, `unsubscribed` y repetidos se guardan y no hacen nada más (antes reescribían la actividad en cada evento y volvían a agregar una restricción levantada). La entrega le gana a un `soft_bounce` anterior o del mismo segundo; un rebote permanente posterior sigue ganando. Solo escribe lo que cambia.
- **API:** `GET /_api/communication` devuelve por mensaje `emailEngagement` (`deliveredAt`, `firstOpenedAt`, `openCount`, `firstProxyOpenedAt`, `proxyOpenCount`, `firstClickedAt`, `clickCount`, `clickedLinks`, `spamAt`, `lastEventAt`) con una sola consulta agregada por `outbox_id` (índice existente `crm_email_events_outbox`; sin migración, la 050 queda libre). Los enlaces salen como texto saneado.
- **Pantalla:** en el ítem de email, «Entregado · dd/mm hh:mm», «Abierto · … · ×N», «Posible apertura automática», «Click en un enlace» (enlaces en el tooltip, como texto) y «Marcado como spam» (aviso). Tooltip y leyenda con la nota de aperturas aproximadas; entrada «Email (Brevo)» en «Cómo leer el chat». La Bandeja no cambia.
- **Docs:** pasos de producción del webhook en `COOLIFY_DEPLOY.md`, nota en `desarrollo-local.md`, decisiones y guía de usuario.
- **Validación local:** `npm run typecheck`, `npx vitest run --maxWorkers=4` (215 archivos, 1693 tests), `npm run build`; contra la base local desechable: `test:email-engagement` (nuevo, en CI), `test:communication`, `test:inbound`. Revisión visual en un servidor propio en el puerto 3023 con eventos falsos.

## Spec 92 — abrir el chat de Instagram desde el CRM — implementada en `feat/instagram-open-chat-92` (apilada sobre la 91, sin PR todavía) — 27/10/2026

- **Canal «Instagram» en «Contactar»:** entre «Email · Brevo» y «Llamada»; siempre usa el usuario de Instagram del negocio (una persona elegida queda solo como contexto). Sin usuario válido la opción se deshabilita con el motivo y «Agregar o editar datos de contacto». Desde la Bandeja, «Responder» de un hilo de Instagram abre «Contactar» con Instagram si el remitente es el usuario del negocio y no hay restricción; si no, abre sin preseleccionar y explica por qué.
- **Composer:** texto plano (sin negrita ni cursiva, sin material de venta), avisos de revisión (sesión de Hospeda en Instagram, conexión inactiva, usuario compartido con otro negocio) y botón «Abrir Instagram»: copia el mensaje (copia sincrónica antes de abrir la pestaña) y abre Instagram en el mismo clic: en la computadora el perfil `https://www.instagram.com/<usuario>/`, donde se toca «Enviar mensaje» (`ig.me` no funciona en Instagram Web); en el celular el chat `ig.me/m/<usuario>` con el botón «Ir al chat». Portapapeles denegado → caja con «Copiar»; popup bloqueado → enlace; «Copiar y abrir de nuevo» no toca el servidor.
- **Estados:** `instagram_opened` (migración `049_instagram_opened.sql`, solo amplía el CHECK de `crm_messages.status`). Burbuja punteada con «Esperando que Instagram confirme el envío…» durante 15 minutos; después pasa a «Requiere acción» y a Hoy con «¿Lo enviaste?», igual que WhatsApp. Las respuestas Sí/No están disponibles desde el principio.
- **Envíos sin confirmar fuera de «Conversación» (decisión del propietario, todos los canales):** un WhatsApp o Instagram abierto y sin confirmar (incluida la espera de 15 minutos) vive solo en «Requiere acción», con el texto preparado, «Sí, se envió» / «No se envió» y, en Instagram, «Copiar y abrir de nuevo»; al confirmarse aparece como enviado. «No se envió» solo se ve con «Mostrar anulados». No cuentan para «Nuevo desde tu última visita». El email incierto no cambia. Validado: typecheck, `vitest --maxWorkers=4` (213 archivos, 1678 tests), build, `test:communication`, Playwright en un servidor propio (`instagram-open-chat`, `communication-resources`, `business-contact`, `commercial-history`).
- **Eco de Instagram:** el webhook busca un intento del mismo usuario abierto entre 24 h antes y 10 min después del eco con texto parecido (Dice ≥ 0,5, la misma regla del userscript); el más nuevo gana y uno abierto gana a uno confirmado a mano. Resuelve el mismo registro (`manual_sent`, `external_id` = mid, texto realmente enviado, «Editado antes de enviar» si cambió), completa la tarea y escribe `contact_resolved` como acción automática (`instagram-webhook`). Uno confirmado a mano solo vincula el mid; «No se envió» nunca se reescribe. Un error en ese paso se aísla en un savepoint: el eco se guarda solo y Meta recibe 200. Si el eco llega antes de «Abrir Instagram» (10 min), el intento lo absorbe, el eco queda anulado y el composer dice «Ya está enviado».
- **Permisos:** todos los caminos de escritura (`prepare`, `prepare_general`, `edit`, `dispatch`, `outcome`) aplican No contactar, restricciones `social`/`all`, archivado, gestión cerrada, estado Nuevo y delegación. El webhook resuelve como sistema aunque el dueño haya perdido acceso o haya No contactar (recibir no es contactar) y nunca marca cliente a un negocio con No contactar.
- **Validación local:** typecheck, `vitest --maxWorkers=4` (213 archivos), build; contra la base local desechable: `db:migrate` (049), `test:instagram` (ahora incluye la prueba de la migración y la nueva `scripts/test-instagram-open-chat.ts`), `test:communication`, `test:communication-reads`, `test:inbox`, `test:inbound`. Playwright local contra un servidor propio en 3022: `instagram-open-chat.e2e.ts` (nuevo) más `business-contact`, `communication-resources`, `inbox` y `mantine-contact`. CI define valores falsos de Instagram para el servidor y el paso de browser.

## Spec 91 — segunda pasada de «Comunicación» — implementada en `feat/communication-polish-91` (sin PR todavía) — 27/10/2026

- **Conversación:** burbuja única con la meta afuera (canal, quién, hora); el chip de gestión solo aparece cuando hay una; las acciones secundarias («Ver diseño del email», «Corregir…», «Anular registro») van en un menú «⋯» por ítem; llamadas y respuestas sin mensaje son líneas finas con su nota; textos largos recortados (email ~6 líneas, resto ~12) con «Ver más»/«Ver menos».
- **Filtros:** chips de canal más un selector de gestión (solo con dos valores o más, combinable); «Mostrar anulados» es un interruptor aparte (admin).
- **Barra de acciones:** una sola línea: «Contactar», «Registrar ▾» («Llamada u otro contacto», «Respuesta sin mensaje») y «Enviar material».
- **Navegación:** la conversación es una ventana de chat (marco con encabezado y pie fijos, cuerpo con scroll propio y alto máximo según la pantalla). El cuerpo abre en el último ítem sin mover la página; «Ir al último» fijo dentro del cuerpo; «Ver anteriores» conserva la posición.
- **Requiere acción:** resumen («N mensajes por revisar · N envíos sin confirmar · N contactos sin resultado»); cada mensaje por revisar es un botón que lleva y resalta el ítem (limpia los filtros que lo ocultan); las acciones de revisión viven solo en la burbuja; «¿Lo enviaste?» queda en las dos copias y un clic bloquea ambas.
- **Preparar respuesta:** (distinto del «Responder» por SMTP de cada email) abre «Contactar» con el canal y la persona del último mensaje recibido (email o WhatsApp). El canal propio del negocio solo se preselecciona si el composer usaría exactamente ese dato; si no, abre con el canal y pide elegir. Respeta restricciones de todos los canales. Deshabilitado con No contactar; no aparece en solo lectura.
- **Revisión independiente:** la línea «Nuevo» no se repite al volver a la pestaña (solo cuenta un `lastSeenAt` traído después de montar y el marcado actualiza la caché); los anulados no cuentan como nuevos; arrastrar la barra de desplazamiento cuenta como desplazamiento del usuario; `seen` rechaza por `Content-Length`; burbujas enviadas con tinte azul y línea de respuesta sin hueco.
- **Nuevo desde tu última visita:** migración `048_communication_reads.sql` (`crm_communication_reads`, por usuario y negocio, cascada al borrar usuario o negocio). `GET /_api/communication` devuelve `lastSeenAt`; `POST /_api/communication/seen` exige el mismo acceso de lectura que el GET, guarda `GREATEST(anterior, LEAST(seenAt, now()))` y no escribe journal ni historial. Solo en la vista del negocio; ignora lo que escribió el propio usuario.
- **Validación local:** `npm run typecheck`, `npm test` (205 archivos, 1596 tests), `npm run build`; integración contra la base local desechable: `db:migrate`, `test:communication`, `test:inbox`, `test:inbound`, `scripts/test-business-history.ts`, `test:communication-reads` (nuevo, también en CI). Playwright no se corrió localmente; los e2e afectados se actualizaron.

## Spec 90 — comunicación en la ficha del negocio — cerrada: mergeada en `staging` (PR #268, `a5fc50a`) — 27/10/2026

- **Pestaña «Comunicación»:** título con «Abrir en la Bandeja», barra de acciones («Contactar», «Registrar llamada u otro contacto», «Registrar respuesta sin mensaje»), aviso de restricción activa, «Requiere acción · N», una «Conversación» cronológica (separadores por día, burbujas con texto, chip de gestión, estados honestos, llamadas y respuestas sin mensaje como eventos, chips por canal, últimos 30 + «Ver anteriores», «Anulados» solo admin) y «Borradores · N» con «Seguir editando». Se quitaron las listas duplicadas y «Respuestas registradas».
- **Restricciones técnicas:** en la ficha del negocio se editan solo en «Preferencias y restricciones de contacto» (columna izquierda). La vista de gestión las mantiene en su pestaña.
- **Historial:** títulos reales para `inbound_*`, «Instagram»/«Red social»/«Llamada» como canal, llamada con ícono de teléfono y una sola entrada por eco de Instagram.
- **Etiquetas:** Instagram con un solo nombre (también en la Bandeja), «(sin asunto)» solo en email, «No es una respuesta» también en la Bandeja.
- **API (solo lectura):** `responses[].resolvedTaskTitles` (sin tareas borradas) y `responses[].hasInbound`, `inbound[].channelDetail` en `GET /_api/communication`; `isInstagram` en los eventos del historial y en las filas de la Bandeja (hilo y búsqueda). Sin migraciones ni cambios de permisos.
- **Revisión:** filas enviadas sin confirmar, no hechas o con fallo con nombre neutro y estilo punteado; la sesión de llamada sobrevive al cerrar el diálogo (misma clave al reintentar) y el diálogo no se cierra mientras guarda; «sin mensaje» solo sin mensaje vinculado; aviso «Mostrando lo más reciente» con listas llenas; una sola regla Instagram/Red social (`instagramChannel.ts`); «Último contacto» y Historial con títulos honestos («WhatsApp a Julia», «Email a … · «asunto»»); eco de Instagram igual en Historial; «Ver diseño del email» en el email enviado.
- **Móvil:** la columna del negocio va primero, con «Personas» y «Datos del negocio» plegados cuando el contenedor mide 900 px o menos (se decide al montar y no pisa lo que abre el usuario), para no empujar la pestaña debajo de listas largas.
- **Validación:**
  - typecheck, vitest (193 archivos, 1.382 pruebas tras traer `staging`) y build;
  - en la base local: `test:communication`, `test:inbox`, `test:commercial` (incluye `test-business-history`), `test:instagram`, `test:inbound` y `test:business-state`;
  - una revisión con ojos nuevos, sin bloqueantes y con todos los hallazgos corregidos: consulta perezosa de restricciones, nombre neutro para envíos no confirmados, clave de llamada que sobrevive al diálogo, «sin mensaje» exacto, una sola regla Instagram/Red social y filtros por negocio en el historial;
  - el CI completo en verde sobre `25beca6`.
- **En el camino:** el negocio de prueba del historial se renombró a «Zz Channels …», porque desplazaba «Negocio E2E» de la primera página y rompía `commercial.e2e` en el CI.
- **Seguimientos posibles:** en la Bandeja, las filas y filtros que agregan varios mensajes dicen «Instagram / Red social» cuando están mezclados.
- Sin desplegar.

## Spec 89 «Material de venta» — cerrada: F4 (modelos y user script) mergeada en `staging` (PR #272, `a367069`) — 27/10/2026

- Las cuatro fases están en `staging`: F1 #265, F2 #267, F3 #271 y F4 #272, cada una con CI verde sobre su cabeza. F4 sin migración nueva. En el CI de F4, los e2e cuyo script inicial escribe `localStorage` pasaron a tolerar el iframe aislado de la vista previa del email.
- Modelos: «Insertar material de venta» en el editor de modelos de WhatsApp y email (opcional, mismo selector que el composer), guardado como `{{material:<uuid>}}` y mostrado como chip con el título (nodo atómico de TipTap en los dos canales). En email, seleccionar el chip y «Adjuntar el archivo» guarda `{{material:<uuid>:attach}}`. Al guardar o restaurar una versión, el servidor rechaza materiales inexistentes o internos, referencias en el asunto y en canales que no son WhatsApp ni email; un archivado se guarda y el modelo muestra «Material no disponible» y «Este modelo incluye “X”, que ya no está disponible. No se va a enviar». `settings` manda `materialRefs` por modelo y las vistas previas muestran «[Material: Título]», nunca el uuid.
- `prepare` y `prepare_general` resuelven cada referencia con `insertSalesMaterialShare` (el mismo camino que `material_add`, después de los controles de permiso y No contactar): un enlace nuevo por mensaje, `template_materials_resolved` en el journal y `materialWarnings` para lo que queda afuera (archivado, interno, borrado) o va solo como enlace (`:attach` que Brevo o el límite no permiten). El composer muestra esos avisos. `dispatch` rechaza (409) una referencia `{{material:…}}` escrita a mano.
- User script 1.3.0: `GET /_api/userscript/materials` y `POST /_api/userscript/material_add` (Bearer `hcu_…`, control 426, solo WhatsApp), `materialWarnings` en `prepare`, y «Agregar material» en «Mandar un mensaje». `GET /_api/userscript/templates` muestra las referencias como «[Material: Título]» en la vista del modelo.
- Correcciones tras la revisión con contexto nuevo: los títulos de material se escapan en las vistas previas HTML (`labelMaterialReferences({html})`) y el iframe de la vista previa del email va con `sandbox=""`; `prepare` resuelve solo el borrador que acaba de insertar (no uno reutilizado ni la repetición de un id); `edit` y las acciones de material rechazan `{{material:…}}` con el mismo mensaje que `dispatch`, que también revisa `html_body` y `text_body`; el material se bloquea `FOR SHARE` al resolver y un cambio que ve el alta del enlace pasa a `materialWarnings` en vez de cortar el `prepare`; los valores de variables (nombres) no pueden inyectar `{{material:`; una referencia dentro de un atributo (`href`) se rechaza al guardar; `GET /_api/userscript/materials` acepta `search` (el panel busca en el servidor con espera y «Buscando…», y vuelve a pedir la lista cada vez que se abre) y no devuelve categorías inactivas. El negocio del e2e `material-composer` pasa a «Zz Material e2e …».

## Spec 89 «Material de venta» — F3 (composer y email) mergeada en `staging` (PR #271, `e6a755c`) — 27/10/2026

- F1 (#265) y F2 (#267) mergeados a `staging`. F3 mergeada (#271): acciones `material_add`, `material_remove`, `material_attach` y `material_retry_without_attachments` en `/_api/communication` (permiso y No contactar en cada escritura, como `prepare`), un enlace `/m/<token>` por material y mensaje, revocación al cancelar o descartar el borrador, validación en `dispatch` (409 si el material dejó de estar disponible, «Quitado del texto» si el vendedor borró el enlace, `sent_version` y `materials` en el journal), adjunto en Brevo con `attachment.url` firmado por 1 h y `attached_version` al aceptar, «Reintentar sin adjuntos», `POST /_api/sales_materials/share_revoke` y `materials[]` por mensaje en `GET /_api/communication`.
- UI: «Agregar material de venta» en el composer (búsqueda, varias categorías, miniatura, solo entregables activos), lista con «Quitar» y «Adjuntar el archivo» con motivo, registro en «Comunicación» con «Revocar enlace» y registro técnico de acceso, y «Enviar material» en la ficha que abre «Contactar» con el material agregado. Sin migración nueva.
- Correcciones tras la revisión con contexto nuevo: `dispatch` busca todo `/m/<token>` del texto sin filtrar por mensaje (409 si es desconocido, revocado o de otro mensaje o negocio) y bloquea el material con `FOR SHARE`; «Reintentar sin adjuntos» quita del texto copiado los enlaces revocados (pide revisar de nuevo) y conserva `task_id`, `delegated_task_id` y dueño; adjuntos solo con las extensiones de Brevo (`BREVO_ATTACHMENT_EXTENSIONS`) y con nombre; revocar y quitar un enlace siguen permitidos bajo No contactar para el autor y los responsables del negocio o la gestión; el error de Brevo se guarda sin firmas `X-Amz-*`; `PUBLIC_APP_URL` faltante en producción corta el envío (503); «Quitar» conserva el resto del texto de la línea o el párrafo; el registro no dice «Versión enviada» si el mensaje no confirma el envío.
- Validación local en la base descartable: typecheck, vitest en serie, build, `test:sales-material`, `test:sales-material-share`, `test:sales-material-composer` (nuevo, en CI), `test-communication.ts`, `test-email-uncertain.ts`, `test-userscript.ts` y los e2e `material-composer`, `material-share`, `commercial` y `business-contact`.

## Spec 89 «Material de venta» — F1 (#265) y F2 (#267) mergeadas en `staging` — 26 y 27/10/2026

- Spec aprobada y mergeada (#263). F1 en `feat/sales-material-f1`: R2 con subida directa firmada (`aws4fetch`), migración `046_sales_material.sql` (materiales, versiones, categorías, subidas pendientes y registros de envío), página `/sales-material` para todos con acciones de admin, categorías en Configuración, barrido de subidas abandonadas y retiro de la biblioteca vieja (los adjuntos de negocio siguen igual).
- Validación: typecheck, vitest en serie, build, `test:sales-material` (16 grupos), `test-work`, `test-permissions`, `test-search`, `test-communication` y los e2e afectados sobre base descartable. Revisión con contexto nuevo y correcciones (timeouts de R2, barrido fuera de transacción, conflicto 409 recuperable).
- Para producción: crear el bucket R2, su CORS y las variables en Coolify (`docs/COOLIFY_DEPLOY.md`), y borrar a mano las subidas de prueba de la biblioteca vieja antes del deploy. Siguen F2 (página pública `/m/<token>`), F3 (composer y email) y F4 (modelos y user script).

## Spec 87 — reglas comerciales — PR #262 a `staging` (26/10/2026)

- Cerrar como Cliente exige acuerdo y persona aceptante (3 caracteres útiles); editar ese acuerdo no permite vaciar los dos datos. Se marca la evidencia nueva con `markedClient` en el evento `closing_checklist`, sin inferir decisiones para eventos antiguos.
- Registrar respuesta permite seleccionar tareas pendientes de la gestión; solo las seleccionadas se completan y se vinculan a la respuesta en la misma transacción. La repetición idempotente no vuelve a completar tareas.
- El asignado a una tarea pendiente puede preparar, editar y enviar email/WhatsApp desde «Contactar» de esa tarea. Se valida de nuevo en cada escritura y envío; el historial identifica al delegado y al responsable.
- Migración `044_delegated_messages.sql`: `delegated_task_id bigint` (tipo real de `crm_tasks.id`) y su índice. Pagos no se registran.
- Guía en pantalla y Markdown actualizados. Suites de integración extendidas en `test-pipeline.ts` y `test-communication.ts`.
- Verificación local: `npm run typecheck`, `npm test -- --maxWorkers=2` (175 archivos, 1.246 pruebas) y `npm run build` pasaron. El reporte indica comandos y límites. Las suites de integración se ampliaron, pero no se ejecutaron por instrucción.
## Spec 87 — reglas comerciales — cerrada: mergeada en `staging` (PR #262, `921b76c`) — 26/10/2026

- **Ganar como Cliente:** exige «Qué se acordó» y «Persona que aceptó», con 3 caracteres útiles. El acuerdo no se puede vaciar después, porque `markedClient` se arrastra en cada guardado.
- **Registrar respuesta:** lista las tareas pendientes de la gestión y del negocio sin gestión. Solo se completan las que tilda el vendedor, que tiene que ser el asignado o un admin.
  - El vínculo queda en la actividad (`taskId`) y en el journal `response_task_resolved`, no en `communication_response_id`, que es única y la usa el recordatorio (decisión del propietario).
  - Se pueden resolver varias tareas y además crear el recordatorio.
- **Mensajes por delegación:** el asignado de una tarea pendiente prepara y envía desde esa tarea, con los controles de siempre, y se vuelve a validar al despachar. Usa `crm_messages.delegated_task_id` (migración `044`). El historial muestra «por delegación de». Los admins conservan el acceso.
- **Pagos:** no se registran.
- **Validación:**
  - en la base local: `test-communication` y `test-pipeline` dos veces seguidas; `test-permissions`, `test-work`, `test-commercial`, `test-usability`, `test-inbox` y `test-business-state`;
  - el CI completo, con la suite de navegador, en verde sobre `a0a4692`;
  - una revisión con ojos nuevos, con todos los hallazgos corregidos.
- **En el camino:**
  - los fixtures nuevos de negocios se nombran «Zz …», para no desplazar «Negocio E2E» de la primera página;
  - `pinned-views` mide los controles cuando el panel ya dejó de moverse.
- Sin desplegar.
## Ajustes de la revisión del propietario sobre staging — 26/10/2026

- Mergeados a `staging`, sin deploy: Bandeja como chat, letra más chica y «Volver a los resultados» con la búsqueda en la URL (#255, `8922d65`); rediseño de la página del user script (#254, `85c5e5b`); tablas de Gestiones y Negocios igualadas, con acciones siempre visibles como íconos (#258, `e887ffd`); menú de usuario en la barra superior con el user script adentro, «En vivo» informativo y siempre activo, títulos de grupo en negrita y paneles laterales que entran deslizando en escritorio (#259, `4d75254`).
- Esta rama (`ux/page-headers-help`): encabezado compartido (`PageHeader`: eyebrow azul, título y descripción) en todas las páginas, mismo encabezado en las tres vistas de Hoy y `HelpLink` («?» → artículo de la guía) en páginas y secciones. Se quitó el botón de ayuda de la barra superior y sus popovers (`usePageHelp`, `TodayHelp`).
- Bugs encontrados en el camino: el `transform` de la transición de Mantine desanclaba el pie fijo de los paneles laterales; una recarga en vivo durante un arrastre en «Elegir vistas de la barra» descartaba el orden (ahora el borrador se marca al empezar a arrastrar).
- Los e2e corren con `reducedMotion: 'reduce'`. Validación por PR: typecheck, `vitest --maxWorkers=1` (la corrida paralela da timeouts con carga), build, revisión con contexto nuevo y CI verde sobre el commit exacto.
- Próximo paso: revisión del propietario en `staging`.

## Orden original de columnas en Gestiones — 26/10/2026

- «Columnas» de Gestiones suma «Orden original»: vuelve las columnas visibles al orden de fábrica sin mostrar ni ocultar ninguna (desde #247, «Mostrar todas» ya no reordena). Rama `ux/column-default-order`. Validación: `npm run typecheck`, `npm test` (170 archivos, 1222 pruebas), `npm run build`, e2e `column-order.e2e.ts` 2/2.

## Bandeja de conversaciones — mergeada (#249, `53b14a0`) — 26/10/2026

- Mergeada a `staging`, sin deploy. CI verde sobre `4b9b02b`. Validación final sobre base nueva: `test:inbox`, `test-communication.ts`, `test:inbound`, `test:permissions`; e2e focalizados 27/27 (1 omitido) y suite completa 201 OK, 1 omitido y solo la falla local conocida de `commercial.e2e.ts` («CRM template»). Al desplegar, la migración `043` construye índices trigram sobre `crm_messages` y `crm_inbound_messages`: hacerlo en un momento tranquilo.

- API (`/_api/inbox/*`) y página `/inbox` (B1) commiteadas en `ux/inbox-v1`; B2 implementada en la misma rama, sin commit, PR, merge ni deploy.
- B2: acciones de mensaje recibido compartidas con «Comunicación» (`InboundMessageActions` + `ResponseRecordDialog`), «Nuevo mensaje» con el «Contactar» de siempre y la gestión preseleccionada, búsqueda con debounce de 300 ms, mínimo 3 letras, filtros, «Cargar más», resaltado con `<mark>` (acentos no, ñ sí) y apertura del resultado en su mensaje. Guía actualizada.
- Validación local: `npm run typecheck`, `npm test` (162 archivos, 1166 pruebas), `npm run build`, `npm run test:inbox`; e2e `inbox.e2e.ts` 3/3 (el escenario de vendedor se omite: el seed no tiene vendedor) y suite e2e completa 201 pasan, 1 omitida, 1 falla (`commercial.e2e.ts`, solo local, por datos que quedaron en la base local).
- Integrado `origin/staging` (spec 85, registro automático) por merge: nuestra migración pasó a `043_inbox_indexes.sql`; `voided` queda fuera de la Bandeja salvo «Anulados» de admin en el hilo; «Automático» y «Anular registro» también en la Bandeja.
- Correcciones de revisión: «Cargar más» e hilo sobre consultas infinitas, intento de respuesta que sobrevive al cambio de conversación, etapa del teléfono desde la URL, nombre del negocio en `inbox_threads`, filtros de búsqueda persistentes y mínimo por caracteres visibles, acciones desde las filas del hilo, diálogo de respuesta que se reinicia al abrir.
- Validación tras la integración: `npm run typecheck`, `npm test` (170 archivos, 1221 pruebas), `npm run build`. Falta `test:inbox` y e2e sobre una base nueva (la local tiene la vieja `042_inbox_indexes` aplicada).
- Próximo paso: revisión del propietario en `staging` y su «terminamos» para pasar a `main`.

## Vistas fijadas y orden de columnas — 25/10/2026

- PR #245 de vistas fijadas por usuario mergeado a `staging` como `c7cd1d7`; no desplegado. Validación: pruebas unitarias, `test:view-pins` y e2e 195/197. Fallos conocidos: `commercial.e2e.ts` solo local y `contextual-materials` a 390 px con inestabilidad conocida.
- Orden de columnas por arrastre para Negocios y Gestiones: implementado en `ux/column-order-v1`. Validación local: tests unitarios/componentes, `npm run typecheck`, `npm test` (157 archivos, 1105 pruebas) y `npm run build`; e2e `column-order.e2e.ts` 4/4 y `business-cards.e2e.ts` en verde; suite e2e completa 197/199 (`commercial.e2e.ts` solo local y `seller-flow` con un timeout de carga que pasa 3/3 aislado). PR #247.

## Spec 86 — insignias del CRM en la lista de chats de WhatsApp — cerrada: mergeada en `staging` (PR #251, `e21cfb2`) — 26/10/2026

`docs/crm-roadmap/86-userscript-chat-badges.md`.
- **Qué se ve:** cada chat individual de la lista muestra una insignia compacta junto a la hora. Muestra el código del negocio (azul normal, rojo No contactar), «2 negocios» (ámbar) o «Sin CRM». Al costado se abre un detalle con estado, responsable, gestión abierta, último WhatsApp y «Abrir en el CRM».
- **Dónde se dibuja:** en una capa propia del script, sin tocar las etiquetas ni el alto de las filas de WhatsApp.
- **Servidor:** `POST /_api/userscript/badges` es de solo lectura. Procesa hasta 50 chats por pedido, con 30 pedidos por minuto por token. Empareja igual que `context` y aplica las mismas reglas de lectura; si el negocio existe pero no se puede leer, devuelve `hidden`, sin datos. «Último WhatsApp» cuenta solo envíos reales y recibidos, nunca un WhatsApp abierto sin enviar.
- **Teléfono:** el script lo lee del modelo de chat de React de cada fila. Lo verificó un diagnóstico en WhatsApp real, incluso en contactos guardados `@lid`.
- **Validación local:** `npm run typecheck`, tests del script, del servidor y de la guía. `scripts/test-userscript.ts` pasó contra la base local, con cada tipo de insignia, `hidden`, el caso de dos chats en un pedido, códigos con ceros, el límite de 50 y el token revocado.
- **Prueba en WhatsApp real:** OK (propietario, 26/10/2026, versión local 1.2.21).
- CI verde en el head `59f272f`. Una revisión de seguridad posterior llevó a la regla del negocio no visible (`decisiones.md`, 26/10/2026). No está desplegado.

## Spec 85 — registro automático desde el user script, con anulación — cerrada: mergeada en `staging` (PR #248) — 26/10/2026

`docs/crm-roadmap/85-userscript-auto-register.md` (fase F5 de la spec 83).
- **Cuándo registra solo:** el script registra sin clic los mensajes nuevos del chat abierto cuando hay un único negocio emparejado, que no esté en Nuevo ni tenga No contactar. No exige gestión abierta. Toma solo mensajes posteriores a la activación y de las últimas 24 horas; los enviados, recién con la tilde de enviado.
- **Interruptores:** uno global de admin en Ajustes, apagado por defecto, y uno por vendedor, en el panel y en `/userscript`.
- **Efectos y anulación:** cada registro automático guarda sus efectos en `crm_auto_registrations` (migración `042`). Se puede anular con motivo desde el panel («Registrados solos» → «Deshacer») o desde la ficha («Automático» → «Anular registro»). Anular devuelve cada efecto que no cambió después: el intento vuelve a «WhatsApp abierto», se reabre la tarea y se borra la actividad. Además libera el id de WhatsApp y el automático no vuelve a registrarlo.
- **Estado `voided`:** queda oculto como `cancelled`. Admin lo ve con «Anulados».

Validación local:
- `npm run typecheck`, tests del script, del helper y de la guía.
- `scripts/test-userscript.ts` contra la base local con la `042` aplicada: registro automático, interruptores, Nuevo, cada caso de anulación, permisos y mensaje reasignado a otro negocio.
- También pasaron `test-work`, `test-communication-locks`, `test-commercial`, `test-inbound-email` y `test-business-history`.
- `test-communication` no se pudo volver a correr sobre la base local (crea plantillas con nombres fijos). Queda para CI.
- CI verde en el head `e32771b`; mergeada como `e65a5ee`. La revisión fresca encontró y se corrigieron la anulación desde el CRM (mandaba un id aleatorio) y la lista «Registrados solos» (columna ambigua), entre otros.
- Prueba manual en WhatsApp real del registro automático: OK (propietario, 26/10/2026, versión local 1.2.17).
- Para producción hay que aplicar las migraciones `041` y `042` y publicar una versión nueva del script. No está desplegado.

## Spec 84 — modelos del CRM desde WhatsApp Web — mergeado (#246, `343d024`) — 25/10/2026

«Mandar un mensaje» en el panel del user script (`docs/crm-roadmap/84-userscript-templates.md`): elegir un modelo compatible con la gestión abierta, vista previa con los datos del CRM y «Pegar en el chat» sin enviar (o «Copiar»). Rutas `GET /_api/userscript/templates` y `POST /_api/userscript/{prepare,dispatch,outcome}` sobre `mutateCommunication`, con los mismos permisos y restricciones que «Contactar»; pegar deja el intento en «WhatsApp abierto · envío no confirmado» y «No lo voy a enviar» lo cierra.

- Pegar conserva los saltos de línea y reemplaza el texto de la caja: el modelo pegado por el script sin preguntar, otro texto solo con confirmación. Cada reemplazo cierra el intento anterior.
- Popover con la plantilla cruda al pasar el mouse por un modelo.
- Registrar un enviado completa un intento abierto solo si el texto se parece al preparado; un mensaje escrito a mano queda como envío suelto (afecta también a «Contactar»).

Probado en local contra WhatsApp real por el propietario (versiones 1.2.11 a 1.2.15). Validación: `npm run typecheck`, `npx vitest run userscript src/server/routes.spec.ts` (84), `scripts/test-userscript.ts`, `scripts/test-work.ts` y `scripts/test-business-history.ts` contra la base local descartable.

## User script de WhatsApp 1.2.0, revisión y panel nuevo — mergeado (#244, `05943cf`) — 25/10/2026

Probado de punta a punta en local contra WhatsApp Business real (Chrome + Tampermonkey): 4 recibidos en `crm_inbound_messages` (`pending_review`, por teléfono, horas correctas) y 4 enviados en `crm_messages` (`manual_sent` con id real de WhatsApp).

- **Lectura del DOM actual de WhatsApp**: `data-id` sin prefijo, título por `conversation-info-header-chat-title`, dirección por `tail-in`/`tail-out` o el lado del mensaje, texto en `selectable-text`. Los chats sin código ni teléfono visible (`@lid`) toman el teléfono del estado interno de WhatsApp (`unsafeWindow`, fiber de React), y si no lo encuentran no adivinan. Fixtures nuevos con la estructura real.
- **Instalar desde el CRM**: «Instalar user script» en `/userscript`. La página detecta el script en este navegador («Instalado», «Desactualizado» o «No detectado») porque el script corre también en el origen del CRM y solo marca `<html>` con su versión.
- **Panel nuevo** (mockup aprobado): botón con el logo en la barra izquierda de WhatsApp (capa propia superpuesta; aparece directo ahí y la sigue si se mueve; flotante si la barra no aparece en 15 s), panel con negocio, estado, gestiones, avisos de No contactar y de estado Nuevo, vista previa con selección y resumen. Token, versión, tema y diagnóstico en «Ajustes», sin depender de un chat abierto (`GET /_api/userscript/status`). Tema automático según WhatsApp, o claro/oscuro forzado. Variables CSS propias (`--hc-*`) porque las de WhatsApp pisaban el color del botón principal.
- **Actualizaciones:** el script consulta la versión publicada al cargar, cada 30 minutos y al volver a la pestaña (máximo cada 2 minutos), y avisa con una tarjeta propia («Actualizar» / «Más tarde» por 24 h y por versión). Una versión por debajo del mínimo (426) no se puede posponer más allá de la página. Versión mínima: 1.2.0.
- **Versión por token:** migración `041_userscript_token_version.sql` (`last_version`). La lista de tokens muestra la versión que usó cada uno y marca los desactualizados.
- Ayuda actualizada (instalación en Chrome/Edge y Firefox, nuevo flujo del token y de las actualizaciones).

Validación local: `npm run typecheck`, `npm test`, `npm run build`, `scripts/test-userscript.ts` contra la base local descartable con la 041 aplicada. Firefox: pasos documentados, no probado en un Firefox real.

## Rediseño visual v1, Fase 7 mergeada a `staging` (#242, `2975cba`; sin desplegar) — crear y editar en paneles — 25/10/2026

Solo visual: sin cambios de campos, validaciones, endpoints ni permisos. Mockup aprobado el 25/10/2026.

- Nuevo negocio, Datos del negocio, Persona de contacto, Iniciar gestión, Agendar tarea, Cambiar fecha o datos, Anotar lo que pasó y Editar actividad se abren como panel lateral derecho (560 px, pantalla completa en el celular), con el título y el pie de acciones fijos.
- Las confirmaciones cortas (Archivar, Enviar a Papelera, Quitar persona, Ya no hace falta, Borrar) y el editor amplio de gestión siguen siendo ventanas centradas.
- Es una variante (`side`) del mismo `DialogContent`: mismo rol de diálogo, foco atrapado, Escape y protección de cambios sin guardar.
- En escritorio la barra de acciones queda fija en el borde inferior del panel aunque el formulario sea corto (ajuste posterior). En el celular sigue debajo del contenido y fija al desplazar, para acompañar al teclado.

## Rediseño visual v1, Fase 4 mergeada a `staging` (#241, `b56f177`; sin desplegar) — tablero de Gestiones — 25/10/2026

Solo visual: sin endpoints ni pedidos nuevos, sin cambios de permisos. Mockup aprobado el 25/10/2026 (con acordeón en el celular a pedido del propietario).

- Columnas con color propio por etapa (las abiertas por su orden: gris, celeste, violeta, ámbar, rosa, azul; ganada verde y perdida roja), fondo teñido, banda superior y contador. Cada columna se colapsa a una tira y el estado se recuerda en el navegador.
- Tarjetas: nombre de la gestión (abre la gestión), negocio, vertical, días en la etapa, próximo paso con color, avisos de seguimiento y prioridad, responsable y «Cambiar etapa» con los mismos permisos.
- Tocar una tarjeta abre «Vista previa de la gestión» (a la derecha; abajo en el celular) con los pasos de la etapa y los datos clave, «Cambiar etapa» y «Abrir gestión». Sigue a la fila actualizada y se cierra si la gestión deja la lista.
- El tablero ya no tiene selector propio de «Tipo de gestión»: lo toma del filtro rápido cuando hay un solo tipo elegido. Ajuste posterior: sin un único tipo, «Ver etapas del equipo» pide elegir uno (botones con la cantidad de cada tipo que aplican el filtro rápido) en lugar de mezclar las etapas de todos los tipos.
- En el celular (hasta 700 px) el tablero es un acordeón por etapa; arrancan desplegadas las etapas abiertas con gestiones.

## Ajustes de Gestiones y Hoy pedidos por el propietario — mergeados a `staging` (#240, `ee7c006`; sin desplegar) — 25/10/2026

Tres cambios chicos decididos el 25/10/2026 (fuera de la v1 solo visual, aprobados aparte):

- Gestiones tiene el filtro rápido «Tipo de gestión» (y el mismo campo en «Filtrar»). El servidor acepta `managementType` como campo del filtro avanzado solo en Gestiones; en Negocios responde 400.
- «Vencidas» y «Hoy» del filtro «Próximo paso» muestran solo gestiones abiertas, como el resumen. La restricción se deriva del filtro: dura lo que dura «Vencidas» u «Hoy» y no pisa una clasificación elegida por un indicador o una vista guardada; el desplegable lo explica.
- El mini calendario de Hoy marca todas las tareas pendientes del mes mostrado, con los mismos filtros de trabajo, mediante el modo nuevo de solo lectura `GET /_api/work?mode=month` (la grilla visible, hasta 42 días, mismo alcance que la lista; avisa si el tope de 3000 tareas la corta).

## Rediseño visual v1, Fase 5 mergeada a `staging` (#239, `eecd391`; sin desplegar) — Hoy — 25/10/2026

Solo visual: sin endpoints ni pedidos nuevos, sin cambios de permisos ni de No contactar. Mockup aprobado el 25/10/2026.

- Indicadores arriba: Vencidas, Para hoy, Respuestas nuevas, Gestiones sin tarea agendada y el avance «Hoy: N de M hechas» (o «¡Terminaste por hoy!»). Tocar uno lleva a su sección; quedan deshabilitados cuando la sección no aparece y «Respuestas nuevas» muestra «–» mientras carga o si falló.
- Dos columnas desde 1100 px: a la izquierda Anotá cómo salió, Vencidas, Para hoy, Próximas acciones (agrupadas por día) y Gestiones sin tarea agendada; a la derecha Respuestas nuevas, mini calendario y Primeros pasos. Más angosto, una columna intercalada.
- Filtros de trabajo siempre visibles (Responsable solo admin, Localidad, Rubro; Mes y vista en Calendario). La ayuda «Cómo usar esta lista» pasó al «?» («Ayuda sobre Hoy»).
- Filas de tarea con ícono por tipo (también en la ficha); los botones bajan debajo del texto cuando la columna es angosta.
- Mini calendario: al mergear marcaba solo las tareas que la Lista ya trae; el ajuste posterior lo pasa al mes completo.
- Pruebas: ver el PR.

## Rediseño visual v1, Fase 3b mergeada a `staging` (#238, `b8841e4`; sin desplegar) — tabla de Gestiones — 25/10/2026

Solo visual: sin cambios de endpoints, permisos ni reglas de No contactar. Mockup aprobado el 24/10/2026.

- Los seis indicadores del resumen quedan visibles como tiles y filtran al tocarlos; las vistas rápidas y las guardadas van en una sola fila con «Guardar vista». El desplegable «Resumen, vistas guardadas y ayuda» se quitó en Gestiones y la ayuda comercial pasó al «?» («Ayuda sobre gestiones»).
- Filtros rápidos Etapa, Responsable (con «Yo») y Próximo paso (Vencidas, Hoy, Esta semana de hoy al domingo, Próximos 7 días, Sin próximo paso, «Rango…»), con las mismas reglas de pertenencia que Negocios (componente compartido `ListQuickFilters`). «Tipo de gestión» no se agregó: `managementType` no es un campo del filtro avanzado y sumarlo cambiaría la API.
- La columna Etapa muestra la etapa con pasos y la tabla es la vista inicial en todos los anchos; «Tablero comercial» sigue llevando al tablero.
- En el celular: búsqueda a lo ancho, «Filtrar» y «Columnas» debajo y la tira de filtros rápidos desplazable; sin scroll horizontal a 390 y 320 px.
- «Vencidas» y «Hoy» del filtro rápido no limitan a gestiones abiertas (los tiles y vistas sí).
- Pruebas: typecheck, `npm test` (1000), build y e2e completos sobre Postgres 17 descartable (193/194; `commercial.e2e.ts` en «CRM template» falla solo en local).

## Rediseño visual v1, Fase 3a mergeada a `staging` (#237, `a32ed00`; sin desplegar) — lista de Negocios — 25/10/2026

Solo visual: sin cambios de endpoints, permisos ni reglas de No contactar. Mockup aprobado por el propietario el 24/10/2026.

- Vistas del equipo y personales en una sola fila desplazable.
- Filtros rápidos Responsable, Estado, Ciudad y Último contacto junto a «Filtrar negocios» (en el celular, una tira desplazable). Cada uno edita solo su propio grupo (valores en «o»); si el campo ya tiene otra regla, avisa que se edita en «Filtrar negocios». Último contacto tiene atajos en días de Argentina (Hoy, Ayer, Esta semana, Últimos 7 y 30 días, Sin contacto) y «Rango…».
- Tocar una fila (o «Vista previa» en el menú «⋯») abre una vista previa lateral (hoja inferior en el celular) con el mismo pedido que ya usaba «Contactar»: estado, datos, canales, próximo paso, actividad reciente y gestiones abiertas, con «Abrir ficha», «Contactar» y «Editar» (mismas reglas que la fila y que la ficha). Abrirla no registra contacto. El nombre sigue abriendo la ficha y la lista recupera el negocio al volver.
- Último contacto con barra de antigüedad (≤7, ≤30, >30 días, sin contacto) y canales con ícono y valor visible; «No contactar» en rojo.
- Se quitó el botón «Abrir» (ojo) de filas y tarjetas; «Contactar» y «⋯» aparecen al pasar el mouse en la tabla. La selección múltiple usa una barra flotante. En el celular, las tarjetas se agrupan en Vencidos, Hoy, Próximos y Sin próximo paso.
- Pruebas: typecheck, `npm test` (990), build y e2e completos sobre Postgres 17 descartable (193/194; `commercial.e2e.ts` en «CRM template» falla solo en local). Se actualizaron la guía y los e2e que usaban el ojo «Abrir» o el nombre como botón.

## Rediseño visual v1, Fase 2c — composer flotante y formulario de documentos — 24/10/2026 (mergeada a `staging`, #236, `a1c3bbf`; sin desplegar)

- En la ficha completa, WhatsApp y Email de la barra lateral abren «Contactar» con el canal elegido. El composer de email/WhatsApp puede mostrarse como panel flotante desde ≥768 px; conserva el composer compartido y las guardas de borrador. «Contactar» restaura el panel existente; cerrar el composer flotante termina el flujo de contacto en escritorio. El composer modal conserva el comportamiento del caller; otras rutas mantienen la presentación modal.
- Documentos muestra primero la lista; «Agregar documento» revela el formulario de vinculación en la ficha de negocio o gestión. Al vincular, se pliega, la confirmación queda visible encima de la lista y el foco vuelve al botón. Se actualizó la guía y se exportó.
- Pruebas: typecheck, `npm test` (959, incluidos los specs del panel flotante y de Documentos; el de cierre falla si el aviso de cierre vuelve a saltear la guarda), build, capturas del panel abierto y minimizado a 1280 px y del diálogo a 390 px, y e2e completos sobre Postgres 17 descartable (192/194: `business-contact` a 1280 se corrigió después y pasa aislado; `commercial.e2e.ts` en «CRM template» falla solo en local).


## Rediseño visual v1, Fase 2b: contenido de las pestañas de la ficha — 24/10/2026 (mergeada a `staging`, #235, `5e0a965`; sin desplegar)

Solo visual: sin cambios de permisos, endpoints ni acciones.

- Historial: timeline con un ícono y un tono por tipo de evento (y por canal en emails y WhatsApp), fecha a la derecha y filtros como chips; se conservan detalle desplegable, compromisos pendientes y paginación.
- Tareas: pendientes y realizadas en una sola lista agrupada («Pendientes · N», «Realizadas · N»), sin pestañas anidadas; las realizadas muestran 5 y se expanden en el lugar.
- Comunicación: el email recibido se lee como una tarjeta (asunto, remitente, estado, cuerpo) con las mismas acciones. No se muestra destinatario porque el dato no existe, y «Por revisar» no se presenta como respuesta.
- Gestiones: `StageStepper` muestra la etapa como pasos según el catálogo de cada tipo, con la etiqueta propia de la etapa («Participa», «Colabora», «Cerrada completada»…). «Derivada a Leandro», las etapas heredadas y las cerradas se muestran como «Etapa: …».
- Documentos sin cambios: mostrar el formulario solo a pedido necesita un botón con un nombre nuevo, a decidir por el propietario.

Pruebas: typecheck, `npm test`, build, capturas de cada pestaña a 1280 y 390 px sin scroll horizontal y e2e completos sobre Postgres 17 descartable.

## Rediseño visual v1, Fase 2a: ficha del negocio, estructura — 24/10/2026 (mergeado a `staging` en #234, `797aec9`, sin desplegar)

Mockup aprobado sin cambios. Solo visual: no cambian permisos, No contactar, endpoints ni qué cuenta como contacto; no hay pedidos nuevos (el Resumen reutiliza las consultas que la ficha ya hacía).

- Encabezado: nombre, estado, código `H{id}`, datos y responsable; Contactar, Editar negocio y «⋯» arriba a la derecha. Se quitó «← Volver al listado de negocios»: lo reemplaza el breadcrumb (en el celular, la barra inferior).
- Columna de datos del negocio (en el celular y en anchos angostos va después del Próximo paso y las pestañas, por decisión del propietario): identidad, acciones rápidas (WhatsApp y Email abren el mismo diálogo de contacto; Agendar tarea y Anotar lo que pasó abren los mismos editores que la pestaña Tareas), preferencias de contacto, Contacto, Personas y Datos plegables.
- El aviso de No contactar o archivado aparece una sola vez, arriba de las columnas, en todos los anchos.
- Pestañas: Resumen (nueva y de entrada), Historial, Tareas, Comunicación, Gestiones y Documentos; Tareas y Gestiones muestran contador. Desaparece «Gestiones · Personas · Datos»; los `?section=` viejos siguen llevando al contenido correspondiente.
- La Ayuda de negocios pasa a un botón «?» en la barra superior (API `usePageHelp` del shell).
- La vista compacta dentro de la gestión no cambia, incluido el aviso de No contactar.
- Corrección: volver a la lista por un link del shell antes de que cargue la ficha ya no pierde el foco ni la posición de la fila abierta.

Pruebas: typecheck, `npm test` (936), build, capturas a 320, 390 y 1280 px (sin scroll horizontal) y e2e completos sobre Postgres 17 descartable. Sigue la Fase 2b (timeline con íconos, tareas en una lista, email en vista de lectura y stepper de etapas).

## Rediseño visual v1, Fase 1: estructura general — 24/10/2026 (mergeado a `staging` en #233, `8ffa1c0`, sin desplegar)

Un solo layout (`AppLayout`) envuelve todas las rutas con sesión; cada página dejó de montar su propia cabecera. Las guardas `UserRoute`/`AdminRoute`, las rutas, los permisos y las etiquetas no cambian.

- Escritorio: barra lateral con buscador (abre los accesos rápidos), Trabajo (Hoy), Registros (Negocios, Gestiones), Administración plegable solo para admins (se recuerda abierta o cerrada y se abre sola en una página de administración), Ayuda, User script, indicador en vivo y menú de usuario. Se contrae a una columna de íconos con tooltips. Barra superior fina con breadcrumbs (`Negocios › nombre del negocio`, `Gestiones › nombre de la gestión`).
- Celular (< 768 px): cabecera de una línea y barra inferior Hoy, Negocios, Gestiones, Ayuda y Más; «Más» abre el panel «Otras secciones» con Administración, User script y el indicador en vivo. Los avisos emergentes suben por encima de la barra inferior.
- La tabla de usuarios de Configuración cambia a su versión compacta según el ancho de su tarjeta, porque la barra lateral reduce el espacio disponible.
- Los contadores de la navegación quedan para después de v1; no se muestran lugares vacíos.

Pruebas: typecheck, `npm test`, build, e2e completos sobre Postgres 17 descartable y capturas a 1280 px (claro, oscuro y barra contraída) y 390 px. Los e2e que buscaban el menú hamburguesa, el desplegable de Administración o un único enlace «Negocios» se adaptaron a la navegación nueva. Pendiente: revisión visual del propietario en staging.

## Rediseño visual v1, Fase 0: sistema de diseño — 24/10/2026 (mergeado a `staging` en #232, `213434b`, sin desplegar)

Primera fase del rediseño aprobado por el propietario (ver [decisiones](decisiones.md)). Solo visual: no cambia rutas, etiquetas, permisos ni contratos.

- Tipografía Plus Jakarta Sans; primario #2563EB sobre fondo #EEF2F8 con tarjetas blancas de radio 16 px; modo oscuro con fondo #0A0F1C y tarjetas #111827.
- Tonos `--tone-{blue,green,orange,red,violet,sky,pink,slate}` (sólido, suave y tinta) y mapa único valor → tono en `src/helpers/tones.ts` para estado del negocio, etapa, revisión y prioridad.
- Badges sin borde con fondo suave; los de estado llevan un punto decorativo.
- Botones en cuatro niveles: primario sólido, secundario con borde neutro, texto y destructivo (rojo suave, sólido al hover).
- Overlay de diálogos derivado de tokens.

Pruebas: typecheck, `npm test` (932), build y capturas a 1280 px (claro y oscuro) y 390 px sin scroll horizontal. E2e completos sobre Postgres 17 descartable: 186/194 en la primera corrida; seis fallos fijaban la opacidad y el color viejos y se actualizaron al diseño aprobado, uno era el área táctil del «?» de Gestiones (se separó del botón primario y se esperó al tablero antes de medir) y `commercial.e2e.ts` es el fallo local conocido de entorno. Los specs corregidos pasan 11/11. Pendiente: revisión visual del propietario en staging y la Fase 1 (estructura general).

## Mensajes y emails recibidos — 22 y 23/10/2026 (mergeado a `staging`, sin desplegar)

Implementado y mergeado a `staging`: todo lo que sigue. Desplegado a producción: **nada**. Producción sigue sin las migraciones 024–040.

- **#211 (`2aaf63b`):** los badges no semánticos de Negocios vuelven a tener color estable por valor. Revisados pasa a editable para el responsable o un admin: «Revisado» desde Nuevo, «No revisado» desde Revisado, Sin tarea agendada o Recontactar (limpia la fecha y cancela la tarea «Volver a contactar» sin tocar). Sin migración.
- **#212 (`1ee2691`):** motor de variantes de mensajes con azar estable por negocio, persona y día, sin repetir la variante anterior del mismo modelo; condiciones nuevas (ciudad, perfil, propósito, día, mes, es cliente); propósito en modelos (migración 035); contexto único entre vista previa y servidor; modelo de red social con «Copiar texto».
- **#213 (`e42bd6d`):** catálogo nuevo de 33 modelos (11 × Email, WhatsApp, Instagram) y variables. **La migración 036 borra todos los modelos y la configuración de variables existentes** e inserta el catálogo; los mensajes enviados conservan su texto. La firma del email pasa al pie del diseño.
- **#214:** spec 83 de registro automático de canales (email, WhatsApp con user script de Tampermonkey, Instagram).
- **#215:** F1a de la spec 83. Migración 037 (`crm_inbound_messages`), `POST /_api/inbound/email` y `GET /_api/inbound/addresses` con `INBOUND_EMAIL_TOKEN`, y el Email Worker de Cloudflare (`workers/inbound-email/`) que reenvía a Gmail y entrega al CRM. Asociación por `In-Reply-To`, `References` y remitente autenticado (DMARC o SPF alineado según el `Authentication-Results` superior de `mx.cloudflare.net`); ante ambigüedad queda Sin asociar.
- **#216 (`e28bfd4`):** F1b. Emails recibidos en Comunicación del negocio (texto plano), «Registrar respuesta» y «No es una respuesta», bloque «Respuestas nuevas» en Hoy y página admin «Emails sin asociar» (`/inbound`) para asociar a mano.

- **#218 (`65f43ea`):** F2. «Responder» en emails recibidos, por el relay SMTP de Brevo y en el mismo hilo (`Message-ID` propio, `In-Reply-To`, `References`). Si el resultado es incierto, no se puede responder otra vez ese email. La migración 038 agrega columnas a `email_outbox` y repara `headers`/`attachments` que F1 guardaba como string JSON. Requiere `BREVO_SMTP_LOGIN`/`BREVO_SMTP_KEY`; sin ellas «Responder» queda oculto.
- **#219 (`17953b7`) y #220 (`060deaa`):** F3. El lado CRM (migración 039, tokens en «User script de WhatsApp» `/userscript`, contexto y registro por token, «Copiar nombre para agendar») y el user script de Tampermonkey (`userscript/`, servido en `/userscripts/hospeda-crm.user.js`, se actualiza solo). Lee el chat abierto en WhatsApp Web y registra lo visible solo después de una vista previa y una confirmación. Nunca escribe en WhatsApp.
- **#221 (`7705b46`):** Ayuda. Cuatro artículos del script de WhatsApp (instalar, vincular un chat, registrar y problemas), «Responder un email desde el CRM», «Asociar emails que llegaron sin negocio» y actualizaciones de los artículos de rutina, pantallas, contacto y correcciones. El control de textos de la Ayuda ahora también verifica la interfaz del script.
- **#222 (`e76b031`):** los WhatsApp recibidos ya no muestran «(sin asunto)», y el descarte dice «mensaje» en vez de «email».
- **#223 (`2eff9c6`):** la edición de negocios en lote y la redistribución de responsables guardaban su metadata del historial como string JSON, el mismo bug que corrigió #218. Ahora guardan objetos, y un control de código impide el cast directo `::jsonb`. **Las filas viejas siguen como string**; repararlas requiere una migración que aún no se decidió.
- **#224 (`b0c5545`):** pruebas de componente de «Mensajes recibidos», «Responder email» y «Emails sin asociar».
- **#226 (`13d26a8`):** migración 040. Repara la metadata vieja guardada como string en `account_updated` y `business_assignment_rebalanced`; es idempotente y no toca otras acciones. **Escribe sobre datos de producción en el deploy.**
- **#227 (`812fd71`):** el user script (1.1.0) completa el WhatsApp abierto desde «Contactar» en vez de duplicarlo, vincula un envío confirmado a mano, y la vista previa lo avisa.
- **#228:** el admin resuelve un email con resultado incierto («Marcar como enviado» / «Marcar como no enviado», con motivo y journal). Libera «Responder» en las respuestas inciertas. Nunca reenvía.

Pruebas: las de cada PR (typecheck, `npm test`, build, integración sobre bases descartables, e2e y tests del Worker). F1 se probó de punta a punta el 23/10/2026 con emails reales, el Worker desplegado y un servidor local expuesto por túnel temporal: la respuesta en hilo se asoció por `In-Reply-To` y los remitentes desconocidos quedaron Sin asociar. Pendiente: prueba real de asociación por remitente, verificación visual del propietario y lo listado en [pendientes](pendientes.md).

## Acciones solo con icono y guías al día — 22/10/2026 (mergeado/en PR a `staging`, sin desplegar)

- **#209 (mergeado a `staging`, `0e5d0fd`):** en Negocios, Abrir y Contactar pasan a botones solo con icono, con nombre accesible exacto y tooltip de propósito. La columna Acciones baja de 220 a 120 px; el layout de columnas pasa a v5 con una migración única (anchos guardados ≤ 220 → 120; mayores se conservan; después se respeta lo que elija el usuario). CI verde. El primer CI detectó que el foco no volvía a Contactar al cerrar el diálogo (el tooltip se montaba/desmontaba); se corrigió dejando el tooltip siempre montado.
- **Guías (`docs/guides-sync`):** auditoría de `src/content/user-guide.json`, `docs/guia-de-uso.md` (regenerada) y `docs/guia-capacitacion-vendedores.md` contra el código: Revisado como indicador de solo lectura (el estado real se cambia en Estado), recontacto al cerrar gestión con y sin fecha, Es cliente en No contactar solo admin, archivado de solo lectura para el responsable, columnas de contacto, búsqueda sin tildes con ñ, acciones con icono, editores inline y columnas agrupadas con «+N más». Revisión con contexto nuevo: dos hallazgos corregidos. `prueba-con-principiantes.md` y `usability-validation.md` son históricos y no se tocaron.
- Decisión del propietario: la columna y el filtro Revisado quedan de solo lectura por retrocompatibilidad; el estado lo cambia admin o responsable desde Estado.
- Las secciones siguientes sobre #206–#208 describen trabajo que ya está mergeado a `staging` (#206, #207, #208), aunque su texto diga «local».

## Columnas agrupadas en Negocios — implementación local

En `feat/business-table-group-columns` (PR #206) se implementó la columna agrupada para tabla y grilla, el editor en Configuración → Listado de negocios y el endpoint `/_api/business_column_groups`. Las definiciones usan `app_settings.business_list_column_groups_v1`; las semillas Tipo (id estable `classification`) y Contacto aparecen disponibles, pero no seleccionadas por defecto. Contacto incluye Persona de contacto, Teléfono, Teléfono de la persona, WhatsApp, Email y Email de la persona; Medio preferido queda afuera. Las preferencias aceptan IDs `group:<id>` y sólo quitan referencias a grupos eliminados después de cargar correctamente las definiciones. No hay actualización en vivo en otras pestañas.

En `fix/group-columns-polish` se ajustó la presentación de los grupos: etiquetas de miembro a 10 px con el token `--muted-foreground`, valores y controles en una línea con elipsis y acceso al texto completo por tooltip/título. Los grupos ahora muestran todas las líneas cuando hay algún miembro con dato o editable; los miembros vacíos muestran «—» o el editor inline según permisos. Se actualizó `src/content/user-guide.json` y se regeneró `docs/guia-de-uso.md`. Pasaron `npm run typecheck`, `npm test` (103 archivos, 812 pruebas) y `npm run build`. No se ejecutó el e2e ni integración. Sin commit, push, despliegue ni operaciones de base de datos.

En `feat/group-columns-max-lines` (PR #208) se agregó `maxVisible` opcional para limitar las líneas de tabla; omitirlo conserva «Todos» y sigue aceptando definiciones guardadas antes de este cambio. El administrador puede elegir el límite, que se ajusta si quita miembros. La tabla muestra los primeros miembros en orden y abre los demás en un popover con los mismos editores y permisos; las tarjetas siguen mostrando todos. Se actualizaron pruebas unitarias, la guía y el mapa técnico, y se agregó el recorrido navegador solicitado. Pasaron `npm run typecheck`, `npm test` (104 archivos, 817 pruebas) y `npm run build`. El e2e de grupos y las pruebas de integración no se ejecutaron. El fix de revisión queda local, sin commit ni push, despliegue u operaciones de base de datos.

Para la revisión del PR #208 se corrigieron dos bloqueos localmente: editar un miembro oculto conserva abierto el popover padre al interactuar con el dropdown portal del editor, desactiva la trampa de foco y deja que Esc cierre primero el editor; la poda de preferencias se escribe cuando termina la restauración y con su página corregida, en una sola escritura. Se agregó cobertura E2E del editor anidado y una prueba de restauración/persistencia. Pasaron `npm run typecheck`, `npm test` (104 archivos, 819 pruebas) y `npm run build`; el E2E no se ejecutó localmente y queda para el coordinador. Sin commit ni push.

Se corrigió un tercer blocker de revisión: la captura ya no usa un indicador de “saltar la próxima”. Conserva la huella serializada de preferencias y contexto guardados al podar, y omite capturas repetidas sólo mientras ese valor siga igual; una edición posterior de preferencias se persiste. La prueba de página verifica que la poda hace una escritura y que un cambio de ordenamiento posterior hace una segunda. Pasaron `npm run typecheck`, `npm test` (104 archivos, 819 pruebas) y `npm run build`. Sin commit ni push, Docker ni operaciones de base de datos.

El primer blocker de revisión #206 sobre la carga de definiciones quedó corregido localmente: Configuración conserva columnas, anchos, fijaciones, orden y vistas compartidas mientras la consulta está pendiente o falla, informa el estado y permite reintentar o guardar sin podar. El segundo blocker queda corregido localmente: Negocios espera sólo las configuraciones por defecto del equipo; mientras los grupos no se resuelven, conserva sus referencias, oculta las columnas desconocidas y usa `nombre` para ordenar la solicitud. La misma clave efectiva determina `aria-sort` y el indicador del encabezado sin alterar la preferencia guardada. Las ediciones durante la espera conservan referencias a grupos; al resolver definiciones se podan únicamente las referencias inexistentes y las preferencias personales se escriben una vez. Cuando la consulta de grupos responde correctamente, muestra las columnas existentes. El e2e cubre grupos demorados y fallidos en Negocios. Validación local: `npm run typecheck`, `npm test` (103 archivos, 809 pruebas) y `npm run build` pasaron; la prueba de página cubre sort, preservación/poda y conteo de escrituras además de respuestas demoradas y fallidas. No se ejecutó el e2e ni integración. Sin commit, push, migración ni operación de base de datos.

## Revisión de UX y rendimiento — 20 y 21/10/2026 (mergeada en `staging`, sin desplegar)

**Estado de cada hecho.** Implementado y mergeado a `staging`: todo lo que sigue. Desplegado a producción: **nada**. Promoción de `staging` a `main`: **no hecha**; la decide el propietario más adelante. Verificación visual del propietario sobre un entorno real: pendiente. Las cifras de CI/pruebas pertenecen a cada PR, no son un contador vivo.

Antes de promover hay que tener en cuenta:

- **Migraciones nuevas, sin aplicar en producción:** 024–033. 024–026 (rendimiento y sesiones) y 027–031 de esta revisión: 027 resultados unificados y próximo paso obligatorio, 028 seguimiento de resultados de contacto, 029 índice de eventos de pipeline por negocio y etapa, 030 índices de primeros pasos y usuarios, 031 índice parcial de negocios No contactar; de la tanda de seguimientos, 032 índices GIN `pg_trgm` para la búsqueda y 033 índice parcial de tareas hechas por día. 028 fija el instante desde el cual se rastrea «Anotá cómo salió» (en producción, el momento de aplicarla). 024 y 029–031 crean índices sin `CONCURRENTLY` (bloquean escrituras de esas tablas mientras se crean); 025 hace un `UPDATE` de `sessions`; 026 reemplaza triggers; 027 cambia constraints y las valida recorriendo `crm_tasks` y `crm_activities`. **032 ejecuta `CREATE EXTENSION IF NOT EXISTS pg_trgm`: el rol de migración necesita `CREATE` sobre la base de datos; si falta, 032 hace rollback y `migrate && start` impide que la aplicación arranque** (precomprobación: `SELECT has_database_privilege(current_user, current_database(), 'CREATE');`, o crear la extensión antes con un rol administrador). 032 y 033 usan `CREATE INDEX` simple (bloqueo `SHARE`, segundos con el volumen de producción) y `migrate.mjs` no define `lock_timeout`. Ejecutar en horario de baja actividad; detalle en [pendientes](pendientes.md) y en las [notas de deploy del plan de rendimiento](rendimiento-y-arquitectura-2026-10.md).
- `JWT_SECRET` ahora es obligatorio (32 o más caracteres, sin valor de ejemplo): el servidor no arranca sin él (#131, mergeado el 21/10/2026). Debe estar bien definido en Coolify antes de desplegar.
- Healthcheck de Coolify: informado por el propietario el 21/10/2026: lo pasó a `/_api/health/ready` (verifica la base de datos). No verificado desde el repo (informado por el propietario); el comentario de `src/server/app.ts` ya lo refleja.

PRs mergeados a `staging` (#151–#193 de la revisión de UX más la base de rendimiento), agrupados (título resumido de cada uno):

- **Rendimiento, seguridad y arquitectura (#114–#149, plan de rendimiento; ver [resultados](rendimiento-y-arquitectura-2026-10.md)):** carga diferida del editor y la guía; caché de recursos y estáticos con compresión; sondeo de versiones en vivo por dominio; sesiones con expiración y renovación en pestañas abiertas; login sin enumeración de cuentas; JWT obligatorio (#131); errores sin filtrar mensajes de Postgres; códigos HTTP correctos; límite de cuerpo; cabeceras de seguridad, CSP en modo reporte y verificación de Origin; id de petición, log de lentitud y salud con base de datos; bloqueo de filas en Comunicación en lugar de tablas; endpoints muertos retirados; imagen Docker sin root; error boundary.
- **Entorno local (#150):** `npm run local`.
- **Fundamentos de UX (#151–#155):** fechas en hora de Argentina (24 h); tonos de badge semánticos con contraste legible; Esc acotado a selectores, motivos de deshabilitado honestos y validación en línea; vocabulario, etiquetas y catálogo de resultados; cliente de API compartido con errores en español, timeout y reintentos.
- **Negocios y Gestiones (#156–#158, #166, #167):** chequeo de duplicados y bloqueo ante un negocio No contactar; valores por defecto de vendedor, columnas y vista de contacto reciente; totales y tarjetas más calmas en el tablero; acciones por fila claras, esqueletos y tarjetas móviles; alta de negocio en un paso con aviso de duplicado.
- **Permisos (#159, #172, #192):** negocio archivado o No contactar de solo lectura para su responsable; vendedor con gestión abierta corrige datos de contacto; D1 y 1C (solo responsable o admin registran «Pidió no ser contactado»; negocios No contactar de solo lectura para no admins).
- **Sesión y contacto (#160, #161, #170, #174):** diálogo de nuevo ingreso al expirar la sesión conservando la página y los borradores; destinatario y borradores de WhatsApp; todo contacto termina en «¿Cómo salió?» → «¿Cómo sigue?»; un solo diálogo Contactar y llamadas.
- **Resultados y tareas (#162, #163, #173, #180, #183, #184):** lista única de resultados y próximo paso obligatorio; Comunicación usa la misma lista; «Agendar tarea» con atajos de fecha; Hoy rehecho con tareas posponibles, progreso y trabajo urgente sin paginar; editor liviano «Anotar lo que pasó»; etapa sugerida como casilla explícita.
- **Búsqueda y navegación (#164, #165):** teléfonos con cualquier formato y búsqueda por varias palabras (nombre + ciudad); navegación del vendedor Hoy, Negocios, Gestiones, Ayuda.
- **Ficha y gestión (#168, #171, #175, #177, #178):** página de gestión con badge de etapa, diálogo de etapa agrupado y reglas de reapertura; ficha con un próximo paso, estado como badge-botón y cuatro pestañas; línea «Qué pasó» unificada como pestaña por defecto; notas de etapa visibles en esa línea; ayudas, estados vacíos que enseñan y descarga de documentos para el responsable archivado.
- **Móvil, accesibilidad y primer uso (#179, #182):** pasada móvil y errores accesibles en línea; lista de primeros pasos y estado vacío didáctico en Hoy.
- **Vocabulario y colores (#185, #186):** barrido final con guardia estricta de vocabulario; color fijo por rubro en los badges.
- **No contactar y recontacto (#187, #188, #190, #191):** advertencia (sin bloqueo) por teléfono de persona de un negocio No contactar; «Recontactar» con fecha crea la tarea «Volver a contactar»; aviso al contactar un teléfono No contactar (D2); cancelación de tareas pendientes al quedar No contactar (D3).
- **Guía y pruebas (#189, #193, #169, #176, #181):** guía en pantalla sincronizada con las últimas reglas No contactar y «Hoy» en todos los textos (#193), con un test que verifica sus etiquetas; arreglos de pruebas inestables.
- **Seguimientos de la revisión (#195–#201, 21/10, mergeados a `staging`, sin desplegar):** #195 (D4) un contacto pasado de acompañamiento en un negocio No contactar solo marca Es cliente si lo registra un admin; #196 cerrar una gestión con fecha deja solo la tarea de la gestión «Recontactar según lo acordado» (la «Volver a contactar» sin tocar del negocio se cancela) y cambiar el responsable del negocio mueve su tarea sin tocar; #197 marcadores de ejemplo de `JWT_SECRET` unificados (advertencia ante espacios o comillas), e2e estabilizados, `line-clamp` estándar y aserción del chip de lunes; #198 diálogos `.editor` como hoja inferior en móvil, ajuste por `visualViewport` ante el teclado, `viewport-fit=cover` con márgenes de área segura y áreas táctiles de 44 px; #199 migraciones 032 (índices `pg_trgm`) y 033, consulta de historial compartida entre el resumen y el historial del negocio, y aviso del tope de urgentes en Hoy con acceso a filtros; #200 `task_save` con concurrencia optimista por `updated_at` (409 con mensaje en español, sin migración); #201 el responsable de un negocio archivado lee en solo lectura la gestión y su comunicación por `leadId`. Los seguimientos que quedaron abiertos están en [pendientes](pendientes.md). Pruebas: las de cada PR (typecheck, `npm test`, build, integración y e2e sobre bases descartables); no hay verificación visual del propietario ni prueba en un teléfono real.
- **Otros:** #133 (CI más rápida), #138 (actualizaciones de seguridad), #149 (documentación del plan de rendimiento).

Este documento, [decisiones](decisiones.md), [pendientes](pendientes.md), el historial y la guía Markdown se actualizaron al cierre (U-34), con `staging` incluyendo #193; la tanda de seguimientos #195–#201 se registró después.

## Configuración de variables de texto para modelos — 19/10/2026

En `staging`, localmente y sin commit, se agregó Configuración → **Variables de texto**. Permite crear, editar y eliminar variables; seleccionar fuente CRM, sistema, otra variable o texto; y definir textos por vertical, tipo de negocio, tipo de gestión, hora local, canal y presencia de nombre de contacto. Se precargaron variables genéricas `saludo`, `gracias`, `despedida`, `presentacion`, `pregunta_cierre` y `firma`; las variables existentes se conservan. Si ya existía un catálogo guardado, los nuevos valores predeterminados se agregan sin reactivar los que el admin haya deshabilitado. Los modelos insertan el catálogo configurado y la vista previa y el servidor resuelven las mismas reglas; los mensajes preparados conservan una copia del contexto y definiciones usadas. La configuración se guarda en `app_settings`, sin migración de esquema.

Las variantes se resuelven por condiciones reales y gana la combinación más específica; combinaciones duplicadas se rechazan. No se implementó rotación aleatoria o cíclica de textos. Pasaron `pnpm run typecheck`, 13 pruebas focalizadas de render/variables, `pnpm run build` y `git diff --check`. El build conserva el aviso existente de chunk JavaScript superior a 500 kB. Pendiente: revisión visual manual de la nueva sección y prueba funcional en la app autenticada. Sin commit ni push.

## Auditoría del flujo comercial — 19/10/2026

Se revisó estáticamente el recorrido desde alta/revisión del negocio hasta gestión, comunicación, tareas, cierre y reactivación sobre `staging` (`6cc6bb2`). Se documentó el informe [auditoria-flujo-comercial.md](auditoria-flujo-comercial.md) y una guía para capacitación de vendedores principiantes en [guia-capacitacion-vendedores.md](guia-capacitacion-vendedores.md). También se actualizó la guía compartida en Markdown y su fuente JSON para usar la columna **Revisados** y advertir sobre límites actuales de Reactivación.

Hallazgos prioritarios originales: Reactivación no conservaba el tipo de gestión; ofrecía reapertura a no administradores; el cierre por “Pidió no ser contactado” dejaba elegir una fecha incompatible; algunos controles de cambio de etapa aparecían habilitados sin permiso. Los puntos P0 1–4 ya están corregidos; el commit `d173889` está en `staging` y `origin/staging`. P1 5 y 6 quedaron en `045ab36` y ya están publicados en `origin/staging`. P1 7, 10 y 11 están en `8e9e7ca`, publicado en `origin/staging`. P1 12–16 están corregidos localmente: Reactivación anticipa opciones y resume la tarea de recontacto; Archivar y Enviar a Papelera explican usos distintos; la ficha resume la última interacción, tareas pendientes y gestiones abiertas, y cada gestión muestra su actividad reciente junto al próximo paso; Contactar, pipeline y tareas diferencian la relación general del negocio, la gestión concreta y quién ejecuta la tarea. Pasaron typecheck, build y E2E con API interceptada en desktop/móvil para #12–15; para #16 typecheck, build y `git diff --check`. No se probó con la base. Falta revisión visual manual de los puntos corregidos.

## Corrección de Reactivación — P0 1 y 2

Se ajustó Reactivación para conservar el tipo de gestión al reabrir o crear otra gestión vinculada, listar solo etapas abiertas compatibles y no ofrecer la etapa especial de derivación a Leandro. La UI deshabilita la reapertura para no administradores y la API vuelve a comprobar el rol. Pasaron cuatro pruebas unitarias, `pnpm run typecheck` y `pnpm run build`. No se ejecutaron escrituras ni pruebas de integración con base.

## Corrección de cierres y permisos del pipeline — P0 3 y 4

Al cerrar una gestión con motivo **Pidió no ser contactado**, el formulario oculta la fecha de recontacto, descarta una fecha marcada antes y avisa que el negocio quedará Archivado y No contactar. El payload también omite la fecha para ese motivo; la validación del servidor sigue activa. En el tablero y el detalle de gestión, **Cambiar etapa** ahora usa el permiso `canModify` calculado por el servidor mediante `canModifyManagement`; si no corresponde, queda deshabilitado con explicación. El detalle informa quién es el responsable. Pasaron typecheck, 11 pruebas unitarias de permisos/Reactivación y build; no se probaron escrituras ni integración con base.

Commit `d173889` publicado en `origin/staging`.

## Camino recomendado para vendedores nuevos — P1 5

La guía de capacitación y la ayuda dentro del CRM señalan el mismo recorrido: empezar por Mi día si ya existe una tarea; si no, buscar el negocio, abrir su ficha y elegir Contactar o Iniciar gestión según el objetivo. El resultado se registra en el mismo contexto y el próximo compromiso queda como tarea. Búsqueda global, pipeline e historial se describen como atajos, no como procesos distintos. No se quitaron accesos alternativos.

## Canales disponibles desde Contactar — P1 6

Desde Contactar en la ficha, el selector ofrece Email, WhatsApp, Llamada, Red social y Otro para contexto General o una gestión abierta. Email y WhatsApp conservan la preparación/envío existente; los canales manuales abren el formulario de registro con el contexto ya elegido. La guía de capacitación y la ayuda dentro del CRM explican qué queda pendiente y que iniciar o copiar no prueba que el contacto se realizó. Pasó `pnpm run typecheck`, `pnpm run build` y `pnpm exec playwright test tests/browser/mantine-contact.e2e.ts` (4 variantes desktop/móvil y claro/oscuro); también pasó `tests/browser/message-template-policy.e2e.ts` (3 casos). Las regresiones que exigen login no avanzaron de `/login` en el servidor local y no se ejecutaron contra la base. Cambios incluidos en `045ab36`.

## Cliente previo y cierre ganado — P1 7

La acción manual se renombró **Registrar cliente previo** y explica que aplica a relaciones anteriores al seguimiento en CRM. El motivo obligatorio ahora se conserva en el evento de journal y se muestra en el historial del negocio y el global. La guía dirige las ventas nuevas al cierre ganado de la gestión, que mantiene su conversión automática correspondiente. Pasaron typecheck, build y la prueba unitaria del formato del historial. No se ejecutó el test comercial de navegador porque requiere la base local descartable descrita en la guía; queda pendiente la comprobación visual.

## Compatibilidad de la marca «Revisados» — 18/10/2026

En `staging` se restaura la columna seleccionable y el filtro booleano «Revisados» para tabla y cards. La UI deriva el valor exclusivamente del estado del negocio: `Nuevo` (o estado ausente) = no revisado; cualquier otro estado = revisado. Los filtros y columnas guardados con el nombre anterior se conservan; las preferencias de columnas antiguas recuperan la columna una vez y luego permiten ocultarla. El modelo interno y la base siguen usando `crm_accounts.status`; no se consulta ni modifica `review_status` y no se agrega migración.

Verificación local: typecheck, suite completa de Vitest (24 archivos, 111 pruebas) y build pasan; el build mantiene el aviso existente por el bundle principal mayor a 500 kB. Commit `665f614` está en `staging` y fue enviado a `origin/staging`. El servidor Vite del checkout continúa escuchando en `localhost:5173`.

Este documento es el traspaso de la conversación de desarrollo a un checkout local. No importa automáticamente la conversación de ChatGPT a Codex o Claude: conserva las decisiones y la evidencia útil en Git. Verificar el estado remoto al comenzar una nueva sesión.

## Contexto

Hospeda CRM es la herramienta interna de prospección y seguimiento comercial de Hospeda. Está en producción en https://crm.hospeda.com.ar, alojada en un VPS con Coolify y PostgreSQL 17. Es independiente del portal turístico público https://hospeda.com.ar.

La UI debe ser sencilla para vendedores y personas con poca experiencia técnica. El propietario pidió especial atención a móvil, claridad de próximos pasos, loading visible y diseño cuidado. Las pruebas automatizadas no equivalen a haber medido usabilidad con usuarios.

Base remota comprobada para este traspaso: `75904f4acb6958fa8ca90bee3689f73b4a796275` (merge del [PR #92](https://github.com/qazuor/hospeda-leads/pull/92)). El propio PR de documentación será un commit posterior: esta referencia es una base histórica, no un HEAD perpetuo.

## Estados de negocio y gestión — integrados en staging

El issue aprobado [#98](https://github.com/qazuor/hospeda-leads/issues/98) define separar el estado del negocio del estado de cada gestión, preservar los negocios que ya no estén en estado Nuevo y redistribuir los restantes de forma equitativa contando también el trabajo previo. Los PRs #99–#103 están mergeados en `staging`; esto no significa que estén en `main` ni desplegados. La redistribución productiva ejecutada el 15/10 está registrada más abajo; no repetirla automáticamente.

## Lo implementado en main

| Área | Estado y alcance | Referencia |
|---|---|---|
| Modelo comercial | Negocios, personas y gestiones independientes; altas/importaciones solo de negocio; gestiones explícitas e idempotentes | [Fase comercial](crm-roadmap/01-commercial-foundation.md), [inicio explícito](crm-roadmap/07-explicit-management-and-cleanup-audit.md) |
| Seguimiento | Tareas, actividades, Mi día, Agenda, siguiente pendiente y seguimiento general o por gestión | [Trabajo](crm-roadmap/02-tasks-activities.md), [continuidad](crm-roadmap/47-pending-continuity.md) |
| Pipeline | Etapas, objeciones, reactivación y acuerdos con cambios explícitos | [Pipeline](crm-roadmap/03-pipeline-reactivation.md), [reglas pendientes](crm-roadmap/48-commercial-rules-review.md) |
| Calidad/importación | Procedencia, revisión de lotes, API de importación y fusión explícita; no fusionar por simples coincidencias | [Calidad](crm-roadmap/04-data-quality.md), [API](BUSINESS_IMPORT_API.md) |
| Comunicación/materiales | Email Brevo, WhatsApp asistido, modelos, documentos/versiones y biblioteca administrada | [Comunicación](crm-roadmap/05-communication-resources.md), [miniaturas](crm-roadmap/49-material-thumbnails.md) |
| UI compartida | Mantine, wrappers, primitivas CSS, header móvil con hamburguesa y Drawer, navegación responsive | [Sistema visual](ui-visual-system.md) |
| Filtros/vistas | AND/OR, exclusiones, búsqueda libre, badges que editan solo el valor, vistas y guardado contextual | [Badges](crm-roadmap/32-filter-badge-values.md), [vistas](crm-roadmap/33-contextual-view-save.md) |
| Búsqueda | Normalización sin acentos en búsquedas y filtros restantes, conservando ñ | [Búsqueda](crm-roadmap/43-complete-accent-search.md) |
| Historial comercial | Conversaciones, resultados y compromisos; auditoría técnica separada | [Historial comercial](crm-roadmap/44-commercial-history.md) |
| Recorrido del vendedor | Contactar desde tareas comparte el recorrido; resultados guiados y revisión; reprogramación/cancelación/duplicados | [Contactar](crm-roadmap/45-task-contact.md), [resultados](crm-roadmap/46-guided-results.md) |
| Feedback | Avisos con destinos y reintentos pertinentes; bloqueos inmediatos de guardado y conservación del formulario | [Avisos](crm-roadmap/50-actionable-feedback.md), [loading](crm-roadmap/51-loading-audit.md) |
| Accesos rápidos | Ctrl/Cmd+K: navegación más búsqueda de negocios, gestiones, personas, notas, pendientes, archivos, mensajes, actividades y modelos según permisos | `src/endpoints/search.ts`, `tests/browser/business-trash-search.e2e.ts` |
| Archivo/Papelera | Archivo del negocio y eliminación lógica del negocio son estados separados; Papelera conserva además la consulta de gestiones eliminadas | Migración 016, [PR #91](https://github.com/qazuor/hospeda-leads/pull/91) |
| Historial global | Unión de journals de gestiones, negocios/contactos, trabajo, recursos, pipeline y configuración; filtro por negocio y eventos sin gestión | [PR #92](https://github.com/qazuor/hospeda-leads/pull/92), `src/helpers/globalHistoryServer.ts` |
| Metadatos históricos | Campos propios de negocio para origen, referencia, Filtrado y suscripción histórica; recuperación manual auditada | Migración 017, [procedimiento](business-metadata-recovery.md) |

La lista describe código entregado y pruebas disponibles. No declara que toda pantalla o contenido real esté perfecto. Las auditorías visuales anteriores recibieron nuevas observaciones del propietario y necesitan seguimiento.

## Operaciones de datos: ya realizadas, no repetir

### Limpieza del 8/10

El propietario amplió explícitamente el alcance para borrar todas las gestiones artificiales, indicando que no representaban seguimiento real. El operador reportó `cleanupCommitted:true`: 1.602 gestiones eliminadas, 3.532 negocios y responsables conservados y 2 personas conservadas. Hubo respaldo externo, restauración aislada y ensayo con rollback. Se quitaron también sus filas comerciales relacionadas; ver [runbook](management-cleanup-runbook.md).

La auditoría conservadora inicial devolvía 0 candidatos y 1.602 bloqueadas: no fue una licencia para ignorar bloqueos. La operación posterior tuvo un alcance distinto, autorizado expresamente.

### Comparación actual del 10/10

Se recibió un respaldo completo posterior a la limpieza y se verificó su SHA-256. La comparación de filas comprobó:

- Mismos 3.532 negocios y responsables; 2 contactos idénticos.
- 20.547 evidencias y 173 lotes de importación idénticos.
- Documento, versión y vínculo idénticos, incluido el archivo.
- 22 negocios con nuevos canales, direcciones o notas; todos con eventos `account_updated`. Esos cambios se conservaron.
- Journal antiguo: 1.914 filas conservadas con `lead_id` desvinculado; comercial: 4.215 → 4.241; trabajo: 11 → 17; recursos: 20 → 26. Los eventos antiguos de estos journals permanecieron.
- Las bajas de gestiones y sus relacionadas coinciden con la limpieza autorizada. Los 110 eventos de `crm_pipeline_events` sí se eliminaron: el historial unificado no los reconstruye.
- Revisión editorial de modelos observada en el respaldo: 31 modelos anteriores conservados, 6 agregados, 30 textos revisados y 1 modelo de prueba desactivado; 37 registros totales.

Estos son conteos del snapshot recibido, no del estado actual después de cada nueva acción.

### Recuperación del 10/10

El usuario pidió recuperar únicamente Papelera, origen, fuente de referencia, Filtrado y suscripción. Se preparó un manifiesto privado externo a Git y un ejecutor de vista previa/aplicación con huella, conflictos, transacción y auditoría.

Se restauraron las 44 tablas del respaldo actual en una copia aislada PostgreSQL embebida (PGlite 18.3); se reprodujo exactamente la huella de producción, se ensayó la aplicación y se comprobó idempotencia y preservación de los demás campos/tablas. Ese ensayo no prueba concurrencia ni roles/ACL del servidor nativo. El ejecutor también pasó integración en PostgreSQL 17 en CI.

El operador confirmó `committed:true` y cero conflictos en producción, con estos conteos:

| Atributo recuperado | Negocios |
|---|---:|
| Origen | 1.600 |
| Fuente de referencia | 1.590 |
| Filtrado | 146 |
| Suscripción histórica | 5 |
| Papelera, fecha y autor | 23 |

Los grupos se superponen y afectan 1.600 negocios distintos. No se recrearon gestiones. El manifiesto, dumps e informes individuales no se incluyen en el repositorio. Se pidió conservar el informe aplicado fuera del contenedor. Falta confirmación humana de la visualización final en Papelera, filtros y Historial global.

## Bloques abiertos

1. Verificación visual de esa recuperación y del historial global sobre el deploy actual.
2. Nuevo recorrido real de UI, operando formularios, diálogos, menús y estados, en desktop/móvil y ambos temas.
3. Decisiones funcionales comerciales pendientes, antes de añadir automatismos.
4. MCP OAuth y revisión de negocios para multiverticales/fusiones: pospuestos por el propietario.

Detalles y orden sugerido: [pendientes](pendientes.md). Instrucciones estables: [decisiones](decisiones.md). Historia de entregas: [historial](historial-desarrollo.md).

## Última validación comprobada

PR #92: 93 pruebas unitarias, 115 recorridos de navegador, integraciones PostgreSQL 17, build y smoke de Docker aprobados antes del merge. Son los resultados de esa revisión; no cifras a prometer para cualquier commit futuro. Pruebas nuevas del historial usan desktop 1280px y móvil 390px. Otras suites incluyen 320px y ambos temas.

Un CLI local debe volver a verificar comandos, permisos y checks del cambio que realice. El historial de conversaciones de cada herramienta se retoma con su mecanismo propio; los documentos y PRs son el traspaso entre herramientas.

## Planificación de IA — definición funcional acordada

Se generaron una épica, una spec fundacional y 19 specs hijas. El propietario definió la experiencia (chat general y acciones contextuales), acceso para todo usuario autenticado respetando permisos CRM, uso de ficha e historial completos cuando se permiten, registro de prompts/respuestas vinculados al negocio en su journal y de fragmentos por negocio para resultados multinegocio, límites antes de habilitar, punto de comparación por fecha y el informe de cartera con 30 días predeterminados, desglose por responsable y métricas iniciales acordadas. Dictado queda fuera de la primera etapa. No hay integración LLM ni implementación aprobada. Proveedor/modelo se elegirá antes de implementar; también falta verificar privacidad, retención, entrenamiento, región y contrato del proveedor antes de enviar datos reales. Ver [épica 61](crm-roadmap/61-ai-in-crm-epic.md), [base 62](crm-roadmap/62-ai-platform-foundation-spec.md) y el [inventario](crm-roadmap/60-ideas-uso-ia.md).

La documentación se integró en `staging` mediante los PRs [#107](https://github.com/qazuor/hospeda-leads/pull/107), [#108](https://github.com/qazuor/hospeda-leads/pull/108), [#109](https://github.com/qazuor/hospeda-leads/pull/109) y [#110](https://github.com/qazuor/hospeda-leads/pull/110). La implementación de IA sigue pendiente.

## Integración de cambios visuales, estados y comunicación

La rama `feat/integrate-crm-state-communication-visual` recibió el cambio visual del PR #102, la cadena de estados (#99–#101 y sus cortes de journal, API, UI y preferencias), los cambios locales complementarios y Comunicación. El PR #103 se mergeó en `staging` el 14/10. La migración 019 se mantuvo intacta; el nuevo código de archivo está en la migración 023.

Incluye las migraciones 018–023, la conversión de vistas, flujos de estados, derivación, comunicación, la limpieza aprobada de secuencias de prueba y las specs 53–59. No se ejecutaron migraciones ni escrituras de base durante esta integración; tampoco se inició ningún servidor. La limpieza de secuencias de la migración 022 requiere revisar el preflight antes de aplicarla a cualquier base.

La validación registrada para el PR #103 fue `pnpm run typecheck`, `pnpm test` (23 archivos, 110 pruebas), `pnpm run build` y `git diff --cached --check`; el build conserva la advertencia de chunk mayor a 500 kB. No se ejecutaron pruebas de navegador ni de integración PostgreSQL como parte de ese PR. Falta revisión visual y validar migraciones sobre una base local descartable.

## Cambio mergeado — marca de revisión y ayuda del CRM

En el checkout local se agregó UI para editar `crm_accounts.review_status` desde el formulario del negocio, ofrecer Revisión como columna opcional para tabla y cards, editarla inline, mostrar el valor en el detalle, y filtrar por la marca. El valor `filtered` identifica Filtrado; `NULL` se presenta como No filtrado. No se agregó una migración porque el campo existe desde la migración 017. Los filtros de columnas de usuario también ofrecen “Usuario autenticado”, resuelto en el servidor para cada sesión en `assignedUserEmail`, `asignadoA`, `quienCargo` y `creadoPor`. La ayuda suma accesos directos por tarea para el recorrido de negocio a venta y para cerrar una venta, muestra los artículos anidados bajo sus temas y los expone en la paleta de comandos con búsqueda aproximada. Incluye una guía para verificar negocios precargados, marcarlos Filtrado si son válidos o enviarlos a Papelera si son inválidos. Los badges editables simples de tabla y cards abren ahora una lista compacta de opciones como badges y guardan al seleccionar; Vertical/Subtipo conserva el editor detallado por sus dependencias, y las columnas de gestión mantienen la selección explícita cuando hay más de una gestión.

Validación local: `pnpm run typecheck`, `pnpm test` (95 pruebas), `pnpm run build` y los 15 recorridos de navegador afectados aprobados; Vite mantiene el aviso de chunk grande (>500 kB). La pasada completa de CI terminó verde sobre `8b5583d`. El [PR #95](https://github.com/qazuor/hospeda-leads/pull/95) se mergeó el 11/10/2026. No inferir deploy desde el merge. `pnpm-lock.yaml` estaba sin seguimiento y no formó parte del cambio.

## Pulido visual de navegación y recorridos

En la rama `feat/visual-polish-ux` se compactó el header entre 768 y 1440 px para mantener la navegación agrupada y evitar que “Más opciones” quede aislado; se agregaron indicaciones de desplazamiento en los accesos horizontales de la Guía y las vistas guardadas; y se jerarquizaron las acciones de Mi día/Agenda con verbos más claros y una acción principal. El reporte estético y las mejoras futuras priorizadas están en [pendientes](pendientes.md).

Validación local: `pnpm run typecheck`, `pnpm run build` y 6 pruebas de navegador dirigidas (11/10/2026). Se usaron respuestas sintéticas; no se recorrieron datos productivos ni todas las pantallas/temas con una persona usuaria. Build mantiene el aviso de bundle principal mayor a 500 kB. El CI, merge y deploy de este cambio quedan pendientes.

### Segunda pasada visual — previsualización local sin commit

En el mismo checkout se avanzó sobre los hallazgos estéticos del listado de negocios, las cards, el detalle de negocio y los formularios de gestión/modelos/configuración. Se evitó cambiar permisos, reglas comerciales, endpoints o persistencia. La referencia del responsable en cards ahora tiene espacio propio y una sola línea; en móvil se agruparon las vistas y el restablecimiento de preferencias para reducir altura; el bloque de filtros y vistas ahora separa búsqueda, vistas guardadas y filtros aplicados con divisores sutiles, y oculta el aviso de ausencia de vistas personales dentro del carril horizontal. Se dejó una única forma de editar/borrar vistas personales: el botón “Administrar” abre el diálogo; los badges solo seleccionan vistas. Restablecer preferencias también limpia la identidad de la vista activa y su marca en el selector. Las columnas fijadas tienen un tinte de color de acento más visible en desktop, manteniendo el patrón de franjas y adaptándose al tema oscuro. En la tabla, la columna de selección queda siempre primera y fija a la izquierda, incluso en móvil; los anclajes izquierdos configurables dejan reservado su ancho. Los bloques secundarios del detalle usan divisores en vez de paneles anidados; y los formularios de gestión resaltan el contexto del negocio y usan etiquetas/ayudas más legibles. La prueba de navegador del flujo Mi día actualizó su texto esperado al nuevo nombre del botón.

Estado al 11/10/2026: cambios presentes solo en el árbol de trabajo, sin commit ni push, para previsualizar en `http://localhost:3001`. `pnpm run typecheck`, `pnpm run build`, `pnpm test` (95 pruebas), pruebas dirigidas con fixtures sintéticos y `git diff --check` pasaron. La última prueba `business-view-badges.e2e.ts` junto con `personal-views.e2e.ts` pasó en desktop y móvil (4 casos); comprueba selección, foco, edición, borrado y que administrar una vista no cambie la búsqueda actual. `business-system-views.e2e.ts` ahora comprueba que Restablecer quite tanto la etiqueta de vista activa como el badge seleccionado en desktop y móvil. `business-table-reading.e2e.ts` verifica el listado fijado en desktop y móvil, que la selección permanezca a la izquierda durante scroll horizontal, y compara el fondo de columnas fijadas con el resto tanto en claro como oscuro. `mobile-scroll-cues.e2e.ts` también pasó y guardó una captura móvil del panel. Una suite de cards también encontró el fallo conocido de restauración del foco al volver del detalle; se mantuvo fuera del alcance visual y no se alteró esa interacción. No se ejecutaron recorridos que escriban en la base local, porque no se verificó qué base usa el servidor ya iniciado.

Refinamiento posterior: los chips del resumen de filtros ahora son más compactos; la vista activa aparece primero en esa línea, seguida únicamente por filtros añadidos o cambiados manualmente. Los filtros heredados se ocultan, pero los chips manuales conservan su edición inline y mantienen la agrupación de la configuración real. El nombre de la vista ya no se recorta; si es largo, puede ocupar más espacio y empujar el filtro manual a la línea siguiente. `pnpm run typecheck`, `pnpm test` (96 pruebas), `pnpm run build`, `business-system-views.e2e.ts` (desktop/móvil), `business-view-badges.e2e.ts` (desktop/móvil), `mobile-scroll-cues.e2e.ts` y `git diff --check` pasaron. Build conserva el aviso de bundle >500 kB. Sin commit ni push.

## Spec de estados de negocio y gestiones — 11/10/2026

Se redactó la spec de producto 53 y el reporte de brechas 54. Las decisiones funcionales ya se completaron; la implementación se está trabajando en ramas encadenadas separadas y aún no se integró a `main`. No se consultó la base de datos productiva.

La edición de vistas personales ahora permite cambiar también la búsqueda, los filtros avanzados AND/OR y limpiar los filtros heredados visibles desde el constructor. El editor carga la configuración guardada de esa vista y no reemplaza los filtros de la lista actual; el guardado conserva el resto de sus preferencias. `business-view-badges.e2e.ts` cubre edición, error de guardado con reintento y persistencia del nuevo filtro en desktop y móvil. `pnpm test` (96 pruebas), `pnpm run typecheck`, `pnpm run build` y `git diff --check` pasaron.

El [PR #97](https://github.com/qazuor/hospeda-leads/pull/97) ya fue mergeado. La expectativa de `tests/browser/work.e2e.ts` para el botón de Mi día se actualizó en la rama remota de esta rama de trabajo; está incluida en el conjunto que se publica a continuación.

Administrar vistas ahora permite duplicar una vista personal con su misma búsqueda y configuración, con nombre de copia editable. Los administradores también pueden convertir una vista personal en una vista de sistema compartida: la operación mueve su configuración al ajuste de equipo y elimina la vista personal en una transacción; los usuarios comunes no ven esa opción y el servidor la protege por rol. Las vistas compartidas aparecen y se administran en Configuración; pueden cambiar nombre, visibilidad, orden y filtros o quitarse. Si se convierte la vista que está activa, el selector conserva los filtros y pasa a marcar la vista compartida. Validado con `pnpm run typecheck`, `pnpm test` (97 pruebas), `pnpm run build`, `business-view-badges.e2e.ts` (duplicar como usuario común y convertir como admin, desktop/móvil para duplicación) y `business-system-views.e2e.ts` (desktop/móvil), más `git diff --check`. El build mantiene el aviso del bundle principal mayor a 500 kB. El servidor local se detuvo por pedido del usuario. Los cambios se publicaron en el [PR #102](https://github.com/qazuor/hospeda-leads/pull/102); CI está pendiente.

### Ajustes visuales menores en staging — 14/10/2026

En `/tmp/hospeda-staging`, los badges de ciudad muestran `C. del Uruguay` cuando el valor guardado es Concepción del Uruguay; el valor completo se conserva en el dato y como tooltip. Se dio al formulario de Contacto general una jerarquía de labels, controles y espaciado consistente. La revisión de formularios encontró además el editor de perfil con labels demasiado pequeños, el formulario de levantar restricción sin layout propio y el cambio de política de contacto heredando una grilla inadecuada; se ajustaron al mismo patrón. Sin cambios de permisos o comportamiento comercial. `pnpm run typecheck` y `pnpm test` (110 pruebas) pasaron; UI y API local respondieron correctamente. Sin commit ni push.

## Tooltips para acciones deshabilitadas — 15/10/2026

Auditoría e implementación local en `staging`: todos los `Button` y `CrmButton` deshabilitados muestran un tooltip accesible al pasar el mouse o enfocar con teclado, con razón explícita; se cubrieron también checkboxes deshabilitados, opciones inline, selectores y acciones implementadas con `UnstyledButton`/`ActionIcon`. Se añadieron motivos específicos para permisos, restricciones, destinatarios/datos faltantes, guardados en curso, estados del negocio, límites de paginación y vistas. No se modificaron reglas de permisos ni estados comerciales.

Verificado: `pnpm run typecheck`, `pnpm test` (23 archivos, 110 pruebas), `pnpm run build` y `git diff --check`; el build conserva la advertencia existente de chunk JavaScript >500 kB. El servidor local web/API respondió HTTP 200. Sin commit ni push. Revisión visual manual pendiente.

### Actualización de guías y ayudas — 15/10/2026

Se revisó la guía del CRM contra los flujos de estado y comunicación actuales. `src/content/user-guide.json` sigue siendo la fuente de la ayuda en pantalla y de sus resultados en la paleta de comandos; `docs/guia-de-uso.md` se regeneró desde esa fuente. Se añadió un artículo buscable que distingue estados del negocio, etapas de gestiones y marcas independientes. También se actualizaron las instrucciones de verificación, inicio de gestiones, Contactar/Email/WhatsApp, respuestas entrantes, cierres y motivos, recontacto, acompañamiento de ficha, modelos, vistas, papelera, administración e importaciones. Se retiraron referencias a secuencias y a etapas genéricas configurables que ya no describen el producto.

El panel “Cómo avanzar con esta gestión” ahora muestra el catálogo real según tipo, aclara que se pueden saltar etapas abiertas y separa la orientación histórica de las gestiones sin tipo. Se añadió una comprobación al recorrido de navegador de la guía. `pnpm run typecheck`, `pnpm test` (23 archivos, 110 pruebas), `pnpm run build` y `tests/browser/guide.e2e.ts` pasaron. El recorrido se ejecutó en `http://localhost:5173` con respuestas de API interceptadas; no escribió en la base. El build conserva el aviso de chunk mayor a 500 kB.

## Publicación de ajustes UX y guías — 15/10/2026

Los ajustes de interfaz, formularios, tooltips y guías se publicaron en la rama `feat/crm-ux-polish` y el [PR #105](https://github.com/qazuor/hospeda-leads/pull/105) ya fue mergeado en `staging`. Esto no implica merge a `main` ni deploy. Revisión visual manual pendiente.

## Integración local de estados, comunicación y ajustes de UI — 16/10/2026

El branch `feat/ui-aesthetic-functional-tweaks` se reubicó sobre el `staging` actualizado (`8a3095f`). Las implementaciones principales de estados y comunicación ya estaban integradas mediante el PR #103. De los dos worktrees locales, se incorporaron las decisiones de producto de estados y comunicación que faltaban, y se reforzó el test de migración para verificar la conservación de `Es cliente` y `No contactar` en la auditoría. Las variantes locales de componentes eran anteriores a los tooltips de `staging`; se conservaron las versiones actuales. La edición local de la migración 019 se excluyó porque las migraciones aplicadas son inmutables.

Validación en el branch: `pnpm run typecheck`, `pnpm test` (23 archivos, 110 pruebas), `pnpm run build` y `git diff --check`. El build conserva la advertencia existente de chunks mayores a 500 kB. Los tres commits de UI y la documentación/prueba complementaria quedaron integrados en `staging` mediante el commit `924d186` el 16/10/2026. Sin merge a `main` ni deploy confirmado.

## Reparto de responsables en producción — 15/10/2026

Por instrucción directa del propietario, se redistribuyeron los negocios no filtrados ni eliminados en orden ascendente por ID entre los cuatro usuarios con `role='user'`, excluyendo a Julián. Los 356 negocios filtrados o en Papelera conservaron su responsable. Quedaron 883 negocios asignados a cada usuario elegible. Se actualizaron 2.460 filas de `crm_accounts.assigned_user_email` y `updated_at`, con un evento `account_updated` por negocio en `crm_commercial_journal`. No se modificaron responsables de gestiones. La verificación posterior confirmó que cada uno de los cuatro usuarios tiene negocios de Alojamiento, Experiencias y Gastronomía. No repetir la operación como parte de un deploy o cambio de código.

El respaldo completo, manifiesto de reversión y scripts de rollback quedaron fuera de Git. La validación consistió en consultas SQL de solo lectura antes y después, más verificaciones dentro de la transacción. No hubo cambios de código ni pruebas de aplicación en esta operación.

## Acciones de negocios siempre visibles

En la rama `feat/ui-aesthetic-functional-tweaks`, las acciones Abrir, Contactar, Archivar y Eliminar quedan siempre visibles en tabla y grilla; las no permitidas se muestran deshabilitadas con explicación. La columna de acciones tiene un ancho mínimo de 150 px para evitar recortes. También se quitó el resaltado de columna que se activaba al pasar por un encabezado. `pnpm run typecheck` y `git diff --check` pasaron. Commits locales; sin push ni PR.


## Pulido visual de la ficha de negocio · PR 1/2 · 23/10/2026

Rama `ux/business-page-polish`. Primer paso del rediseño de `/accounts/:accountId` pedido por el propietario (falta de jerarquía visual). Cambios: escala tipográfica y ritmo de secciones bajo `.businessDetail` (títulos de sección 18 px, subsecciones 15 px, texto secundario 13 px) y limpieza de reglas CSS repetidas sin cambiar el resto de pantallas; el historial muestra 5 eventos y «Ver N más»; Datos del negocio muestra solo campos cargados y resume los vacíos en «Sin cargar: …»; los selectores de gestión/actividad de un documento nuevo pasan dentro de «Agregar documento o recurso»; «Registrar respuesta recibida» y «Ver tareas» dejan de ocupar todo el ancho. Sin cambios de API, permisos ni etiquetas existentes.

Medido sobre un negocio sintético con 34 eventos (solapa «Qué pasó»): 9657 → 3594 px de alto a 1280 px y 10614 → 4510 px a 390 px, sin scroll horizontal.

Validación local: `npm run typecheck`, `npm test` (122 archivos, 926 pruebas) y `npm run build` pasaron. E2E de la ficha sobre base Docker descartable: 38 de 39 pasaron; `commercial.e2e.ts` falla en el paso «CRM template» también con el build de `staging` en el mismo entorno local (en CI depende de datos que crean las integraciones previas), por lo que no se atribuye a este cambio. PR 1/2 mergeado en `staging` como #230 (`18db09c`).

## Ficha de negocio · PR 2/2 · 23/10/2026

Rama `ux/business-page-tabs`. Encabezado compacto (estado junto al nombre; datos y responsable; persona y canales; «Último contacto» desde la misma consulta del historial), Próximo paso como única tarjeta destacada y solapas «Historial», «Tareas», «Comunicación» y «Gestiones · Personas · Datos», con los `?section=` viejos redirigidos. «Copiar nombre para agendar» pasa a «Más acciones del negocio» (sigue visible en solo lectura). Se quitó «Resumen para retomar». El calendario de la fecha de recontacto se abre hacia arriba para no tapar «Guardar». La Ayuda y `docs/guia-de-uso.md` se actualizaron. Sin cambios de API ni permisos.

Medido sobre el negocio sintético: solapa Historial 2192 px a 1280 px y 2630 px a 390 px, sin scroll horizontal; a 390 px las solapas aparecen en y≈772 cuando Próximo paso está vacío y en y≈1057 con una tarea.

Validación local: `npm run typecheck`, `npm test` (122 archivos, 926 pruebas) y `npm run build` pasaron. Suite de navegador completa sobre base Docker descartable: 193 de 194; `commercial.e2e.ts` se detiene en el paso «CRM template», igual que con el build de `staging` en este entorno (en CI pasó con #230).

## Spec 88 — Instagram Direct por la API de Meta — cerrada: mergeada en `staging` (PR #260, `1393feb`) — 26/10/2026

- **Webhook** `GET/POST /_api/inbound/instagram`:
  - la verificación compara en tiempo constante y exige un token de 32 caracteres o más;
  - la firma es una HMAC sobre el cuerpo crudo, con un límite de 1 MiB;
  - cada evento se valida por separado, así una reacción o un aviso de lectura no hacen perder un mensaje real.
- **Mensajes del cliente:** van a `crm_inbound_messages` y se asocian por `perfil_instagram` normalizado. Con un solo negocio quedan «Por revisar»; con ninguno o con varios, en «Mensajes sin asociar» (antes «Emails sin asociar»).
- **Respuestas de Hospeda (ecos):** van a `crm_messages` como «Enviado desde Instagram de Hospeda». Las que no tienen negocio pasan al asociar el chat a mano.
- **Token:** cifrado con AES-256-GCM y cargado por un admin en Configuración → Integraciones. Se renueva todos los días bajo un advisory lock. Migración `045`.
- **Validación:**
  - en la base local: `test-instagram` tres veces; `test:inbound`, `test-communication` y `test-inbox`;
  - el CI en verde sobre `7cb4d0a`;
  - una revisión de seguridad con ojos nuevos, sin críticos y con todo corregido, salvo dos límites documentados;
  - **la prueba real de punta a punta** el 26/10/2026, con la app de Meta publicada, un túnel al CRM local y la cuenta `qaz.uor`: los mensajes del cliente se asociaron por usuario, la respuesta de Hospeda se registró como eco y la Bandeja muestra el ida y vuelta.
- Sin desplegar.
