# Fase 3: pipeline, pérdida, objeciones, reactivación y prioridad explicada

Base remota verificada: main `0de3f1197585aae8692aa0043836f792928359c6` (fases 1/2 y revisión visual). No existe AGENTS.md. Rama: feature/crm-pipeline-reactivation. No ejecuta deploy; deploy-vps.yml continúa exclusivamente workflow_dispatch.

## Vocabulario y fuente de verdad

Negocio/cuenta: identidad, contactos y condición comercial. Oportunidad: venta concreta almacenada en `leads`. Etapa actual: exclusivamente `leads.estado`; FK al catálogo `crm_stages.name`. No se agrega un segundo campo de estado. Clasificación: abierta, ganada o perdida. Ganada describe un resultado comercial explícito, no acredita pago ni convierte automáticamente la cuenta en cliente.

`crm_stages`: nombre estable, orden, activa/inactiva, clasificación e indicador histórico. Catálogo común a verticales, como en fases anteriores; no había restricciones de etapas por vertical. Admin configura mediante `/_api/pipeline`; las configuraciones viven en PostgreSQL. Nombre y clasificación son inmutables para conservar las referencias y evitar reclasificar ventas anteriores. Para reemplazar: desactivar y crear otra etapa. Motivos y tipos de objeción también conservan su nombre; se editan mediante baja/alta lógica. No hay borrado físico de catálogos.

### Mapeo histórico explícito (migración 007)

| Valor anterior | Valor actual | Clasificación |
| --- | --- | --- |
| Cargado | Cargado | abierta |
| Filtrado | Filtrado | abierta |
| 1er contacto | 1er contacto | abierta |
| En tratativas | En tratativas | abierta |
| Suscripto | Suscripto | abierta, sin inferir resultado ni pago |
| Promocionado a Leandro | Promocionado a Leandro | abierta |
| Rechazado | Rechazado | abierta, pendiente de revisión humana |
| No interesado | No interesado | abierta, pendiente de revisión humana |
| Re contactar mas adelante | Re contactar mas adelante | abierta |
| Cualquier otro texto histórico | mismo texto exacto | abierta |
| NULL / texto vacío | se conserva | sin etapa / etiqueta histórica vacía |

El catálogo se inicia con app_settings.crm_opportunity_stages más los valores históricos observados. No modifica ninguna fila de lead, prioridades, fechas ni suscripciones; stage_since permanece NULL y no genera eventos ficticios. Los nombres Ganada y Perdida se agregan para decisiones futuras explícitas. Si ya existían históricamente, se conservan abiertos: admin debe crear nombres distintos para los cierres explícitos. Los textos desconocidos de nuevas importaciones se conservan abiertos e inactivos; admin puede habilitarlos. El viejo app_setting deja de ser fuente de etapas, y el adaptador getOpportunityStages lee crm_stages. Se mantienen filtros/vistas por texto exacto de estado.

## Pipeline y conflictos

Seguimiento `/opportunities` ofrece Tabla/Pipeline. Comparten la misma consulta, filtros AND/OR, búsqueda, orden, datos y página de 50 oportunidades. Kanban muestra todas las etapas activas y etapas históricas de la página. Sus conteos son **de la página**, no totales por etapa. No usa drag-and-drop: Cambiar etapa abre un formulario accesible por teclado, que permite también el cierre perdido con motivo. La tabla principal de negocios no se convierte en tarjetas de oportunidades.

`stage_since` se conoce desde el alta o el primer movimiento real posterior a 007. Muestra días transcurridos completos, nunca created_at como sustituto para historia incompleta. La ausencia de tarea pendiente se indica en cada tarjeta. La prioridad manual y sugerencia aparecen separadas. El detalle tiene una pestaña Gestión comercial; no mezcla objeciones/pipeline con notas o tareas.

