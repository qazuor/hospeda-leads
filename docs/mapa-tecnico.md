# Mapa técnico para continuar el CRM

Consultar archivos reales: este mapa orienta y no reemplaza la lectura de contratos ni permisos.

## Dónde trabajar

| Área | Ubicación |
|---|---|
| Rutas API y middleware (registro de rutas, salud, estáticos) | `src/server/app.ts` (desde #114; `src/server/index.ts` solo arranca el servidor) |
| MCP | `src/server/mcp/` |
| Páginas y estilos de página | `src/pages/` |
| Componentes compartidos | `src/components/`, `src/components/ui/` |
| Contratos cliente/servidor | `src/endpoints/` (schemas Zod, tipos y serializers SuperJSON) |
| Negocios/personas/gestiones | `src/endpoints/commercial.ts`, `commercial.schema.ts` |
| Listado/proyección heredada compatible | `src/endpoints/leads_GET.ts`, `src/helpers/businessTable.ts` |
| Trabajo y resultados | `src/endpoints/work.ts`, `work.schema.ts`, componentes de trabajo |
| Pipeline/etapas/acuerdos | `src/endpoints/pipeline.ts`, helpers y schemas correspondientes |
| Comunicación | `src/endpoints/communication.ts`, selector/editor compartido y componentes de modelos |
| Recursos/versiones/descarga | `src/endpoints/resources.ts`, miniaturas/visor y biblioteca |
| Calidad e importación | `src/endpoints/dataQuality.ts`, `businessImport.ts` y schemas |
| Búsqueda global de entidades | `src/endpoints/search.ts`, `search.schema.ts`, paleta del header |
| Historial global | `src/endpoints/lead_journal_GET.ts`, `src/helpers/globalHistoryServer.ts`, `auditChanges.ts`, `src/pages/history.tsx` |
| DB/mapeo de identificadores | `src/helpers/db.tsx`, `src/helpers/schema.tsx` |
| Permisos/autenticación | Helpers de sesión/usuario y guards compartidos; comprobar también el endpoint afectado |
| Permisos de negocio (lectura/escritura, archivado, No contactar, datos de contacto 8A) | `src/helpers/crmPermissions.ts`: `assertAccountViewable` (solo lecturas; el responsable ve su negocio archivado/No contactar), `assertAccountReadable`/`assertAccountWritable` (escrituras; no aflojar) y `assertContactDataWritable` (8A) |
| Quién registra/levanta No contactar (D1) | `src/helpers/doNotContactPermission.ts` (+ `.spec.ts`) |
| Tarea «Volver a contactar» (7A), reasignación con el responsable del negocio y cancelación al quedar No contactar (D3) | `src/helpers/recontactTask.ts` (`syncRecontactTask`, `reassignRecontactTask`, `cancelRecontactTaskFor`, `cancelPendingTasksForDnc`) |
| Duplicados al crear negocio y aviso de teléfono No contactar (D2) | `src/endpoints/business_duplicate_check.ts` (+ `.schema.ts`) |
| Vocabulario y su guardia | `src/content/vocabulary.ts`, `src/helpers/vocabularyGuard.spec.ts` (términos prohibidos) |
| Guía en pantalla y exportada | `src/content/user-guide.json` (fuente), `scripts/export-user-guide.mjs` (genera `docs/guia-de-uso.md`; regenerar tras cambiar la fuente), `src/content/userGuideLabels.spec.ts` (cada etiqueta citada debe existir en la UI) |
| Primeros pasos de Hoy | `src/helpers/firstSteps.ts` |
| Etapa sugerida al anotar un resultado (9A) | `src/helpers/stageSuggestion.ts` |
| Concurrencia al editar una tarea (#180): versión `expectedUpdatedAt`, 409 y reintento ya aplicado | `src/helpers/taskSaveConflict.ts` (+ `.spec.ts`); servidor en `task_save` de `src/endpoints/work.ts`; aviso y «Cargar la versión más reciente» en `src/components/WorkEditor.tsx` |
| Fechas rápidas y posponer tareas | `src/components/DueDateShortcuts.tsx`, `src/components/TaskPostponeMenu.tsx` |
| Llamadas desde Contactar | `src/components/PhoneCallPanel.tsx` (+ `.spec.tsx`) |
| Navegación por rol | `src/helpers/appNavigation.ts` |
| Evolución de esquema | `migrations/`, `scripts/migrate.mjs` |
| Unitarias | `*.spec.ts` / `*.spec.tsx` según configuración de Vitest |
| Integración | `scripts/test-*.ts`, `scripts/test-*.mjs` y comandos de `package.json` |
| Navegador | `tests/browser/`, `playwright.config.ts`; ayudante de transiciones/esperas en `tests/browser/support/transitions.ts` |
| Checks/deploy | `.github/workflows/ci.yml`, `.github/workflows/deploy-vps.yml`, `Dockerfile` |

## Compatibilidad importante

`leads` es el nombre físico heredado de las gestiones; no describe automáticamente un negocio. Muchos endpoints todavía llevan prefijo leads por compatibilidad. El listado de Negocios utiliza una proyección de negocio: no trasladar escrituras de una gestión a la cuenta por coincidencia de IDs.

Kysely transforma snake_case a camelCase mediante el plugin existente. Hay overrides para nombres con dígitos, por ejemplo recordatorios. SQL raw, JSON de snapshots y TypeScript pueden llevar nombres distintos; mantener la traducción exacta. No imprimir snapshots completos en logs de producción.

`crm_accounts.origin`, `source_reference`, `review_status` y `subscription_label` se incorporaron en la migración 017. `businessTable.ts` los proyecta a filtros/columnas heredados. La etapa de una gestión continúa independiente. `source_lead_id` sigue siendo referencia técnica/histórica.

## UI compartida

- `src/components/ui/CrmLayout.module.css`: paneles, encabezados, filas de acciones, filtros, formularios, footer y estados vacíos.
- Wrappers Mantine (`Button`, `Badge`, `Dialog`, selects, fechas y archivos) conservan contratos de componentes existentes.
- Estilos generales/tokens en `src/base.css`; verificar ruta exacta antes de editar si se reorganiza.
- `CrmResponsiveNavigation` mantiene opciones/callbacks de navegación desktop y selector móvil.
- `Disclosure`, `CrmEmptyState`, `QueryLoadingNotice` y `QueryErrorNotice` aportan presentación compartida; el caller conserva consultas y acciones.
- Reutilizar normalizadores de búsqueda, fechas y helpers de permisos antes de crear equivalentes.

## Migraciones recientes

| Migración | Propósito |
|---|---|
| 004 | Fundación comercial negocio/personas/gestiones |
| 006 | Tareas y actividades |
| 007 | Pipeline/reactivación |
| 008 | Recuperación de contraseña |
| 009 | Calidad/procedencia |
| 010 | Comunicación/recursos |
| 011–012 | UX y trabajo contextual |
| 013 | Importación de negocios |
| 014 | Inicio explícito de gestiones y compatibilidad |
| 015 | Credenciales MCP; no activa el servicio |
| 016 | Papelera propia de negocios |
| 017 | Campos para recuperación selectiva de metadatos |
| 018 | Estado del negocio (`crm_accounts.status`, `recontact_at`, `referred_to_leandro`), aditivo y nullable |
| 019 | Flujos de gestión: `is_client`, tipo de gestión, catálogos de etapas y motivos por tipo |
| 020 | Backfill idempotente del estado de negocio (se detiene ante etapas no clasificadas); no aplicado en producción |
| 021 | Trigger de auditoría de cambios de estado del negocio |
| 022 | Modelo de Comunicación; elimina datos atribuibles a secuencias de prueba |
| 023 | Trigger que conserva el archivado al actualizar otros campos del negocio |
| 024 | Índices de rendimiento (sin `CONCURRENTLY`) y retiro de `leads_nombre_idx` |
| 025 | Rellena `sessions.expires_at` |
| 026 | Versiones en vivo por dominio (37 triggers) |
| 027 | Lista única de resultados (CHECKs ampliados) y `continuation_reason` (motivo de «No agendar nada») |
| 028 | Guarda `crm_contact_outcome_since`: desde ahí se rastrea «Anotá cómo salió» |
| 029 | Índice de eventos de etapa por negocio (línea «Qué pasó») |
| 030 | Índices de usuario para Primeros pasos y contactos sin resultado |
| 031 | Índice parcial de negocios No contactar (aviso de teléfono, D2) |
| 032 | Extensión `pg_trgm` e índices GIN de trigramas sobre la expresión exacta de `normalizeSearchSql` (`crm_accounts`, `crm_contacts`, `crm_activities`, `lead_notes`) para la búsqueda sin acentos; si cambia la expresión en `searchSql.ts`, hace falta una migración nueva (`scripts/test-search.ts` lo verifica) |
| 033 | Índice parcial de tareas completadas por día de Argentina (`doneToday` de Hoy) |
| 034 | Índices GIN de trigramas de `leads` (nombre, opportunity_name, service_interest, contact_name, origen) y `crm_accounts.origin`, sobre la misma expresión que 032. Los usan Ctrl+K «Gestiones» y el `q=` del listado de negocios, que buscan cada tabla por separado con `idSetSearchSql` (`searchSql.ts`; fuentes del listado en `businessSearchSql`, `businessTable.ts`) |

El migrador lleva checksums. Aplicar migraciones no ejecuta la limpieza ni recupera campos históricos automáticamente.

## Lecturas recomendadas según tarea

- Visual: [sistema visual](ui-visual-system.md), [UI transversal](crm-roadmap/52-transversal-ui.md), suites visuales existentes.
- Flujo vendedor: [guía](guia-de-uso.md), [validación UX](usability-validation.md), documentos 44–48 del roadmap.
- Datos: [recuperación](business-metadata-recovery.md), [limpieza](management-cleanup-runbook.md), [importación](BUSINESS_IMPORT.md).
- Modelos: [revisión](message-model-review-runbook.md), documento 42 del roadmap.
- Infraestructura: [Coolify](COOLIFY_DEPLOY.md), [MCP](crm-mcp.md), [desarrollo local](desarrollo-local.md).
- Rendimiento: [plan, resultados y notas de deploy de octubre 2026](rendimiento-y-arquitectura-2026-10.md); harness en `scripts/perf/`.
