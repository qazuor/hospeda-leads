# Spec hija: preparar una guía para una conversación

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Media · **Depende de:** [62](62-ai-platform-foundation-spec.md), vertical y gestión.

## Resultado esperado

Antes de una llamada o reunión, el usuario obtiene preguntas útiles para entender al comercio y avanzar la gestión sin asumir sus necesidades.

## Flujo

- Desde la ficha o Contactar, elegir contexto General o gestión y el objetivo de la conversación.
- Presentar entre 3 y 7 preguntas sugeridas, por bloques: confirmar lo sabido, descubrir necesidades, acordar próximo paso.
- Cada pregunta basada en un dato existente muestra su fuente; las preguntas genéricas se distinguen como propuestas.
- La persona puede editar/copiar la guía o descartar preguntas. No se registra como comunicación ni actividad hasta que se use el flujo manual.

## Guardrails y aceptación

- No sugerir promesas, condiciones, precios o beneficios no respaldados por material aprobado.
- No mostrar esta acción dentro del flujo de salida cuando el negocio está bloqueado o no es elegible. Si se habilita desde un contexto interno de planificación, indicar el bloqueo y no ofrecer un atajo para abrir el canal.
- No inventar hechos sobre el negocio ni usar lenguaje que presente una hipótesis como diagnóstico.
- La guía queda disponible como borrador y no abre canales ni crea tareas.

## Impacto estimado

Entrada contextual desde `CommercialPanel`/`CommunicationPanel`, con referencias a historial autorizado. No requiere un nuevo modelo de interacción.
