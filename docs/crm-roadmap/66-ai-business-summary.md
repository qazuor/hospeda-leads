# Spec hija: resumen de un negocio

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), permisos e historial del negocio.

## Resultado esperado

Desde la ficha, una persona obtiene un resumen corto de qué necesita el comercio, qué se habló, qué se acordó y qué sigue pendiente, sin leer cada entrada del historial.

## Flujo y presentación

- Acción **Resumir actividad** en la ficha, con opción de incluir todas las gestiones visibles o una gestión seleccionada y un rango temporal.
- Presentar secciones: situación conocida, hechos recientes, acuerdos/compromisos y próximos pendientes.
- Cada afirmación factual importante tiene fecha y vínculo al evento/gestión/tarea fuente. Mostrar cuándo no hay información suficiente.
- Regenerar es explícito; el resultado se puede cerrar, copiar o usar como borrador en otra acción. Prompt y respuesta de cada generación se guardan en el journal del negocio según la spec 62; la respuesta se etiqueta como contenido generado por IA, no como hecho comercial confirmado.

## Contexto y permisos

Solo datos que el usuario ya puede leer: estado del negocio, gestiones visibles, comunicaciones, respuestas, tareas y actividad del período elegido. Los datos borrados de Papelera no aparecen. Archivado y No contactar se presentan como contexto, no como recomendación para saltarse sus bloqueos.

## Aceptación

1. El resumen no transforma inferencias en acuerdos, ventas, entrega o respuesta confirmada.
2. Las fuentes abren el elemento correcto respetando permisos.
3. No se incluyen registros fuera del rango o contexto seleccionado.
4. Un error no borra el contenido de la ficha y mantiene alternativa manual.
5. El journal registra prompt y respuesta como interacción de IA; no transforma la respuesta en dato comercial ni la presenta como hecho confirmado.

## Impacto estimado

Ficha `CommercialPanel`/`BusinessSummary`, endpoint de preparación contextual y acceso autorizado a `BusinessHistory`, gestiones y trabajo. El servicio común no recibe una ficha serializada completa.
