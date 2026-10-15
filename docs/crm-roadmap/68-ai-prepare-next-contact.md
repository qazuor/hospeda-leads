# Spec hija: preparar el próximo contacto

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), reglas aprobadas de Comunicación.

## Resultado esperado

Desde Contactar, la persona obtiene un borrador coherente con la gestión y el historial reciente, listo para revisar y editar antes de usar el canal normal.

## Flujo

- Disponible desde una gestión abierta o un contexto General que ya sea elegible para contacto.
- Ofrecer objetivo breve (por ejemplo, retomar o compartir información) y canal disponible. La gestión aporta el contexto; en General sigue siendo obligatorio el propósito.
- Mostrar qué hechos recientes se usaron, el mensaje editable y un botón **Usar este borrador** que lo copia al editor existente.
- Avisar que los datos consultados y la interacción con IA quedarán registrados en el journal del negocio según la spec 62.
- Desde allí se aplican intactas confirmación, destinatario, restricciones, revisión y envío de Comunicación.

## Guardrails y aceptación

1. Revisar permiso, No contactar, Archivado, Papelera y restricciones antes de preparar o presentar la acción.
2. No inventar datos, promesas, precio, disponibilidad, acuerdos o respuesta; indicar si falta información.
3. No enviar ni crear un intento de contacto al generar, copiar al editor o regenerar el borrador. El registro de prompt/respuesta en el journal es auditoría de IA, no prueba de contacto.
4. No sustituir un borrador editado sin confirmación; conservarlo ante error.
5. No hacer accesible la función como vía alternativa para contactar un negocio bloqueado.

## Impacto estimado

`GeneralContactDialog`, `TaskContactDialog`, `MessageComposer` y servicio de Comunicación. Reutilizar validaciones de canales y modelos; el prompt no adquiere permisos de envío.
