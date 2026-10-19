# Estado del CRM — corte al 16 de octubre de 2026

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

## Redistribución de responsables — 15/10/2026

Por instrucción del propietario, se redistribuyeron en producción 2.460 negocios no filtrados ni eliminados por ID ascendente entre cuatro usuarios con rol `user`, excluyendo a Julián. Los 356 negocios filtrados o en Papelera conservaron sus responsables; quedaron 883 negocios asignados por usuario. Se generó un evento de auditoría por negocio y no se modificaron responsables de gestiones. El respaldo y el manifiesto de rollback quedaron fuera de Git. No repetir la operación como parte de un deploy o cambio de código.
## Acciones de negocios siempre visibles

En la rama `feat/ui-aesthetic-functional-tweaks`, las acciones Abrir, Contactar, Archivar y Eliminar quedan siempre visibles en tabla y grilla; las no permitidas se muestran deshabilitadas con explicación. La columna de acciones tiene un ancho mínimo de 150 px para evitar recortes. También se quitó el resaltado de columna que se activaba al pasar por un encabezado. `pnpm run typecheck` y `git diff --check` pasaron. Commits locales; sin push ni PR.
