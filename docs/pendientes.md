> Promoción `staging` → `main`: ejecutada el 30/10/2026 (#288); el runbook sigue siendo el procedimiento reutilizable, en [`runbook-promocion-produccion.md`](runbook-promocion-produccion.md).

# Pendientes y próximo trabajo

## Smoke de producción 2026-10-30

El smoke con usuario común quedó completo; el del admin está pendiente. Del smoke salió un lote planeado de specs:

- **99** registro honesto de contactos.
- **100** «Requiere acción» compacto.
- **101** links y envío de material.
- **102** pantalla de material de venta.
- **103** Bandeja sin asociar + Instagram + user script.
- **104** pulido de ficha, formularios y visual.
- **105** el script adjunta el material en WhatsApp Web (decisión D5 de la 101; sale en el script 1.8.0 con el bloque 4 de la 103 y el separador de verticales de la 102).

**Spec 105** (el script adjunta el material en WhatsApp Web; [`crm-roadmap/105-script-adjunta-material.md`](crm-roadmap/105-script-adjunta-material.md), borrador para revisión del propietario, rama `docs/spec-105-script-attach`): pendiente de implementación. Primero el prototipo en WhatsApp Web real (§6.4) y las decisiones abiertas D1–D5 (§17); después servidor (`material_file`, metadatos de adjunto, `media` en el registro, interruptor), script 1.8.0 (adjuntar + bloque 4 de la 103 + separador «De otras verticales» de la 102, que espera la rama `feat/spec-102-verticals-covers` en `staging`) y publicación con aviso previo a los vendedores. Sin migración.

**Spec 104, decisiones D2, D3 y D6 + spec 96 §10.1** (rama `fix/owner-decisions-small`, sin PR todavía): el responsable agrega restricciones por canal (levantar sigue solo admin), persona única preseleccionada en «Anotar lo que pasó», rótulo «HOSPEDA · {VERTICAL}» y respuesta nueva que no resuelve envíos. Falta: PR a `staging`, CI completo (suite de unidad entera, build y navegador no corridos en local) y revisar visualmente el rótulo en Gmail. D1, D4 y D5 siguen fuera de esta rama. Nota de despliegue (D6): los borradores de email guardados antes del deploy conservan el rótulo viejo hasta que se editen, porque el envío usa el `html_body` guardado.

**Spec 104** (pulido de ficha, formularios y visual; spec en revisión): bloque 3 (avisos y email: contraste por tipo, éxito 4 s / con acción 8 s, paneles laterales que registran su capa, rótulo del email con `line-height:1.5`) implementado en la rama `fix/spec-104-toasts-email`. Falta: PR a `staging`, suite de navegador completa (incluye el caso nuevo de `actionable-toasts.e2e.ts`) y el paso 0 del bloque 3 (capturas de la vista previa del email en Chrome y Firefox y del email recibido en Gmail, para confirmar que la tilde de «INVITACIÓN» se ve). El texto del rótulo sigue en D6 (bloque 4).
- Revisión del bloque 3, a confirmar en el navegador: la X de cerrar del aviso queda arriba a la izquierda (regla de Sonner) y ahora cae sobre la franja de color; desde la lista de negocios en pantalla completa, la vista previa (z 200) queda debajo del diálogo (z 410) desde antes de este cambio y ahora además pasa a ser la capa activa; los avisos largos sin acción (por ejemplo «WhatsApp abierto…») duran 4 s, con pausa al pasar el puntero.

**Spec 104** (pulido de ficha, formularios y visual): bloque 2 (formularios: 24 editor, 25 copy, 28, 29 copy, 31, 32, 33 y 37 prevención) implementado en la rama `fix/spec-104-forms`, sin PR todavía; el bloque 1 está en #316. Pendiente: PR a `staging`, suite de navegador completa (`work`, `session-expiry`, `light-activity-log` cambiaron) y los E2E nuevos que pide el plan de tests (Hoy «Agendar encuentro» con tipo de agenda, calendario que no tapa la hora, ciudad «san jose» → «San José»), que no se agregaron porque acá no se pudo correr el navegador. **Desvío para el propietario (hallazgo 32):** la spec pedía elegir solo el negocio cuando la búsqueda encuentra uno; se cambió por un botón «Elegir H123 · Nombre · Ciudad» debajo del buscador (clic o Enter, con la marca No contactar si corresponde), porque elegirlo solo desmontaba el buscador mientras se tipeaba y se perdían teclas o quedaba otro negocio. Aceptado por el propietario el 31/10/2026 (el botón «Elegir H123 · …» queda; no se elige solo). Tampoco se verificó en el navegador cómo se ve la fila de fecha y hora tras excluir los segmentos de las reglas del formulario. Siguen el bloque 3 (avisos y email) y el bloque 4, con lo decidido el 31/10/2026: D1 sin cambios; D2 el responsable del negocio o de una gestión abierta agrega restricciones por canal (levantarlas, solo admin); D3 persona preseleccionada si hay una sola activa; D4/D5 runbooks que aprueba el propietario (ningún agente los ejecuta; borrador en `docs/runbook-limpieza-catalogos.md`, sin ensayar ni aprobado); D6 rótulo «HOSPEDA · {vertical}».

**Spec 104** (pulido de ficha, formularios y visual; spec en revisión en #314): bloque 1 (ficha y vista de gestión: hallazgos 22, 23, 24 encabezado y Gestiones, 26, 27 copy y plurales, 30) implementado en la rama `fix/spec-104-business-view`. Validado en local (integraciones, typecheck, unit y build; detalle en `estado-desarrollo.md`). Próximo paso: PR a `staging` y CI con la suite de navegador. Quedan los bloques 2 (formularios), 3 (avisos y email) y 4 (decisiones D1–D6). No se sumaron los e2e nuevos del plan de pruebas del bloque 1 (`business-record-polish`, contacto desde la gestión, «Persona de contacto» en Gestiones): quedan para el PR o el bloque siguiente.

**Spec 103, D1–D5** («Mensajes sin asociar» por conversación, descartar con motivo, guardar el dato, «Volver a buscar negocios»): implementado en la rama `feat/spec-103-unmatched-inbox`, sin PR todavía. Próximo paso: PR a `staging`; CI corre `test-instagram.ts` y la suite de navegador (incluye el e2e nuevo `inbound-unmatched.e2e.ts`), que no corrieron localmente. Quedan fuera: sugerencia por nombre (regla 4), número en la navegación, «Buscar el usuario en Instagram» por tarjeta (lo cubre «Volver a buscar»), D6 y D7. Deuda: «Descartados» lee el motivo de `crm_resource_journal` sin índice por `entity_id` (si crece, agregar un índice en una migración nueva).

**Spec 103** (Bandeja sin asociar, Instagram y user script; spec en revisión en #312): bloques 1 (panel de WhatsApp: responsable, No contactar y etapa legible sin script nuevo), 2 (estado de `INTEGRATION_SECRETS_KEY` en Configuración) y 3 (bugs de «Mensajes sin asociar»: estado por tarjeta, gestiones abiertas, código y ciudad, rechazo de fusionados/papelera, aviso; los archivados se aceptan porque Archivado bloquea salidas, no entradas) implementados en la rama `fix/spec-103-userscript-context-and-inbox`. Próximo paso: PR a `staging` y CI (incluye `test-instagram.ts` y la suite de navegador, que no corrieron con el runner local). Queda el bloque 4, que ahora sale como script 1.8.0 junto con la spec 105 (con aviso previo a los vendedores), y los bloques 5–8 con lo decidido el 31/10/2026: una tarjeta por conversación con «Asociar a H123» (D1), emails agrupados por remitente (D2), «Descartar» con motivo y reversible sin migración (D3), casilla para guardar email/@usuario solo si está vacío (D4), «Volver a buscar negocios» con máx. 50 consultas a Meta por clic (D5), insignias con el nombre de perfil del webhook tras ver el diagnóstico en producción (D6), «Contactar» en web.whatsapp.com/send con pestaña reusada previo prototipo (D7). Al desplegar el bloque 1, avisar a los vendedores que el panel ahora deshabilita «Mandar un mensaje» con No contactar. Deuda menor: el selector de gestión de «Mensajes sin asociar» filtra abiertas con el catálogo del cliente (`openPreviewManagements`: una etapa heredada desconocida cuenta como abierta) y el servidor con `crm_stages.classification='open'`; el detalle no trae la clasificación, así que una etapa heredada puede aparecer y el servidor la rechaza con «La gestión debe estar abierta».

**Spec 101** (links y envío de material; spec en revisión en #309): bloques 1 (enlaces sin cursiva en el editor y la vista final) y 2 («Abrir WhatsApp» en un clic, también en «Seguir editando») implementados en la rama `fix/spec-101-link-italics-and-open`. Hallazgos de la revisión corregidos (enlace que crecía al tipear después de la URL, Instagram fuera del cambio de barrera, email sin botón de envío en «Seguir editando», vista final sin enlace navegable). Verificado en local: integraciones PASS tras `seed`, typecheck, unit (2377) y build. Próximo paso: PR a `staging` y CI (incluye la suite de navegador, no corrida en local). Bloques 3 y 4 (D1–D4) implementados en la rama `feat/spec-101-links` (migración 056; enlace corto con slug exigido, enlaces viejos compatibles, 5 desconocidos por cliente por hora con IPv6 /64 en la base y 429 sin oráculo, «Abrir directo» por material con redirección https). Integraciones de material y user script PASS en local; falta PR a `staging`, CI y la suite de navegador. D5 pasa a la spec 105 (adjuntar el archivo desde el script 1.8.0; nueva, por escribir). Limitación conocida, previa a la spec: en el editor de Instagram, editar adentro de una URL que el editor convirtió en enlace manda `URLeditada (URLoriginal)` (`htmlToPlainText`, compartida con email); WhatsApp ya manda solo lo que se ve.

**Spec 101, bloques 3 y 4** (enlace corto con slug, límites duros, «Abrir directo»): implementados en la rama `feat/spec-101-links` (sin PR todavía; detalle en `estado-desarrollo.md`). Decidido el 31/10/2026: «Los válidos siempre abren» (solo los fallos gastan el cupo de 5 por hora; oráculo 429/200 aceptado). Abierto:
- **Precondición para promover a `main`:** con tokens de 4 caracteres, el cupo por IP depende por completo de que el origen acepte solo tráfico de Cloudflare cuando `CRM_CLIENT_IP_HEADER=cf-connecting-ip` (firewall del VPS o Tunnel); si no, `CF-Connecting-IP` se falsifica y el cupo no corta nada. Sin verificar todavía (`COOLIFY_DEPLOY.md`).
- Próximo paso: PR a `staging` y CI (suite de navegador incluida).

**Spec 99** (registro honesto de contactos): cerrada el 31/10/2026. Bloques 1–5 mergeados a `staging` con CI verde (#296, #297, #298, #299, #300).

**Spec 100** («Requiere acción» compacto): cerrada el 31/10/2026. Bloques mergeados a `staging` con CI verde (#303, #304, #305, #306, #307). Las decisiones D1–D8 fueron confirmadas por el propietario el 31/10/2026 (`decisiones.md`). Las notas por bloque que siguen conservan sus limitaciones conocidas.

**Spec 100, bloque 5** («Para retomar» con «Todos» y «Hasta» vacío; «Próximas acciones» abierta): mergeado a `staging` en #303. Verificado en local: `test-pipeline`, `test-work`, `test-commercial`, typecheck, unit (2286) y build. Próximo paso: PR a `staging` y CI (incluye la suite de navegador, no corrida en local).

**Spec 102, bloques 1 y 2** (portada del PDF; portada manual de enlaces): mergeados a `staging` en #313. Verificado en local: integraciones `test-sales-material*`, typecheck, unit (2374) y build; la suite de navegador queda para CI. Abierto:
- **Causa del PDF del propietario confirmada (31/10/2026):** pesaba más de 50 MB (límite viejo); resuelto con el límite de 150 MB. D2 resuelta: las portadas de archivos siguen en el navegador.
- La CSP de reporte no tiene `'wasm-unsafe-eval'` en `script-src`: pdf.js compila sus wasm igual (la CSP es solo de reporte), pero puede generar reportes. Decidido (31/10/2026): `'wasm-unsafe-eval'` se agrega recién cuando la CSP pase a obligatoria; es requisito de ese cambio.
- Bloques 3–5 (D1, D3–D6) implementados en la rama `feat/spec-102-verticals-covers` (migración 057; ver `estado-desarrollo.md`). Próximo paso: revisión adversarial con contexto fresco del fetch del servidor (obligatoria por la spec), PR a `staging` y CI (suite de vitest completa, build y navegador no corridos en local). El separador «De otras verticales» dentro del panel del user script queda para la próxima versión del script (hoy solo llega el orden y `otherVertical`). Las 7 observaciones de la revisión de los bloques 1–2 quedaron corregidas (ver `estado-desarrollo.md`).

Quedan abiertos de la spec 99:
- **Spec 96 §10.1, decidido (31/10/2026):** una respuesta marcada como nueva no resuelve ningún envío abierto. Implementado en la rama `fix/owner-decisions-small` (sin PR todavía): `newReply` en `response_create`/`inbound_register`. Falta: PR a `staging` y CI.
- Medir con volumen real las búsquedas del journal por entidad (no hay índice `(entity_type, entity_id)`) antes de decidir una migración.

Regla: el trabajo se mergea a `staging`; a `main` solo cuando todos los PR del lote estén en `staging` y el propietario lo pida (un merge a `main` despliega producción). Decidido el 31/10/2026: `staging` → `main` recién cuando esté implementado lo decidido ese día (specs 96 §10.1, 101–105); se promueve todo junto.

**Spec 100, bloque 1** (servidor: vencimiento, grupos por gestión, límite por grupos, espera de 5 minutos del script de WhatsApp y conflicto «Este envío ya estaba confirmado.») está mergeado a `staging` en #304. Verificado el 31/10/2026: 7 integraciones PASS tras `seed`; `test-work` pasa entero salvo su línea 137, que falla por datos acumulados en la base descartable local (confirmar en CI, que usa una base nueva); typecheck, vitest (2294) y build OK; suite de navegador sin correr. Siguen los bloques 2 (tira), 3 (masivo), 4 (Hoy y toast) y 5 (Para retomar y Próximas acciones).

**Spec 100, bloque 2** (tira «Requiere acción» plegada, bloques desplegados, «Anotá cómo salió» por gestión, «Vencidos», `?pending=open`, 390 px) está mergeado a `staging` en #305 (antes: implementado sobre el bloque 1; faltaba la suite de navegador (nuevo `requires-action-strip.e2e.ts` y cuatro suites ajustadas con `openRequiresAction`). Limitaciones conocidas: (a) `?pending=open` queda en la URL, así que volver a la solapa Comunicación en la misma visita la abre otra vez. (b) Resuelta por el bloque 4: Hoy y el toast cuentan sin confirmar + gestiones, igual que la tira salvo «Por revisar». (c) Grupo de tarea delegada y grupo propio de la misma gestión: la UI los muestra como grupos separados, pero la regla del servidor (anterior a esta spec) resuelve por negocio y gestión sin mirar la tarea delegada, así que un resultado en uno puede resolver los envíos del otro, y la nota «vale para los N envíos» solo cuenta su grupo. Siguen los bloques 3 (masivo), 4 (Hoy y toast, que agregan `&pending=open` a sus enlaces) y 5.

**Spec 100, bloque 4** (Hoy «Pendientes de contacto» con «¿Lo enviaste?», «Anotá cómo salió» por gestión y «Vencidos»; mosaico y `dayProgress` con sin confirmar + gestiones; toast con el mismo número y `&pending=open`; «Ver en el negocio») está implementado localmente sobre el bloque 2 (PR #305), en `feat/spec-100-today-card`. Verificado en local: 6 integraciones PASS tras `seed`, typecheck, vitest (2322) y build; suite de navegador sin correr (`requires-action-strip` y `business-contact` ajustados). Falta PR a `staging` y CI. Limitaciones conocidas: (a) en Hoy, «Sí, se envió» no conoce los bloqueos del negocio (No contactar, restricción del canal, gestión cerrada) antes de tocarlo: el servidor rechaza y el error queda en la fila, sin reintento (Hoy no carga cada negocio, spec 100 §11). (b) `?pending=open` queda en la URL: con la ficha abierta, una navegación que cambie la búsqueda sin quitarlo vuelve a desplegar la tira. Revisión del 31/10/2026 corregida (409 «ya confirmado» en Hoy como información, tira que se despliega al navegar a `?pending=open` con la ficha montada, ayuda de «Vencidos» unificada, decisiones de la spec 100 en `decisiones.md`); la rama ya incluye el bloque 3. Revalidado: `test-work`, `test-communication`, `test-userscript` PASS tras `seed`, typecheck, vitest (2346) y build.

**Spec 100, bloque 3** (masivo «Sí, se enviaron» / «No se enviaron» en «¿Lo enviaste?» y «Vencidos» de la ficha, confirmación con bloqueados, secuencia por ítem sin reintento automático; 409 «Este envío ya estaba confirmado.» como información en los botones individuales) está implementado localmente en `feat/spec-100-bulk-confirm`, apilado sobre el bloque 2 (#305); falta PR a `staging` (después de mergear #305), CI y la suite de navegador (nuevo caso en `requires-action-strip.e2e.ts`). Limitaciones: (a) el camino «Sí, lo envié» de `OutcomeAfterContact` sigue al editor de trabajo y un 409 ahí lo maneja `WorkEditor` (no tocado: el bloque 4 lo edita). (b) «Hoy muestra el mismo número» del E2E se compara con los conteos de la API hasta el bloque 4. (c) Un «No se enviaron» reintentado sobre una apertura que ya se resolvió devuelve «Solo podés resolver un intento de WhatsApp o Instagram No confirmado.» y se muestra como rechazo (el servidor no distingue si quedó enviado o no enviado). (d) Revisión corregida el 31/10/2026 (título «Resultado», «Listo», incierto separado que frena la secuencia, singulares, recorte de selección); la suite de navegador sigue sin correr en local.

Datos que necesitan aprobación del propietario (ningún agente los toca por iniciativa propia):
- Negocio de prueba H1601 «PRUEBA UX — Hospeda — 02-10-2026» en producción.
- Documento de prueba «aaaa» en Cheroga (H1468) en producción.
- Ciudades duplicadas: San Jose / San José, Federacion, Chajari.

Otros: el apex `hospeda.com.ar` no tiene SPF TXT; si el Worker `hospeda-inbound-email` vuelve a fallar, ver `COOLIFY_DEPLOY.md` (el PR #293 agrega logs).

## Specs 94, 96, 97 y 98 — desplegadas a producción el 30/10/2026

PR #281/#284 (94 y 96), #285 (97), #286 (98). Se promovieron con el PR #288 (`staging` → `main`, `dfa9b33`) y Coolify desplegó solo (auto-deploy de `main`, confirmado por el propietario). Producción sirve el user script 1.7.0. Pendiente:
- **Verificación del propietario:** que las variables de Coolify estén cargadas (inventario en [`runbook-promocion-produccion.md`](runbook-promocion-produccion.md) sección 3.2, en especial `INSTAGRAM_ACCOUNT_USERNAME`, `BREVO_WEBHOOK_TOKEN`, `PUBLIC_APP_URL`, las `R2_*`) y que las migraciones (049, 051 a 055) se aplicaron sin error en el log del contenedor.
- **Vendedores a 1.7.0:** la barrera de la spec 96 bloquea el CRM en la computadora con un script por debajo de la última versión (`USERSCRIPT_MIN_VERSION` sigue en 1.5.0). Avisar que fuercen «Buscar actualizaciones» en Tampermonkey y aprueben instagram.com si lo pide.
- **Pruebas del propietario en producción (94, 96, 97 y 98):** tres clics con el script conectado (96); chat de Instagram, panel e insignias (97); «Enviar material» en ambos paneles, «Sin gestión» en WhatsApp y «Buscar o crear en el CRM» (98); pegar en Instagram real (94).
- **Spec 97:** el aviso `account-unknown` (marcado NEEDS OWNER en la spec §14) sigue abierto; también agregar `INSTAGRAM_ACCOUNT_USERNAME` a la plantilla de variables de la raíz.
- **CI:** quitar la fijación a ubuntu-24.04 (#289) cuando Playwright soporte 26.04.

## Material de venta: pantalla (spec 95) — cerrada en `staging`, pendiente de producción

- PR #282 (`a2c7c93`). Al desplegar: aplicar la migración `051_sales_material_auto_cover.sql`. El CORS de los buckets ya está actualizado.
- Después del deploy, un admin corre «Generar portadas faltantes» en «Material de venta».
- Límites conocidos: la captura de cuadro de video solo tiene pruebas unitarias; el backfill cubre lo listado (filtros activos y tope de 500).

## Spec 93 — email: entrega, aperturas y clicks — pendiente de PR

[Spec 93](crm-roadmap/93-email-engagement.md) implementada en `feat/email-engagement-93`, apilada sobre la 92 (PR #278): el PR va después del de la 92. Falta:
- push, PR a `staging`, CI verde y merge;
- **Mensajes ya fallidos por un rebote temporal posterior a la entrega:** los que hoy quedaron en `failed` por un `soft_bounce` llegado después de un `delivered` no se reprocesan. Corregirlos es una operación de datos que necesita aprobación del propietario y un runbook; no se reprocesa nada automáticamente.
- **Futuro (sin hacer ahora):** índice parcial de expresión `crm_email_events(trim(both '<>' from message_id), lower(recipient)) WHERE outbox_id IS NULL` para la detección y adopción de eventos huérfanos, que hoy recorren la tabla. Medir antes con datos reales.
- **para producción (propietario):** cargar `BREVO_WEBHOOK_TOKEN` en Coolify y crear el webhook transaccional con Bearer siguiendo `COOLIFY_DEPLOY.md` («Webhook de Brevo»); después, verificar con un envío real a una casilla propia que aparezcan «Entregado» y «Abierto». Sin migración.

## Spec 92 — abrir el chat de Instagram — pendiente de PR

[Spec 92](crm-roadmap/92-instagram-open-chat.md) implementada en `feat/instagram-open-chat-92`, apilada sobre la 91: el PR va después del de la 91 (o se rebasea sobre `staging` cuando la 91 se mergee). Falta: push, PR a `staging`, CI verde (incluye browser) y merge. **Para producción:** aplicar la migración `049`; sin variables nuevas (usa las de la 88). La confirmación automática necesita la integración de Instagram activa; sin ella el composer avisa y se confirma a mano.

## Spec 91 — segunda pasada de «Comunicación» — pendiente de PR

[Spec 91](crm-roadmap/91-communication-polish.md) implementada en `feat/communication-polish-91`. Falta: push, PR a `staging`, CI verde (incluye browser) y merge. **Para producción:** aplicar la migración `048`. Sin variables nuevas.

## Spec 90 — comunicación en la ficha — cerrada en `staging`

[Spec 90](crm-roadmap/90-business-communication-view.md) mergeada en `staging` (#268) el 27/10/2026. No tiene migraciones ni variables nuevas, así que para producción alcanza con promover `staging`. Seguimiento posible: en la Bandeja, las filas y filtros mezclados dicen «Instagram / Red social».

## Specs 87 y 88 — cerradas en `staging`, pendientes de producción

Specs 87 (#262) y 88 (#260), mergeadas en `staging` el 26/10/2026. **Para producción**, cuando el propietario promueva `staging`:
1. Aplicar las migraciones `044` y `045`.
2. En Coolify:
   - definir `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN` (32 caracteres o más) e `INSTAGRAM_ACCOUNT_ID`;
   - definir `INTEGRATION_SECRETS_KEY`: 32 bytes en base64, generados para producción. **No reutilizar** la de la prueba local.
3. En Meta, poner la Callback URL `https://crm.hospeda.com.ar/_api/inbound/instagram` con el verify token de producción (cambiar la URL no exige un verify token nuevo), y confirmar las URLs de privacidad y de eliminación de datos.
4. En el CRM de producción, un admin carga el token de la cuenta en Configuración → Integraciones → Instagram.

Límites conocidos de la 88: el token pegado no se valida contra Meta al guardarlo, y viaja como parámetro de la URL a `graph.instagram.com`.

## Material de venta (spec 89) — cerrada en `staging`, pendiente de producción

- F1 (#265), F2 (#267), F3 (#271) y F4 (#272) mergeadas en `staging` el 26 y 27/10/2026. Sin desplegar.
- **Para producción**, cuando el propietario promueva `staging`:
  - aplicar las migraciones `046_sales_material.sql` y `047_sales_material_share_triggers.sql`;
  - crear el bucket R2 con su CORS y cargar en Coolify las variables `R2_*` (ver `COOLIFY_DEPLOY.md`);
  - confirmar `PUBLIC_APP_URL`: sin ella, la vista previa de los enlaces sale sin imagen y los enlaces no se pueden armar;
  - `CRM_CLIENT_IP_HEADER`: resuelto, producción usa `cf-connecting-ip` (confirmado por el propietario el 30/10/2026);
  - borrar a mano las subidas de prueba de la biblioteca vieja antes del deploy;
  - distribuir el user script 1.3.0 **antes** del deploy: el mínimo pasa a 1.3.0 y un 1.2.x queda bloqueado (426).
- **A verificar con servicios reales:** los `response-content-*` de R2, el PUT firmado con `Content-Length`, la vista previa en WhatsApp, que Brevo acepte un `attachment.url` firmado de R2 y su tope de tamaño (hoy 10 MB).
- Decisiones del propietario sobre F4 (quedan así a propósito):
  - `USERSCRIPT_MIN_VERSION` sube a 1.3.0 (decisión del propietario, 27/10/2026): desde el deploy, un script 1.2.x recibe 426 y el vendedor tiene que instalar el 1.3.0 antes de usar WhatsApp. Distribuir el 1.3.0 a los vendedores antes o en el mismo momento del deploy.
  - Los avisos del modelo muestran a los vendedores el título del material archivado («“X” ya no está disponible»), como pide la spec.
  - Un `prepare` repetido con el mismo id (o un borrador reutilizado) devuelve el borrador sin los `materialWarnings` del primer `prepare`: se aceptan perdidos por ahora.
  - Un archivo o cambio a interno que coincide con un `prepare` en curso se serializa en la fila de versión en vivo (`app_settings`, que tocan los dos); si se cruzan en el orden opuesto, Postgres aborta uno por deadlock y hay que reintentar. No se rediseña ese orden de bloqueos en F4.

## Rediseño visual (v1 por fases)

Vistas fijadas (#245), orden de columnas (#247, #250), Bandeja (#249) y los ajustes de la revisión del 26/10 (#254, #255, #258, #259 y encabezados con ayuda) están en `staging`. Pendiente: revisión del propietario (celular real, modo oscuro, vista de vendedor) y su «terminamos» para pasar a `main`. Unos 35 e2e todavía escriben `hospeda-live-mode=off`, que ahora no tiene efecto: limpiarlos cuando se toquen.

Plan aprobado el 24/10/2026 (ver `decisiones.md`, «Rediseño visual del CRM»). Fase 0 (sistema de diseño), Fase 1 (estructura general), Fase 2a (estructura de la ficha) y Fase 2b (contenido de las pestañas) están mergeadas a `staging` (#232, #233, #234 y #235; Fase 2b: `5e0a965`). Fase 2c (composer flotante y documentos a pedido) mergeada (#236, `a1c3bbf`). Fase 3a (lista de Negocios) mergeada (#237, `a32ed00`). Fase 3b (tabla de Gestiones) mergeada (#238, `b8841e4`). Fase 5 (Hoy) mergeada (#239, `eecd391`). Ajustes aprobados el 25/10/2026 (filtro «Tipo de gestión», «Vencidas»/«Hoy» solo abiertas y mini calendario con el mes completo) mergeados (#240, `ee7c006`). Fase 4 (tablero de Gestiones) mergeada (#241, `b56f177`). Fase 7 (crear y editar en paneles) mergeada (#242, `2975cba`): las fases originales de la v1 quedaron completas en `staging`. El 25/10/2026 el propietario movió a v1 las vistas fijadas por usuario (mergeadas en #245), el arrastre de columnas (en progreso) y la bandeja unificada de conversaciones; la fila de totales pasó a V2. Queda la revisión del propietario en staging (vista de vendedor, celular real, modo oscuro y mensajes entrantes reales) y su «terminamos» para pasar a `main`. Cada fase con mockup aprobado antes de implementar.

- **Después de la v1, cada uno con análisis propio:** fila de totales (V2), agrupar la tabla por estado o etapa, contadores en la sidebar (endpoint liviano), KPIs con agregados nuevos, drag & drop en el kanban (puede reutilizar `@dnd-kit`, ya instalado para las vistas fijadas) y destacados por usuario.

## Registro automático de canales (spec 83)

Spec en [`crm-roadmap/83-registro-automatico-canales.md`](crm-roadmap/83-registro-automatico-canales.md) (#214). F1 y F2 mergeados a `staging` (#215, #216, #218), sin desplegar; F3 mergeado (#219 lado CRM, `17953b7`; #220 el script); F4 sin implementar. Orden: F1 email entrante (Cloudflare Email Worker), F2 responder en hilo por SMTP de Brevo, F3 user script de WhatsApp Web (Tampermonkey), F4 Instagram. **F4 pasa a la [spec 88](crm-roadmap/88-instagram-direct-webhooks.md)** (API oficial de Meta, aprobada el 26/10/2026, sin implementar). La app de Meta ya está creada y publicada. Verificado el 22/10/2026 con una prueba real: el relay SMTP de Brevo conserva `Message-ID`, `In-Reply-To` y `References` y Gmail arma el hilo. Las cinco decisiones abiertas quedaron resueltas el 22/10/2026 (sección 11 de la spec y `decisiones.md`).

- **F1a (servidor + Worker), rama `feat/inbound-email`:** migración 037 (`crm_inbound_messages`), `POST /_api/inbound/email`, `GET /_api/inbound/addresses`, reglas de asociación y Worker `workers/inbound-email/`. Validado en local: `test:inbound`, `test:communication`, unitarias, build y tests del Worker. Falta: deploy del Worker y alta en Email Routing (propietario), `INBOUND_EMAIL_TOKEN` en Coolify, y una prueba real respondiendo desde Gmail.
- **F1a mergeado** en `staging` (#215) y probado de punta a punta el 23/10/2026 con un túnel temporal: respuesta en hilo asociada por `In-Reply-To`, remitente desconocido Sin asociar, reenvío a Gmail con SPF/DKIM/ARC/DMARC en pass. `TRUSTED_AUTHSERV_ID = mx.cloudflare.net`.
- **F1b (interfaz), rama `feat/inbound-email-ui`:** emails recibidos en la ficha (texto plano), «Registrar respuesta» (mismo camino que `response_create`), «No es una respuesta» (responsable o admin), «Respuestas nuevas» en Hoy y página admin «Emails sin asociar» (`/inbound`). Mergeado en `staging` (#216, `e28bfd4`). Pruebas de componente en #224. Falta: verificación visual del propietario.
- **Para producción (cuando se promueva F1):** aplicar la migración 037; definir `INBOUND_EMAIL_TOKEN` (32+ caracteres) en Coolify y el mismo valor como secret del Worker; confirmar que `CRM_BASE_URL` del Worker apunta a producción; configurar en Cloudflare Email Routing el catch-all de `hospeda.com.ar` → Worker `hospeda-inbound-email` (con `FORWARD_TO` como secret). Mientras tanto, el catch-all debe volver a «Send to an email» al terminar las pruebas locales.
- **F2 (responder en el mismo hilo), mergeado en `staging` (#218, `65f43ea`):** «Responder» en emails recibidos, envío por el relay SMTP de Brevo con `Message-ID` propio, `In-Reply-To` y `References`; migración 038 (`email_outbox.transport`, `in_reply_to`, `references_header`, `inbound_message_id`, y corrección de `headers`/`attachments` que F1 guardaba como string JSON). Validado con un servidor SMTP falso local (`test:inbound`). Falta: generar la clave SMTP propia del CRM en Brevo y cargar `BREVO_SMTP_LOGIN`/`BREVO_SMTP_KEY` (sin ellas «Responder» queda oculto), prueba real del hilo en Gmail y Outlook, verificar si Brevo permite desactivar por envío el seguimiento y `List-Unsubscribe` en respuestas 1 a 1, y verificación visual del propietario.
- **F3 (user script de WhatsApp Web):** lado CRM mergeado en #219 (migración 039, tokens en `/userscript`, `GET /_api/userscript/context`, `POST /_api/userscript/register`, «Copiar nombre para agendar», «Mensajes recibidos» con WhatsApp) y el script en #220, `userscript/` (Tampermonkey/Violentmonkey, generado en `dist/userscripts/hospeda-crm.user.js` con `npm run build`). Falta: **reemplazar los fixtures sintéticos de WhatsApp por capturas reales** con «Copiar diagnóstico del chat» (sin eso los selectores no están validados), prueba manual guiada con un vendedor en un chat de prueba a 1280 px, recordar el negocio al abrir un chat desde el CRM (quitado de la v1: un parámetro en la URL de WhatsApp no es confiable) y verificación visual del propietario.
- **User script 1.2.0 (revisión del 25/10/2026):** mergeado a `staging` (#244, `05943cf`), con la lectura del DOM actual, el panel nuevo, la detección desde el CRM, el aviso de actualización y la migración 041. Para producción: aplicar la 041 en el deploy; los scripts instalados en 1.1.x quedan bloqueados (426) hasta actualizar, con el aviso dentro de WhatsApp.
- **Próximas specs del script, aprobadas el 25/10/2026 (mockups aprobados para 1 y 3):**
  1. **Templates desde WhatsApp (spec 84, **cerrada**: mergeada con el PR #246, `343d024`):** elegir un modelo compatible con la gestión desde el panel, vista previa con datos, pegarlo en la caja de WhatsApp sin enviar (o copiarlo). Usa la acción `prepare` del CRM con los mismos controles.
  2. **Registro automático con reversión (spec 85, **cerrada**: mergeada en `staging` con el PR #248 y probada en WhatsApp real el 26/10/2026):** registrar solos los mensajes de chats con un único negocio emparejado y gestión abierta; el resto sigue con confirmación. Cada registro queda marcado como automático y se puede anular (no borrar) con motivo desde el CRM o el panel, deshaciendo sus efectos. Interruptor por vendedor y global para admin.
  3. **Insignias propias en la lista de chats (spec 86, **cerrada**: mergeada en `staging` con el PR #251, `e21cfb2`, y probada en WhatsApp real el 26/10/2026):** marca del CRM por chat (gestión y responsable, No contactar, varios negocios, sin asociar) dibujada en una capa propia, sin tocar las etiquetas de WhatsApp.
- **Para producción de las specs 84–86 (cuando el propietario promueva `staging` a `main`):**
  - aplicar las migraciones `041`, `042` y `043` (la `043` es de la Bandeja, PR #249);
  - publicar una versión nueva del script, que en git sigue en `1.2.0`;
  - prender el registro automático global desde Ajustes, que arranca apagado.
  Las specs se cierran en estas docs porque el proyecto no tiene `/closeIssue` (propietario, 26/10/2026).
- **Ayuda (#221):** la guía paso a paso del script y de las respuestas por email ya está en la Ayuda. Firefox figura como compatible, según la decisión de la spec, pero no se probó en un Firefox real.
- **Decisiones tras F3, resueltas el 23/10/2026:**
  1. **WhatsApp abierto y el script** (#227): el mensaje enviado completa el `whatsapp_opened` del mismo vendedor y teléfono, preparado hasta 24 h antes del envío, y vincula un «Sí, lo envié» sin id. La vista previa lo avisa. El script pasa a la versión 1.1.0.
  2. **Email con resultado incierto** (#228): el admin lo resuelve con «Marcar como enviado» o «Marcar como no enviado» y un motivo. Falta verificar con un envío real que el webhook de Brevo resuelva solo las respuestas por SMTP (en la prueba real de F2).
  3. **Metadata vieja del historial** (#226): la migración 040 la repara en el deploy y solo toca esas dos acciones.
- **«Reingresar» (pegar el código fuente de un email):** postergado. Requiere un parser MIME en el servidor (dependencia nueva) y los encabezados pegados no son confiables para asociar por remitente; el Worker ya reintenta y todo email queda reenviado a Gmail.

## Columnas agrupadas de Negocios

La implementación base está en `feat/business-table-group-columns` (PR #206); los cambios siguientes están locales en `feat/group-columns-max-lines`, PR #208. El seed **Tipo** conserva el id `classification`; Contacto mantiene sus seis miembros. `maxVisible` opcional configura el máximo de líneas de tabla (sin valor significa «Todos»), acepta definiciones guardadas previamente y se ajusta cuando se quitan miembros. La tabla ofrece los datos restantes en un popover con etiquetas, editores y permisos existentes; las tarjetas muestran todos los miembros. Se corrigieron tres bloqueos de revisión: el editor inline puede usarse desde el popover anidado, la poda se persiste con el contexto corregido tras la restauración y una huella de preferencias/contexto evita duplicar esa escritura sin perder una edición posterior. La regresión prueba una escritura de poda y otra para un cambio de ordenamiento. Se actualizó la guía y el mapa técnico, y el E2E cubre edición, guardado y la secuencia de Esc.

Validación local: `npm run typecheck`, `npm test` (104 archivos, 819 pruebas) y `npm run build` pasaron. No se ejecutó `tests/browser/business-column-groups.e2e.ts` ni integración; esta tarea no escribió en ninguna base. Próximo paso: el coordinador ejecuta el E2E de grupos y revisa el cambio. No se hizo commit ni push.

## Tras la revisión de UX (21/10/2026)

La revisión de UX y su tanda de seguimientos (#195–#201) están mergeadas en `staging` y **no** desplegadas ni promovidas a `main` (ver [estado](estado-desarrollo.md)). Seguimientos abiertos, verificados contra el código de `staging` al cierre salvo indicación. Lo que cerró la tanda de seguimientos está en [estado](estado-desarrollo.md) y en el [historial](historial-desarrollo.md): contacto de acompañamiento en No contactar (D4, #195), recontacto al cerrar y al reasignar (#196), marcadores JWT, estabilización de e2e, `line-clamp` y chip de lunes (#197), diálogos móviles, teclado, `viewport-fit` y áreas táctiles de 44 px (#198), índices de búsqueda, `doneToday`, consulta de historial compartida y aviso del tope de Hoy (#199), concurrencia de `task_save` (#200) y lectura de la gestión por el responsable de un negocio archivado (#201). `createResponse` ya estaba tipado (sin `sql<any>`).

**Recontacto y tareas (decisión 7A / D3 y recontacto al cerrar)**

- Si la fusión no deja el negocio en No contactar, la tarea «Volver a contactar» del negocio absorbido pasa al destino y queda pendiente; con No contactar se cancelan todas las pendientes (D3). Verificado leyendo el código, sin prueba.
- ~~Si el responsable de la gestión no es el del negocio, cerrar con fecha deja la tarea «Recontactar según lo acordado» al responsable de la gestión.~~ Resuelto en #203 (decisión del 21/10): queda a cargo del responsable del negocio y lo sigue al reasignarlo. Sin mergear.
- ~~Volver a guardar Recontactar después de un cierre con fecha recrea «Volver a contactar».~~ Resuelto en #203 (decisión del 21/10): se mueve la tarea de la gestión sin tocar. Sin mergear.
- El recordatorio de gestión «Recontactar según lo acordado» se identifica por título, propósito y fecha (heurística); podría identificarse por `crm_pipeline_events.task_id` del cierre.
- Al volver a guardar Recontactar, mover el recordatorio de gestión no revisa si ya existe una «Volver a contactar» pendiente en el nuevo día.
- Si dos recordatorios de gestión sin tocar caen en el mismo día guardado, solo se mueve, reasigna o cancela uno (el más reciente).
- «Para retomar» filtra a los vendedores por el responsable de la gestión, no por quien tiene la tarea: el responsable de la gestión ve la fila aunque la tarea sea del responsable del negocio.
- Con varias gestiones, el negocio puede mostrar «Sin tarea agendada» mientras una tarea de recontacto de una gestión sigue pendiente.
- La definición de tarea «sin tocar» ignora ediciones de descripción y prioridad: una tarea con esos cambios se sigue cancelando o moviendo.
- `reassignRecontactTask` con responsable anterior nulo puede tomar una tarea asignada a cualquiera.
- Quitar la derivación a Leandro sin responsable restaurado deja la tarea «Volver a contactar» con Leandro.
- Reabrir una gestión en un negocio Recontactar deja la tarea pendiente.

**Búsqueda**

- ~~Ctrl+K «Gestiones» y el `q=` del listado de negocios siguen calculando la expresión normalizada fila por fila (~70 ms).~~ Resuelto en #204 (`perf/gestiones-search-rewrite`, sin mergear): cada tabla se busca por separado (`idSetSearchSql`) y la migración 034 agrega los índices de `leads` y `crm_accounts.origin`. Mismos resultados (`scripts/test-search.ts` compara el predicado anterior y el nuevo fila por fila). 034 se aplica con las mismas precauciones que 032 (`CREATE INDEX` simple, sin `CONCURRENTLY`).
- Las búsquedas con forma de teléfono y las de menos de 3 caracteres recorren la tabla (un índice trigram no ayuda).
- El texto de `crm_messages` y `crm_tasks` no tiene índice de búsqueda.
- Los índices de 032 dependen de que postgres.js use `prepare:false` (plan por sentencia con el parámetro incorporado); si se pasa a `prepare:true`, dejan de usarse. `scripts/test-search.ts` lo vigila con EXPLAIN.

**Móvil y accesibilidad**

- Quedan abiertos, a decisión del propietario, los de accesibilidad: los errores de Textarea y NativeSelect no tienen `role="alert"` (reportado en #179); `useInlineInvalid` fija el `aria-label` con el texto de la etiqueta al marcarse inválido y queda desactualizado si el texto cambia mientras el campo es inválido; la ayuda de `managementTypeHints` se renderiza dentro de la etiqueta y pasa al nombre accesible del combo (moverla a `aria-describedby`, reportado en #178).
- Los Disclosure con formularios (Mantine Collapse con `overflow:hidden` durante ~200 ms) pueden perder un clic hecho justo al abrirlos (causa de la inestabilidad de #181). #197 solo esperó las transiciones en los tests; valorar `overflow:visible` al abrir o sin animación.
- Móvil apaisado (ajustes menores de #198): el fondo del header no se extiende hasta el borde del área segura lateral; el `Dialog` simple con ancho máximo `calc(100vw - 24px)` puede quedar bajo la muesca; comentario desactualizado en `tests/browser/transversal-ui.e2e.ts` (~línea 69); los botones de `.quickViewList` miden 34 px con ancho ≤ 620 px.
- El teclado en pantalla se verificó con un `visualViewport` simulado, no con un teclado físico de iOS/Android; no se agregó `interactive-widget` al meta viewport. Confirmar en un teléfono real.

**Archivados y No contactar**

- El responsable de una gestión que no es responsable del negocio pierde el acceso cuando el negocio se archiva (coherente con 1C).
- El banner de negocio archivado no menciona No contactar cuando se dan ambos.
- Quedan `sql<any>` en `correctResponse` y en el levantamiento de la restricción.

**Editor de tareas**

- El mensaje 409 dice «otra persona» aunque haya sido el mismo vendedor desde otra pestaña.
- «Cargar la versión más reciente» (`loadLatest`) no reinicia los indicadores de propósito del formulario.
- El token de versión tiene precisión de milisegundo (lo que transporta superjson): dos escrituras en el mismo milisegundo no se distinguen.

**Pruebas**

- Repetibilidad de integración: `test-business-state`, `test-permissions`, `test-communication`, `test-commercial` y `test-userscript` pasaron dos veces seguidas sobre la misma base local descartable (también `test-work`, `test-inbound-email` y `test-business-history` en una pasada). Fixtures por ejecución: plantillas, teléfonos/emails No contactar, `message-id` de Brevo simulados y teléfono del chat del userscript. La derivación a Leandro (`pipeline.ts` la resuelve por nombre visible y exige un único usuario) se prueba creando un Leandro propio, renombrando temporalmente los de ejecuciones previas y restaurándolos al terminar. Verificado solo con esas suites; el resto de `scripts/test-*` no se repitió en esta tarea.
- `business-view-badges.e2e.ts`: #197 lo reforzó (restauración del scroll, fuentes, transiciones) sin reproducir nunca el fallo; si reaparece en la suite completa, sospechar del reveal de una sola vez de `BusinessViewBadges`.

**Notas de despliegue (cuando el propietario decida promover)**

1. Ejecutar las migraciones 024–033 en horario de baja actividad, con respaldo (nada se aplicó en producción). Detalle verificado en el SQL; ver también las [notas de deploy del plan de rendimiento](rendimiento-y-arquitectura-2026-10.md):
   - 024: crea 4 índices sin `CONCURRENTLY` (bloquean escrituras de esas tablas mientras se crean), elimina `leads_nombre_idx` y ejecuta `ANALYZE`.
   - 025: `UPDATE` sobre `sessions` (extiende `expires_at`).
   - 026: reemplaza los triggers de versión en vivo (37 triggers `CREATE OR REPLACE TRIGGER` sobre las tablas del CRM).
   - 027: `DROP`/`ADD CONSTRAINT` sobre `crm_tasks` y `crm_activities` (bloqueo exclusivo breve) y `VALIDATE`, que recorre ambas tablas; agrega `continuation_reason`.
   - 028: guarda en `app_settings` el instante desde el cual se registra «Anotá cómo salió» (`crm_contact_outcome_since`): en producción es el momento de aplicarla; los contactos anteriores nunca aparecen.
   - 029, 030, 031: `CREATE INDEX` simples (sin `CONCURRENTLY`).
   - 032: ejecuta `CREATE EXTENSION IF NOT EXISTS pg_trgm` y crea 4 índices GIN (`crm_accounts`, `crm_contacts`, `crm_activities`, `lead_notes`) más `ANALYZE`. **El rol de migración necesita `CREATE` sobre la base de datos** (no basta con el esquema). Si falta, 032 hace rollback y, como el contenedor corre `migrate && start`, la aplicación no arranca. Verificar antes con `SELECT has_database_privilege(current_user, current_database(), 'CREATE');` o crear la extensión de antemano con un rol administrador (`pg_trgm` es una extensión de confianza desde PostgreSQL 13). Requiere base UTF8 (ya exigido).
   - 033: un índice parcial de `crm_tasks` para «hechas hoy».
   - 032 y 033 usan `CREATE INDEX` simple (bloqueo `SHARE`: las escrituras de esa tabla esperan mientras se construye; segundos con el volumen de producción). `migrate.mjs` no define `lock_timeout`.
2. `JWT_SECRET` válido en Coolify (32 o más caracteres, sin valor de ejemplo) antes de arrancar; sin él el servidor no inicia. Desde #197 un valor con espacios o comillas alrededor solo genera una advertencia en el log.
3. `PUBLIC_APP_URL` correcta en Coolify.
4. Healthcheck: el propietario informó el 21/10 que lo pasó a `/_api/health/ready` en Coolify; **no se verificó desde el repo** (informado por el propietario). El comentario de `src/server/app.ts` ya lo refleja.
5. Después del despliegue, verificar visualmente con el propietario y registrar el resultado aquí.

## Auditoría del flujo comercial — 19/10/2026

- P0 1–4 de [la auditoría](auditoria-flujo-comercial.md) están corregidos; `d173889` ya está en `origin/staging`. P1 5 y 6 se corrigieron en `045ab36`; P1 7, 10 y 11 en `8e9e7ca`; ambos publicados en `origin/staging`. P1 12–16 están corregidos localmente: Reactivación anticipa opciones y resume la tarea; Archivar/Papelera distinguen usos y consecuencias; el resumen del negocio y el próximo paso de cada gestión reúnen la información para retomar el trabajo; los responsables del negocio, la gestión y la tarea se identifican por separado. #12–15 pasaron typecheck, build y E2E desktop/móvil con API interceptada; #16 pasó typecheck, build y `git diff --check`. Falta una revisión visual integral de los puntos anteriores y verificación con una base descartable.
- Pendiente: recorrido integrado en navegador con datos descartables. No usar la réplica de producción para mutaciones ni marcar el proceso completo como probado hasta hacer ese recorrido.
- Usar la guía en pantalla («Ayuda», fuente `src/content/user-guide.json`, exportada a [guia-de-uso.md](guia-de-uso.md)) como fuente de verdad; la [guía de capacitación](guia-capacitacion-vendedores.md) es material de apoyo para el capacitador. Validar el recorrido recomendado con un vendedor principiante y en una sesión visual real.
- La guía en pantalla y la capacitación explican que el estado Recontactar resume la fecha de la tarea y que el vendedor debe abrir esa tarea para registrar o consultar el resultado.
- No se hicieron operaciones de escritura en base. El E2E del punto 15 usa Chromium con API interceptada; se revisaron capturas desktop/móvil. El recorrido integrado con datos descartables sigue pendiente.

Corte histórico: 16/10/2026 (la sección sobre la revisión de UX arriba es más reciente). Actualizar al cerrar una tarea. No marcar como pendiente un bloque implementado solo porque un documento histórico aún use ese término.

## Compatibilidad «Revisados» — implementada en staging

Se recuperó la columna seleccionable para tabla/cards y el filtro booleano, derivados de `crm_accounts.status` (`Nuevo` = no revisado; los demás estados = revisado). Una actualización de preferencias antiguas vuelve a mostrarla una vez, sin impedir que después se oculte. Los filtros guardados con `reviewStatus` se mantienen. No se usa `crm_accounts.review_status` ni requiere migración. Validado con typecheck, 111 pruebas unitarias y build. Commit `665f614` está en `staging` y fue enviado a `origin/staging`; el servidor del checkout está disponible en `localhost:5173`.

## Integración visual + estados + Comunicación

La implementación unificada de estados y comunicación se integró en `staging` mediante el [PR #103](https://github.com/qazuor/hospeda-leads/pull/103), junto con los PRs #99–#102. No está integrada en `main`.

- Typecheck, 110 pruebas unitarias y build pasan. No se ejecutaron E2E ni pruebas de PostgreSQL.
- Próximo: terminar la revisión visual en desktop/móvil; ejecutar migraciones y pruebas de integración solo sobre una base local descartable.
- La migración 022 elimina únicamente datos atribuibles a secuencias de prueba y aborta ante referencias independientes. Ejecutar primero `pnpm run db:preflight:communication-sequences` con `CRM_TEST_DATABASE=1` y una URL local; revisar su salida antes de aplicar cualquier migración. No se tocaron bases en esta tarea.
- La revisión visual manual y la validación de migraciones sobre una base descartable siguen pendientes. No inferir deploy desde el merge a `staging`.

## En curso: estados y redistribución de negocios

El alcance está aprobado en el [issue #98](https://github.com/qazuor/hospeda-leads/issues/98). Los PRs #99–#103 se integraron en `staging`. La redistribución productiva reportada el 15/10 está registrada en el historial; no repetirla como parte de cambios de código.

## Primeros pasos al retomar en una PC

1. Clonar/pull y preparar el entorno local según [desarrollo local](desarrollo-local.md).
2. Verificar HEAD remoto, estado local y PRs abiertos; no trabajar sobre un snapshot viejo.
3. Pedir/obtener observación del deploy real para comprobar los 23 negocios recuperados en Papelera, los atributos recuperados y el Historial global. El operador confirmó el commit, no la visualización final.
4. Continuar el recorrido de UI en una base local sintética. Para datos reales usar únicamente acceso explícitamente configurado; no copiar secretos del VPS al repo.

## Cambio mergeado: revisión de negocios y ayuda

- La UI de `crm_accounts.review_status` está implementada para editar Filtrado/No filtrado, ofrecerlo como columna seleccionable y editable inline en tabla y cards, mostrarlo en detalle y filtrar por el valor. Los badges simples abren una lista compacta de opciones y guardan al seleccionar; Vertical/Subtipo mantiene su editor detallado y varias gestiones requieren elegir el registro antes de modificarlo. Los filtros de usuario incluyen “Usuario autenticado”. La guía anida sus artículos, los expone en la paleta de comandos con búsqueda aproximada e incluye el recorrido de venta y la revisión de negocios precargados. Validación local: `pnpm run typecheck`, `pnpm test` (95 pruebas), `pnpm run build` y los 15 recorridos de navegador afectados aprobados. El CI terminó verde y el PR #95 se mergeó el 11/10/2026. El deploy no queda confirmado por ese merge.

## Reporte estético y próximos ajustes

Se corrigieron tres detalles visuales de alcance acotado:

- **Navegación desktop intermedia (1024–1440 px):** el header podía partir el grupo y dejar “Más opciones” separado; ahora conserva una fila hasta 1100 px y mantiene el menú unido a Agenda cuando necesita dos filas.
- **Accesos horizontales en móvil:** la Guía y las vistas guardadas ahora explican que hay más elementos fuera del área visible y cómo encontrarlos.
- **Mi día y Agenda:** la acción de planificar queda como principal; registrar lo ya realizado queda secundaria, con textos que describen mejor cada acción.

Segunda pasada visual implementada y publicada en el [PR #102](https://github.com/qazuor/hospeda-leads/pull/102), mergeado a `staging`:

- **Cards de Negocios:** el responsable largo ahora tiene el ancho de la card y se limita a una sola línea con el valor completo disponible por tooltip.
- **Controles móviles del listado:** se ajustó la jerarquía entre búsqueda, vistas guardadas y filtros aplicados con separadores sutiles; el carril horizontal ya no ocupa espacio con el estado vacío de vistas personales y conserva el cue de desplazamiento.
- **Columnas fijadas:** reciben un tinte de color de acento en desktop, más visible y compatible con las franjas de filas y el tema oscuro.
- **Selección de filas:** la columna de checkbox permanece como primera columna y fija a la izquierda durante el desplazamiento horizontal; el resto de fijaciones izquierdas comienza después de ella.
- **Detalle de negocio:** el próximo paso conserva el tratamiento principal; conversación reciente y otros datos secundarios se leen como bloques separados por divisores, sin una caja adicional.
- **Formularios y jerarquía:** contexto del negocio se presenta aparte en “Preparar gestión”; aumentaron legibilidad y espaciado de campos/ayudas en gestión, modelos y configuración.

El PR #102 está mergeado en `staging`. Los ajustes adicionales de ciudad, acciones visibles y hover están en proceso de integración en la rama `feat/ui-aesthetic-functional-tweaks`. `pnpm run typecheck`, `pnpm run build`, tres pruebas dirigidas con fixtures y `git diff --check` pasaron en la pasada visual anterior. Una ejecución de `business-cards.e2e.ts` alcanzó un fallo preexistente de restauración del foco al regresar del detalle; no se modificó ese comportamiento. No se ejecutaron pruebas de navegador que escriben en la base local.

La revisión visual manual final en desktop y móvil sigue pendiente. La prueba con personas principiantes y revisión completa en tema oscuro también continúan pendientes.

Evidencia de la primera iteración: screenshots sintéticos de Guía, navegación y vistas en móvil, además de Mi día; pruebas dirigidas en 320, 390, 1024 y 1280 px. Para esta segunda pasada se agregaron screenshots de cards, detalle y preparación de gestión, en móvil y desktop. No equivalen a una revisión completa de todas las rutas, ambos temas ni una prueba con usuarios principiantes.

## Prioridad: pulido visual, con recorridos reales

El propietario sigue detectando detalles pese a varias rondas de mejoras. El primer recorrido debe revisar los puntos que señaló, distinguiendo lo ya corregido de regresiones o casos de contenido no cubiertos:

- Filtrar negocios: texto centrado en Agregar filtro; Quitar búsqueda/Quitar filtro consistentes en iconos, tamaño y separación.
- Tabla y cards: centrado y padding de badges de ciudad, responsable, vertical y estado; datos largos; filas vacías innecesarias; altura de tarjetas.
- Acciones de fila: iconos sin borde decorativo; header Acciones alineado; targets accesibles y menús sin iconos pegados a texto.
- Vistas de Negocios: badges compactos, poco espacio vacío, nombre/selección/acciones y guardado contextual legibles, overflow móvil.
- Filtros aplicados de Negocios: segunda iteración implementada localmente; chips compactos, vista activa adelante y resumen diferencial que omite filtros heredados. Los filtros manuales siguen editables; el nombre completo de la vista se conserva y puede envolver si es largo.
- Edición de vistas personales: ahora se pueden editar los filtros guardados desde Administrar, además del nombre. Queda para revisar visualmente en la previsualización local.
- Administración de vistas: duplicar una vista personal está disponible para todos; convertirla en vista de sistema está disponible solo para admin. La conversión comparte configuración con el equipo y retira el original personal en una transacción; las vistas personalizadas se administran desde Configuración. Implementado y validado localmente; el PR está abierto y falta revisión visual en la previsualización.
- Formulario Iniciar gestión: jerarquía, espacios, contexto del negocio, campos opcionales y footer; conservar creación explícita/idempotencia.
- Foco y controles: borde discreto con contraste suficiente, tamaño compacto sin perder teclado ni targets táctiles.
- Hamburguesa/Drawer móvil, diálogos anidados, dropdowns, tooltips, scroll y restauración de foco.
- Papelera y Archivados: estados vacíos, datos recuperados, detalle/restauración y explicación de la entidad; sin confundir archivo con eliminación.
- Ctrl/Cmd+K: resultados y destinos por entidad, textos largos, sin resultados, loading/error y teclado. No prometer búsqueda en el contenido binario de PDFs.

Recorrer desktop y 320/390px, claro/oscuro, teclado y contenidos largos. Operar los recorridos, no limitarse a screenshots de páginas. Usar componentes/primitivas compartidos. Guardar evidencia de qué se probó; fixtures no prueban todas las combinaciones productivas. Ver [sistema visual](ui-visual-system.md) y `tests/browser/`.

## Reglas comerciales (spec 87)

Las cuatro preguntas de la [revisión 48](crm-roadmap/48-commercial-rules-review.md) se resolvieron el 26/10/2026 y la [spec 87](crm-roadmap/87-commercial-rules-decisions.md) está **cerrada**, mergeada en `staging` (#262). Pagos: no se registran en el CRM.

## Estados de negocio y gestiones

La definición funcional quedó aprobada y está en la [spec 53](crm-roadmap/53-business-and-management-state-model.md). El código y las migraciones 018–021 se integraron al branch local de integración; (histórico) en su momento faltaban pruebas de migración en PostgreSQL descartable y la revisión del PR final; el trabajo se integró en `staging` (#99–#103) y las migraciones 018–033 corren en CI sobre PostgreSQL 17 descartable. Sigue pendiente aplicarlas en producción con el procedimiento revisado. La migración conserva `review_status='filtered'` como Revisado, mantiene Papelera separada y no reconstruye gestiones eliminadas.

## Pospuesto por el propietario: datos y multivertical

- Resolver el acceso MCP de solo lectura. El último bloqueo reportado fue `Origin not allowed` en el recorrido OAuth; antes hubo PKCE/configuración y `invalid_request`. Se corrigieron partes del servidor, pero no se confirmó conexión de ChatGPT a producción.
- Existe el rol lector provisionado y código MCP; no repetir el provisionado ni rotar secretos por iniciativa propia. Validar configuración/redirect/resource/origin sobre evidencia actual; consultar [MCP](crm-mcp.md).
- Revisar negocios existentes para posibles fusiones o verticales adicionales. Una coincidencia es señal de revisión, no prueba de duplicado.
- Acordar clasificación, gestiones conjuntas, filtros, responsables y migración de multivertical. No ejecutar fusiones ni reasignaciones a partir del plan documental.

El usuario pidió avanzar con otros puntos mientras esto quedaba para después. No bloquear el pulido de UI por esta dependencia.

## Validación humana pendiente

- Prueba de facilidad de uso con principiantes/personas mayores, según [procedimiento](prueba-con-principiantes.md).
- Sesión específica con lector de pantalla. Las comprobaciones de foco/teclado existentes no sustituyen esa sesión.
- Revisión editorial sobre todos los modelos y contenidos reales restantes: las pruebas no cubren todos los textos/productos.

## Completado: conservar como regresión

Ya están implementados los bloques 43–52 del roadmap: búsqueda restante, historial comercial, Contactar desde tareas, registro guiado, continuidad, revisión de reglas/permisos (no las decisiones aún abiertas), miniaturas, avisos, loading y UI transversal. También las rondas posteriores de diseño, Papelera/Archivo, búsqueda de entidades y unificación del historial global.

No reescribir esos bloques desde cero. Revisar la implementación y ampliar la cobertura del caso que falle. Limpieza y recuperación productiva están ejecutadas; no volver a tratarlas como pendientes.

### Ajustes menores solicitados en staging — 14/10/2026

Implementados localmente: abreviatura del badge Concepción del Uruguay, mejor jerarquía/espaciado en Contacto general, perfil, levantar restricción y cambio de política No contactar. `pnpm run typecheck` y las 110 pruebas unitarias pasan. Pendiente: revisión visual del propietario en `http://localhost:5173`; no se hizo commit ni push.

### Tooltips en acciones deshabilitadas — 15/10/2026

La cobertura automática está agregada en los componentes compartidos y en controles de acción especiales. Confirmar visualmente mouse y foco de teclado en desktop/mobile; revisar especialmente tooltips dentro de tablas, popovers y formularios. No se hizo commit ni push.

### Guías del CRM actualizadas — 15/10/2026

Se refrescaron la guía en pantalla y el Markdown generado con los flujos actuales de estados, comunicación, cierres, modelos, recontacto, vistas y papelera; el detalle de gestión usa ahora las etapas propias de su tipo. `pnpm run typecheck`, `pnpm test` (23 archivos, 110 pruebas), `pnpm run build` y `tests/browser/guide.e2e.ts` pasaron en el servidor local con API interceptada; no se escribió en la base. El build conserva el aviso de chunk mayor a 500 kB. Sin commit ni push.

### PR de ajustes UX y guías — 15/10/2026

[PR #105](https://github.com/qazuor/hospeda-leads/pull/105) mergeado en `staging`. Pendiente revisión visual manual; aún no integrado a `main`.

## IA en el CRM — revisar antes de implementar

- Revisar la [épica 61](crm-roadmap/61-ai-in-crm-epic.md), [spec base 62](crm-roadmap/62-ai-platform-foundation-spec.md) y las specs hijas 63–81.
- Elegir proveedor/modelo y verificar retención, entrenamiento, región y contrato antes de enviar datos reales. La spec permanece agnóstica hasta esa elección.
- Configurar límites concretos antes de habilitar el servicio. El CRM informará uso/errores y bloqueará solicitudes al alcanzar el límite.
- Revisar cada spec hija y autorizar por separado el primer alcance de implementación. Dictado queda fuera de la primera etapa.
- No interpretar la documentación como aprobación para conectar un proveedor, enviar datos reales o desplegar IA.
- La documentación quedó integrada en `staging` mediante los PR #107–#110. Antes de implementar, elegir proveedor/modelo, verificar sus condiciones y definir los límites de uso.

## Variables de texto para modelos — 19/10/2026

- Revisar visualmente Configuración → Variables de texto en desktop y mobile y probar crear/editar/eliminar una variable en la base local autenticada.
- Las alternativas se seleccionan por coincidencia contextual y especificidad, no por rotación aleatoria o cíclica. Los textos alternativos sin condiciones repetidas son configurables; cada combinación de condiciones admite un solo texto.
- La configuración vive en `app_settings`; no requiere migración. La conexión real de datos de sistema/CRM está limitada al catálogo explícito de campos permitidos.

## Estado de ramas — 16/10/2026

Los PRs #99–#110 revisados para estados, comunicación, UI y documentación están integrados en `staging`. Los tres ajustes adicionales de UI y la documentación/prueba complementaria se integraron mediante el commit `924d186` el 16/10/2026. Esto no implica merge a `main` ni deploy.

La distribución de responsables entre los cuatro usuarios elegibles se ejecutó el 15/10/2026 en producción, conservando responsables de Filtrados y negocios en Papelera. Esto no completa la revisión pendiente de fusiones o multiverticales.


### Ficha de negocio · revisión con el propietario (23/10/2026)

PR 1/2 (#230) y PR 2/2 implementados. Falta que el propietario revise la ficha nueva y decida si avanzar con la variante de dos columnas en escritorio. Límites conocidos: a 390 px la cuarta solapa queda parcialmente visible y la lista se desplaza dentro de sí; no se revisó la vista de vendedor ni Comunicación con mensajes recibidos reales.

### Bandeja de conversaciones (26/10/2026)

B1 y B2 mergeadas en `staging` (PR #249, `53b14a0`). Falta la revisión del propietario. Límites conocidos: el e2e del vendedor se omite porque el seed no tiene vendedor (la visibilidad la cubre `test:inbox`); el e2e del descarte sirve el mensaje recibido con mocks porque la app no puede crear uno sin el token del webhook; la búsqueda solo lleva al mensaje si aparece en las primeras 4 páginas del hilo (si no, avisa). Las subconsultas de registro automático por fila del hilo no tienen índice por `message_id`/`inbound_id` (igual que `communication` en staging); revisar si `crm_auto_registrations` crece.

### Spec 88 · Instagram Direct (26/10/2026)

**Cerrada**: mergeada en `staging` (#260) y probada de punta a punta con Meta el 26/10/2026. Lo que falta para producción está en «Specs 87 y 88», al principio de este archivo.
