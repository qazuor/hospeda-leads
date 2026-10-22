# Pendientes y próximo trabajo

## Columnas agrupadas de Negocios

La implementación está en `feat/business-table-group-columns` (PR #206). El blocker de revisión sobre podar preferencias antes de resolver las definiciones quedó corregido localmente y validado con typecheck, suite unitaria completa y build. Falta correr `node --import tsx scripts/test-business-column-groups.ts` sobre una base descartable y `tests/browser/business-column-groups.e2e.ts` con el build/servidor de navegador del flujo CI; esta tarea no ejecutó integración ni e2e ni escribió en ninguna base. No se hizo commit ni push.

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

- Pruebas de integración que no se pueden repetir sobre una base usada: `scripts/test-business-state.ts` (usuario Leandro), `scripts/test-permissions.ts` (teléfono No contactar fijo) y los fixtures de `scripts/test-communication.ts`. Usar una base descartable nueva en cada ejecución.
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

## Reglas comerciales: decisiones pendientes

Implementación/revisión existente: [documento 48](crm-roadmap/48-commercial-rules-review.md). Faltan definiciones del propietario sobre:

1. Evidencia necesaria para aceptación/cierre y campos obligatorios del acuerdo.
2. Si registrar una respuesta espontánea debe proponer completar una tarea seleccionada.
3. Si un delegado puede preparar/enviar mensajes solo para su tarea y con qué restricciones/auditoría.
4. Si habrá registro estructurado de pagos, fuente y responsable de confirmación.

No deducir esas decisiones de etapas históricas. No agregar automatismos de pago/entrega/cierre ni permisos nuevos mientras sigan abiertas.

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
