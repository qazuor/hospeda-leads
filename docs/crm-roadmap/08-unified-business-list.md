# Fase 3 — Listado único de negocios

Base remota verificada antes de comenzar: `main` en `ac3e5fe4eb3234034dcb6bd3745402d700fcd8bf`; feature en `f99156b1fcc6f6a569ca725dad98e3ccf7c0a303`.

## Resultado

`/accounts` tiene un listado propio, con tabla y grilla de cards. Ya no utiliza las vistas simple/avanzada de la tabla comercial. Ambas presentaciones comparten búsqueda, filtros AND/OR y orden. Nombre y Abrir permanecen disponibles. La configuración permite seleccionar campos, moverlos, ajustar su ancho y fijarlos a cada lado. Las cards muestran los campos elegidos como datos del establecimiento.

La tabla permite desplazamiento horizontal. Las fijaciones efectivas usan hasta la mitad del ancho de escritorio; las restantes preferencias de fijación se conservan para un ancho mayor. En mobile no se aplican fijaciones y el primer ingreso usa grilla. Cada campo puede configurarse con teclado y sin arrastrar.

Se conservan la importación de negocios, búsqueda/revisión de duplicados, fusión para admin, vistas personales guardadas y selección con revisión de cambios masivos. La selección usa IDs de negocios, incluso cuando no tienen gestiones. Los cambios comerciales masivos siguen mostrando todas las gestiones afectadas y requieren revisar la confirmación existente. No se cambia su criterio comercial.

## Preferencias y regreso

Se guarda un documento validado y versionado en `localStorage`, cuya clave incluye el ID del usuario autenticado. Incluye presentación, campos/orden, anchos/fijaciones, búsqueda/filtros, ordenamiento, tamaño, forma de carga, página o último lote, desplazamiento vertical/horizontal y negocio de referencia con su posición visible.

No se migran preferencias antiguas compartidas sin usuario: no se conoce su propietario y hacerlo mezclaría información entre personas. Al regresar por el enlace, menú o Atrás, se recupera el documento personal. El servidor puede localizar el negocio de referencia dentro del mismo conjunto filtrado y ordenado, para recuperar su página incluso si cambió de posición después de editarlo. En carga continua se solicitan los lotes necesarios antes de restaurar el ancla. Si disminuye la cantidad de resultados, la página se ajusta a una existente. Si el registro ya no existe o queda fuera de resultados, se usa la posición disponible. Las preferencias quedan en ese navegador, no se sincronizan entre dispositivos. Si el almacenamiento falla, se muestra un aviso permanente.

La paginación usa Anterior/Siguiente. En carga continua se conserva lo cargado al pedir el siguiente lote, con skeletons del lote y Cargar más disponible. La carga inicial y los cambios de búsqueda/filtro reemplazan los datos por skeletons, conservando encabezados. Los errores permiten reintentar sin borrar filtros y detienen el disparador automático.

## Valores del equipo

Nuevo endpoint autenticado `/_api/business_list_defaults`: GET comparte únicamente el documento operativo de valores iniciales; POST exige admin y valida estructura, campos, rangos, filtros, IDs únicos de presets y filtro inicial existente. Se almacena con upsert atómico en `app_settings`, clave `business_list_team_defaults_v1`; no requiere migración SQL.

En Configuración → Listado de negocios, el admin elige presentación, campos/orden, tamaño, carga, ordenamiento y filtros preestablecidos. Los filtros disponibles y el filtro inicial activo son opciones distintas. Crear un preset no lo aplica. Preferencias personales prevalecen; Restablecer valores del equipo vuelve a los iniciales (grilla en mobile), mientras Limpiar filtros conserva presentación y demás preferencias.

## Validación

- Unitarias: aislamiento por usuario, contexto completo, datos corruptos, nombre obligatorio, presets disponibles vs activos y límite de fijación/mobile.
- Integración en BD descartable: lectura compartida, escritura admin, validación de configuración y rechazo anónimo.
- Navegador: desktop/mobile, preferencias, cambio de presentación, página, regreso por enlace y Atrás, carga continua, skeletons, fijación, ancho mobile y separación de usuarios.
- Se adaptan los recorridos existentes a la eliminación de simple/avanzada y los skeletons nuevos. Se mantienen revisión masiva, importación/fusión y gestión explícita.

La evidencia de CI queda en el PR. No se ejecutan comunicaciones reales, auditoría de producción, limpieza, merge ni despliegue.

## Pendiente del alcance general

Contactar desde negocios con preparación automática de gestión, registrar resultados y respuestas espontáneas, reorganización de ficha, continuidad de pendientes, historial, materiales, loading y toasts del resto de la app. Las etapas/transiciones, aceptación/cierre/pago/entrega, cambios de etapa propuestos, respuestas espontáneas sobre tareas, modelos finales y delegaciones mantienen su condición pendiente. Esta fase no decide esas reglas.
