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

**Auto-deploy:** un push a `main` despliega producción solo (confirmado por el propietario el 30/10/2026, con el merge del #288). Mergear a `main` es desplegar: antes hay que tener las variables cargadas y un respaldo de la base. Los merges a `staging` no despliegan nada. Las migraciones pendientes corren al arrancar el contenedor (`scripts/migrate.mjs` en el `CMD` del `Dockerfile`).

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
BREVO_WEBHOOK_TOKEN=<random secret, minimum 32 characters; the Brevo transactional webhook sends it as a Bearer token>
BREVO_SMTP_HOST=<optional, default smtp-relay.brevo.com>
INSTAGRAM_ACCOUNT_USERNAME=<Hospeda Instagram username, e.g. hospeda.com.ar>
INSTAGRAM_APP_SECRET=<Meta app secret>
INSTAGRAM_VERIFY_TOKEN=<random secret, minimum 32 characters; same value as the Meta webhook verify token>
INSTAGRAM_ACCOUNT_ID=<Hospeda professional Instagram account id>
INTEGRATION_SECRETS_KEY=<base64 of exactly 32 random bytes: openssl rand -base64 32>
CRM_CLIENT_IP_HEADER=cf-connecting-ip  # production value; code default x-real-ip; allowed: x-real-ip, cf-connecting-ip, x-forwarded-for, none
SLOW_REQUEST_MS=<optional, default 1000>
DB_LOCK_TIMEOUT_MS=<optional, default 10000>
DB_POOL_MAX=<optional, default 10>
DB_STATEMENT_TIMEOUT_MS=<optional, default 30000>
BUSINESS_IMPORT_TOKEN_SHA256=<optional: SHA-256 of the business import API token; without it the import API is disabled>
BUSINESS_IMPORT_ACTOR_EMAIL=<optional, defaults to ADMIN_EMAIL>
```

No versionar valores reales.

Qué pasa cuando falta cada una, y los valores por defecto, está en el inventario de `docs/runbook-promocion-produccion.md` (sección 3.2). Solo `DATABASE_URL` y `JWT_SECRET` son obligatorias para arrancar; `PUBLIC_APP_URL` es de nivel «función» en el código pero en producción es efectivamente obligatoria (sin ella fallan los enlaces para compartir material y la recuperación de contraseña responde 503). No cargar `CRM_MCP_*`, `R2_ENDPOINT`, `CRM_TEST_DATABASE*`, `CRM_DEV_*`, `PERF_*`, `CRM_PERF_*` ni `CRM_STATE_PREFLIGHT*` en producción.

**Confirmado por el propietario (30/10/2026):** producción usa `CRM_CLIENT_IP_HEADER=cf-connecting-ip` (el dominio pasa por el proxy de Cloudflare). El valor por defecto del código, si no se define, es `x-real-ip`. La plantilla de producción del repo está al día con este inventario.

**Worker de email entrante (Cloudflare, despliegue aparte).** No usa Coolify: se despliega desde `workers/inbound-email/` con `wrangler`. Variables en `wrangler.toml`: `CRM_BASE_URL` (debe apuntar a producción) y `TRUSTED_AUTHSERV_ID`. Secrets de wrangler: `INBOUND_EMAIL_TOKEN` (el mismo valor que en Coolify) y `FORWARD_TO`.

Para habilitar «Responder» en emails recibidos, cargá `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY` y, opcionalmente, `BREVO_SMTP_PORT` en Coolify. La clave debe ser propia del CRM y revocable. Si falta el usuario o la clave, el servidor inicia igual y oculta la acción.

### Webhook de Brevo: entrega, aperturas y clicks (spec 93)

Sin este webhook los emails quedan en «Email aceptado por proveedor · entrega no confirmada» y no se ven aperturas ni clicks. Pasos del propietario, una sola vez y después del deploy (ningún agente los ejecuta):

1. Generar un secreto de 32 caracteres o más (`openssl rand -hex 32`), cargarlo en Coolify como `BREVO_WEBHOOK_TOKEN` y redesplegar. Sin la variable, o con menos de 32 caracteres, `POST /_api/brevo/events` responde 503.
2. Crear el webhook transaccional con autenticación Bearer. La API de Brevo la admite (`auth.type: "bearer"`); la pantalla de Brevo (Transactional → Settings → Webhook) puede no ofrecerla, así que conviene la API, con la API key de Hospeda y desde una máquina de confianza:

   ```bash
   curl -X POST https://api.brevo.com/v3/webhooks \
     -H "api-key: $BREVO_API_KEY" -H 'content-type: application/json' \
     -d '{"type":"transactional","channel":"email","description":"Hospeda CRM",
          "url":"https://crm.hospeda.com.ar/_api/brevo/events",
          "events":["delivered","opened","uniqueOpened","click","softBounce","hardBounce","blocked","spam","invalid","deferred","unsubscribed"],
          "auth":{"type":"bearer","token":"<BREVO_WEBHOOK_TOKEN>"}}'
   ```

   - No activar `batched`: un evento por pedido es el comportamiento por defecto y el CRM acepta hasta 100 eventos por pedido.
   - `sent`/`request` no hace falta. `error` no se suscribe por separado. Brevo documenta `proxy_open` / `unique_proxy_open` (aperturas por un servidor intermedio) pero no tienen valor de suscripción, así que *puede* enviarlos o no; el CRM las muestra como «Posible apertura automática».
   - Nombres que llegan en el campo `event`: `delivered`, `opened`, `unique_opened`, `proxy_open`, `unique_proxy_open`, `click` (URL en `link`), `soft_bounce`, `hard_bounce`, `blocked`, `spam`, `invalid_email`, `deferred`, `unsubscribed`, `error`, `request`. Fuente: documentación de Brevo «Transactional webhooks» y «Create a webhook».
3. Verificar: enviar desde el CRM un email a una casilla propia. En un minuto el ítem muestra «Entregado · <hora>»; al abrirlo aparece «Abierto». `GET https://api.brevo.com/v3/webhooks?type=transactional` lista el webhook. Abrirlo también desde Apple Mail (con la protección de privacidad activa) y mirar en los logs de Brevo si llega `proxy_open`: si nunca llega, «Posible apertura automática» no va a aparecer y esas aperturas pueden llegar como `opened`. En los logs de Brevo, un 401 indica que el token no coincide y un 503 que falta `BREVO_WEBHOOK_TOKEN` o es corto.
4. Rotar: cargar el nuevo token en Coolify, redesplegar y actualizar el webhook con `PUT https://api.brevo.com/v3/webhooks/<id>` y el nuevo `auth.token`. Hacerlo en un momento tranquilo: los eventos rechazados en el medio pueden no volver a llegar (Brevo no documenta reintentos).

