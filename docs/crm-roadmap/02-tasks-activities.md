# Fase 2: tareas, actividades, Mi día y agenda

## Base y alcance

Base remota verificada: `main` 24938b43495aaa2586bee77189b715246ec6ce87.
Fase 1 mergeada: cuentas, contactos, oportunidades (tabla histórica `leads`), clientes,
tabla principal de negocios y documentación `01-commercial-foundation.md`. Sin AGENTS.md.
No incluye pipeline, secuencias, campañas, rutas ni integración con Hospeda. No ejecuta deploy.

## Modelo y fuente de verdad

- `crm_tasks`: trabajo planificado, varias pendientes por negocio u oportunidad. Título,
  descripción/objetivo, tipo, responsable, fecha, hora opcional, prioridad, participantes y
  contactos; pendiente/completada/cancelada, resultado y fecha real de finalización.
- `crm_activities`: lo ocurrido. Fecha real (admite carga retrospectiva), tipo, participantes,
  contactos, canal, resultado y notas. Una finalización crea una actividad con `task_id` único.
  Ediciones de esa actividad actualizan también el resultado/fecha real de la tarea completada.
- `crm_work_types`: catálogo compartido en DB; nombre, activo, inclusión en agenda. Tipos
  iniciales: seguimiento, llamada, mensaje, reunión, visita, propuesta, otro. Desactivación
  conserva registros y permite conservar el tipo al editar. Seguimiento permanece disponible.
- `crm_work_journal`: snapshots antes/después por cada inserción, edición y baja de tareas y
  actividades. Triggers transaccionales; actor obtenido de `crm.actor_email` local a transacción.
  Los adaptadores históricos autenticados establecen el mismo actor. Migraciones/sistema pueden
  no tener actor. La baja es lógica; auditoría no se elimina. Eliminación definitiva de una
  oportunidad elimina sus tareas, conserva actividades desligadas y auditoría en la cuenta.

Vínculo obligatorio a negocio; oportunidad opcional. FK compuesta impide vínculos cruzados.
Contactos se validan activos y del mismo negocio en backend. Referencias JSON conservan los IDs
históricos de participantes incluso tras dar de baja un contacto. No se mueve un registro a otro contexto.

## Próxima acción compatible

`crm_tasks` es la única fuente de planificación. `leads.fecha_proxima_accion` sigue siendo SQL DATE,
una proyección por trigger de la primera tarea pendiente, no eliminada, vinculada a esa oportunidad:
orden por día, hora (sin hora después de las programadas de ese día), y ID como desempate.
Solo se proyecta el día, porque la columna/filtros anteriores son de fecha sin hora.

Migración 006 crea una tarea `legacy=true` por fecha histórica, incluidas oportunidades en papelera.
Un índice único parcial impide duplicar el adaptador. El migrador por checksum no repite backfills.
Preserva exactamente el día SQL DATE: no convierte días de calendario mediante AT TIME ZONE.

La edición inline, masiva, formulario, registro de contacto e importación continúan escribiendo el
campo histórico: su trigger crea/reprograma **solo el seguimiento legacy**. Limpiar la fecha cancela
solo ese seguimiento; otra llamada/visita pendiente vuelve a aparecer en la columna. Si el seguimiento
anterior fue finalizado o dado de baja, pierde el marcador legacy y se crea otro, preservando su
resultado y actividad. La edición de un formulario que omite la fecha no cancela seguimiento.
Un mismo valor proyectado no genera una tarea adicional: para planificar otra acción del mismo día,
se usa Nueva tarea. Completar una tarea conserva las demás y recalcula la primera.

Tareas generales de negocio no se copian a todas sus oportunidades. Se ven en el detalle del negocio,
Mi día y agenda. La tabla de negocios conserva las reglas de fase 1 para sus oportunidades: si hay
varias, muestra sus fechas y solicita elegir antes de editar inline; el masivo afecta todas.

## Fechas

Zona operacional explícita: `America/Argentina/Buenos_Aires`.

- `due_date`: SQL DATE, día de calendario, obligatorio, sin zona ni hora.
- `due_at`, `occurred_at`, `completed_at`: TIMESTAMPTZ, instantes. API exige ISO con offset;
  editor convierte los horarios argentinos explícitamente. DB valida que due_at coincida con due_date
  en Argentina. Se rechazan actividades/finalizaciones futuras: se planifican como tareas.
- “Hoy” se calcula en Argentina. Sin hora vence al pasar el día; con hora vence al pasar ese instante.
- Columna y filtros históricos comparan días SQL DATE. “Vencida” en esa columna significa día anterior;
  Mi día distingue además las horas vencidas de hoy. Estadísticas/Analytics usan el día argentino.
