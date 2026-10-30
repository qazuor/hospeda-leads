# Spec hija: detectar inconsistencias para revisar

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Media · **Depende de:** [62](62-ai-platform-foundation-spec.md), reglas de calidad y estados vigentes.

## Resultado esperado

El usuario ve combinaciones de datos que podrían requerir revisión, con explicación del conflicto y enlaces a sus fuentes, sin que el CRM corrija el registro automáticamente.

## Alcance inicial

- Las alertas se basan primero en reglas deterministas aprobadas (por ejemplo, negocio Nuevo con gestión abierta o tarea abierta asociada a una gestión cerrada).
- La IA puede resumir la regla y el contexto, y ayudar a priorizar hallazgos; no decide por sí sola que los datos son incorrectos.
- Cada hallazgo incluye señal observada, motivo de revisión, elementos implicados, fecha de detección y acción manual disponible.

## Flujo y controles

Desde Calidad de datos o un panel de revisión, filtrar por tipo y abrir el negocio/gestión. La persona puede marcarlo revisado en el flujo autorizado o dejarlo pendiente. Descartar una alerta no borra ni altera datos fuente.

## Aceptación

1. Hallazgos explican una regla comprobable; hipótesis del modelo se etiquetan como “posible”.
2. No se fusionan, borran, reclasifican ni reasignan registros.
3. No generar alertas sobre entidades que el usuario no puede leer.
4. No presentar ausencia de datos como prueba de error.
5. La detección se puede ejecutar con reglas/mock y produce resultados reproducibles.

## Impacto estimado

`DataQualityPanel`, helpers de validación y un catálogo de reglas versionado. La generación de texto no sustituye validaciones existentes ni dispara escrituras.