Las aperturas, clicks y quejas de spam son informativas: no cambian el estado, no cuentan como contacto ni respuesta y no tocan tareas ni el último contacto.

### Material de venta en Cloudflare R2 (spec 89)

«Material de venta» guarda los archivos en un bucket privado de R2. El navegador sube directo a R2 con una URL firmada que emite el CRM; el archivo no pasa por el VPS (salvo portadas de hasta 1 MB). Pasos del propietario, una sola vez:

1. En Cloudflare → R2, crear un bucket **privado** (por ejemplo `hospeda-crm-material`). Sin dominio público ni `r2.dev`: las URL firmadas solo funcionan sobre el dominio S3 de R2 (`https://<account>.r2.cloudflarestorage.com`).
2. Crear un token de API de R2 con permiso **Object Read & Write** limitado a ese bucket. Guardar el Access Key ID y el Secret Access Key (el secreto se ve una sola vez).
3. Configurar el CORS del bucket (Settings → CORS policy):

   ```json
   [{"AllowedOrigins":["https://crm.hospeda.com.ar","http://localhost:5173"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["Content-Type","Range"],"ExposeHeaders":["ETag","Accept-Ranges","Content-Range","Content-Length"],"MaxAgeSeconds":3600}]
   ```

   Staging o un worktree que suba archivos agrega su propio origen a `AllowedOrigins`.

   `GET`, `Range` y los encabezados expuestos sirven para las portadas automáticas (spec 95): el navegador lee el archivo guardado (los PDF por rangos, con `pdf.js`) para dibujar la portada. Sin ellos la portada no se genera y la tarjeta muestra el dibujo del formato.
