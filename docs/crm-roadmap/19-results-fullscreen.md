# Pantalla completa de resultados

Pedido: mostrar únicamente resultados, encabezados y barra de cantidad cargada, Tabla/Grilla y Columnas. Búsqueda, filtros, vistas, encabezado de página y navegación quedan fuera.

Se reutiliza el diálogo accesible existente, con cierre desde la barra o Escape, foco contenido y devolución del foco al salir. Se conservan preferencias, selección, resultados cargados y desplazamiento horizontal durante el cambio; el desplazamiento del diálogo no reemplaza la posición guardada de la página. La carga continua observa el contenedor de pantalla completa.

Validación local: typecheck y 56 pruebas unitarias. Prueba de navegador agregada para desktop y mobile: geometría del viewport, contenido aislado, encabezados, contador, cambio Tabla/Grilla, desplazamiento horizontal y cierre por Escape/botón. Primer CI: 34 de 35 pruebas de navegador aprobadas, incluidas ambas de pantalla completa. La prueba del listado detectó un desborde desktop de 32 px al contener una tabla ancha en el nuevo grid; se limita la pista a minmax(0,1fr) y sus hijos a min-width:0. Reejecución completa y revisión de capturas pendientes antes de mergear.

Siguiente subtarea: recuperar vistas del sistema en el selector y permitir su administración. Sin cambios de reglas comerciales, migraciones ni limpieza de datos.
