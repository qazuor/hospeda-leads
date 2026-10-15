# Spec hija: responder preguntas frecuentes con material aprobado

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Media · **Depende de:** [62](62-ai-platform-foundation-spec.md), biblioteca y modelos aprobados.

## Resultado esperado

El usuario prepara una respuesta breve a una consulta frecuente usando únicamente materiales vigentes y aprobados del CRM.

## Flujo

- Desde Comunicación o Biblioteca, introducir la consulta y elegir vertical/gestión cuando aplique.
- Recuperar solo versiones vigentes aprobadas y accesibles; mostrar primero las fuentes a usar.
- Generar borrador con citas a documento/modelo y versión. Si no hay respaldo suficiente, decirlo y permitir buscar material o responder manualmente.
- El usuario revisa/edita y luego sigue el flujo normal del canal, incluyendo destinatario, bloqueos y confirmación de envío.

## Aceptación y límites

1. Ningún borrador afirma una condición que no pueda vincular a una fuente vigente.
2. Material borrador, desactivado, vencido o sin permiso no se usa como fuente.
3. Citas abren la versión consultada y permanecen visibles al revisar el texto.
4. La IA no envía, adjunta ni confirma una respuesta.
5. Sin fuente válida, no improvisa; la persona puede redactar desde cero.

## Impacto estimado

`ResourcesPanel`, búsqueda/selección de recursos aprobados y `MessageComposer`. Definir ranking y regla de vigencia de materiales antes de implementación; no indexar todo el repositorio o documentos externos automáticamente.
