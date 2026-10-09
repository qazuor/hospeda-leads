# Loading, envíos repetidos y conservación de datos

Se revisaron las escrituras del listado, editores comerciales, pipeline, tareas, mensajes, materiales, restricciones, vistas personales, perfil, catálogos, configuraciones, modelos y papelera.

- Las mutaciones disparadas desde botones usan un bloqueo inmediato, además del estado de React Query. El bloqueo se libera al terminar la operación y sus callbacks. No cambia `mutateAsync`, que conserva su contrato para operaciones secuenciales.
- Listado y configuración protegen la operación completa, incluidos refrescos; las celdas rápidas tienen bloqueos independientes por registro y campo.
- Modelos mantienen el texto ante errores, impiden envíos simultáneos y capturan las promesas rechazadas. Papelera mantiene solo la selección aún pendiente ante fallos parciales.
- Tareas y pipeline bloquean campos y cierre durante el guardado, con texto visible. Los accesos de navegación y descarte también esperan a que termine la escritura. Perfil conserva el borrador ante refrescos y bloquea cierre/cancelación al guardar.
- Negocios, seguimiento, comunicación y calidad conservan datos y editores ante un error de refresco. Las lecturas ofrecen reintento; los envíos de mensajes continúan con su protección y estados existentes.
- Observaciones de respuestas cuentan como cambios sin guardar y solo se limpian tras un resultado confirmado.
- Materiales y mensajes mantienen los bloqueos existentes, el control de versiones y sus claves de idempotencia. No se añade reintento automático de escrituras ni envíos.

Validación: typecheck, unitarias y build local; navegador de CI prueba envío lento, dos submits consecutivos, Escape durante guardado, error y reintento conservando valores, en escritorio y móvil. La suite completa conserva las verificaciones de permisos, restricciones y materiales.
