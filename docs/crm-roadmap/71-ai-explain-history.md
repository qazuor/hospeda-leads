# Spec hija: explicar el historial

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), journal con permisos.

## Resultado esperado

La persona pregunta por qué un negocio o gestión está en una situación y recibe una explicación cronológica breve respaldada por entradas visibles del historial.

## Flujo y salida

- Desde Historial del negocio o timeline de gestión, elegir una pregunta sugerida o escribir una propia.
- La respuesta separa secuencia observada, regla de negocio aplicable y dato que no consta.
- Cada evento citado tiene fecha, autor tal como está registrado y enlace al elemento visible. Eventos automáticos se identifican como automáticos cuando el journal contiene esa atribución.
- Una respuesta puede limitarse al período o entidad seleccionados.

## Reglas y aceptación

1. Usar solamente eventos que el usuario puede leer y no reconstruir lo que no está registrado.
2. No confundir autor de un evento automático con el usuario que provocó la acción inicial.
3. Citar la fuente que respalda cada afirmación causal; si solo hay correlación, decirlo.
4. No editar ni “explicar” eventos por interpretación psicológica del usuario/comercio.
5. Consultar historial no modifica estados ni genera una entrada comercial.

## Impacto estimado

`BusinessHistory`, `LeadDetailDialog` y timeline; construir referencias con los IDs/tipos de evento de los journals existentes. Verificar lectura de eventos automáticos, cambios y permisos antes de mostrar la acción.
