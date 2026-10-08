# Revisión editorial del catálogo de mensajes

Autorización: el propietario aprobó revisar los 30 modelos comerciales, agregar seis WhatsApp para Referente y desactivar el modelo de prueba. La exportación recibida el 8 de octubre de 2026 contiene 31 modelos activos y se conserva en scripts/message-models/baseline.json. Son textos de catálogo, sin destinatarios ni credenciales.

La revisión distingue beneficios por vertical y usa un tono cercano para Independiente, formal para Consolidado y Referente. Referente cierra preguntando por la persona adecuada para coordinar una presentación. Los WhatsApp se acortan. Se eliminan afirmaciones de conocimiento del negocio, trayectoria o posicionamiento y la frase histórica Estamos desarrollando. Se mantiene la propuesta regional sin inventar promociones, precios, contratos o garantías de resultados. Email usa sender, WhatsApp Independiente usa sender_short; la aplicación ya provee ambas variables.

Se conservan IDs y referencias de los 30 modelos comerciales; solo se cambian nombre, asunto, cuerpo y, si corresponde, etiqueta de vertical. El modelo prueba contacto (ID 1) se desactiva, no se borra. Se agregan seis WhatsApp para Referente. No se envía ningún mensaje ni se modifica ninguna gestión, negocio, contacto o responsable.

Para este catálogo se revisaron expresamente los pares Alojamiento/Alojamientos, Experiencia/Experiencias, Partner/Partners y Proveedor de servicios/Proveedores de servicios. El comando consulta las verticales activas: acepta un único nombre existente de cada par y usa ese nombre. Si no existe ninguno o están activos ambos, se detiene para acordar la clasificación. No crea verticales ni altera el criterio general de compatibilidad de la aplicación.

## Vista previa de solo lectura

Tras desplegar el PR, en el contenedor de la aplicación:

~~~sh
npm run db:review:models -- --output=/tmp/crm-models-preview
~~~

Guarda before.json, plan.json, after.json y receipt.json con permisos privados. La vista previa usa una transacción de solo lectura y no consume IDs. En el caso inicial esperado muestra 30 updates, seis inserts y una desactivación. plan.json contiene los 36 textos propuestos para revisión. Conviene copiar el directorio fuera del contenedor junto con el respaldo anterior.

## Aplicación manual

~~~sh
npm run db:review:models -- --apply --output=/tmp/crm-models-apply
~~~

Usar un directorio nuevo cada vez. El comando respalda todas las filas actuales de modelos antes de escribir, registra el plan y el estado final, y realiza el cambio en una única transacción con validación final. Los bloqueos de tablas impiden que el catálogo o las verticales cambien durante la aplicación. Los triggers normales de versión de la aplicación siguen activos.

Cada ID conocido debe coincidir exactamente con la exportación o con el estado final revisado. Cualquier edición humana, borrado, desactivación inesperada o nombre en conflicto detiene el procedimiento. Los modelos ajenos al catálogo se conservan. Volver a aplicar el mismo catálogo no duplica modelos ni actualiza timestamps. No se ejecuta al iniciar ni al desplegar.

Una falla de conexión alrededor del COMMIT se informa con committed=null: leer los modelos y el recibo antes de repetir. No asumir rollback. Si falla escribir el recibo después del COMMIT, se informa committed=true. Los respaldos y el estado final se escriben antes del COMMIT.

Para revertir, revisar before.json contra los valores actuales antes de restaurar los campos de los mismos IDs y reactivar prueba contacto. Los seis modelos nuevos deben desactivarse, conservando referencias de cualquier mensaje que ya los haya usado. No hacer un DELETE global ni restaurar el respaldo completo de producción por un cambio editorial.

## Validación

El test del plan verifica conflictos, ausencia/ambigüedad de verticales, los 36 modelos y la segunda ejecución sin cambios. La integración PostgreSQL ejecuta el mismo aplicador, comprueba preservación de un modelo ajeno, desactivación sin borrado, seis inserts, timestamps/versiones sin cambios en segunda ejecución, rechazo de ediciones posteriores y rollback del esquema de ensayo. No usa proveedores ni destinatarios reales.
