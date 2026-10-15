# Spec hija: sugerir tareas a partir de compromisos escritos

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), catálogo y permisos de tareas.

## Resultado esperado

Al guardar un registro con texto de compromiso, el CRM puede señalar acciones concretas que podrían convertirse en tareas y dejar que la persona las revise.

## Flujo

- Después de una comunicación/actividad guardada o en su pantalla de revisión, detectar frases de compromiso propias o del comercio.
- Presentar cada sugerencia con acción, evidencia textual, responsable propuesto, fecha interpretada y contexto; marcar como “sin fecha” lo que no la tenga.
- La persona edita/elimina sugerencias y elige cuáles crear. Crear usa el formulario y validación actuales de tareas.
- La sugerencia puede descartarse sin alterar el registro original.

## Reglas

- No crear tareas al detectar; no asumir que una frase de posibilidad es un acuerdo.
- No inventar fechas. Resolver fechas relativas en la zona/calendario comercial de Argentina y pedir confirmación de la fecha concreta.
- Responsable predeterminado solo si el contexto define uno y se informa; reasignación sujeta a permisos.
- Evitar duplicados evidentes contra tareas abiertas del mismo contexto y mostrar coincidencia en vez de crear otra automáticamente.

## Aceptación e impacto

Cada tarea creada requiere confirmación individual o una confirmación conjunta inequívoca. El texto de evidencia se conserva visible hasta decidir. No se cambia la etapa de gestión. Integración estimada con formularios de actividades/Comunicación y creación existente de tareas; no registrar sugerencias rechazadas en el journal como compromisos.
