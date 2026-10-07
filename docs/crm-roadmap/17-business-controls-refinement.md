# Barras y densidad de Negocios

Base main remota verificada: c7546ba1e035d6d0ff453cda9c140f6fab53b6d5. PR #49 mergeado con CI completa verde y capturas claro/oscuro revisadas.

## Solicitud nueva y estado de este bloque

- Una sola acción Limpiar en la barra de filtros; retirar la duplicación de filtros heredados y del estado vacío: implementado.
- Guardar como vista dentro de la barra de filtros: implementado, también sin filtros activos.
- Vistas del sistema además de personales, administrables por admin: pendiente del próximo bloque. Fuente anterior localizada en src/pages/_index.tsx: Todos, Mis negocios, Para hoy, Vencidos, Sin responsable y Sin próxima acción. Recuperar sus criterios existentes antes de adaptarlas; no inventar reglas comerciales.
- Filtrar negocios cambia a Editar filtros cuando hay búsqueda o filtros: implementado.
- Hover del nombre sin bloque de color: implementado con enlace subrayado y foco visible.
- Retirar Ordenar por y Ascendente/Descendente; ordenar desde encabezados: implementado, con aria-sort.
- Tabla/Grilla y Columnas junto al contador, a derecha: implementado; adaptación mobile en dos líneas cuando el ancho lo requiere.
- Cantidad de resultados oculta y lote de 50: implementado. Se conserva selector y lógica bajo BUSINESS_RESULTS_CONTROL_ENABLED. Mientras está oculto se usa 50 también para preferencias antiguas, vistas y configuraciones de equipo. Paginación sigue conservada bajo su opción existente.
- Filas compactas con contenido limitado: implementado. Campos hasta dos líneas, nombre y resumen en una línea cada uno; cuerpo limitado a 48 px (64 px con puntero táctil), más padding. Valor íntegro sigue en la ficha.
- Checkbox en encabezado: implementado. Selecciona los negocios cargados que se pueden modificar; cualquier selección previa se limpia al pulsarlo. Estado parcial visible; no incluye negocios ajenos ni filas que aún no se cargaron.
- Acciones configurable y fijada por defecto: pendiente del próximo bloque; sigue siendo columna existente temporalmente.
- Encabezados sin wrap, con ellipsis: implementado; nombre accesible completo y foco interno visible.

## Validación

TypeScript, seis pruebas de preferencias y diff check locales aprobados. Browser actualizado para controles retirados, 50 por lote, filtro dinámico, una sola limpieza, guardado de vista, selección parcial/todos/deselección, permisos de fila, altura máxima y ordenamiento accesible. Capturas desktop/mobile/claro/oscuro disponibles en CI. CI completa y revisión visual pendientes al abrir PR.

## Resto pendiente

Después de los dos bloques de arriba: badges editables, búsqueda indiferente a mayúsculas/acentos en toda la app y resto del alcance general. No cambia la lectura compartida ni los permisos de modificación. No se implementan las reglas comerciales pendientes. Sin migración, limpieza, comunicaciones reales ni despliegue.
