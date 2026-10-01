# Fase 4: calidad, procedencia, importación revisable y fusión

Base remota verificada: main `5f84d3b8ce0fc8579ef475bb8b401df7f451c9f0`. Fases 1–3 y sus documentos revisados. No existe AGENTS.md en el checkout. Rama: feature/crm-data-quality. No se ejecuta deploy; deploy-vps.yml conserva workflow_dispatch.

## Normalización conservadora

Los valores visibles y originales no se reemplazan. `normalizeField` produce un valor independiente de comparación, validez de formato y explicación. Nombre/localidad: Unicode sin diacríticos, espacios y puntuación normalizados solo para comparación. Sin localidad conocida no se declara coincidencia nombre+localidad.

Teléfono: acepta internacional explícito (+/00), Argentina +54 con diez dígitos nacionales o +549 con diez dígitos y nacional de diez dígitos con cero opcional. Un nacional se compara con +54, sin inventar el 9 de móvil. El formato 549 sin + se reconoce. Número local sin área, prefijo 15, múltiples números, internos y texto permanecen ambiguos; no se infiere área ni se equipara fijo/móvil. No se valida existencia de línea, ni lista externa de códigos de área.

Email: trim y dominio en minúscula; parte local conserva mayúsculas. Múltiples direcciones/formato inválido se indican. URL: solo HTTP(S), dominio y sintaxis mediante URL; sin protocolo ofrece sugerencia https pero queda ambigua. Conserva ruta, query y fragmento. No comprueba disponibilidad. Un formato válido no implica un dato verificado.

## Procedencia por campo

`crm_data_evidence` registra campo, alcance (negocio/contacto/oportunidad), valor original y normalizado, fuente, URL, fechas de obtención/verificación opcionales, validez, observaciones, actor real y lote opcional. Se agrega evidencia nueva; la API no modifica la anterior. No se atribuye una fuente global a todos los campos. Datos generales importados corresponden al negocio; campos comerciales corresponden a la oportunidad creada.

No se inventa procedencia retrospectiva de los datos anteriores: `origen` y `fuenteReferencia` se preservan. Calidad de datos, en el detalle del negocio, muestra datos generales y canales de contactos, incompletos/inválidos/ambiguos y todas sus evidencias. Si un valor cambia, la evidencia del valor anterior queda marcada histórica. Evidencias comerciales importadas se consultan en el histórico con ID de oportunidad; no se confunden con los datos compartidos. Admin o responsable del negocio pueden agregar evidencia; otros usuarios solo leen. Fechas futuras se rechazan. No hay crawling, consultas externas ni enriquecimiento.

## Importación

Se conserva el esquema de filas que aceptaba `leads_import` (incluidos campos históricos, fechas y booleanos). La UI incorpora carga CSV con Papa Parse, dependencia ya existente; no se agregan Excel, JSON ni nuevos parsers. Permite delimitador detectado por Papa Parse, encabezados únicos, mapeo, fuente, URL y fecha de obtención. DB `app_settings.crm_data_quality` configura máximo de filas/bytes dentro de topes de seguridad de 250 filas y 2 MiB. Sin cambios al stack.

1. Cargar y mapear. Campos sin mapeo se omiten.
2. Preview validado por backend. Guarda únicamente el lote de revisión, sin escribir negocios/oportunidades. Cada fila conserva valores, errores, advertencias, coincidencias existentes y dentro del archivo.
3. Crear, actualizar negocio u omitir por fila. Filas inválidas empiezan omitidas y no se pueden escribir. Coincidencias empiezan omitidas; activar escritura exige reconocerlas explícitamente. Datos ambiguos también exigen reconocimiento; se conservan originales.
4. Actualizar requiere elegir coincidencia destino, revisión observada y permite exclusivamente datos generales del negocio. Muestra antes/después. No interpreta qué oportunidad debería recibir etapa, notas o seguimiento; esos campos exigen excluirlos del mapeo, crear una entrada u omitir. Solo admin o responsable del negocio actualiza. Responsable importado exige admin y usuario inequívoco.
5. **Vacío o campo no mapeado nunca borra datos al actualizar.** Para borrar se usa el editor explícito habitual. Dos filas no pueden actualizar el mismo destino en una confirmación.
6. Confirmación del resumen antes de escribir. Una transacción valida nuevamente todas las filas, identidad activa, permisos, coincidencias y revisión. Un error/conflicto revierte todo el lote; permanece en revisión y se informa la fila/motivo. No hay importación parcial silenciosa.
7. Informe final: ID de lote, creados, actualizados, omitidos y errores (cero en lote completado atómicamente), detalle por fila/ID. Guarda decisiones y resultado.

Fingerprint SHA-256 de filas mapeadas en orden estable, ignorando columnas vacías y sin incluir fuente, impide reenviar el mismo contenido cambiando nombre de archivo/fuente. Lote cerrado retorna su resultado incluso ante dos confirmaciones concurrentes. Filas reordenadas o datos diferentes generan otra huella: siguen requiriendo revisión de coincidencias; no se promete deduplicación infalible de archivos modificados. Lote existente conserva fuente original, visible en preview. Otro usuario necesita admin para revisar/confirmar ese lote.

Rutas antiguas `leads_import` e ingest con token devuelven 409 y explicación, sin escribir: ya no pueden saltar la revisión. Ingest no autorizado sigue 403. La carga asistida debe exportarse a CSV y revisarse en sesión CRM. La migración operativa de snapshots/scripts continúa separada de esta herramienta comercial. Altas/ediciones individuales y comunicación mantienen sus rutas.

## Duplicados

