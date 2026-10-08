# Vista activa y guardado contextual

Base: PR 65 integrado en `0da0e5e86c822c62d144c69ec2edb34af42907c6`. CI 37721674976 aprobada: 76 unitarias, 61 recorridos de navegador, integraciones y Docker. Los estados pendientes de CI del documento 32 son históricos.

Se implementan los tres estados de guardado en Negocios: sin vista seleccionada solo crear una nueva; con una vista personal modificada elegir entre crear y actualizar; con una vista sin cambios, botón deshabilitado. Revertir los cambios vuelve a deshabilitarlo. Las vistas del sistema únicamente pueden copiarse a una personal, también para admin.

La selección muestra su nombre y estado discreto. La identidad y configuración aplicada se conservan por usuario en el navegador, también al volver o recargar. No se infiere una selección por coincidencia de nombres o filtros. Cambiar la búsqueda, un badge, filtros, presentación, columnas, orden, anchos o fijaciones efectivos cuenta como cambio de la configuración que las vistas ya almacenan. Scroll, filas seleccionadas y lotes cargados quedan fuera. Se normalizan layouts históricos, controles de paginación inactivos, claves de objetos y orden conmutativo de condiciones AND/OR.

Las vistas personales reciben ID estable desde la API. Las históricas tienen un ID de compatibilidad determinista por propietario, conservado en la siguiente escritura autorizada y al renombrar. GET no escribe. El servidor mantiene el contrato anterior por nombre para los accesos heredados; cuando el cliente envía ID, ese ID es la identidad y no se usa el nombre como fallback. Nuevas vistas reciben UUID. Se mantiene la transacción por sesión y la validación de duplicados. No hay migraciones ni cambios de datos comerciales.

Actualizar conserva nombre, ID y metadatos adicionales de la configuración. Crear una copia conserva la original y activa la nueva. Renombrar mantiene la selección; borrar la activa retira su identidad y conserva los filtros actuales. Fallos conservan borrador/estado modificado, permiten reintentar y no cambian la referencia aplicada. Durante escritura se bloquean doble clic, botones y cierre. El foco vuelve al selector de vistas después de guardar.

Verificación local: TypeScript, build y 82 unitarias; 12 recorridos de navegador aprobados a 1280/390 px, usuario/admin, claro/oscuro, cancelación, reversión, copia, renombre/borrado, recarga, badges y fallo/reintento lento. Capturas revisadas. La CI completa debe aprobar integraciones de propietario/ID/históricos, recorrido con API real y Docker antes del merge.

Siguiente bloque: fila de vistas como badges, acciones y overflow; después composición más compacta de cards, preservando preferencias y edición inline. Decisiones comerciales/multiverticales y limpieza productiva siguen separadas.
