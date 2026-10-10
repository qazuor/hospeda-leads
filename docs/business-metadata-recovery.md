# Recuperación selectiva de datos históricos de negocio

La migración 017 agrega campos vacíos. El deploy no recupera datos automáticamente.

## Alcance autorizado

- Marca de Papelera, fecha y autor originales.
- Origen y fuente de referencia.
- Estado de revisión Filtrado, independiente de la etapa de una gestión.
- Etiqueta de suscripción histórica, independiente de pago confirmado y de conversión a cliente.

Se conservan responsables, archivo, clasificación, canales, notas, investigación nueva, documentos y relaciones. No se vuelven a crear gestiones. `origin` y `source_reference` preservan los valores originales sin sobrescribir `discovery_source` y `verification_urls`. El historial global lee los journals actuales sin copiarlos ni reescribir los antiguos.

## Manifiesto

Archivo privado externo a Git, preparado a partir de un respaldo verificado. Formato: `formatVersion: 1`, `backupSha256`, `accounts` con `accountId`, `sourceLeadId` y `values`. Solo se aceptan `origin`, `source_reference`, `review_status=filtered`, `subscription_label`, `deleted_at`, `deleted_by_email`, `deletion_reason`. No incluir nombres, datos o IDs de producción en el repositorio o artefactos de CI.

## Vista previa

Después de desplegar la migración, dentro del contenedor del CRM con DATABASE_URL configurada:

```sh
umask 077
npm run db:recover:businesses -- --manifest /tmp/recuperar-negocios-manifiesto.json --output /tmp/recuperacion-preview.json
```

La transacción es REPEATABLE READ READ ONLY. El archivo de informe es nuevo, privado y no se sobrescribe. La consola muestra conteos, conflictos y previewSha256; el informe contiene el detalle. Un campo ya recuperado se omite; un valor distinto se declara conflicto. Identidad cambiada, negocios fusionados o trabajo activo en un negocio cuyo estado debe recuperarse bloquean la aplicación.

## Ensayo y comparación actual

Obtener y conservar un respaldo actual completo fuera del contenedor; comprobar restauración en una base aislada sin trabajadores ni proveedores reales. Comparar las tablas protegidas con el respaldo anterior y revisar cambios legítimos posteriores. Ensayar la recuperación en la copia actual con el mismo manifiesto. La huella de la copia depende de sus datos, no es automáticamente reutilizable en producción.

No aplicar antes de revisar los conflictos y comprobar el respaldo actual. Un archivo businesses.json no permite verificar documentos, contactos, versiones ni todos los journals.

## Aplicación revisada

La autorización del propietario comprende los cinco grupos anteriores. Cuando la comparación y el ensayo estén comprobados, obtener una vista previa reciente de producción. Usar su previewSha256 y un email de administrador real:

```sh
npm run db:recover:businesses -- --manifest /tmp/recuperar-negocios-manifiesto.json --output /tmp/recuperacion-aplicada.json --apply --expected-preview HUELLA_DE_PRODUCCION --actor EMAIL_ADMIN
```

El ejecutor usa una transacción SERIALIZABLE y bloquea los negocios por ID. Relee los valores y las relaciones activas; aborta si la huella cambió o si hay conflictos. Registra un evento `business_metadata_recovered` por negocio modificado con antes/después, actor y huellas del respaldo, manifiesto y vista previa. Verifica que no hayan cambiado otros campos. La operación es idempotente.

El resultado `committed: true` confirma el commit; guardar el informe fuera del contenedor. Si falla guardar el informe después del commit, el ejecutor informa expresamente que la operación se confirmó; no asumir rollback ni ejecutar escrituras alternativas.

## Validación final

- Revisar los conteos aplicados y los 23 negocios en Papelera.
- Comprobar los filtros de origen, referencia, Filtrado y suscripción en el listado de negocios.
- Confirmar que no se recrearon gestiones ni se cambiaron responsables, investigación, archivo o estado de cliente/pago.
- Abrir Historial global: deben aparecer la recuperación y los cambios existentes de negocios, contactos, tareas, recursos y pipeline, incluidos negocios sin gestiones.

## Recuperación ante problemas

Usar las snapshots de los eventos de recuperación y el respaldo actual para preparar una reversión selectiva. No restaurar globalmente el respaldo antiguo sobre producción: contiene datos previos a cambios posteriores. Revalidar siempre las escrituras nuevas antes de revertir.
