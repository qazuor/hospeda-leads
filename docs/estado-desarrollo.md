# Estado del CRM — corte al 11 de octubre de 2026

Este documento es el traspaso de la conversación de desarrollo a un checkout local. No importa automáticamente la conversación de ChatGPT a Codex o Claude: conserva las decisiones y la evidencia útil en Git. Verificar el estado remoto al comenzar una nueva sesión.

## Contexto

Hospeda CRM es la herramienta interna de prospección y seguimiento comercial de Hospeda. Está en producción en https://crm.hospeda.com.ar, alojada en un VPS con Coolify y PostgreSQL 17. Es independiente del portal turístico público https://hospeda.com.ar.

La UI debe ser sencilla para vendedores y personas con poca experiencia técnica. El propietario pidió especial atención a móvil, claridad de próximos pasos, loading visible y diseño cuidado. Las pruebas automatizadas no equivalen a haber medido usabilidad con usuarios.

Base remota comprobada para este traspaso: `75904f4acb6958fa8ca90bee3689f73b4a796275` (merge del [PR #92](https://github.com/qazuor/hospeda-leads/pull/92)). El propio PR de documentación será un commit posterior: esta referencia es una base histórica, no un HEAD perpetuo.

## Cambio en revisión — estado de negocio y redistribución

El issue aprobado [#98](https://github.com/qazuor/hospeda-leads/issues/98) define separar el estado del negocio del estado de cada gestión, preservar los negocios que ya no estén en estado Nuevo y redistribuir los restantes de forma equitativa contando también el trabajo previo. La propuesta se dividió en PRs encadenados para revisión. Los PRs [#99](https://github.com/qazuor/hospeda-leads/pull/99) y [#100](https://github.com/qazuor/hospeda-leads/pull/100) tienen CI verde; el [#101](https://github.com/qazuor/hospeda-leads/pull/101) incorpora el modelo de dominio y también tiene CI verde sobre `721a52da83b2dbcf7a81cf4252b939809745aa3c` (14/10/2026). Los tres siguen abiertos y sin merge. API, UI y página de redistribución continúan en los cortes siguientes; no se ejecutaron cambios de datos productivos.

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
