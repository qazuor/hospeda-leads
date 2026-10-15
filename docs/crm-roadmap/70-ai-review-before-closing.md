# Spec hija: revisión asistida antes de cerrar una gestión

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), validaciones/catálogos actuales de cierre.

## Resultado esperado

Antes de confirmar un cierre, el vendedor puede ver una revisión legible de campos requeridos y posibles omisiones de contexto.

## Flujo

- Se ejecutan primero las validaciones deterministas actuales: resultado, motivo, nota para “Otro” y demás requisitos.
- Si son válidas, la revisión asistida puede señalar falta de resumen, evidencia ambigua entre motivo y nota o compromisos abiertos que conviene revisar.
- Cada observación incluye el dato que la motivó y se etiqueta como sugerencia, no como error de sistema.
- La persona vuelve al formulario, corrige o continúa con el cierre normal.

## Guardrails

- La IA no elige resultado/motivo, no valida como hecho una venta, no bloquea un cierre válido y no elimina requisitos deterministas.
- Cancelar revisión deja el formulario intacto. El cierre sigue requiriendo la acción explícita ya existente. Prompt y respuesta de la revisión se registran en el journal del negocio según la spec 62, sin presentarse como resultado o hecho comercial.
- No se usa como mecanismo de aprobación gerencial ni como evaluación de rendimiento del vendedor.

## Aceptación e impacto

El cierre funciona sin proveedor IA y mantiene los errores de validación existentes. Las sugerencias no cambian estados ni generan hechos comerciales; el journal solo registra la interacción de IA según la spec 62. Integración estimada con `Pipeline`/formulario de cierre y reglas del endpoint de etapas; debe verificar especialmente verticales, resultados y motivos distintos.
