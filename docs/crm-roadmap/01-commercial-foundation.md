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

## Claridad de la UI (revisión de fase 1)

- “Editar negocio” modifica datos compartidos; “Editar lead” conserva la edición de clasificación, etapa y seguimiento de la oportunidad. Los canales genéricos y la identidad siguen siendo proyecciones compartidas y están identificados como tales.
- Una oportunidad es una venta/contratación concreta; el lead existente representa esa oportunidad. La gestión migrada sin nombre propio se muestra como “Gestión comercial inicial”, sin cambiar datos almacenados.
- Las personas se editan exclusivamente en el bloque Personas de contacto del detalle. El formulario heredado conserva contactName al editar y lo permite al crear la primera entrada; el card inferior muestra solo canales genéricos y datos del negocio.
- Cargo y canal preferido son selects con catálogos en app_settings (migración 005). Los valores históricos fuera del catálogo permanecen seleccionables y no se normalizan ni borran automáticamente.

- Ayuda contextual colapsable en cuentas y detalle: definiciones con ejemplos, alcance de cada editor y diferencia prospecto/cliente. Formularios explican principal, preferencias, responsables independientes y fecha estimada. Comunicación explica destinatario y variables vacías.

## Lenguaje y flujo para usuarios sin experiencia

La UI usa exclusivamente Negocios, Contactos y Oportunidades. `leads` sigue siendo el almacenamiento de oportunidades y sus URLs/IDs, sin crear otra fuente de estado. Los nombres antiguos solo permanecen en código y evidencia histórica.

Nueva oportunidad solicita elegir un negocio existente o crear uno nuevo y luego cargar la venta. Cancelar después de crear un negocio lo conserva sin oportunidades, una situación válida. En el detalle de oportunidad, contactos y otras ventas son secciones colapsables del negocio; la etapa/notas/seguimiento de la oportunidad quedan separados. “Editar datos de venta” es un acceso rápido; “Editar oportunidad” es el formulario completo.

El formulario completo ya no ofrece edición de campos compartidos del negocio. Envía scope=opportunity y el backend toma esos campos de la fila actual en una transacción con bloqueo, para que valores viejos del formulario no sobrescriban datos generales. La API heredada conserva su comportamiento cuando no recibe scope. El contacto elegido se valida dentro del negocio; responsables siguen restringidos a admin.

Validación: se fija Rollup 4.63.5 mediante overrides de npm. Dos instalaciones limpias de CI con resolución flotante fallaron por la ausencia del binario opcional linux-x64-gnu; la versión fijada es la validada localmente y conserva las variantes nativas de cada plataforma.

## Navegación centrada en negocios

La entrada principal y el logo llevan a Negocios (/accounts): una fila por negocio, con contactos y oportunidades contados, sin multiplicar filas por venta. Al abrir un negocio aparecen las personas y ventas relacionadas. Seguimiento (/opportunities) conserva la tabla avanzada de oportunidades como vista secundaria. La raíz / redirige a negocios; los enlaces antiguos /?leadId, /?quick y otros filtros redirigen a /opportunities conservando el query completo. No cambian IDs ni datos.

## Tabla principal existente con una fila por negocio

La pantalla principal `/accounts` reutiliza `LeadsPage` en modo negocio. Se retiró el listado simplificado independiente: se conservan la tabla configurable original, tamaños/orden/visibilidad de columnas, búsqueda, filtros AND/OR, vistas rápidas y guardadas, selección, edición inline, acciones masivas y pantalla completa. Abrir una fila muestra el negocio, sus personas, oportunidades e historial comercial. Crear o editar desde la tabla modifica los datos generales del negocio. Las ventas se crean dentro de ese negocio. `/opportunities` mantiene el seguimiento individual y los detalles históricos.

El listado `leads?entity=business` es una proyección de lectura de cuentas y oportunidades; no crea un segundo estado comercial. Primero se aplican los filtros existentes sobre cada oportunidad y luego se deduplican las cuentas **antes de contar, ordenar y paginar**. Un negocio aparece si una misma oportunidad cumple todos los grupos AND (las reglas dentro de cada grupo siguen siendo OR). Nunca se combinan condiciones de oportunidades diferentes para inventar una coincidencia. Los datos generales y el responsable de la fila provienen de la cuenta; los filtros de responsable se refieren al responsable del negocio. El modo original del endpoint continúa devolviendo oportunidades.

Las filas tienen IDs estables de negocio para selección y acciones. La columna **ID de entrada** y los filtros históricos por ID conservan los IDs de leads: las vistas guardadas con un ID siguen encontrando el mismo negocio. `opportunityId` es la entrada que coincidió con los filtros; no se usa como identidad de la cuenta ni como destino silencioso de ediciones ambiguas. Las preferencias y vistas existentes conservan sus claves y formato. Las URLs antiguas `/?leadId=…` abren el detalle original; los demás filtros rápidos de la URL principal abren la tabla de negocios.

Cuando hay una sola oportunidad, las columnas de seguimiento mantienen la edición inline anterior. Con varias, muestran los valores de sus oportunidades y ofrecen abrir el negocio para elegir cuál modificar. Los datos generales (por ejemplo ciudad) y el responsable del negocio siguen admitiendo cambios inline. Backend rechaza una edición inline de seguimiento que pretenda elegir implícitamente una oportunidad entre varias o una oportunidad ajena. Cambiar responsable del negocio solo está permitido a administradores y no cambia los responsables independientes de las oportunidades. Los cambios importantes de la cuenta quedan en su historial comercial.

En acciones masivas, ciudad y responsable modifican cuentas; etapa, prioridad, vertical y próxima acción modifican **todas las oportunidades activas** de los negocios seleccionados, incluso las que no coincidan con el filtro actual. La interfaz lo indica antes de aplicar. Las transacciones bloquean las cuentas en orden y preservan la auditoría y las restricciones del backend. Enviar a Papelera guarda todas sus oportunidades activas; cuenta, contactos e historial permanecen disponibles. Restaurar una oportunidad hace reaparecer el negocio. Los negocios recién creados sin oportunidades aparecen en la tabla; no tienen todavía elementos restaurables en la Papelera existente y el backend rechaza esa operación de forma explícita. No se agrega una nueva papelera de cuentas en esta corrección. La conservación del journal por cuenta impide que eliminar definitivamente la última entrada haga reaparecer accidentalmente un negocio archivado.

Las métricas de la tabla principal cuentan negocios distintos. Estado, suscripción y fechas de seguimiento continúan perteneciendo a oportunidades; la condición prospecto/cliente se muestra junto al negocio y no acredita pagos. Un negocio puede figurar en más de una métrica de seguimiento si tiene ventas diferentes en situaciones diferentes. Los negocios nunca se agrupan por teléfonos o emails iguales. No se requiere una migración de datos nueva para esta proyección.

## Templates sin perfil comercial

El selector Destinatario muestra «Contacto original de la oportunidad» para conservar el teléfono, email y nombre históricos. Las demás opciones son personas activas del negocio; los templates se eligen debajo.

Sin perfil comercial, se muestran y permiten enviar templates de todos los perfiles, manteniendo las restricciones de canal y vertical. Con perfil definido, se muestran los genéricos y los correspondientes a ese perfil. Se conserva la regla existente de primer contacto Referente por email.