Transacciones bloquean cuenta y oportunidad; `pipeline_revision` aumenta ante cada UPDATE de oportunidad, incluidas proyecciones de seguimiento. El cliente envía la revisión observada; desactualizada devuelve 409 y exige actualizar/revisar antes de reintentar. La revisión queda congelada al abrir el formulario, incluso si Live Mode refresca las consultas mientras se edita. Un conflicto exige cerrar y abrir de nuevo para revisar; no se actualiza la revisión silenciosamente. No hay movimiento optimista sin confirmación de servidor. Triggers validan etapa, baja lógica, motivo y responsable incluso cuando se escribe por editores inline/masivos/formulario/importación. Ediciones antiguas no pueden pasar a Perdida sin usar el formulario de cierre. Solo admin o el responsable de la oportunidad pueden cambiar su etapa; user no cambia responsables.

## Pérdida y objeciones

Un cierre perdido exige un motivo activo; admite comentario y día opcional de recontacto. La fecha es SQL DATE, sin conversión de zona. `crm_pipeline_events` guarda actor, fecha real, etapa anterior/nueva, clasificación, motivo, comentario y recontacto. Reabrir no borra cierres anteriores. Motivo desactivado sigue legible en los eventos. Cerrar no cancela tareas silenciosamente.

`crm_objections`: varias por oportunidad, tipo de catálogo, notas, pendiente/resuelta/descartada y baja lógica. No modifica la etapa ni equivale a perder la venta. Cada alta, edición/resolución y baja registra snapshots en el historial del pipeline. Responsables y revisión se validan en backend. No permite editar una objeción de otra oportunidad.

## Reactivación

`/reactivation` muestra oportunidades actualmente perdidas cuyo **último movimiento de etapa** tiene fecha de recontacto. Filtros por desde/hasta, motivo, vertical, responsable (equipo/otro solo admin) y seguimiento generado. Por defecto muestra fechas hasta hoy y cierres sin planificar; limpiar Hasta permite ver fechas futuras. Papelera queda excluida. Históricos ambiguos no entran automáticamente: requieren un cierre explícito.

Acciones explícitas y transaccionales:

1. Crear seguimiento: conserva la venta perdida y crea una tarea pendiente.
2. Reabrir: mueve a una etapa abierta activa y crea seguimiento, preservando el cierre.
3. Nueva oportunidad: conserva la venta perdida, crea otra del mismo negocio y responsable/vertical, con nombre explícito, etapa abierta y `reactivated_from_id`; crea seguimiento sobre la nueva. No copia estado de suscripción ni pago.

El cierre vincula task_id/related_lead_id y se registra un evento de reactivación. Un mismo cierre no genera seguimiento dos veces, ni permite usar un cierre antiguo tras otra transición. Fecha vencida no contacta ni reabre por sí sola. La tarea usa la fuente de planificación de fase 2 y aparece en Mi día/agenda según su tipo, sin duplicar próxima acción.

`crm_accounts.do_not_contact` introduce la política de recontacto. Admin la modifica con un motivo obligatorio, auditable, desde negocio o Gestión comercial. El backend bloquea **todas las acciones de reactivación**, incluido admin; deshabilitarla exige una decisión administrativa explícita. La cola mantiene visible el negocio bloqueado. Esta política cubre reactivación; no implementa un sistema global de consentimiento, bajas de campañas ni intercepta los enlaces manuales de WhatsApp/teléfono existentes. No se inventa consentimiento para los registros anteriores.

## Prioridad determinista

Prioridad manual: `leads.prioridad`, con sus editores existentes. Nunca se escribe desde una sugerencia. Configuración de reglas: `app_settings.crm_priority_rules`, editable solo admin y auditada con antes/después. Evaluador puro `suggestPriority(rules,facts,today)` sin IA ni puntuación; usa el día de Argentina.

Cada regla: ID estable, explicación visible, factor, prioridad alta/media/baja, activa, días cuando corresponde y etapas opcionales. Si varias se cumplen, sugiere la prioridad más alta y muestra **todas** las razones. Sin coincidencias o en una venta ganada/perdida: sin sugerencia.

