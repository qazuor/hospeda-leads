# Listado — corrección visual de tabla y columnas

Base remota main verificada: e5017ba8536025e30926eb847b45ef32a2abe2dc. Rama feature/crm-business-table-polish. Primera subtarea de las correcciones solicitadas tras PR #42.

Se recuperan los badges existentes de categorías (ciudad, vertical, subtipo, perfil, responsable y otras selecciones), sin agregar edición ni modificar permisos. Filas alternadas y hover comparten el mismo fondo con las celdas fijas. Encabezados compactos con iconos Lucide de orden y bordes que permiten ajustar anchos por drag. El ajuste también admite flechas, Shift para pasos mayores, Home/End y límites 100–600; preferencias personales conservadas.

El botón Columnas despliega un panel compacto para visibilidad, orden y fijación; no hay inputs de ancho. Nombre y Abrir permanecen disponibles. El panel conserva navegación por teclado y cierre por Escape. La fijación sigue limitada a desktop y a la mitad del espacio, con filas alineadas. Las cards reutilizan los mismos badges.

Validación local: TypeScript, unitarias, build y revisión React. Los recorridos existentes de listado a 1280 y 390 px incorporan drag real, teclado, ausencia de inputs de ancho, persistencia, badges, filas alternadas y capturas claro/oscuro. CI y evidencia visual pendientes antes de merge.

Pendiente de las siguientes subtareas: rediseño de búsqueda/vistas, filtros y vistas siempre visibles, mover importación/duplicados al menú admin, carga siempre continua, Configuraciones por defecto, búsqueda transversal sin acentos y resto de iconografía. Estas acciones no se dan por completadas en este PR.
