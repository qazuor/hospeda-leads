# Listado — búsqueda, filtros y vistas visibles

Base main verificada: da16b85e3cb4d59fcd93afb02cede25a60fc6a2c (PR #44). Rama feature/crm-business-toolbar.

Búsqueda en una línea propia con icono, foco visible y borrado explícito. Filtros siempre disponibles. Tabla/grilla agrupadas; columnas, orden, dirección y tamaño de lote con alturas y separación consistentes. Las vistas guardadas se aplican desde un selector siempre visible; Guardar vista abre un diálogo para nombrar la configuración o eliminar vistas existentes. Guardado mantiene errores y texto, bloquea desde el primer clic y confirma el resultado.

Importar CSV y Buscar duplicados se acceden desde Más opciones → Administración solo para admin. Los enlaces abren la herramienta dentro del listado, conservando preferencias y retirando el parámetro de la URL para no reabrirla al volver. Los controles del servidor existentes se conservan.

Mobile distribuye búsqueda y controles en filas adaptadas, sin aplicar el ancho desktop. Lucide acompaña los controles modificados. Las expresiones de filtros continúan visibles.

Validación prevista: TypeScript, unitarias, build; recorridos de lista 1280/390, guardar/aplicar vista y admin importar/revisar duplicados. CI y capturas pendientes antes de merge.

## Subtareas siguientes

- Carga siempre continua y Configuraciones por defecto (la carga elegible se conserva temporalmente en este bloque).
- Búsqueda/filtros sin diferencias por mayúsculas o acentos en toda la app.
- **Nuevo pedido: badges de tabla clickeables con edición en el lugar.** Selector de valores existentes, loading desde primer clic, error persistente y actualización consistente. Permitir editar solo a responsable/admin; asignación de Responsable solo admin. Mantener lectura compartida. No editar etapas hasta resolver criterios comerciales pendientes.
- Resto de materiales, resultados guiados, próximos pasos, historial y feedback de acciones según el alcance general.

## Pedidos adicionales — pendientes

- Incluir **Acciones** en el selector de columnas, con visibilidad, orden y fijación/quitar fijación, conservando los límites de espacio desktop y sin fijación mobile. Esto actualiza el criterio anterior que mantenía Abrir siempre visible en tabla. Si se oculta Acciones, el nombre del negocio conserva el acceso para abrir su ficha.
- Reemplazar el hover del botón de encabezado por un resaltado de **toda la columna**, encabezado y celdas, con una variante más intensa del fondo del tema. Mantener texto legible, filas alineadas, celdas fijas y contraste claro/oscuro. Mantener foco por teclado distinguible del hover.

Ambos pedidos se implementarán en una subtarea propia; no forman parte del rediseño de barra de búsqueda de este PR.
