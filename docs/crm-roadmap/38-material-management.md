# Carga y administración de materiales

La lectura de archivos y el guardado de documentos o versiones ahora muestran progreso y bloquean las acciones desde el primer clic. Los errores conservan el título, archivo o URL, vencimiento y destino; reintentar una creación sin cambios reutiliza su identificador para aprovechar la idempotencia del servidor. Las versiones conservan la revisión esperada para respetar conflictos de concurrencia.

Aprobar, archivar, vincular y administrar categorías ya no borran el formulario de carga. Cancelar una versión o cambiar de documento con un borrador requiere confirmar el descarte. El selector de archivo se limpia realmente tras guardar y el editor identifica el documento y versión de origen.

La baja usa el diálogo Mantine compartido, muestra el documento afectado, conserva errores para reintentar y bloquea Escape, cierre y dobles clics durante el guardado. La baja conserva versiones e historial.

## Verificación

- Typecheck, build y 82 pruebas unitarias.
- Dos recorridos simulados en 1280/390 px: lectura lenta, doble clic, error/reintento con mismo ID, independencia del borrador, descarte protegido y baja pendiente.
- Un recorrido con API y base real en CI: nueva versión TXT, vuelta a borrador, aprobación, recarga, vista previa de ambas versiones y baja persistente.
- Suite completa de CI, incluidos permisos, recursos contextuales y comunicaciones.

## Siguiente bloque

Miniaturas y vista previa de PDF. No se incorporan envíos automáticos ni cambios de permisos o migraciones.
