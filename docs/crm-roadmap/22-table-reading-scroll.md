# Lectura de celdas y scroll del listado

Primera subtarea del pedido: celdas de tabla en una línea, ellipsis y tooltip propio Radix con contenido completo, disponible por hover/foco. Los badges del listado no utilizan title nativo. Cards conservan sus datos completos. Contador alineado abajo en su barra.

Modo normal: barra de resultados sticky a top 0; navegación de esta página acompaña el scroll. Cuando el encabezado sale de su posición natural, un viewport de encabezados fijos replica controles y posición horizontal, incluyendo columnas fijadas, sin mover las filas. Pantalla completa: barra exterior estable y scroll vertical dentro de la tabla, con th sticky. Carga continua y Cargar más están dentro del viewport correspondiente.

Verificación: TypeScript; prueba de navegador nueva para desktop/mobile que cubre ellipsis, tooltip propio, barra/encabezados fijos, scroll interno y carga continua al final. CI y capturas pendientes antes de mergear.

Segunda subtarea pendiente: completar la columna de acciones con botones de iconos uniformes para abrir, contactar y retirada permitida. La operación actual de negocios es archivar (solo admin); la papelera de gestiones conserva negocios. No introducir borrado permanente ni confundir esas operaciones.
