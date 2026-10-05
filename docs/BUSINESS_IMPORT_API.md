# Importación automatizada de negocios

`GET /_api/business_import` y `POST /_api/business_import` usan JSON convencional y `Authorization: Bearer <clave>`. No requieren cookies ni sesión del navegador. El antiguo `/_api/leads_ingest` permanece deshabilitado.

## Activación y revocación

1. Generar una clave aleatoria sin imprimirla: `node scripts/create-business-import-key.mjs /ruta/privada/nuevo-directorio` (fuera del repositorio). Crea `business-import.token` y `business-import.sha256`, permisos 0600 en directorio 0700.
2. Configurar `BUSINESS_IMPORT_TOKEN_SHA256` con el contenido del archivo `.sha256`. El actor usa `ADMIN_EMAIL` por defecto; opcionalmente configurar `BUSINESS_IMPORT_ACTOR_EMAIL` con el email de otro administrador existente. En Deploy VPS, agregar el hash (y el actor opcional) como secretos de GitHub Actions; el workflow y Docker Compose los pasan al contenedor. En Coolify, configurar esas variables directamente. Nunca subir la clave `.token` a Git, notas, informes o logs.
3. Desplegar `main`. Sin hash válido o sin administrador existente el endpoint responde 503. La clave no permite iniciar sesión ni acceder a otros endpoints; el servidor almacena solo su hash SHA-256. El usuario real se usa para autoría de lotes y auditoría, sin heredar permisos de administrador.
4. Configurar en el cliente `BUSINESS_IMPORT_TOKEN_FILE=/ruta/privada/nuevo-directorio/business-import.token`. `BUSINESS_IMPORT_URL` es opcional; por defecto `https://crm.hospeda.com.ar`. HTTPS obligatorio excepto localhost. No se siguen redirecciones con credenciales.
5. Para revocar, vaciar el hash y redesplegar. Para rotar, generar otra clave, cambiar el hash, redesplegar y reemplazar la clave del cliente. El administrador debe seguir existiendo y conservar su rol.

## Flujo

`node scripts/business-import.mjs config` obtiene las verticales y subtipos activos, el límite de filas (máximo 30) y el límite de datos configurado. Solo se exponen clasificaciones y datos relacionados con importaciones; no se descarga la base completa.

Preparar un JSON con `source`, `sourceUrl` y `obtainedAt` opcionales, y `rows` con los campos de [BUSINESS_IMPORT.md](BUSINESS_IMPORT.md), excepto `asignadoA`. Cada campo de fila es texto. No incluir `mode`: siempre es negocio.

```json
{"source":"Relevamiento de fuentes públicas","rows":[{"nombre":"Nombre comercial verificado","ciudad":"Colón","provincia":"Entre Ríos","tipo":"Gastronomía","subtipo":"Restaurante","direccion":"Dirección verificada","discoverySource":"Sitio oficial","verificationUrls":"https://sitio-del-negocio.example/local","verifiedOn":"2026-10-05","businessNotes":"Nota y limitaciones del relevamiento"}]}
```

El ejemplo es un contrato ilustrativo: no cargarlo como negocio real. La API valida estructura, clasificación y duplicados; el investigador sigue siendo responsable de comprobar existencia, ubicación y funcionamiento. No inventar datos ausentes.

1. `node scripts/business-import.mjs preview lote.json revision.json`: guarda `batchId`, errores, advertencias y coincidencias con CRM y dentro del lote. La acción HTTP es `import_preview`.
2. Revisar todas las filas. Crear `decision.json` con `batchId`, `confirm:true`, `decisions` (una por cada índice). Solo acciones `create` o `skip`. Omitir duplicados y candidatos no verificados. `acknowledge:true` permite reconocer advertencias de normalización, nunca forzar coincidencias.
3. `node scripts/business-import.mjs confirm decision.json resultado.json`: confirma atómicamente. Devuelve conteos y `details` con `id`, `accountId`, `entity:"business"`. No crea ventas, contactos, tareas ni actividades; deja condición `prospect` y responsable vacío.
4. `node scripts/business-import.mjs status UUID persistencia.json`: devuelve resultado guardado, datos básicos de los negocios creados y `allCreatedAccountsPresent`. Solo permite consultar lotes del actor configurado y modo negocio. Revisar también nombres, clasificación y condición de los registros devueltos.

```json
{"batchId":"UUID devuelto por preview","confirm":true,"decisions":[{"index":0,"action":"create"}]}
```

Guardar revisión y resultado antes de avanzar al siguiente lote. Repetir la confirmación devuelve el resultado persistido; repetir el mismo contenido de filas recupera el lote. Si cambiaron las filas, se revisan de nuevo contra CRM. Las coincidencias se comprueban nuevamente bajo bloqueo transaccional al confirmar: una alta concurrente provoca 409, sin altas parciales. Omitir esa fila y confirmar de nuevo.

## Límites y respuestas

Hasta 30 filas, límites actuales del CRM y cuerpo HTTP hasta 2 MiB. 401 clave ausente/incorrecta; 403 operación, lote o asignación no autorizados; 404 lote no visible; 409 coincidencias; 400 JSON o validación incorrectos; 413 cuerpo excesivo; 415 formato incorrecto; 503 configuración ausente o actor inválido; 500 fallo interno sin exponer detalles. Un error no debe contarse como carga; consultar el lote antes de reintentar tras un fallo de red.

Pruebas: `CRM_TEST_DATABASE=1 npm run test:quality` sobre una base descartable con migraciones aplicadas. Incluye autenticación, permisos, altas sin entidades ficticias, lectura de persistencia, reintentos, duplicados concurrentes, lotes ajenos, modo histórico y límites de entrada.
