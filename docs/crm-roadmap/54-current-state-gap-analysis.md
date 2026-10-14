# Reporte: brecha entre el CRM actual y el modelo de estados definido

**Fecha:** 12/10/2026
**Spec objetivo:** [53 — Estados de negocios y gestiones](53-business-and-management-state-model.md)
**Alcance:** inspección de lectura del código del checkout local. No se modificó código ni se consultó la base de datos.

## Alcance y límites de la inspección

- Checkout revisado: rama `feat/visual-polish-ux`, HEAD `b360836a3ecbb7aa5b4bdd6ba22898860a9c2c4a`. `origin/main` reportó `fdd9e14fb2672b6c30ba37d81e2e1b6dd0771284`; este reporte describe el checkout local, no afirma que `main` tenga exactamente el mismo contenido.
- El árbol de trabajo ya tenía cambios locales, principalmente de UI visual y documentación. Los archivos de lógica comercial consultados no muestran cambios funcionales sin commit frente al HEAD en las áreas centrales; `CommercialEditor.tsx` tiene además un cambio local de presentación.
- No se leyó `.env`, no se consultaron secretos ni se hicieron lecturas/escrituras a la base de datos.
- Los conteos productivos citados provienen de la documentación existente, no de una consulta actual. El corte documentado registró 146 negocios marcados Filtrado; no se verificó el conteo actual.
- Se siguieron esquema/migraciones, endpoints y sus principales pantallas. No se ejecutaron pruebas porque el encargo fue una inspección de solo lectura.

## Resumen ejecutivo

El CRM ya tiene las tres entidades necesarias como base: negocios (`crm_accounts`), gestiones (`leads`) y relaciones de uno a muchos entre ellas. También conserva por separado Cliente, No contactar, Archivo y Papelera. Esa base permite evolucionar sin fusionar negocio y gestión.

La brecha principal es que **el estado agregado del negocio todavía no existe**. La revisión vive como `review_status = filtered | NULL`; la etapa vive en cada gestión como `leads.estado`; Archivo es `archived_at`. La tabla de negocios incluso proyecta una etapa de gestión en la columna heredada `estado`, o “Filtrado” cuando no hay gestiones. Por lo tanto, todavía no existe una fuente única para Nuevo, Revisado, En gestión, Sin seguimiento programado o Recontactar.

Las etapas actuales usan un catálogo global compartido por todas las gestiones. Hay clasificación abierta/ganada/perdida y motivo obligatorio para pérdida, pero no etapas asociadas a una vertical ni una matriz que limite las transiciones. El inicio de gestión tampoco exige que el negocio haya sido revisado.

Conclusión: varias piezas se pueden conservar, pero llegar al modelo objetivo requiere un cambio de datos, centralizar las reglas de escritura en servidor y revisar todos los caminos heredados que hoy pueden editar `leads.estado`.

## Comportamiento actual verificado

### Negocio y propiedades independientes

| Concepto actual | Dónde se guarda | Qué hace hoy |
|---|---|---|
| Revisión | `crm_accounts.review_status`, limitado a `filtered` o `NULL` | La UI permite marcar Filtrado/No filtrado. No es el estado completo del negocio. |
| Condición de cliente | `crm_accounts.commercial_status` (`prospect`/`client`) y `client_since` | Tiene semántica de indicador, pero es un enum. Se activa manualmente o mediante una opción al cerrar Ganada; no se desactiva desde la UI/API comercial actual. |
| No contactar | `crm_accounts.do_not_contact` | Puede activarse al registrar el resultado “Pidió no ser contactado” o desde Política de contacto, esta última solo por admin. Bloquea nuevas acciones de contacto/secuencias. No archiva el negocio. |
| Archivo | `crm_accounts.archived_at` | Es independiente de Papelera. Se conserva negocio e historial; la lista de archivados es administrativa. El admin puede recuperarlo. |
| Eliminado | `crm_accounts.deleted_at`, `deleted_by_email`, `deletion_reason` | Soft delete separado de Archivo. La Papelera de negocios es solo para admin y ofrece restaurar. Las escrituras normales bloquean negocios eliminados. |
| Derivado a Leandro | No existe | No hay indicador, acción de derivación ni captura automática del responsable previo. |

Las altas manuales e importadas no asignan un estado de negocio: el enum Cliente queda en su default Prospect y la revisión queda sin marcar. El importador de negocios no recibe ni establece la condición de revisión como dato de entrada.

