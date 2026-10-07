# Hover de columnas

Base remota: eef713e7ebf1d35f14c3832081f47c806f696e7c. PR #48 mergeado con CI completa verde: 55 unitarias, 31 recorridos de navegador, integraciones, permisos, build y smoke API/Docker. Carga continua visible; paginación conservada en código.

## Cambio

El puntero sobre un encabezado resalta esa columna completa, incluyendo selección y acciones, celdas fijadas y skeletons. Al salir del encabezado se recuperan los colores alternados. Se utiliza el fondo de superficie con una pequeña mezcla del color de texto, adaptable a claro y oscuro, opaco para evitar superposiciones en columnas fijas.

El botón de ordenamiento deja de dibujar su propio bloque de color en hover. Se conserva el indicador de foco accesible y el ordenamiento por teclado. Eventos táctiles no dejan la columna resaltada.

## Validación

TypeScript y diff check locales. Nuevo recorrido de navegador en claro/oscuro: ambos lados fijos, columna central, selección, acciones, restauración de franjas, foco y ordenamiento por teclado; capturas correspondientes. CI completa y revisión visual pendientes al abrir PR.

## Siguiente trabajo

Acciones configurable, badges editables, búsqueda indiferente a mayúsculas/acentos y resto del alcance general. Reglas comerciales pendientes sin cambios. Sin limpieza, comunicaciones reales ni despliegue.
