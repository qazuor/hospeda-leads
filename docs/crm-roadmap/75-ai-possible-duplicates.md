# Spec hija: encontrar posibles negocios duplicados

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Media · **Depende de:** [62](62-ai-platform-foundation-spec.md), búsqueda/revisión actual de duplicados.

## Resultado esperado

La herramienta ayuda a priorizar pares de negocios que podrían ser el mismo comercio y explica qué señales coinciden o discrepan.

## Flujo

- Desde Buscar duplicados o un negocio, obtener candidatos con coincidencias estructuradas actuales y señales textuales controladas.
- Mostrar par lado a lado con nombre, ciudad/dirección y señales de canal disponibles al usuario; ocultar valores sensibles cuando no se requieran para decidir.
- La IA resume coincidencias y diferencias, marca incertidumbre y propone **Revisar** o **No son duplicados**.
- Si la persona decide fusionar, abre el procedimiento existente y confirma cada dato; la fusión nunca la realiza la IA.

## Aceptación

1. Un nombre parecido no basta para afirmar duplicidad; ciudad/dirección/canales se muestran como señales, no prueba.
2. La recomendación incluye razones verificables y no incorpora registros no autorizados.
3. El usuario siempre compara ambas fichas antes de fusionar.
4. No se fusiona, borra o reclasifica nada al generar o cerrar la sugerencia.
5. La función respeta el acceso a cada negocio y la elegibilidad actual del flujo de fusión.

## Impacto estimado

`AccountMergeDialog`, acción actual de duplicados y endpoint/candidatos existentes. Reutilizar las señales de búsqueda y comparación; no enviar a IA el universo de negocios completo.