- Las fechas SQL DATE que postgres.js representa como Date se muestran por su día UTC de transporte,
  sin desplazarlas al día anterior. Los instantes del journal se muestran con hora argentina.
- `fecha_ultimo_contacto` también era SQL DATE, no admite guardar una hora real. La hora vive en la
  actividad. Triggers proyectan el último día/resultado de llamadas, mensajes, reuniones, visitas y
  propuestas. Una carga retrospectiva no desplaza un contacto posterior. Baseline conservado de
  fechas históricas/manuales; editar/borrar una actividad recalcula respecto de las otras y el baseline.

## Permisos

Auth propia admin/user, validación backend en `/_api/work`. No modifica responsables comerciales.

- Solo admin cambia `assignedUserEmail` de negocio/oportunidad, como en fase 1.
- User crea tareas/actividades en negocios u oportunidades cuyo responsable comercial es él.
  La nueva tarea hereda ese responsable; no puede asignar a otro, autoasignarse un negocio ajeno,
  ni cambiar el contexto de un registro. Editar responsable de tarea se rechaza con 403.
- Admin puede asignar una tarea independientemente del responsable comercial. El destinatario puede
  editar, completar/cancelar/bajar su tarea y editar la actividad derivada, sin cambiar el negocio.
- El seguimiento legacy conserva el responsable de la oportunidad y sigue sus cambios realizados
  por admin. Los demás responsables de tareas son independientes: no se reasignan silenciosamente.
- Mi día/agenda personal filtran por el usuario autenticado. `responsible=all` y responsables ajenos
  requieren admin. Tipos y reglas de seguimiento también requieren admin.
- Registro histórico de contacto/envío de templates conserva sus permisos previos; crea actividad,
  pero no concede ninguna capacidad de asignación. Intentar asignar por otra pantalla mantiene las
  restricciones de fase 1. Abrir WhatsApp no registra una comunicación como enviada por sí solo.

## UI y compatibilidad

`/my-day`: vencidas, hoy y próximas; nuevas asignadas sin contacto e interesadas sin tarea pendiente.
`assigned_at` registra cambios de responsable; históricos usan created_at como referencia inicial.
Etapas de interés y ventana de nuevas asignaciones están en `app_settings.crm_work_followup`,
configurables en Administración > Configuración > Clasificaciones. No se interpreta “No interesado”
como interés. Filtros por responsable (admin), localidad y vertical/contexto comercial.

`/agenda`: lista/calendario mensual de tipos marcados Agenda. Planificadas son tareas pendientes;
realizadas son actividades. Completar no dibuja dos veces el mismo encuentro. Calendario sin rutas.
Detalle de negocio/oportunidad reutiliza editores, pendientes, realizadas, tareas canceladas y auditoría.
Las tareas generales permiten elegir canales genéricos o una persona para WhatsApp, llamada o email,
sin crear una oportunidad ficticia ni registrar un envío al abrir el canal.
Registro de contacto y email aceptado por Brevo crean actividades, vinculadas al journal por activityId.
Detalle comercial oculta esas copias técnicas; journal técnico conserva su evidencia original.
No se convierte automáticamente el journal técnico anterior en actividades retrospectivas.

Paginación de 100 tareas/actividades; controles muestran páginas y el calendario advierte cuando muestra
solo una página. No se oculta la existencia de otras páginas. Auditoría contextual: últimos 200 cambios.
Live Mode invalida la nueva familia `work`; triggers de tareas/actividades/tipos incrementan versión.
Filtros guardados, tabla, edición inline/masiva, notas, templates, Analytics, Papelera y dark mode continúan.

## Verificación

- `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`.
- `CRM_TEST_DATABASE=1 npm run test:work`: esquema aislado con rollback; backfill bajo zona extranjera,
  idempotencia, múltiples tareas, replanificación legacy, permisos, delegación, contactos ajenos,
  fechas retrospectivas, auditoría, catálogo DB y baja lógica. Solo DB descartable.
- `npm run test:commercial`: regresión de fase 1 completa.
- `npm run test:browser`: flujo llamada+visita, completar desde Mi día, próxima acción, agenda,
  registro retrospectivo y evidencias claro/oscuro/móvil, además de flujos anteriores.
- Local: PGlite vía socket, pool de una conexión exclusivamente con CRM_TEST_DATABASE=1. Producción
  conserva pool 3. CI ejecuta PostgreSQL 17 real, migración, seed, todas las suites, smoke API y Docker.

Referencias oficiales: [PostgreSQL 17 DATE/TIMESTAMPTZ](https://www.postgresql.org/docs/17/datatype-datetime.html),
[AT TIME ZONE](https://www.postgresql.org/docs/17/functions-datetime.html),
[Triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html),
[React](https://react.dev/reference/react), [Kysely](https://kysely-org.github.io/kysely-apidoc/classes/Transaction.html).
