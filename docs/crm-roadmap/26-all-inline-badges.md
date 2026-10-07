# Edición del resto de badges

Vertical y Subtipo editan la clasificación del negocio. El cambio de vertical limpia el subtipo; el aviso se muestra antes de guardar. Catálogos activos y compatibilidad se validan en servidor. La comparación bloqueada del par Vertical/Subtipo evita perder cambios simultáneos. El listado usa la clasificación del negocio, sin volver a mostrar valores históricos de gestiones cuando se limpia un campo. No se alteran las clasificaciones históricas de las gestiones.

Perfil comercial, Medio preferido, Origen histórico, Quién cargó histórico y Creado por histórico editan una gestión explícita. Con una única gestión se muestra su nombre; con varias se requiere elegir, indicando las que son solo consulta. Sin gestiones se explica dónde iniciar el trabajo, sin crear registros. El servidor valida la pertenencia, el responsable independiente de la gestión y el valor esperado; repetir un cambio aplicado no duplica historial.

Los campos históricos de carga conservan su carácter de dato importado. Su corrección no modifica la autoría real de acciones registrada en el historial. Los siete badges usan Guardar/Cancelar, carga específica, bloqueo inmediato, errores persistentes y recarga. Funcionan en tabla y cards; Ciudad/Responsable también usan el mismo editor en ambas presentaciones.

Sin cambios de etapas, reglas comerciales, tareas, comunicaciones ni migraciones. Sin limpieza de producción.

Validación: TypeScript, unitarias, build; integración de clasificación, conflicto, permisos, selección explícita, reintento y conservación de otra gestión y tarea; navegador desktop/mobile, cancelación, aviso de subtipo, opciones compatibles, múltiples gestiones, campos históricos y cards. CI y capturas deben revisarse antes de mergear.

## Corrección de CI

El run 37681302290 aprobó TypeScript, 60 unitarias, integraciones, build y smoke de API; navegador aprobó 49 y falló dos variantes de la misma aserción. Playwright 1.58.2 redirige el estado de un option dentro de label al select asociado: el option tenía disabled, pero el select estaba habilitado. Se comprueba ahora la propiedad disabled del option y se verifica por teclado que End omite la gestión ajena y Home vuelve a la opción inicial. Se mantienen las pruebas de autorización reales del servidor. Nueva CI completa y revisión visual requeridas antes del merge.