### Gestiones y etapas

- `leads` ya permite varias gestiones para un mismo `account_id`; el detalle carga todas las gestiones y el pipeline clasifica cada una por separado.
- `leads.estado` referencia `crm_stages.name`. El catálogo contiene nombre, orden, activo, clasificación (`open`, `won`, `lost`) e histórico; desde la migración 012 también `journey_phase`. No hay una clave de vertical/tipo de gestión en esa tabla.
- Las verticales se mantienen en `crm_verticals` y en `leads.tipo`/`crm_accounts.tipo`, pero el catálogo de etapas no está ligado a ellas. La configuración actual administra una lista global.
- El pipeline permite elegir cualquier etapa activa. La base exige motivo cuando la etapa destino tiene clasificación `lost`; no define qué etapa puede seguir a cuál.
- El motivo de pérdida y la fecha de recontacto quedan en `crm_pipeline_events`. La fecha aparece en el flujo de pérdida, y permite la pantalla actual de reactivación. No hay estado agregado `Recontactar` en el negocio.
- El cierre Ganada puede crear evidencia de acuerdo/entrega y una tarea de acompañamiento, pero esa tarea es seguimiento general, no una gestión posterior de acompañamiento con su propio ciclo.

### Cómo cambian hoy negocio y gestión

- **Iniciar gestión:** la pantalla ofrece “Iniciar gestión” cuando el negocio es editable. El endpoint crea la fila en `leads` y comprueba permisos/etapa, pero no exige `review_status = filtered` ni un estado equivalente a Revisado.
- **Cerrar o mover etapa:** el pipeline actualiza la etapa de esa gestión. No recalcula el estado del negocio al iniciar, cerrar una gestión o cerrar la última gestión abierta.
- **Ganada y Cliente:** al seleccionar Ganada se muestra un checkbox opcional “Marcar este negocio como cliente”. La ganada por sí sola no activa `commercial_status=client`. La conversión manual desde la ficha también está disponible para el responsable/admin; la acción inversa no está implementada.
- **Edición directa de etapa:** el editor de gestión también permite guardar `estado` como parte de `opportunity_save`. Una etapa clasificada Ganada puede guardarse por esa ruta sin activar Cliente ni registrar automáticamente el cierre/acuerdo del flujo del pipeline.
- **Perdida y motivo:** el pipeline pide motivo de pérdida y la base lo hace obligatorio para toda transición a una etapa `lost`. La regla no cubre cierres ganados ni otros resultados como Participa/No participa o Colabora/No colabora.
- **No contactar:** el resultado `do_not_contact` activa la política del negocio y detiene secuencias. La política no cambia `archived_at`, no registra una etapa especial de gestión y no pregunta si cerrar las demás gestiones abiertas.
- **Edición alternativa de etapa:** además del pipeline, hay endpoints heredados/de edición/bulk que escriben `leads.estado`. El trigger de base protege el motivo de pérdida y permisos de etapa, pero no puede imponer una matriz de transiciones que no existe.
- **Archivo:** se conserva como fecha separada. El inicio de gestión no tiene una regla de dominio que fuerce desarchivar primero en todos los escenarios; admin conserva capacidad de modificar registros archivados.

### Tabla de negocios y significado de `estado`

La proyección heredada usa la primera gestión no eliminada que encuentre para formar la fila. La columna `estado` toma `leads.estado`; solo si no hay una gestión toma el texto “Filtrado” cuando `review_status='filtered'`. Con varias gestiones, la tabla también calcula valores agregados separados para algunos campos. Esto confirma la mezcla actual de etapa de gestión y revisión dentro de una misma columna, justo lo que la spec busca eliminar.

### Papelera y visibilidad

La ruta dedicada de Papelera permite al admin restaurar el negocio; `assertAccountReadable` deniega consultar negocios eliminados, incluso por URL de detalle. Los listados normales filtran eliminados por defecto. Sin embargo, el endpoint genérico de Negocios/Gestiones permite a un admin pedir la inclusión de eliminados mediante el filtro `deletedAt`; ese camino no está limitado a la pantalla Papelera. Si “solo aparece en Papelera” debe ser una garantía estricta, habrá que quitar ese acceso genérico o convertirlo en una consulta interna de la Papelera.

Los negocios archivados están separados de los eliminados y se filtran de los listados ordinarios. El permiso actual de modificación permite al admin editar una cuenta archivada; la spec requiere primero desarchivarla para iniciar una gestión, incluso si quien opera es admin. Esa regla necesita protección de servidor, no solo ocultar el botón.

