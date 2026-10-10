# Estado del CRM — corte al 10 de octubre de 2026

Este documento es el traspaso de la conversación de desarrollo a un checkout local. No importa automáticamente la conversación de ChatGPT a Codex o Claude: conserva las decisiones y la evidencia útil en Git. Verificar el estado remoto al comenzar una nueva sesión.

## Contexto

Hospeda CRM es la herramienta interna de prospección y seguimiento comercial de Hospeda. Está en producción en https://crm.hospeda.com.ar, alojada en un VPS con Coolify y PostgreSQL 17. Es independiente del portal turístico público https://hospeda.com.ar.

La UI debe ser sencilla para vendedores y personas con poca experiencia técnica. El propietario pidió especial atención a móvil, claridad de próximos pasos, loading visible y diseño cuidado. Las pruebas automatizadas no equivalen a haber medido usabilidad con usuarios.

Base remota comprobada para este traspaso: `75904f4acb6958fa8ca90bee3689f73b4a796275` (merge del [PR #92](https://github.com/qazuor/hospeda-leads/pull/92)). El propio PR de documentación será un commit posterior: esta referencia es una base histórica, no un HEAD perpetuo.

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
