# Rediseño funcional: fase 1, permisos

Base revisada: main, ac3e5fe4eb3234034dcb6bd3745402d700fcd8bf.

## Comportamiento

- Lectura compartida de negocios activos, personas e historial comercial activo.
- Negocios y personas: modifica el responsable del negocio o un admin.
- Gestiones: modifica su responsable o un admin. Se conservan responsables independientes; administrar el negocio no autoriza a modificar gestiones ajenas.
- Los endpoints heredados que proyectan datos al negocio también validan al responsable del negocio.
- Los lotes validan todos sus destinos antes de modificar; una selección con elementos ajenos se rechaza completa.
- Archivados: consulta exclusiva del admin, incluso para su responsable anterior. Las rutas, detalles y consultas contextuales aplican la restricción.
- Papelera: registros eliminados fuera del detalle comercial activo. Notas e historial de una gestión eliminada son consultables por admin; se requiere restaurar antes de modificar.
- Configuración operativa conserva catálogos y el directorio mínimo para filtros. El vendedor no recibe datos personales adicionales, contraseñas/invitaciones ni configuración de email. Esos datos tampoco se consultan para construir su respuesta.
- Importaciones por sesión: admin. El endpoint de importación con clave conserva su alcance específico, su revisión previa y su política de crear negocios sin asignación.
- Administración de materiales: admin. Vinculación de materiales aprobados: responsable autorizado del contexto o admin. Lectura de documentos de negocios activos compartida.
- La UI indica consulta y deshabilita/oculta edición, selección masiva y administración cuando corresponde. El servidor mantiene el control definitivo.
- El inicio de sesión cancela y elimina consultas de la sesión anterior para evitar reutilizar datos administrativos entre usuarios.

## Decisiones preservadas

No se modifican etapas, cierres, criterios comerciales ni asignaciones. La excepción actual para tareas delegadas se conserva: su política definitiva está pendiente. Los flujos de comunicación mantienen su protección contra reenvíos con resultado incierto.

## Migraciones y limpieza

Esta fase no requiere migración y no ejecuta limpieza. No elimina negocios, gestiones, asignaciones, comunicaciones ni trabajo.

La limpieza posterior se entregará como procedimiento separado:

1. Inventario de oportunidades y relaciones: tareas, actividades, mensajes/borradores, email outbox, notas, journal, pipeline, objeciones, reactivaciones, secuencias, evidencias y documentos/vínculos. Inspeccionar también todas las FK y triggers efectivos.
2. Identificar candidatos y distinguir cambios técnicos de historia comercial; no inferir vacío solo por nombre o etapa.
3. Reportar cantidades y ejemplos de cualquier asociación que contradiga la condición autorizada. No eliminar ante contradicciones.
4. Respaldo recuperable, comprobación de restauración y ensayo en copia.
5. Presentar identificadores, dependencias, efectos de cascadas y conteos de negocios/asignaciones a conservar.
6. Tras revisión, ejecutar explícitamente en transacción, revalidando las condiciones y abortando ante cambios.
7. Verificar conservación de negocios/asignaciones y que los mecanismos de carga no generan nuevas gestiones.

No incluir esta operación dentro del despliegue automático.

## Validación

- `npm run typecheck`
- `npm test`
- `npm run build`
- `CRM_TEST_DATABASE=1 npm run test:permissions` sobre una base descartable con todas las migraciones.
- Regresiones de negocios, trabajo, pipeline, calidad, importación y comunicación. Los proveedores de envío se simulan.
- Nueva prueba de interfaz en `tests/browser/permissions.e2e.ts`, con respuestas simuladas; la autorización real se prueba por API.

En este entorno las integraciones se verifican con PGlite y sus 13 migraciones. CI utiliza PostgreSQL 17. La prueba visual local queda pendiente: falta el ejecutable Chromium y la descarga devuelve un archivo inválido. No afirmar validación visual ni CI remoto hasta obtener esos resultados.

## Siguientes fases

Separar altas de negocios y gestiones; preparar auditoría de limpieza; listado único y preferencias; ficha/contacto; resultados/continuidad; materiales y validación integral. Las reglas de etapas, aceptación/cierre, respuesta espontánea y tareas delegadas requieren definición antes de desarrollar sus automatismos.
