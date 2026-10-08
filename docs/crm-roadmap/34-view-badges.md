# Fila de vistas guardadas

La selección de vistas de negocios pasa del desplegable a una fila de badges. Las vistas del sistema y las personales se agrupan con etiquetas distintas; cada selección es un botón con nombre accesible completo y `aria-pressed`. La activa se marca también con un check y se identifica fuera del área desplazable, junto al estado «Modificada» / «Sin cambios».

La fila utiliza ScrollArea de Mantine, desplazamiento horizontal y botones anterior/siguiente. No expande el ancho de la página ni cambia de estrategia en móvil. El foco y la selección revelan el badge dentro de la fila sin desplazar verticalmente el listado; nombres largos se truncan visualmente y conservan el nombre accesible y el título completo.

Cada badge personal incluye acciones independientes para editar y eliminar. Se reserva su espacio para evitar saltos al pasar el mouse; aparecen con hover/foco y permanecen visibles en pantallas táctiles o pequeñas. Las acciones reutilizan los diálogos existentes y no aplican la vista al listado. Cancelar vuelve al botón que abrió el diálogo; si la eliminación lo retira, vuelve a Administración. Se conservan errores, reintento, bloqueo durante guardado y confirmación de eliminación. Las vistas del sistema no ofrecen estas acciones.

Se conserva la identidad estable por ID, la selección por usuario y el guardado contextual implementados en PR #66 (mergeado con CI completa en verde: 82 pruebas unitarias y 66 de navegador, además de integraciones y Docker). Renombrar o eliminar una vista mantiene los filtros actuales.

Validación de este bloque: typecheck, 82 pruebas unitarias, build y pruebas de navegador para selección, restauración, guardado, acciones directas sin activar la vista, error/reintento, foco, nombres largos, muchas vistas y ancho de pantalla a 1280 y 390 px. La API real y los flujos de permisos se verifican en CI antes del merge.

Siguiente bloque: tarjetas de negocios más compactas, con jerarquía visual y componentes Mantine consistentes.
