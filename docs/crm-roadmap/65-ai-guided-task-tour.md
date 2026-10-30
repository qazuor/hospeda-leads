# Spec hija: recorrido guiado para una tarea nueva

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), pasos aprobados por tarea y rutas existentes.

## Resultado esperado

Una persona nueva puede completar una tarea poco frecuente siguiendo pasos pequeños, enlazados a la pantalla real, sin tener que memorizar toda la guía.

## Flujo

1. Desde Ayuda, la persona elige una tarea concreta, por ejemplo revisar un negocio precargado o registrar una respuesta recibida.
2. El recorrido muestra un objetivo a la vez, la acción esperada, por qué hace falta y el enlace o botón para continuar.
3. La persona marca el paso completo o vuelve al anterior; puede salir y consultar la guía completa.
4. La IA puede adaptar la explicación a una pregunta del usuario y al paso actual, pero el catálogo de pasos, los destinos y las reglas son contenido aprobado.

## Guardrails y aceptación

- El sistema nunca pulsa botones, cambia estados, abre un envío ni guarda datos en nombre de la persona.
- Si falta permiso o el negocio está en un estado que impide continuar, se explica el requisito y se enlaza la acción válida cuando exista.
- El recorrido muestra progreso y deja claro que se puede cancelar. No marca el trabajo real como hecho por cerrar la guía.
- No interpreta como completado un paso solo por navegar a una URL.
- Pasos y enlaces se validan en pruebas contra rutas conocidas. Una respuesta del modelo no puede inventar un paso adicional obligatorio.

## Impacto estimado

Componente de recorrido reutilizable desde `src/pages/guide.tsx`, basado en contenido estructurado versionado. No requiere un nuevo agente ni tracking oculto de navegación.
