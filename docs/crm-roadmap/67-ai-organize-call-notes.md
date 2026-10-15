# Spec hija: ordenar apuntes de una llamada

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), registro manual de llamadas.

## Resultado esperado

La persona pega o dicta apuntes libres y recibe una propuesta ordenada para completar el registro de la llamada.

## Flujo y salida

- Acción **Ordenar apuntes** en el formulario de llamada. Antes de generar, mostrar qué texto se procesará y avisar que prompt y respuesta se conservarán en el journal del negocio/gestión vinculada.
- Completar como borrador campos separados: resumen obligatorio, respuesta recibida si está expresada, compromisos/acciones con persona y fecha si constan, dudas pendientes y observaciones.
- La persona puede aceptar, editar o descartar cada bloque. El guardado usa el formulario manual y su contexto General/gestión.

## Reglas

- No inferir una respuesta entrante a partir de un intento sin contacto ni inferir aceptación comercial.
- No inventar responsable o fecha. Fechas relativas se interpretan con calendario de Argentina y se muestran para confirmar.
- No crear tareas ni activar No contactar automáticamente; ofrecer la sugerencia correspondiente solo mediante el flujo explícito de tareas/respuestas.
- La nota original permanece intacta hasta que la persona decida reemplazarla.

## Aceptación

1. La salida conserva los hechos y matices expresados, incluidos los negativos y la incertidumbre.
2. Cada campo se revisa por separado; descartar IA restaura el texto original.
3. Guardar registra solamente el contenido que la persona confirmó; el journal de IA conserva por separado el prompt original y la respuesta generada, según la spec 62.
4. La función respeta permisos del contexto y deja un flujo manual si el proveedor falla.

## Impacto estimado

`ManualCommunicationForm` y endpoint de transformación estructurada. La llamada no se graba: solo se procesa el texto que la persona introduce.
