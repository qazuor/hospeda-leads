# Limpieza de gestiones históricas vacías

Estado: procedimiento de preparación, pendiente de datos y ensayo reales. No contiene un comando de borrado. Base revisada: main `04fe2ab2e0e60a2cff4ff0bdfcf0258580a32470`, auditoría `scripts/audit-management-cleanup.mjs` y migración 014.

## Resultado requerido antes de borrar

- Respaldo completo PostgreSQL recuperable y restauración comprobada en una base nueva aislada.
- Informe de auditoría del respaldo restaurado, clasificación revisada de cada ID histórico y lista explícita de exclusiones.
- Inventario de dependencias, JSON y triggers, incluidas relaciones agregadas después de la implementación original.
- Manifiesto aprobado con IDs exactos, huellas, conteos, relaciones a preservar y SQL específico ensayado.
- Resultado del ensayo con conservación de negocios, responsables, personas e historia y ausencia de regeneración de gestiones.

No hay conteos productivos verificados en esta sesión. No inferir que una gestión está vacía por nombre, etapa, antigüedad, fecha de corte o ausencia de tarjetas visibles. Las gestiones reales creadas después de la autorización histórica no se incluyen automáticamente.

## 1. Entorno y evidencia

Usar clientes PostgreSQL 17 compatibles y el código de auditoría del commit revisado. Ejecutar sobre el servidor autorizado o desde una conexión administrativa controlada. Las credenciales se configuran fuera de Git y no se pegan en comandos, informes ni logs.

Para las herramientas PostgreSQL, configurar un servicio libpq `hospeda_crm_source` que apunte a la base origen y otro `hospeda_crm_rehearsal` que apunte exclusivamente a una base nueva aislada. Configurar contraseña mediante el mecanismo de credenciales del operador. Verificar identidad y versión de ambas conexiones antes de ejecutar. La auditoría Node requiere DATABASE_URL en su entorno; comprobar que apunta al origen o a la copia correspondiente en cada etapa.

La copia de ensayo no recibe tráfico del CRM ni ejecuta workers, webhooks o envíos. No iniciar la aplicación con credenciales reales de Brevo. Preservar aparte configuración, roles/permisos necesarios y secretos de despliegue: el dump de una base no sustituye ese respaldo operativo.

Preparar un directorio nuevo privado para cada ejecución:

~~~sh
set -euo pipefail
umask 077
cleanup_dir="$(mktemp -d /ruta/privada/cleanup-crm.XXXXXXXX)"
~~~

`/ruta/privada` debe existir y ser un destino protegido elegido por el operador. No guardar dumps ni informes reales en el repositorio o artefactos públicos de CI.

## 2. Relevamiento de solo lectura

Con DATABASE_URL configurada para origen:

~~~sh
npm run db:audit:managements -- --output "$cleanup_dir/audit-source.json"
~~~

El script exige archivo nuevo, guarda con permisos 0600 y usa una transacción REPEATABLE READ READ ONLY. Devuelve conteos/huella por consola, sin nombres, canales ni contenido comercial. Sus categorías son orientativas:

- `blocked`: hay datos o relaciones incompatibles con la condición de vacío. Excluir y reportar contradicciones; no eliminarlos para despejar el candidato.
- `review`: referencias de origen, persona, etapa o auditoría técnica requieren análisis y conservación.
- `candidate`: no se detectó evidencia con las reglas actuales. Todavía requiere revisar JSON, triggers, columnas comerciales y cobertura del esquema.

El informe conserva inventario de FK y acciones de borrado, referencias conocidas sin FK, columnas JSON y triggers. JSON arbitrario y semántica de campos no están exhaustivamente certificados. Revisar el esquema real y no tratar esta clasificación como autorización de DELETE.

## 3. Respaldo completo y restauración

Con el servicio origen revisado:

~~~sh
PGSERVICE=hospeda_crm_source pg_dump --format=custom --file="$cleanup_dir/full.dump"
sha256sum "$cleanup_dir/full.dump" > "$cleanup_dir/full.dump.sha256"
pg_restore --list "$cleanup_dir/full.dump" > "$cleanup_dir/archive-list.txt"
~~~

Comprobar códigos de salida y advertencias; no continuar ante errores. El respaldo debe incluir todos los esquemas y datos de la base, incluidas versiones y bytes de documentos. Registrar fecha, versión y ubicación protegida del respaldo. Guardar una copia fuera del volumen afectado por la limpieza según el mecanismo operativo disponible.

