# Épica: IA dentro de Hospeda CRM

**Estado:** propuesta documental para revisión; no autoriza implementar funciones de IA.
**Fecha:** 15/10/2026
**Inventario de producto:** [19 ideas priorizadas](60-ideas-uso-ia.md)

## Objetivo

Incorporar asistencia de IA en los puntos donde una persona usa el CRM: aprender la aplicación, entender información comercial, preparar trabajo y revisar propuestas. La IA debe reducir pasos y escritura repetitiva, mientras que las personas conservan las decisiones, los cambios de datos y el envío de comunicaciones.

Esta épica organiza una capacidad común de conexión con modelos de lenguaje y 19 funcionalidades hijas. No se implementará una función individual hasta que su spec hija esté revisada y aprobada.

## Alcance

- Una base técnica de IA del lado servidor: conexión con uno o más proveedores, contratos tipados y puntos de consumo internos.
- 10 capacidades de prioridad Alta, 8 de prioridad Media y una Exploratoria, conservando el orden del inventario.
- Uso de contexto del CRM con permisos, fuentes visibles y respuestas revisables.
- Pruebas reproducibles con un proveedor simulado y sin enviar datos reales.

## Fuera de alcance transversal

- Un agente que opere el CRM sin intervención humana.
- Envío automático de mensajes, registro de respuestas, cambios de estados, cierres, fusiones o desbloqueos.
- Una bandeja conversacional que sustituya la navegación normal.
- Elegir por anticipado un proveedor, modelo, presupuesto, región, tratamiento contractual o retención de datos.
- Usar conversaciones del CRM para entrenar modelos.

## Principios comunes

1. **La IA propone; la persona decide.** Todo resultado que pueda guardarse, aplicarse o enviarse requiere una acción explícita y una vista previa.
2. **Permisos primero.** El servidor comprueba el acceso al negocio, la gestión, el historial o el material antes de preparar el contexto. La IA no amplía permisos.
3. **Contexto mínimo y rastreable.** Cada función declara qué campos/eventos necesita. Cuando afirma algo del CRM, incluye una referencia navegable a su origen o indica que no pudo verificarlo.
4. **No inventar.** El modelo puede señalar información ausente o contradictoria; no completa datos comerciales, precios, acuerdos, respuestas ni acciones como si fueran hechos.
5. **Sin efectos implícitos.** Generar texto no equivale a guardar, contactar, aceptar, cerrar ni crear una tarea.
6. **Falla segura y recuperable.** Si el modelo no está disponible, el CRM conserva el borrador y deja seguir con el flujo manual.
7. **Claridad para personas no técnicas.** Cada acción explica qué información usará, qué propone y qué ocurrirá al confirmarla.

## Specs hijas

| ID | Spec | Prioridad | Dependencias principales |
|---|---|---|---|
| 62 | [Base común de IA](62-ai-platform-foundation-spec.md) | Fundacional | Política de proveedor y datos por definir |
| 63 | [Ayuda para aprender a usar la app](63-ai-crm-help.md) | Alta | 62, guía vigente |
| 64 | [Explicar campos y opciones en contexto](64-ai-contextual-field-help.md) | Alta | 62, catálogo de ayuda por campo |
| 65 | [Recorrido guiado para una tarea nueva](65-ai-guided-task-tour.md) | Alta | 62, rutas y pasos de tareas |
| 66 | [Resumen del negocio](66-ai-business-summary.md) | Alta | 62, permisos e historial |
| 67 | [Ordenar apuntes de una llamada](67-ai-organize-call-notes.md) | Alta | 62, formulario de llamada |
| 68 | [Preparar el próximo contacto](68-ai-prepare-next-contact.md) | Alta | 62, Comunicación |
| 69 | [Sugerir tareas desde compromisos escritos](69-ai-task-suggestions.md) | Alta | 62, parser de fechas y tareas |
| 70 | [Revisar antes de cerrar](70-ai-review-before-closing.md) | Alta | 62, validaciones actuales de cierre |
| 71 | [Explicar el historial](71-ai-explain-history.md) | Alta | 62, journal y permisos |
| 72 | [Explicar cambios desde la última revisión](72-ai-changes-since-review.md) | Alta | 62, definición del punto de comparación |
| 73 | [Crear filtros describiendo la búsqueda](73-ai-natural-language-filters.md) | Media | 62, catálogo de filtros |
| 74 | [Detectar inconsistencias para revisar](74-ai-data-inconsistencies.md) | Media | 62, reglas de calidad |
| 75 | [Encontrar posibles duplicados](75-ai-possible-duplicates.md) | Media | 62, flujo actual de duplicados |
| 76 | [Resumen del día personalizado](76-ai-personal-day-summary.md) | Media | 62, Mi día y permisos |
| 77 | [Informe de cartera](77-ai-portfolio-report.md) | Media | 62, métricas y permisos |
| 78 | [Guía para una conversación](78-ai-conversation-guide.md) | Media | 62, verticales/gestiones |
| 79 | [Respuestas frecuentes con material aprobado](79-ai-approved-faq.md) | Media | 62, biblioteca aprobada |
| 80 | [Adaptar el tono de un mensaje](80-ai-message-tone.md) | Media | 62, editor de comunicación |
| 81 | [Dictar notas sin grabar la llamada](81-ai-voice-dictation.md) | Exploratoria | 62, decisión de tecnología y privacidad de voz |

## Secuencia de entrega propuesta

1. Aprobar la política de proveedor y tratamiento de datos; implementar y probar la base común (62).
2. Probar la integración con una función acotada y de bajo riesgo: Ayuda para aprender a usar la app (63).
3. Incorporar las funciones altas en el contexto donde ya ocurre el trabajo (64–72), empezando por borradores y revisiones reversibles.
4. Añadir las funciones medias (73–80) luego de validar precisión, utilidad y permisos de la primera ola.
5. Evaluar dictado (81) por separado; la transcripción de voz añade tratamiento de audio y requiere aprobación específica.

Esta secuencia es una recomendación de planificación, no una autorización para saltarse la revisión de cada spec.

## Criterios de aceptación de la épica

- Cada spec hija tiene alcance, flujo, fuentes, permisos, errores, aceptación y dependencias definidos antes de su implementación.
- La base común no expone claves ni permite al navegador llamar directamente al proveedor.
- Cada función limita explícitamente el contexto enviado y conserva el flujo manual si falla la IA.
- No se guardan ni ejecutan sugerencias sin confirmación humana.
- Se pueden probar las funciones sin una cuenta real del proveedor ni datos productivos.
- La UI diferencia hechos del CRM, inferencias y datos faltantes, con vínculos a fuentes cuando corresponda.

## Próximo paso

Revisar esta épica y las specs, resolver las decisiones abiertas de la spec 62 y aprobar las specs hijas que se quieran implementar primero.
