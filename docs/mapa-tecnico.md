# Mapa técnico para continuar el CRM

Consultar archivos reales: este mapa orienta y no reemplaza la lectura de contratos ni permisos.

## Dónde trabajar

| Área | Ubicación |
|---|---|
| Rutas API, estáticos, MCP y arranque | `src/server/index.ts`, `src/server/mcp/` |
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
| Evolución de esquema | `migrations/`, `scripts/migrate.mjs` |
| Unitarias | `*.spec.ts` / `*.spec.tsx` según configuración de Vitest |
| Integración | `scripts/test-*.ts`, `scripts/test-*.mjs` y comandos de `package.json` |
| Navegador | `tests/browser/`, `playwright.config.ts` |
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

El migrador lleva checksums. Aplicar migraciones no ejecuta la limpieza ni recupera campos históricos automáticamente.

## Lecturas recomendadas según tarea

- Visual: [sistema visual](ui-visual-system.md), [UI transversal](crm-roadmap/52-transversal-ui.md), suites visuales existentes.
- Flujo vendedor: [guía](guia-de-uso.md), [validación UX](usability-validation.md), documentos 44–48 del roadmap.
- Datos: [recuperación](business-metadata-recovery.md), [limpieza](management-cleanup-runbook.md), [importación](BUSINESS_IMPORT.md).
- Modelos: [revisión](message-model-review-runbook.md), documento 42 del roadmap.
- Infraestructura: [Coolify](COOLIFY_DEPLOY.md), [MCP](crm-mcp.md), [desarrollo local](desarrollo-local.md).
