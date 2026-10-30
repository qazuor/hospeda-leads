# Spec hija: explicar campos y opciones en contexto

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), catálogo de ayuda de campos.

## Resultado esperado

Cuando un campo u opción genere duda, la persona puede pedir una explicación breve sin abandonar el formulario ni perder lo que escribió.

## Flujo y ubicación

- Mostrar un ícono de ayuda junto a campos y selectores priorizados, con acceso por mouse y teclado.
- Al activarlo, explicar significado, cuándo se usa y un ejemplo breve. Para una opción seleccionada, explicar esa opción y su efecto conocido.
- Ofrecer **Ver ayuda relacionada** si existe un artículo. Cerrar la ayuda devuelve foco al control y conserva el borrador.

## Contexto permitido

El catálogo del campo (nombre visible, descripción, opciones permitidas, regla de negocio documentada y enlaces) es la fuente principal. Solo se agrega el nombre de la pantalla y la opción actualmente seleccionada; valores personales del formulario no se envían salvo aprobación específica del catálogo.

## Reglas y aceptación

1. No preguntar al modelo por valores de negocio libres para explicar un campo.
2. Explicar estados y efectos tal como están definidos; nunca presentar una sugerencia de la IA como regla del CRM.
3. Si no existe una explicación aprobada o hay ambigüedad, mostrar la descripción estática y sugerir consultar la guía; no improvisar.
4. No completar, cambiar ni guardar el campo.
5. La ayuda se oculta en controles sin opciones semánticas o donde distraiga más de lo que ayuda.
6. Pruebas cubren accesibilidad, conservación del formulario, textos respaldados y fallback sin IA.

## Impacto estimado

Catálogo de metadatos de campos en UI, wrapper de ayuda contextual y superficies seleccionadas como `CommercialEditor`, `OpportunityStart`, `GeneralContactDialog` y formularios de configuración. Incorporación gradual; no añadir un ícono a cada input por defecto.