El servicio de ensayo debe apuntar a una base nueva vacía confirmada. No usar `--clean`, `--create` ni el servicio de producción en esta etapa:

~~~sh
pg_restore --dbname=service=hospeda_crm_rehearsal --no-owner --no-acl --single-transaction --exit-on-error "$cleanup_dir/full.dump"
~~~

Los flags de propietario/permisos son para la copia aislada. El procedimiento de recuperación productiva debe restablecer los roles y privilegios correctos; no copiar esa omisión sin revisión.

Cambiar DATABASE_URL de la auditoría a la copia restaurada y ejecutar:

~~~sh
npm run db:audit:managements -- --output "$cleanup_dir/audit-restored-before.json"
~~~

Comparar tablas, conteos, IDs, datos/asignaciones de negocios, personas, gestiones, referencias e integridad de documentos. La huella del informe completo puede diferir por fecha de captura: comparar los datos preservados y sus huellas, no exigir igualdad del snapshotSha256 global. Origen y dump tomados en momentos diferentes pueden incluir cambios legítimos; registrar esa diferencia y utilizar la copia restaurada como base consistente del ensayo. No afirmar respaldo verificado únicamente porque pg_restore terminó sin error.

## 4. Manifiesto y SQL ensayable

Preparar después de revisar los datos reales, no antes:

- Commit, esquema/migraciones y respaldo usado, con su SHA-256.
- IDs de gestión históricos seleccionados, negocio correspondiente, categoría y decisión justificada por ID.
- IDs excluidos y motivos, especialmente cualquier actividad comercial o creación real posterior.
- Huellas de registros seleccionados y de datos/asignaciones a preservar, conteos esperados de cada tabla y relaciones afectadas.
- Tratamiento explícito de journal técnico y source_lead_id: mantener origen/atribución sin borrar personas ni negocios y sin inventar actividad comercial.
- Referencias JSON, FK y efectos de triggers resueltos; ninguna cascada o modificación indirecta queda implícita.
- SQL limitado a los IDs revisados, comprobaciones previas/posteriores y procedimiento de recuperación.

Revisar bloqueos y escritores reales antes de definir el SQL. El ejecutor deberá revalidar candidatos dentro de la misma transacción, excluir cambios concurrentes relevantes y abortar si difieren huellas, relaciones o conteos. Un filtro por estado/nombre, un manifiesto antiguo o una limpieza global de leads no cumplen este requisito.

## 5. Ensayo y revisión

Ejecutar exclusivamente en la copia aislada el SQL exacto propuesto. Comparar el antes/después y ejecutar una nueva auditoría de lectura. Verificar negocios y asignaciones sin cambios, personas/historia/documentos preservados, IDs excluidos intactos, relaciones coherentes y eliminación limitada a los IDs aprobados.

Probar que crear/editar/importar negocios no regenera gestiones y que las gestiones válidas siguen funcionando. Las suites mutadoras del repo se ejecutan en otra base descartable con fixtures, no sobre producción ni sobre la copia usada como evidencia del respaldo.

Entregar conteos, exclusiones/contradicciones, huellas de preservación, SQL, resultados del ensayo y recuperación comprobada. Presentar ese resultado concreto para la revisión productiva exigida por el alcance vigente. Mergear este documento no habilita ejecutar la limpieza.

## 6. Ejecución productiva posterior

Solo después de revisar el manifiesto y el ensayo: respaldo reciente verificado, ventana y exclusión de escritores según el procedimiento revisado, revalidación transaccional y ejecución explícita del SQL aprobado. Abortar ante diferencias o información comercial no contemplada. No incluir el borrado en migraciones, deploy, seeds o arranque de la aplicación.

Validar conteos, conservación y comportamiento antes de reabrir escritores. Ante fallo, seguir el plan de rollback/restauración ensayado; restaurar un respaldo completo sin revisar escrituras posteriores puede perder datos nuevos.

## Referencias

- https://www.postgresql.org/docs/17/app-pgdump.html
- https://www.postgresql.org/docs/17/app-pgrestore.html
- https://www.postgresql.org/docs/17/sql-set-transaction.html
- `docs/crm-roadmap/07-explicit-management-and-cleanup-audit.md`