Comparación entre negocios activos, incluyendo negocios sin oportunidades. Razones concretas: nombre+localidad normalizados, teléfono/email/sitio web compartido. Nombre+localidad produce **candidato**, no identidad probada. Solo canal compartido se explica como persona compartida / negocio relacionado; el sistema no puede decidir cuál sin revisión humana. No hay score ni fusión automática. Teléfono solo nunca es prueba suficiente. Distintas oportunidades del mismo negocio no se presentan como negocios duplicados.

## Fusión y relaciones inspeccionadas

Solo admin, mediante Buscar duplicados → Revisar fusión. Elegir origen/destino (invertibles), conservar valor de cada campo general, revisar relaciones/políticas, motivo y confirmación explícita. Preview firma SHA-256 de cuentas y todas las relaciones actuales. Una modificación en datos, notas, documentos, eventos, tareas o evidencias exige nuevo preview; no se actualiza el token silenciosamente con Live Mode.

| Relación | Conservación |
| --- | --- |
| crm_accounts | Origen conserva ID y datos originales; merged_into_id/merged_at lo retiran de listas activas y rechazan nuevas escrituras |
| leads | Conserva IDs, estado/vertical/asignación, datos comerciales, baja lógica y reactivated_from_id; cambia cuenta y proyección de datos generales |
| crm_contacts | Conserva todas las personas/IDs, incluidas bajas; principal activo del destino prevalece si hay dos |
| leads.primary_contact_id | IDs intactos; FK compuesta vuelve a validar pertenencia al destino al commit |
| lead_notes / leads.notas | Notas e IDs intactos; no se concatenan ni sobrescriben |
| leads.archivo_adjunto / email_outbox | Documentos y mensajes intactos vinculados a oportunidad; no se borran ni reenvían |
| crm_tasks / crm_activities | Cambia cuenta; IDs, oportunidad/tarea/contact_ids JSON, responsables, fechas, estados y bajas intactos |
| crm_objections / crm_pipeline_events | Cambia contexto operativo para satisfacer FK compuestas; eventos conservan original_account_id, actor, fecha y snapshots/etapas originales |
| lead_journal / crm_commercial_journal / crm_work_journal | Referencias y snapshots anteriores intactos; consulta de destino agrega la familia histórica recursiva |
| crm_data_evidence | Cambia cuenta operativa; original_account_id, valores, alcance, fuente y lote intactos |
| crm_account_merges | Identidad origen/destino, actor, motivo, snapshot de ambas cuentas/relaciones y selección de valores |

Condición cliente: prevalece si cualquiera era cliente, con primera fecha conocida, sin acreditar pago. No contactar: OR conservador; nunca se levanta por fusionar. Responsable del destino permanece; responsables de oportunidades/tareas no se alteran. No se deduplican contactos u oportunidades: conservarlos evita perder personas, ventas o trabajos distintos.

Transacción con bloqueos de tablas afectadas SHARE ROW EXCLUSIVE, filas de lote bloqueadas en importación y FK diferibles solo durante fusión; SET CONSTRAINTS IMMEDIATE antes del commit comprueba relaciones. Esta estrategia prioriza integridad frente a escritores históricos: las fusiones/importaciones manuales son breves y acotadas, pero bloquean temporalmente otras escrituras. Si el volumen crece, evolucionar a protocolo compartido de bloqueos/versiones para todos los escritores antes de quitar este bloqueo. Lecturas habituales continúan.

Familia `crm_account_family` y resolución recursiva de `merged_into_id`: enlaces antiguos a negocio muestran destino y aviso; enlaces a oportunidades mantienen ID y ahora su negocio destino. Cadenas de fusiones conservan histórico de todos los ancestros. No hay borrado físico de origen ni función deshacer. Fuente de etapa, proyecciones de seguimiento y auditoría existente continúan; movimientos de relaciones generan nuevos snapshots de trabajo con actor real, sin reescribir los anteriores.

## Migración y verificación

009 es aditiva, no normaliza/backfillea valores históricos ni fusiona automáticamente. Hace diferibles las FK del contexto, agrega identidad archivada, lote/evidencias/fusiones y origen explícito de eventos de pipeline. Compatible con checksum de migraciones, seed y Docker. Live Mode incluye data-quality, y triggers incrementan versión al escribir; consultas de negocio, duplicados y selectores excluyen orígenes fusionados. UI utiliza tokens claro/oscuro, secciones y formularios compactos existentes.

- `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`.
- `CRM_TEST_DATABASE=1 npm run test:quality`: migración aislada con valores inválidos/históricos/eliminados; preview sin escritura comercial, permisos, campos vacíos, fila inválida y rollback, reenvío/concurrencia de lote, conflicto de destino, error intermedio de fusión, relaciones/IDs/historial/documentos, enlace antiguo y origen sin actividad independiente.
- Suites comerciales, tareas, pipeline y recuperación completas. Prueba de tareas usa importación revisada para conservar su cobertura de seguimiento/actor.
- Playwright: CSV, mapeo, coincidencia intraarchivo, omisión de fila inválida, confirmación, fusión explícita y evidencia de fuente; capturas claro/oscuro/móvil y desborde. Regresiones de fases anteriores incluidas.
- Local: SQL/API con PGlite/socket descartable y pool único de test. PostgreSQL 17 real, navegador y smoke Docker/API se ejecutan en CI. Dependencias locales del motor descartable no se agregan al proyecto.

Referencias oficiales: [PostgreSQL 17 SET CONSTRAINTS](https://www.postgresql.org/docs/17/sql-set-constraints.html), [bloqueos](https://www.postgresql.org/docs/17/explicit-locking.html), [Kysely transactions](https://kysely-org.github.io/kysely-apidoc/classes/Transaction.html), [Papa Parse](https://www.papaparse.com/docs).
