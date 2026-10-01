# Fase 1: base comercial

## Relevamiento y adaptación

Base revisada: main aa08469424f2d3f612fffdb27dcad3728d884040. No hay AGENTS.md.
Se revisaron migraciones 001–003, esquema Kysely, alta/edición/inline/masivos/importación/ingest,
detalle, contacto, templates, filtros AND/OR, vistas guardadas, journal, permisos,
Analytics, Live Mode y workflows CI/deploy. README/MIGRATION describen todavía la migración Floot.

- Cuenta: negocio, datos generales y condición comercial prospecto/cliente.
- Contacto: persona perteneciente a una cuenta; cero o un principal activo.
- Oportunidad: contratación concreta. Se implementa extendiendo `leads`, no creando otro estado.
- Lead: entrada comercial y experiencia existente; su ID sigue siendo el ID de la oportunidad.

La cuenta es la fuente de datos generales (nombre, ciudad, canales genéricos y presencia digital).
Los campos históricos equivalentes en leads se conservan como proyección compatible mediante triggers
transaccionales bidireccionales. Editar esos campos en un lead actualiza su cuenta y oportunidades hermanas.
`opportunity_name` identifica la venta y no modifica el nombre del negocio.
`estado`, vertical, responsable, suscripción, seguimiento y notas siguen siendo propios de cada lead.
El responsable de cuenta es independiente del responsable de oportunidad; ambos solo los cambia admin.
No hay sincronización automática de personas: contactName/email/telefono históricos se conservan;
los contactos explícitos se administran en la cuenta. En entradas históricas sin nombre de oportunidad, el destinatario por defecto conserva los campos genéricos/históricos del lead (aunque exista una persona migrada), para que ediciones previas de teléfono/email sigan siendo efectivas. Un contacto seleccionado usa únicamente sus datos,
sin rellenar un nombre ausente ni usar otro destinatario silenciosamente.

## Migración

004 agrega cuentas, contactos, referencias y auditoría. Una cuenta por lead (incluidos eliminados),
sin deduplicación por email/teléfono ni deducciones de identidad, pago o cliente.
Solo un contact_name no vacío permite crear una persona; los canales genéricos siguen en la cuenta.
Los valores originales (incluido asignado_a ambiguo) no se normalizan ni se pierden.
El contacto migrado es una copia explícitamente identificada por source_lead_id.
Los leads nuevos creados por cualquier ruta/importación reciben cuenta en un trigger.
La migración se aplica una vez por checksum en schema_migrations; el backfill usa referencias únicas.
Los journals existentes conservan IDs y ahora incorporan account_id para retener su relación incluso
si una oportunidad se elimina definitivamente. Notas, URLs, filtros, vistas y templates no cambian.

## Consistencia y permisos

Mutaciones comerciales en transacciones. Bloqueo de cuenta serializa cambios de principal;
índice único parcial impide dos principales activos y FK compuesta impide contacto de otra cuenta.
Baja lógica de contactos conserva historial y limpia referencias de oportunidades, sin sustituciones.
Conversión explícita registra actor, fecha y motivo: cliente comercial no acredita pago.
Configuraciones de verticales y etapas se leen de DB, tanto en leads como en oportunidades (etapas existentes más catálogo DB). El catálogo inicial conserva exactamente las etapas de la UI previa.
Auditoría de cuenta/contactos guarda snapshots y se muestra junto al journal de oportunidades.

## Próximas fases

No incluye pipeline visual, tareas, secuencias, cobros, onboarding ni retención.
Analytics existente cuenta oportunidades/leads, no clientes pagadores. La condición cliente es independiente.
No se fusionan cuentas automáticamente. Los contactos migrados no se mantienen sincronizados con los
campos históricos: seleccionar persona evita ambigüedad; opción datos genéricos mantiene el flujo previo.

## Validación

- `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`.
- `CRM_TEST_DATABASE=1 npm run test:commercial` requiere DB descartable: crea fixtures de prueba.
  Verifica migración 001–004 en esquema aislado (rollback), conservación completa de campos históricos,
  reimportación con ID repetido, autenticación, responsables por rol, pertenencia, índice único,
  oportunidades independientes, conversión idempotente, templates y baja lógica.
  Brevo se simula: no envía correos reales. La prueba de WhatsApp captura localmente la URL y el mensaje, sin abrir WhatsApp ni enviar mensajes.
- `npm run test:browser`: Chromium sobre servidor compilado, cuenta con dos contactos y oportunidades,
  conversión, selección de destinatario y preview, nombres vacíos, estado independiente, baja lógica;
  capturas claro/oscuro/móvil y fecha de cierre sin desplazamiento de día en zona horaria argentina. CI ejecuta estas pruebas sobre PostgreSQL 17, además de todos sus checks previos.
- Localmente se usó PGlite con conexión única como motor de pruebas SQL/API; PostgreSQL 17 real
  y la ejecución de Chromium se validan en CI. No se modifica el pool de producción.

Las vistas guardadas y filtros siguen operando sobre campos de lead; los campos generales se proyectan
desde la cuenta. La importación destructiva `replace` se rechaza para no perder relaciones/historial.
Ingest no asigna responsables; la ruta antigua `leads_POST` resuelve nombres inequívocos a usuarios
solo para admin, conservando assignedUserEmail como campo vigente.
Los emails históricos no válidos se conservan; cambiar un email o crear una persona exige uno válido.
Historial de cuenta muestra los últimos 200 eventos de cada fuente; el journal global/lead conserva su paginación.

Referencias de implementación: [PostgreSQL 17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html),
[Kysely transactions](https://kysely-org.github.io/kysely-apidoc/classes/Transaction.html).
Deploy manual exclusivamente con workflow_dispatch; esta fase no ejecuta deploy.

La tabla de leads muestra el nombre de oportunidad y negocio; la búsqueda libre incluye ambos. La detección de duplicados compara cuentas distintas, no oportunidades de la misma cuenta.
