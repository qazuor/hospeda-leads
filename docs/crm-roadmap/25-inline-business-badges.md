# Edición de badges de datos del negocio — primera subtarea

Ciudad editable por responsable/admin; Responsable editable solo por admin. Click en el badge de la tabla abre un popover compacto con opciones, revisión y Guardar/Cancelar. Valor vacío permite asignar un dato. Negocios ajenos conservan lectura compartida y badges de lectura.

Antes de editar se recupera el detalle actual y se vuelven a comprobar permisos. Se modifica únicamente el campo solicitado mediante el endpoint existente; nunca se usa un guardado completo que pudiera borrar teléfonos o emails. Guardado con estado específico, bloqueo, errores persistentes y Recargar datos. Contexto del listado conservado; un negocio puede salir del resultado si deja de coincidir con filtros activos.

El servidor bloquea el negocio, valida responsable/admin y compara el valor esperado. Cambios simultáneos producen 409; repetir una operación ya aplicada no duplica el historial. La proyección existente de datos del negocio a sus gestiones se conserva; no cambian etapas, responsables de gestiones ni compromisos.

Validación: unitarias/TypeScript, integración de permisos/conflicto/reintento idempotente/campos conservados, navegador desktop/mobile para usuario/admin, cancelación, errores, recarga y acciones lentas. Revisar CI y capturas antes de mergear.

Pendiente en otra subtarea: Vertical/Subtipo, con revisión explícita de su dependencia. Los badges que resumen gestiones requieren elegir la gestión antes de editar; no modificar todas ni elegir una arbitrariamente.