| Factor | Condición |
| --- | --- |
| Seguimiento vencido | próxima acción de fase 2 anterior a hoy, comparación de día sin hora |
| Sin seguimiento | no existe tarea pendiente no eliminada de la oportunidad |
| Etapa | etapa actual en las seleccionadas, selección obligatoria |
| Contacto antiguo | fecha de último contacto conocida, N días o más desde ese día |
| Cierre próximo | fecha estimada conocida entre hoy y hoy + N días inclusive |

Etapas seleccionadas restringen cualquier factor. Una fecha desconocida no se sustituye por fecha de creación. Reglas iniciales: seguimiento vencido → alta; sin tarea pendiente → media. Las tareas generales de negocio no se interpretan como seguimiento de cada oportunidad. Reglas de tiempo con hora pueden incorporarse en otra fase; esta usa las proyecciones DATE existentes.

## Auditoría, Analytics y compatibilidad

Historial de pipeline: últimos 200 eventos en detalle. Auditoría de configuración: últimos 100 cambios, con actor y snapshots, visible en Configuración. Cuenta conserva eventos aunque se elimine definitivamente una oportunidad (FK SET NULL). Objecciones eliminadas definitivamente con la oportunidad mantienen sus snapshots de auditoría.

Analytics conserva métricas históricas de Suscripto, sin convertirlas en ganadas. Agrega abiertas/ganadas/perdidas explícitas y motivos de cierres observados, dentro del mismo corte de oportunidades por fecha de alta/vertical/ciudad/responsable. Un cierre cuenta aunque se reabra, y puede haber varios por venta. Tiempo observado por estado combina journal anterior con eventos de pipeline desde la primera evidencia nueva, sin duplicar movimientos registrados por editores antiguos ni inventar fechas.

Live Mode invalida pipeline y las familias previas. Catálogos, eventos y objeciones incrementan versión; app_settings conserva su trigger existente. Tabla, filtros/vistas guardadas, notas, contacto, templates, historial, papelera y dark mode se mantienen. No hay deploy ni cambio de condición cliente/pago.

## Verificación

- npm run typecheck; npm test; npm run build; git diff --check.
- `CRM_TEST_DATABASE=1 npm run test:pipeline`: migración en esquema aislado/rollback, textos/NULL/vacíos y datos preservados; API autenticada, cierres y motivos, cola y filtros, permisos, conflicto 409, protección de editores antiguos, no contactar, reapertura/nueva/followup, relaciones/historial, objeciones y catálogo.
- Regresiones `test:commercial` y `test:work` completas. La prueba comercial ahora exige admin para mover la venta asignada a admin y comprueba que el usuario ajeno es rechazado.
- Tests unitarios para prioridad: todas las razones, máximo, fechas desconocidas, límites de días, etapas, reglas inactivas, cierres y días futuros/pasados.
- Playwright: cierre con motivo, objeción, sugerencia/manual, reactivación real, misma etapa en Kanban y tabla/API, tarea en Mi día, capturas claro/oscuro/móvil y desborde horizontal, además de las fases anteriores.
- CI: PostgreSQL 17, migración, seed, suites, navegador, build, smoke API y Docker. Local SQL/API usa PGlite/socket como en fases anteriores; no cambia el pool productivo.
- Se fija baseline-browser-mapping 2.9.19 porque la resolución flotante intentó descargar 2.11.27 y devolvió 404. No se migra el stack.

Referencias oficiales: [PostgreSQL 17 locking](https://www.postgresql.org/docs/17/explicit-locking.html), [constraints](https://www.postgresql.org/docs/17/ddl-constraints.html), [Kysely transactions](https://kysely-org.github.io/kysely-apidoc/classes/Transaction.html), [React](https://react.dev/reference/react).
