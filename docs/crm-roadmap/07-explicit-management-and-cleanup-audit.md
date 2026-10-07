# Rediseño funcional: fase 2, inicio explícito y auditoría

Base remota verificada antes de continuar: main `ac3e5fe4eb3234034dcb6bd3745402d700fcd8bf`. Esta fase continúa el PR borrador #42 y conserva sus controles de permisos.

## Comportamiento entregado

- La sección se llama **Gestiones comerciales**, con tablero como presentación inicial. Se conservan los enlaces `/opportunities` y `/sales/:id` para no romper accesos existentes.
- Los negocios se crean/editan mediante `commercial: account_save`, sin gestión, conversación ni tarea automática. La importación revisada y su API crean únicamente negocios.
- `leads` y `leads_save` ya no aceptan altas heredadas: responden 409 y orientan a crear un negocio e iniciar una gestión. Conservan la edición autorizada de registros existentes.
- El modo de importación histórico `opportunity` no admite previews nuevos ni confirmación de lotes pendientes. Los lotes ya completados conservan su informe y su respuesta idempotente. Volver a importar un lote pendiente requiere revisar un nuevo preview en modo negocios; no se convierten lotes silenciosamente.
- Iniciar gestión prepara una propuesta dentro de un negocio. El nombre inicial editable es **Presentación de Hospeda**. Persona, propuesta y cierre previsto son opcionales. El responsable inicial corresponde al negocio y se conservan responsables independientes en las gestiones existentes.
- Cancelar la preparación no crea una gestión. Guardar no acredita contacto, envío, aceptación ni conversación.
- En la preparación manual, no se toma arbitrariamente la primera etapa: el usuario elige entre las etapas existentes o deja la nueva gestión sin etapa. Esto no define el criterio comercial inicial del futuro recorrido automático Contactar.
- La UI bloquea el formulario y muestra un texto específico al guardar. Los reintentos de creación del mismo formulario reutilizan una clave UUID; el servidor devuelve la gestión ya creada. Si ese intento guardó datos diferentes o la gestión fue enviada a Papelera, rechaza la repetición sin crear otra. Clientes antiguos sin clave siguen siendo compatibles con el endpoint explícito; deben incorporar la clave para obtener esta protección.
- El selector de negocios permite consultar resultados ajenos y bloquea su elección para iniciar una gestión sin permiso.

## Migración 014

`014_explicit_management.sql`:

1. Agrega un guard antes del trigger heredado de `leads`: rechaza inserciones sin un negocio explícito. Impide que scripts antiguos vuelvan a crear negocios y oportunidades en una misma alta. Mantiene la proyección de datos de negocios a gestiones.
2. Cambia el default de futuros lotes a `business`, preservando los históricos.
3. Agrega columnas de clave y huella de creación para proteger los reintentos. Los registros existentes quedan con valores nulos.

No elimina ni transforma negocios, gestiones, etapas, personas o asignaciones. La prueba de migración compara registros e historia anteriores y posteriores.

Los importadores históricos `db:import` / snapshots que insertan leads sin negocio dejan de ser una vía de carga en el esquema actualizado. La recuperación se hará desde un respaldo completo de PostgreSQL, ensayado en copia; no mediante un CSV o el importador antiguo.

## Auditoría de limpieza: solo lectura

Comando a ejecutar en una copia consistente o con credenciales PostgreSQL de lectura:

```sh
# DATABASE_URL proviene del entorno autorizado; no pegarla en logs ni informes.
npm run db:audit:managements -- --output /ruta/privada/auditoria-gestiones.json
```

El script usa una transacción `REPEATABLE READ READ ONLY`, exige archivo nuevo y guarda con permisos 0600. No existe opción de limpieza. Esas propiedades se verifican en las pruebas. Referencias oficiales: [SET TRANSACTION](https://www.postgresql.org/docs/17/sql-set-transaction.html) y [pg_constraint](https://www.postgresql.org/docs/17/catalog-pg-constraint.html).

El informe incluye:

- Cantidades, IDs de negocios a conservar y huellas de sus datos/asignaciones.
- Cada FK real a `leads`, columnas y comportamiento de borrado, incluidos cascadas y vínculos compuestos.
- Referencias heredadas sin FK, notas, tareas, actividades, pipeline, mensajes, outbox, secuencias, restricciones, evidencias, materiales y relaciones de reactivación.
- Inventario de columnas JSON y referencias conocidas a IDs de gestión, resultados de importaciones y snapshots de fusiones. El JSON arbitrario debe revisarse manualmente; no se asume cobertura semántica completa.
- Triggers efectivos y código de sus funciones para revisar efectos indirectos antes de redactar el borrado.
- Datos comerciales conservados directamente en la gestión, sin inferir ausencia por el nombre de una etapa.
- `blocked`: datos/relaciones que contradicen la condición de vacío. `review`: origen técnico, persona, etapa o auditoría técnica que requieren revisión y preservación. `candidate`: sin evidencia detectada; también exige revisión del inventario completo y autorización del manifiesto.

La huella del informe identifica el relevamiento; no reemplaza la revalidación transaccional previa al eventual borrado. El informe omite nombres, teléfonos, emails, mensajes y notas; muestra IDs y motivos para revisar en el CRM o en una consulta administrativa autorizada.

**No se auditó la base de producción en esta fase.** Las comprobaciones se ejecutaron sobre bases descartables con casos vacíos y casos con relaciones. No hay un conteo real de candidatos autorizado ni se ejecutó limpieza.

## Procedimiento propuesto, pendiente de revisión

1. Revisar este resultado y la migración. Preparar respaldo completo recuperable y probar restauración en copia.
2. Ejecutar la auditoría de lectura en el entorno autorizado. Entregar el informe y los casos que contradigan la confirmación del propietario. Cualquier asociación comercial detiene la limpieza.
3. Revisar JSON, triggers y casos técnicos. No eliminar personas, negocios ni asignaciones por ser el origen de una oportunidad histórica. Resolver el vínculo de journal al negocio sin perder trazabilidad.
4. Preparar un manifiesto con IDs exactos, clasificación revisada, dependencias, conteos y huellas de datos/asignaciones a conservar. Presentar por separado el SQL de borrado y su ensayo en copia.
5. Solo después de esa revisión, habilitar una ejecución explícita en transacción, con exclusión de escritores, revalidación de cada candidato y aborto ante cambios. La limpieza no formará parte del despliegue automático.
6. Verificar la conservación de negocios/asignaciones, tablero sin gestiones históricas vacías y altas/importaciones sin regeneración de oportunidades.

## Validación y alcance siguiente

- `npm run typecheck`, `npm test`, `npm run build`.
- `CRM_TEST_DATABASE=1 npm run test:managements`: preservación en migración, alta/edición sin gestión, bloqueo heredado, lotes históricos, varias gestiones, concurrencia/reintentos y auditoría de solo lectura con FK, historial, JSON y datos conservados.
- Regresiones de negocios, importación, calidad, permisos y seguimiento; proveedores de comunicaciones simulados.
- Playwright: preparación/cancelación/guardado lento en desktop y mobile, y recorridos existentes ajustados a los nuevos nombres y tablero inicial.

El listado único configurable, sus preferencias por usuario y recuperación de posición corresponden a la siguiente fase. Contactar con creación automática, resultados guiados, reglas de cierre y tareas delegadas siguen pendientes de sus decisiones comerciales. Esta fase no cambia esos automatismos.
