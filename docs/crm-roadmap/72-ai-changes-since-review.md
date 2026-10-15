# Spec hija: explicar cambios desde la última revisión

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), decisión sobre el punto de comparación.

## Resultado esperado

Al retomar un negocio, la persona puede identificar qué cambió en sus datos, contactos, gestiones, respuestas y tareas desde un punto de referencia claro.

## Flujo propuesto

- Desde la ficha, acción **Qué cambió**.
- Para una primera versión, la persona elige una fecha de referencia en cada consulta. El rango se interpreta con el calendario comercial de Argentina; no se guarda una fecha personal de revisión ni se usa automáticamente la última visita.
- Mostrar una lista cronológica agrupada por datos del negocio, personas, gestiones, comunicaciones y tareas; cada fila abre su evento de origen.
- Distinguir cambio directo de persona, cambio automático y autoría causal según lo que registre el journal.

## Reglas y aceptación

- No usar el estado `Revisado` del negocio como si fuera una marca de “última lectura del historial”.
- Solo incluir eventos disponibles y legibles para esa persona. Indicar explícitamente si no hay eventos o si el período no tiene cobertura completa.
- No afirmar “cambió desde tu última visita”; la referencia corresponde a la fecha que el usuario eligió en esta consulta.
- No modificar ni confirmar cambios al generar el resumen. Registrar la consulta y respuesta en el journal según la spec 62, distinguiéndolas de los cambios fuente que se resumen.

## Decisión definida

El usuario elige la fecha en cada consulta; no se guarda una marca de última revisión.

## Impacto estimado

`BusinessHistory`/ficha y consultas del journal; no requiere una preferencia persistida de última revisión. Prompt y respuesta se registran en el journal según la spec 62.