## Brechas contra la spec, priorizadas

### P0 — necesarias para que el modelo tenga semántica correcta

1. **Agregar el estado principal del negocio.** No existe una columna equivalente a los seis estados acordados. `review_status` solo cubre Revisado y `archived_at` cubre Archivo como fecha, por lo que no pueden representar el ciclo completo ni sus transiciones.
2. **Definir catálogo y ámbito de cada gestión.** `crm_stages` es global y no diferencia vertical principal, partner, proveedor, editor o acompañamiento. El actual enum open/won/lost puede seguir siendo una clasificación común de resultado, pero no sustituye los catálogos específicos.
3. **Derivar y mantener el estado del negocio desde todas las gestiones.** Crear una gestión debe llevar el negocio a En gestión; solo cerrar la última gestión abierta debe moverlo a Sin seguimiento programado o Recontactar. Hoy no hay ninguna de esas sincronizaciones. Deben contar todas las gestiones activas, no solo la que se está editando.
4. **Bloquear inicio desde Nuevo y desde Archivado.** No hay validación de revisión al crear la gestión. La condición de archivo se aplica en accesos ordinarios, pero el admin puede trabajar con negocios archivados. La regla debe ser uniforme y validada en el endpoint/transacción.
5. **Completar el contrato de cierre.** Motivo obligatorio está implementado solo para `lost`. Hace falta exigir motivo en todos los terminales definidos por cada catálogo y decidir cómo `Cerrada ganada`, `Participa`, `No participa`, `Colabora` y `No colabora` reportan resultado y motivo.
6. **Implementar matriz de transiciones.** Hoy cualquier etapa activa se puede seleccionar; solo hay categorías de etapa, no aristas válidas. Los endpoints heredados y operaciones bulk también deben respetar la misma matriz o quedar retirados para cambios de etapa.
7. **Unificar No contactar con el cierre especial.** El resultado actual activa el bloqueo, pero falta archivar automáticamente y ofrecer cerrar las otras gestiones. Si se conservan abiertas, deben permanecer bloqueadas para contacto. También hay que impedir que otro camino de edición anule el bloqueo por accidente.
8. **Implementar derivación.** Falta el estado Derivado a Leandro en una gestión, el booleano en el negocio, la asignación del negocio a Leandro, guardar el responsable original y la operación admin de desactivar/reasignar.

   La asignación actual del negocio y la de cada gestión son campos separados. Si un negocio tiene varias gestiones asignadas a personas distintas, el producto debe definir qué responsable cuenta como “original” para la reversión y si la derivación cambia también a los responsables de las gestiones.

### P1 — interacción, administración y consistencia

9. **Convertir Cliente automáticamente en cierres comerciales ganados.** Hoy depende de un checkbox. En el modelo nuevo el cierre de trato lo activa automáticamente; el admin además necesita poder desactivarlo. La implementación actual no ofrece esa acción inversa.
10. **Separar visualización de estado de negocio y de gestión.** Agregar estado del negocio a listado, cards, filtros y detalle. Dejar `estado` de la gestión únicamente en su contexto y retirar el fallback “Filtrado” de la proyección de Negocios.
11. **Modelar Recontactar sin duplicar fechas.** La fecha actual existe como parte del evento de pérdida y como fecha de tarea. Hay que fijar cuál es la fecha opcional de recontacto de la gestión y cómo se refleja en el estado agregado del negocio; al vencer, el estado no debería cambiar silenciosamente salvo regla acordada.
12. **Crear una gestión posterior de acompañamiento de ficha.** Hoy hay un checkbox que crea una tarea general al ganar. No existe un tipo de gestión de acompañamiento ni sus etapas; el catálogo de ese recorrido sigue abierto en la spec.
13. **Aplicar la regla de Papelera en todas las consultas.** El endpoint genérico permite incluir eliminados para admins usando `deletedAt`; la vista dedicada de Papelera debe ser el único lugar de consulta si se interpreta literalmente la spec.

## Qué se puede conservar

