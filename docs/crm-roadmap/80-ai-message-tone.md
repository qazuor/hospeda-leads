# Spec hija: adaptar el tono de un mensaje

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Media · **Depende de:** [62](62-ai-platform-foundation-spec.md), editor de Comunicación.

## Resultado esperado

La persona transforma un borrador existente a un estilo elegido sin perder su intención ni añadir datos nuevos.

## Flujo

- Controles en el editor: **Más breve**, **Más cercano** y **Más formal**; la persona selecciona uno para generar una versión alternativa.
- Mostrar texto original y propuesta editable; aceptar reemplaza el borrador solo tras confirmación, o permitir copiar fragmentos.
- La operación no altera el modelo compartido ni crea una preferencia personal.

## Reglas y aceptación

1. Preservar nombres, cantidades, condiciones, enlaces, fechas, negaciones y compromisos; no agregar beneficios/promesas.
2. Si el texto contiene variables sin resolver, no inventarlas: conservarlas y marcarlas.
3. El usuario puede descartar y volver al texto anterior; error de proveedor no lo borra.
4. Adaptar tono no inicia ni confirma contacto y respeta bloqueos del canal.
5. El resultado final queda sujeto a revisión normal de destinatario y envío.

## Impacto estimado

`MessageComposer`, editor de Email/WhatsApp y los modelos compatibles en `ContactTemplateDialog`. Añadir transformación a `ManualCommunicationForm` solo si el flujo y el tipo de texto lo justifican; excluir llamadas.
