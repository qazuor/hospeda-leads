# Deploy en Coolify

Hospeda Leads está preparado para ejecutarse como una única aplicación Node + una base PostgreSQL.

## Infraestructura recomendada

En el Coolify existente del VPS de Hospeda:

- Aplicación: `hospeda-leads-prod`
- Fuente: GitHub `qazuor/hospeda-leads`
- Rama inicial de migración (histórica): `migration/floot-port`
- Rama definitiva: `main`
- Build: Dockerfile
- Puerto interno: `3001`
- Health check: `/_api/health`
- Reinicio: `unless-stopped`
- PostgreSQL: versión 17, recurso separado gestionado por Coolify

No hace falta desplegar el `docker-compose.yml` en Coolify. Ese compose queda para desarrollo local / despliegue autónomo.

## Dominio

Dominio productivo confirmado:

```
https://crm.hospeda.com.ar
```

Puede cambiarse por otro subdominio. `PUBLIC_APP_URL` debe coincidir exactamente con el dominio definitivo porque se usa, entre otras cosas, para imágenes absolutas en emails.

## Variables de entorno

Configurar en la aplicación:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=<internal PostgreSQL URL from Coolify>
JWT_SECRET=<random secret, minimum 32 characters; the server refuses to start with a missing, shorter or placeholder value (change-me, example...)>
ADMIN_EMAIL=<email administrador>
BREVO_API_KEY=<Hospeda Brevo API key>
PUBLIC_APP_URL=https://crm.hospeda.com.ar
INBOUND_EMAIL_TOKEN=<random secret, minimum 32 characters; shared with the Cloudflare Email Worker>
BREVO_SMTP_LOGIN=<Brevo SMTP login for the CRM>
BREVO_SMTP_KEY=<dedicated, revocable CRM SMTP key>
BREVO_SMTP_PORT=587
R2_ACCOUNT_ID=<Cloudflare account id>
R2_ACCESS_KEY_ID=<R2 API token access key id, Object Read & Write on the material bucket only>
R2_SECRET_ACCESS_KEY=<R2 API token secret access key>
R2_BUCKET=<private bucket name, e.g. hospeda-crm-material>
```

No versionar valores reales.

Para habilitar «Responder» en emails recibidos, cargá `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY` y, opcionalmente, `BREVO_SMTP_PORT` en Coolify. La clave debe ser propia del CRM y revocable. Si falta el usuario o la clave, el servidor inicia igual y oculta la acción.

### Material de venta en Cloudflare R2 (spec 89)

«Material de venta» guarda los archivos en un bucket privado de R2. El navegador sube directo a R2 con una URL firmada que emite el CRM; el archivo no pasa por el VPS (salvo portadas de hasta 1 MB). Pasos del propietario, una sola vez:

1. En Cloudflare → R2, crear un bucket **privado** (por ejemplo `hospeda-crm-material`). Sin dominio público ni `r2.dev`: las URL firmadas solo funcionan sobre el dominio S3 de R2 (`https://<account>.r2.cloudflarestorage.com`).
2. Crear un token de API de R2 con permiso **Object Read & Write** limitado a ese bucket. Guardar el Access Key ID y el Secret Access Key (el secreto se ve una sola vez).
3. Configurar el CORS del bucket (Settings → CORS policy):

   ```json
   [{"AllowedOrigins":["https://crm.hospeda.com.ar","http://localhost:5173"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["Content-Type"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
   ```

   Staging o un worktree que suba archivos agrega su propio origen a `AllowedOrigins`.
4. Cargar en Coolify `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET` y redesplegar. No versionar valores.

Sin esas variables el servidor arranca igual: la página «Material de venta» muestra «Almacenamiento no configurado», subir y abrir archivos responde 503, y los enlaces externos siguen funcionando. La CSP report-only suma el origen de R2 a `connect-src`, `img-src`, `media-src` y `frame-src` cuando las variables están cargadas (se lee al arrancar).

Un barrido interno corre cada 6 horas (y un minuto después de arrancar) y borra de R2 las subidas que quedaron pendientes más de `pendingUploadHours` (24 h por defecto, en `app_settings.crm_sales_material`). Usa un lock de Postgres, así que no hay doble barrido. `R2_ENDPOINT` existe solo para las pruebas (apunta a un R2 simulado); no se configura en producción.

Antes del deploy de F1: el propietario borra a mano sus materiales de prueba en Configuración → «Biblioteca» con la acción existente. Después del deploy la biblioteca vieja deja de mostrarse (sus filas quedan en la base, inertes) y `/library` redirige a `/sales-material`. Ningún agente borra filas de producción.

## Migraciones

El contenedor incluye `scripts/` y `migrations/`.

Ejecutar antes de poner tráfico real:

```bash
npm run db:migrate
```

La migración es idempotente mediante la tabla `schema_migrations`.

## Snapshot de Floot

Existe un snapshot cifrado AES-256-GCM creado el 30/09/2026.

Los valores del URL y la clave **no están versionados**.

Para la migración inicial, agregarlos temporalmente a la aplicación en Coolify:

```env
MIGRATION_DATA_URL=<encrypted snapshot URL>
MIGRATION_DATA_KEY=<AES-256 key in base64>
```

Con la base ya migrada (`npm run db:migrate`), abrir la terminal del contenedor y ejecutar:

```bash
node scripts/migrate-floot-snapshot.mjs
```

El comando descarga el snapshot cifrado, lo descifra **en memoria**, verifica SHA-256, importa los datos, ajusta secuencias y compara todos los conteos.

Después de un import correcto, eliminar `MIGRATION_DATA_URL` y `MIGRATION_DATA_KEY` de Coolify y redeployar.

Conteos esperados del snapshot:

| Tabla | Filas |
|---|---:|
| authorized_emails | 3 |
| crm_cities | 22 |
| crm_subtypes | 73 |
| crm_verticals | 6 |
| users | 3 |
| leads | 1600 |
| lead_notes | 3 |
| lead_journal | 1698 |
| message_templates | 31 |
| email_outbox | 0 |
| app_settings | 5 |

No se exportaron:

- `user_passwords`
- `sessions`
- `login_attempts`

Esto es intencional.

## Contraseñas después de migrar

Los registros de `users` sí se conservan para mantener:

- IDs
- roles
- asignaciones de leads

Al no existir una fila en `user_passwords`, el endpoint de registro permite que ese usuario autorizado defina una contraseña nueva. El ID y rol existentes se conservan.

Después de definir contraseña, el comportamiento vuelve a ser normal y un segundo intento de registro devuelve "email already in use".

## Validación posterior

Después del import:

```bash
npm run db:validate -- /tmp/migration-data.json
```

El proceso falla si cualquier tabla no coincide con el conteo del snapshot.

Después validar manualmente:

1. login / recuperación de los 3 usuarios;
2. listado de 1600 leads;
3. asignaciones Morena/Santiago;
4. filtros AND/OR;
5. notas y journal;
6. templates;
7. WhatsApp;
8. envío de un email de prueba por Brevo;
9. papelera/restauración;
10. Live Mode entre dos sesiones.

## Corte de Floot

No desactivar Floot hasta completar toda la validación.

Secuencia recomendada:

1. Coolify con rama `migration/floot-port`.
2. DB vacía + migraciones.
3. Import cifrado.
4. Validación.
5. Smoke tests manuales.
6. Merge a `main`.
7. Cambiar Coolify a `main`.
8. Confirmar producción estable.
9. Recién entonces retirar Floot.
