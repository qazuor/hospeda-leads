# Configuraciones por defecto — nombres consistentes

Base main verificada: 8d20e74a919149aff4b6e8d4dede7c13a23a3d1d (PR #46). Rama feature/crm-default-settings-copy.

Se reemplaza Valores del equipo por Configuraciones por defecto en el botón Restablecer del listado, títulos/ayudas/botones/loading/confirmación de la configuración administrativa, errores del endpoint y guía de uso. Las preferencias personales siguen teniendo prioridad; restablecer y limpiar filtros mantienen acciones distintas. Los nombres técnicos del almacenamiento y endpoint se conservan para no afectar preferencias existentes.

Los recorridos existentes de configuración y listado se actualizan a los nombres aprobados; siguen verificando guardado, prioridad personal, restablecer y limpiar filtros por separado. Validación local/CI informada en el PR.

Estado: PR #46 (loading de Negocios) mergeado después de CI completa y evidencia desktop/mobile aprobadas. Pendientes: carga siempre continua, búsquedas/filtros sin acentos ni diferencias de mayúsculas, badges editables, Acciones configurable, hover de columna y resto de materiales/feedback/historial del alcance general. Sin migraciones ni cambios de reglas, datos, comunicaciones o despliegue.
