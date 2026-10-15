# Spec hija: explicar cambios desde la última revisión

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), decisión sobre el punto de comparación.

## Resultado esperado

Al retomar un negocio, la persona puede identificar qué cambió en sus datos, contactos, gestiones, respuestas y tareas desde un punto de referencia claro.

## Flujo propuesto

- Desde la ficha, acción **Qué cambió**.
- Para una primera versión, la persona selecciona una fecha/hora de referencia; se ofrecen atajos como “desde hace 7 días” y “desde la última fecha elegida”, si se implementa una preferencia personal explícita.
- Mostrar una lista cronológica agrupada por datos del negocio, personas, gestiones, comunicaciones y tareas; cada fila abre su evento de origen.
- Distinguir cambio directo de persona, cambio automático y autoría causal según lo que registre el journal.

## Reglas y aceptación

- No usar el estado `Revisado` del negocio como si fuera una marca de “última lectura del historial”.
- Solo incluir eventos disponibles y legibles para esa persona. Indicar explícitamente si no hay eventos o si el período no tiene cobertura completa.
- No afirmar “cambió desde tu última visita” sin una marca explícita y persistida para esa persona.
- No modificar ni confirmar cambios al generar el resumen.

## Decisión pendiente

El inventario original menciona “desde una fecha o visita elegida”. Antes de implementar, aprobar si el punto de comparación será solo una fecha elegida (recomendado para MVP) o una marca personal persistida al terminar una revisión. La segunda opción agrega persistencia y reglas de actualización.

## Impacto estimado

`BusinessHistory`/ficha y consultas del journal; una marca personal requeriría un modelo de preferencia nuevo y no se asume en este alcance.