4. Cargar en Coolify `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET` y redesplegar. No versionar valores.

Sin esas variables el servidor arranca igual: la página «Material de venta» muestra «Almacenamiento no configurado», subir y abrir archivos responde 503, y los enlaces externos siguen funcionando. La CSP report-only suma el origen de R2 a `connect-src`, `img-src`, `media-src` y `frame-src` cuando las variables están cargadas (se lee al arrancar).

Un barrido interno corre cada 6 horas (y un minuto después de arrancar) y borra de R2 las subidas que quedaron pendientes más de `pendingUploadHours` (24 h por defecto, en `app_settings.crm_sales_material`). Usa un lock de Postgres, así que no hay doble barrido. `R2_ENDPOINT` existe solo para las pruebas (apunta a un R2 simulado); no se configura en producción.

Antes del deploy de F1: el propietario borra a mano sus materiales de prueba en Configuración → «Biblioteca» con la acción existente. Después del deploy la biblioteca vieja deja de mostrarse (sus filas quedan en la base, inertes) y `/library` redirige a `/sales-material`. Ningún agente borra filas de producción.

### Enlaces públicos `/m/<token>`: IP del cliente y Open Graph (spec 89)

- **`PUBLIC_APP_URL` es obligatoria** para las vistas previas: `og:url` y `og:image` se arman solo con ella. Si falta, la página omite `og:url` y `og:image` (nunca usa la cabecera `Host`, que controla quien pide).
- **`CRM_CLIENT_IP_HEADER`** define de dónde sale la IP del cliente para el límite de tasa de `/m/*` (300 pedidos por minuto por IP; 20 tokens inexistentes cada 10 minutos, que solo corta a quien adivina, nunca a un enlace válido). Una sola fuente, el resto de las cabeceras se ignora:

  | Valor | Fuente | Cuándo |
  | --- | --- | --- |
  | `x-real-ip` (por defecto) | `X-Real-IP`, que Traefik pisa con la dirección que vio | Coolify sin Cloudflare delante |
  | `cf-connecting-ip` | `CF-Connecting-IP` | **Solo** si el origen acepta tráfico únicamente de Cloudflare (firewall del VPS a los rangos de Cloudflare, o Tunnel). Si no, cualquiera puede falsificarla |
  | `x-forwarded-for` | el último elemento de `X-Forwarded-For` (el que agregó nuestro proxy) | Un solo proxy de confianza que agrega la IP al final |
  | `none` | la dirección del socket | Sin proxy, o si no se confía en ninguna cabecera |

  Si el dominio pasa por Cloudflare y no se usa `cf-connecting-ip`, `X-Real-IP` trae la IP de un nodo de Cloudflare: todos los clientes comparten el límite (el de 300 por minuto es generoso a propósito). Un valor desconocido vuelve al por defecto.

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
# Instagram Direct

Before enabling the webhook, apply `migrations/045_instagram_direct.sql` and configure `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, and `INTEGRATION_SECRETS_KEY` (base64-encoded 32 bytes). In Meta, use callback `https://crm.hospeda.com.ar/_api/inbound/instagram`, subscribe to `messages`, and enable the account-level subscription. Publish the app. Load the account token in Settings → Communication → Instagram; it is never shown again. The integration only receives messages; the CRM does not send messages to Meta. For the user script panel on Instagram (spec 97), apply `migrations/053_instagram_threads.sql` and set `INSTAGRAM_ACCOUNT_USERNAME` to Hospeda's Instagram username (for example `hospeda.com.ar`).
