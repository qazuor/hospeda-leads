# Administración de vistas personales

Subtarea del issue #57. Acceso visible Administrar junto al selector Vistas. Diálogo compacto con iconos Lucide para editar o eliminar cada vista personal; vistas del sistema permanecen separadas y administradas por admin.

Editar permite renombrar conservando la configuración original. Una opción explícita reemplaza búsqueda, filtros y presentación por los del listado actual. Eliminar requiere confirmación; no modifica negocios ni filtros activos. Nombre duplicado muestra error sin reemplazar otra vista. Durante el guardado se bloquean confirmación, cancelación y cierre; errores conservan lo escrito y permiten reintentar.

Servidor: identidad obtenida de sesión, nunca del payload. Actualización por nombre dentro de las vistas propias. Transacción y bloqueo de fila serializan guardados, incluso cuando todavía no existe el registro del usuario. Renombrado conserva posición; no borra y vuelve a crear por separado. Sin migración ni datos nuevos obligatorios.

Validación: TypeScript, unitarias; pruebas de integración de propiedad, renombrado, configuración, duplicados y escrituras concurrentes. Navegador desktop/mobile cubre error y reintento, acciones lentas, Escape bloqueado, renombrado sin perder configuración, reemplazo explícito, cancelación de borrado, borrado confirmado y contexto de filtros conservado. CI y capturas deben revisarse antes de mergear.
