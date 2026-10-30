# Spec hija: ayuda para aprender a usar el CRM

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Alta · **Depende de:** [62](62-ai-platform-foundation-spec.md), guía vigente.

## Resultado esperado

Una persona puede preguntar en lenguaje cotidiano cómo realizar una tarea y recibir una explicación breve, correcta y accionable, con enlaces a la ayuda aprobada o al lugar del CRM donde continuar.

## Flujo y ubicación

- Chat general accesible desde la navegación del CRM, Guía/Ayuda y la paleta de comandos. Siempre puede explicar cómo usar la app. Si se abre desde la ficha de un negocio, también responde preguntas sobre ese negocio usando su ficha e historial si la persona tiene permiso; no busca otros negocios.
- El usuario escribe una pregunta y puede elegir una tarea sugerida o seguir con una pregunta libre.
- La respuesta presenta pasos cortos, un vínculo por paso cuando exista y un enlace al artículo de referencia.
- La persona puede reformular o abrir el artículo; esta ayuda no realiza la tarea por ella.

## Datos y respuesta

- Fuente inicial: artículos vigentes de `src/content/user-guide.json` y rutas/acciones declaradas del producto. No se usa la guía histórica Markdown como fuente independiente.
- En una consulta general de uso se envían la pregunta, idioma, guía aprobada y ruta actual si está disponible. Desde una ficha, se puede enviar también la ficha e historial completos del negocio actual, sujetos al permiso de lectura. Antes de generar, la UI identifica ese contexto y avisa que prompt y respuesta quedarán en el journal del negocio.
- La respuesta debe distinguir instrucciones respaldadas de una pregunta sin cobertura. En este último caso ofrece buscar por otro término, ver temas o pedir ayuda humana; no inventa botones ni permisos.

## Reglas y aceptación

1. La búsqueda no requiere conocer los nombres internos de campos o menús.
2. Toda instrucción factual apunta a uno o más artículos o rutas existentes; enlaces inválidos se descartan.
3. La ayuda explica requisitos de permisos/estado solo si están documentados y no ofrece omitirlos.
4. La respuesta no cambia datos comerciales ni ejecuta acciones. Si la consulta está vinculada al negocio abierto, prompt y respuesta se registran en su journal según la spec 62; una consulta genérica sin negocio no se registra en un journal de negocio.
5. Loading, error y ausencia de conexión permiten volver a la búsqueda y consultar la guía sin perder la pregunta.
6. La misma consulta puede ejecutarse con un proveedor simulado en pruebas, validando referencias y casos sin respuesta.

## Impacto estimado

`src/pages/guide.tsx`, `src/components/AppCommandPalette.tsx`, índice estructurado de ayuda y su búsqueda. Reutilizar URLs/artículos existentes; no duplicar la guía ni cargar todo el CRM en el prompt.