- Relación negocio → muchas gestiones; historial/journals y permisos por responsable como base del modelo.
- `review_status='filtered'` como evidencia legible de revisión durante la migración. Puede conservarse temporalmente como campo de compatibilidad, aunque el estado operativo pase al nuevo `status`.
- `commercial_status`/`client_since` como almacenamiento equivalente al indicador Es cliente, si se acuerda exponerlo como booleano en el dominio sin cambiar innecesariamente el dato físico. Hay que agregar la desactivación admin y conversión automática.
- `do_not_contact` y `archived_at`/`deleted_at` como datos independientes. La nueva lógica debe sincronizar lo acordado sin colapsar Archivo y Papelera.
- Clasificación `open`/`won`/`lost` y journal de pipeline como señales útiles para contar gestiones abiertas y preservar cierres históricos. No usar el texto de una etapa histórica como prueba suficiente de su significado.
- Motivo y recontact date existentes para pérdidas, sujeto a mapearlos con el nuevo catálogo y conservar el valor histórico.

## Migración: riesgos y estrategia recomendada

### Lo que se sabe

- `review_status` acepta hoy `filtered` o `NULL`. La recuperación productiva documentada restauró 146 negocios como Filtrado en el snapshot del 10/10/2026; el conteo es histórico, no un valor actual confirmado.
- `commercial_status` distingue prospect/client, y `client_since` conserva fecha.
- Archivo y Papelera tienen campos propios; No contactar es booleano.
- Las etapas históricas se preservaron sin inferir significado textual; algunas quedaron históricas/inactivas y con clasificación abierta por defecto.

### Mapeo posible, todavía sujeto a ensayo

- `review_status='filtered'` → conservar la condición Revisado. No borrarla hasta completar controles de conteo y conciliación.
- Si existe al menos una gestión no eliminada cuya etapa esté clasificada `open`, el estado agregado debe ser En gestión. Esto puede aplicar también a negocios históricamente sin Filtrado, porque ya tienen una gestión.
- `archived_at != NULL` y `deleted_at != NULL` deben conservarse como condiciones separadas; definir precedencia de presentación sin descartar sus valores.
- `do_not_contact=true` debe seguir bloqueando contacto; según el producto acordado, probablemente implique que el estado del negocio sea Archivado, aunque hoy puede coexistir con negocio no archivado.
- No mapear en bloque todo `review_status=NULL` a Nuevo: ese valor no distingue un alta reciente de un negocio antiguo que nunca se marcó Filtrado.
- Para negocios sin gestiones abiertas, Ganada/Perdida y sus eventos pueden orientar la clasificación, pero no determinan por sí solos si corresponde Sin seguimiento programado o Recontactar. Usar la fecha/motivo solo donde la evidencia sea clara; agrupar casos ambiguos para revisión.
- Preservar `commercial_status` y `client_since`. No decidir que todo proveedor/editor que participa pasa a cliente.

### Procedimiento que debería seguir la futura migración

1. Obtener una copia reciente autorizada y trabajar sobre un clon aislado; no conectar este cambio a producción durante desarrollo.
2. Generar un manifiesto de conteos por estado previo: revisión, cliente, No contactar, archivo, papelera, clasificación de cada gestión, gestiones abiertas por negocio y fechas/motivos de recontacto.
3. Ensayar el mapeo con prioridades explícitas: Papelera y Archivo preservados; restricción No contactar preservada; En gestión si existe gestión abierta; Revisado si hay prueba de validación; estado de espera solo cuando la evidencia lo sostenga.
4. Separar automáticamente mapeables, ambiguos y conflictivos. No asignar Nuevo a datos ambiguos ni interpretar nombres históricos por regex como cierre real.
5. Verificar idempotencia, rollback, conteos antes/después, historial, propietarios, tareas y restricciones No contactar. Ensayar concurrencia o bloqueo de escrituras antes del corte.
6. Aplicar primero una migración aditiva con compatibilidad; desplegar lecturas/escrituras coordinadas; retirar campos/proyecciones heredados solo después de conciliar resultados.

La documentación reporta 146 negocios Filtrados en el snapshot de recuperación. Esa cifra puede guiar un test de reconciliación contra una copia de ese snapshot, no una expectativa para la base actual.

## Orden de trabajo recomendado

