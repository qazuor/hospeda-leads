# Tarjetas compactas de negocios

La grilla pasa a SimpleGrid y Card de Mantine. El encabezado mantiene el nombre completo como botón para abrir el negocio, selección y las acciones compartidas cuando la columna Acciones está visible. Contactar y Archivar conservan las comprobaciones de permisos, los diálogos y estados de carga existentes. Se muestra un resumen breve de gestiones, contactos y condición comercial.

Los campos de datos mantienen su orden personalizado. Metadatos como responsable, ciudad, vertical y subtipo comparten filas cuando el ancho real de la tarjeta lo permite; las container queries también adaptan tarjetas angostas en escritorio. Teléfono, email y URLs usan filas compactas con el valor completo accesible mediante foco y tooltip. Los textos descriptivos se ajustan sin recorte y el próximo paso tiene un bloque diferenciado en su posición elegida. No se añaden campos ocultos ni se imponen alturas uniformes.

Los badges editables reutilizan InlineBusinessBadge: permisos por negocio/gestión, carga de opciones, conflicto, reintento y bloqueo de acciones durante guardado. Ocultar Acciones conserva la apertura desde el nombre y el regreso al listado restaura el foco en ese botón. Los skeletons de tarjetas se utilizan durante la carga inicial, cambios de búsqueda y carga de más resultados. Pantalla completa y continuidad del listado conservan su comportamiento.

Validación: typecheck, 82 pruebas unitarias, build y navegador para escritorio/móvil, tarjetas estrechas dentro de escritorio, nombres y valores largos/vacíos, columnas ocultas y reordenadas, composición mínima, navegación por teclado, restauración, skeletons, pantalla completa y edición inline en tabla y grilla para ambos roles. Capturas claras/oscuras revisadas antes de publicar el cambio. CI completa antes del merge.

Bloque anterior: PR #67 mergeado con CI verde (82 unitarias, 68 de navegador, integraciones y Docker), con vistas en badges y acciones independientes.