1. Cerrar decisiones pendientes de la spec: matriz de transición por tipo, etapa de acompañamiento, catálogo de motivos, fecha de recontacto, retorno de etapa/propietario al desderivar, edición de catálogos y permisos/estado tras desarchivar.
2. Diseñar el modelo de dominio: estado de negocio, definición de “gestión abierta” por catálogo, tipo de gestión/vertical, derivación y motivo de cierre; decidir si catálogos se configuran por admin.
3. Implementar servicio transaccional común para cambios de gestión/negocio; fijar bloqueo por cuenta y estado agregado en servidor/DB, no solo en React.
4. Reencaminar `commercial`, `pipeline`, `work`, edición inline, bulk y compatibilidad legacy por esas reglas; impedir el inicio no válido y los cambios de etapa fuera de matriz.
5. Migrar con ensayo/manifest/rollback en copia autorizada. Resolver registros ambiguos antes de producción.
6. Actualizar detalle, tabla/cards, filtros, pipeline y Configuración por vertical. Después validar tests unitarios, integración PostgreSQL, navegador, permisos por rol y migración.

## Archivos y componentes implicados (mapa inicial)

El alcance final depende del diseño acordado; no significa que todos deban editarse:

| Área | Archivos principales |
|---|---|
| Esquema y migración | `migrations/` (nueva migración), `src/helpers/schema.tsx` |
| Negocio y altas/importación | `src/endpoints/commercial.ts`, `commercial.schema.ts`, `src/helpers/dataQualityService.ts`, `src/endpoints/businessImport.ts` |
| Pipeline y cierres | `src/endpoints/pipeline.ts`, `pipeline.schema.ts`, `src/helpers/commercialStages.ts`, migración/trigger de pipeline |
| Trabajo y No contactar | `src/endpoints/work.ts`, `work.schema.ts`, `src/components/ContactPolicy.tsx` |
| Compatibilidad/edición múltiple | `leads_quick_POST.ts`, `leads_bulk_POST.ts`, `leads_save_POST.ts`, `leads_POST.ts`, endpoints de eliminación/restauración |
| Seguridad y archivo/papelera | `src/helpers/crmPermissions.ts`, `BusinessTrashPanel.tsx`, endpoints de listados/detalle/búsqueda |
| Lectura/UI de negocio | `src/helpers/businessTable.ts`, `src/endpoints/leads_GET.ts`, `CommercialPanel.tsx`, `CommercialEditor.tsx`, `business-list.tsx`, `BusinessCard.tsx`, filtros y columnas |
| Catálogos verticales | `src/components/PipelineSettings.tsx`, endpoints de configuración y nuevos contratos/modelos de etapa y transiciones |
| Verificación | tests de pipeline, inicio de gestión, No contactar, papelera, importación y nuevas pruebas de migración/permisos |

## Evaluación de ajuste al modelo objetivo

**Veredicto: mixto.** La estructura de entidades, varias gestiones por negocio, estados independientes Cliente/No contactar, archivo, papelera, clasificación de cierre, journals y recontacto ofrecen una base reutilizable. En cambio, faltan el estado principal de negocio, el agregado de gestiones abiertas, etapas por tipo, matriz de transiciones, derivación y cierres con motivo general. No es una simple configuración del pipeline: requiere evolución de esquema, migración y cambios coordinados en las escrituras.

## Fuentes principales

- Esquema base y campos: [migración 004](../../migrations/004_commercial_foundation.sql), [pipeline 007](../../migrations/007_pipeline_reactivation.sql), [No contactar/Archivo 011](../../migrations/011_usability_workflows.sql), [Papelera 016](../../migrations/016_business_trash.sql), [revisión 017](../../migrations/017_business_recovery_fields.sql).
- Mutaciones de negocio/gestión: [commercial.ts](../../src/endpoints/commercial.ts), [commercial.schema.ts](../../src/endpoints/commercial.schema.ts), [pipeline.ts](../../src/endpoints/pipeline.ts), [pipeline.schema.ts](../../src/endpoints/pipeline.schema.ts).
- Cierres y etapas: [Pipeline.tsx](../../src/components/Pipeline.tsx), [PipelineSettings.tsx](../../src/components/PipelineSettings.tsx), [commercialStages.ts](../../src/helpers/commercialStages.ts).
- Tabla heredada: [businessTable.ts](../../src/helpers/businessTable.ts), [leads_GET.ts](../../src/endpoints/leads_GET.ts).
- Restricciones y papelera: [work.ts](../../src/endpoints/work.ts), [crmPermissions.ts](../../src/helpers/crmPermissions.ts), [BusinessTrashPanel.tsx](../../src/components/BusinessTrashPanel.tsx).
- Inicio de gestión e importación: [CommercialPanel.tsx](../../src/components/CommercialPanel.tsx), [CommercialEditor.tsx](../../src/components/CommercialEditor.tsx), [dataQualityService.ts](../../src/helpers/dataQualityService.ts).
