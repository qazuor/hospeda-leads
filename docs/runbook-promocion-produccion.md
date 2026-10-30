# Runbook de promoción a producción (`staging` → `main`)

**Ejecutado el 30/10/2026** (PR #288, `staging` → `main`, merge commit `dfa9b33`): Coolify desplegó producción solo al mergear, y producción sirve el user script 1.7.0. Este documento sigue siendo el procedimiento reutilizable para las próximas promociones; los números de PR, migraciones y conteos de abajo describen el corte del 27/10 y hay que rehacerlos cada vez. Pendiente de verificar en producción: variables cargadas, migraciones aplicadas sin error y las pruebas funcionales del propietario.

Borrador original para revisión del propietario. Describe todo lo que hay en `staging` y no está en `main`, y los pasos para promoverlo y desplegarlo. **Este documento no autoriza nada**: la promoción, el deploy y cualquier operación sobre datos de producción necesitan la orden explícita del propietario en la conversación (ver `AGENTS.md`).

La sección 1 y las listas de migraciones describen el corte del 27/10/2026 (antes de las specs 94 a 98, promovidas el 30/10). Hechos tomados de git al 27/10/2026 sobre `origin/staging` = `5eedb32`, actualizado con la spec 90 (`92e65f5`) (CI verde en ese SHA según `gh run list`). Todo lo que no se pudo comprobar desde el repo está marcado **(verificar)**. Si `staging` avanza antes de promover (por ejemplo la spec 90, que a esta fecha no está mergeada), rehacer las secciones 1, 3.2 y 3.3 con `git log --first-parent origin/main..origin/staging` y `git diff --name-only origin/main origin/staging -- migrations/`.

## 1. Qué va a producción

177 merges/commits en la primera línea de historia entre `origin/main` y `origin/staging`. A la fecha del corte del 27/10, nada de esto estaba desplegado (`docs/estado-desarrollo.md`); se promovió el 30/10/2026. Agrupado por tema:

| Tema | PRs | Qué cambia para el usuario / operación |
|---|---|---|
| Modelo de estados de negocio y gestión, Comunicación, pulido visual | #99–#111 y commits directos posteriores en `staging` | Estados del negocio, flujos de gestión, secuencias retiradas, migraciones 018–023 |
| Rendimiento, seguridad y arquitectura | #114–#150 | Índices, pool, sesiones con vencimiento, cabeceras de seguridad, login sin enumeración, **`JWT_SECRET` obligatorio (#131)**, Docker sin root, migraciones 024–026 |
| Revisión de UX (U-01…U-37) y seguimientos | #151–#204 | Vocabulario, Hoy, ficha, búsqueda, No contactar, tarea de recontacto, migraciones 027–034 |
| Negocios: columnas y acciones | #205–#209, #211 | Columnas agrupadas, acciones con icono, Revisado editable |
| Modelos de mensajes | #212, #213 | Catálogo nuevo de 33 modelos, **migración 036 borra los modelos existentes** |
| Registro automático de canales (spec 83): email entrante, responder por SMTP | #214–#216, #218, #221–#224, #226, #228 | Emails recibidos, «Responder» en hilo, Worker de Cloudflare, migraciones 037, 038, 040 |
| User script de WhatsApp (spec 83 F3 y 1.2.0) | #219, #220, #227, #244 | Tokens, contexto, registro con confirmación, migraciones 039 y 041 |
| User script specs 84, 85, 86 | #246 (84 modelos), #248 (85 registro automático), #251 (86 insignias), #252 (cierre), #253 | Modelos desde WhatsApp, registro automático con anulación, insignias en la lista de chats, migración 042 |
| Rediseño visual v1 por fases | #230–#243, #245, #247, #250, #254, #255, #258, #259, #261, #264 | Sistema de diseño, shell, ficha, listas, Hoy, tablero, paneles, vistas fijadas, orden de columnas, página del script, topbar, encabezados con ayuda |
| Bandeja unificada | #249, #255 | Página `/inbox`, migración 043 |
| Spec 87 reglas comerciales | #256 (decisiones), #262 | Cerrar como Cliente exige acuerdo y persona; registrar respuesta completa tareas elegidas; migración 044 |
| Spec 88 Instagram Direct | #257 (spec), #260, #266 (cierre 87–88) | Webhook `POST/GET /_api/inbound/instagram`, token cifrado en base, migración 045 |
| Spec 89 Material de venta | #263 (spec), #265 (F1), #267 (F2) | R2, página `/sales-material`, enlaces públicos `/m/<token>`, retiro de la biblioteca vieja, migraciones 046 y 047 |
| Spec 90 Comunicación en la ficha | #268, #270 (cierre) | Conversación única en la pestaña Comunicación, títulos claros en Historial y «Último contacto», una regla Instagram/Red social; sin migraciones ni variables |
| Docs, tests, CI | #111, #133, #141, #149, #150, #181, #202, #210, #229 y otros | Sin efecto en producción |

Fuera de esta promoción (no mergeado a `staging` a esta fecha): F3/F4 de la spec 89 ya declaradas en `docs/pendientes.md` como siguientes **(verificar contra `pendientes.md` antes de promover)**.

## 2. Checklist previo

- [ ] El propietario pidió la promoción y dio el visto bueno en esta conversación. Hoy `pendientes.md` dice que falta su «terminamos» tras la revisión del rediseño (celular real, modo oscuro, vista de vendedor).
- [ ] CI de `staging` verde en el SHA exacto: `gh pr view <N> --json headRefOid,statusCheckRollup` sobre el PR de promoción, o `gh run list --branch staging --limit 3`. Fallidos o cancelados bloquean; omitidos están bien.
- [ ] **Respaldo completo de PostgreSQL**, verificado (SHA-256) y guardado fuera del VPS y fuera de Git, con una restauración comprobada en una base aislada. Es el único camino de vuelta para 022, 036 y 040 (sección 4). Ejemplo, desde un host con acceso: `pg_dump -Fc --no-owner --no-acl <DATABASE_URL> > crm-pre-promocion.dump` (formato custom, ver `docs/desarrollo-local.md`). No hay conexión de agente a producción: lo hace el propietario u operador.
- [ ] Estado de migraciones en producción. En `main` el árbol termina en `017`, pero `docs/rendimiento-y-arquitectura-2026-10.md` y `estado-desarrollo.md` indican que producción ya está en la `023` (se aplicaron 018–023 por el operador). **(verificar)** con una consulta de solo lectura: `SELECT name FROM schema_migrations ORDER BY name;`. El runner solo aplica lo que falta, así que la lista de la sección 3.3 es la candidata máxima y se recorta a lo no aplicado.
- [ ] Rol de migración con `CREATE` sobre la base (migración 032 ejecuta `CREATE EXTENSION IF NOT EXISTS pg_trgm`): `SELECT has_database_privilege(current_user, current_database(), 'CREATE');` debe dar `true`. Si no, crear la extensión antes con un rol administrador. Si 032 falla, la app no arranca (el contenedor corre migrar y arrancar).
- [ ] Ventana de poco tráfico. 026 toma `SHARE ROW EXCLUSIVE` por tabla sin `lock_timeout` a propósito; 032, 034, 043 y 046 crean índices GIN/B-tree sin `CONCURRENTLY` (las escrituras de cada tabla esperan mientras se construye el índice). Con ~1.600 negocios debería ser cuestión de segundos **(verificar con el volumen real)**.
- [ ] El propietario exportó o descartó a conciencia sus **modelos de mensajes** actuales (036 los borra) y borró a mano sus materiales de prueba en Configuración → «Biblioteca» (ver 3.5).
- [ ] **El merge a `main` ES el deploy.** Coolify despliega solo cada push a `main` (confirmado por el propietario el 30/10/2026, cuando el merge del #288 desplegó producción). Antes de mergear: variables de 3.2 cargadas en Coolify, respaldo de la base hecho y ventana elegida. `deploy-vps.yml` sigue siendo solo `workflow_dispatch` y no se dispara.
- [ ] Healthcheck de Coolify en `/_api/health/ready` (verifica la base). Informado por el propietario el 21/10/2026, no verificable desde el repo. **(verificar)**

## 3. Pasos, en orden

### 3.1 PR `staging` → `main`

Solo cuando el propietario lo pida. Abrir el PR con base `main`, cabeza `staging`, título con la etiqueta de trabajo que corresponda (por ejemplo `[NOSPEC:promote-staging] chore: promote staging to main`), cuerpo con el resumen de la sección 1, las migraciones de 3.3 y las variables de 3.2. Esperar CI verde en el head exacto y mergear sin `--admin`. No hacer push directo a `main`. **Este merge despliega producción** (Coolify auto-deploy sobre `main`): no mergear sin la orden explícita del propietario, las variables de 3.2 cargadas y el respaldo hecho.

### 3.2 Variables de entorno en Coolify, ANTES del deploy

Solo nombres; nunca valores en Git, PR, chat o logs. Inventario tomado del código en `dfa9b33`. Referencias: la plantilla de variables de la raíz del repo (su variante de producción está desactualizada, no usarla) y `docs/COOLIFY_DEPLOY.md`.

**OBLIGATORIAS (si faltan o son inválidas, el servidor no arranca)**

| Variable | Detalle |
|---|---|
| `DATABASE_URL` | La necesita también `scripts/migrate.mjs` al arrancar el contenedor |
| `JWT_SECRET` | 32 caracteres o más. Se rechazan valores con marcas de ejemplo (`change-me`, `example`, `placeholder`, `replace`, `your-secret`). Si la actual ya cumple, no tocarla (cambiarla cierra todas las sesiones); si hay que crearla: `openssl rand -hex 32` |

**POR FUNCIÓN (el servidor arranca, pero una función queda apagada)**

| Variable | Si falta o es inválida |
|---|---|
| `PUBLIC_APP_URL` (`https://crm.hospeda.com.ar`, exacto) | La recuperación de contraseña responde 503; la acción de Brevo en Ajustes falla; las páginas `/m/` pierden `og:url` y `og:image`; los enlaces para compartir material **lanzan error en producción**; el logo del email cae a localhost. En el código es de nivel «función», pero **en producción es efectivamente obligatoria** |
| `ADMIN_EMAIL` | Nadie recibe el rol admin al registrarse |
| `BREVO_API_KEY` | Falla el envío de emails y la recuperación de contraseña |
| `BREVO_WEBHOOK_TOKEN` (32+) | `POST /_api/brevo/events` responde 503; no hay eventos de entrega, apertura ni click |
| `INBOUND_EMAIL_TOKEN` (32+) | Email entrante apagado. El mismo valor es un secret del Worker de Cloudflare |
| `BREVO_SMTP_LOGIN` + `BREVO_SMTP_KEY` | Se oculta «Responder» por email (clave propia del CRM, revocable) |
| `INSTAGRAM_VERIFY_TOKEN` (32+) | La verificación del webhook de Meta responde 503. El mismo valor va en la Callback URL de Meta |
| `INSTAGRAM_APP_SECRET`, `INSTAGRAM_ACCOUNT_ID` | El webhook de Instagram responde 503; no hay confirmación automática por eco |
| `INTEGRATION_SECRETS_KEY` (base64 de exactamente 32 bytes: `openssl rand -base64 32`) | No se puede guardar ni renovar el token de Instagram; el log dice «Instagram integration disabled». Nueva para producción, no reutilizar la de pruebas; guardarla también en el gestor de secretos |
| `INSTAGRAM_ACCOUNT_USERNAME` (spec 97, @usuario normalizado) | El panel de Instagram del script no puede aprender ni pegar; el vendedor ve «Falta configurar la cuenta de Instagram de Hospeda…» |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | El ID de cuenta debe cumplir `^[A-Za-z0-9-]+$` y el bucket `^[a-z0-9][a-z0-9.-]{1,62}$`. Si falta alguna o está mal formada: Material de venta muestra «Almacenamiento no configurado» y subir responde 503; los enlaces externos siguen funcionando. Ver 3.5, «Material de venta (spec 89), Cloudflare R2» |
| `BUSINESS_IMPORT_TOKEN_SHA256` | API de importación de negocios deshabilitada |

**OPCIONALES (con su valor por defecto)**

| Variable | Por defecto |
|---|---|
| `NODE_ENV` | `production`, lo fija el `Dockerfile` |
| `PORT` | `3001` |
| `BREVO_SMTP_PORT` | `587` |
| `BREVO_SMTP_HOST` | `smtp-relay.brevo.com` |
| `CRM_CLIENT_IP_HEADER` | `x-real-ip` (producción carga `cf-connecting-ip`); permitidos: `x-real-ip`, `cf-connecting-ip`, `x-forwarded-for`, `none` (ver `COOLIFY_DEPLOY.md`; `cf-connecting-ip` solo si el origen acepta únicamente tráfico de Cloudflare) |
| `SLOW_REQUEST_MS` | `1000` |
| `DB_LOCK_TIMEOUT_MS` | `10000` |
| `DB_POOL_MAX` | `10` |
| `DB_STATEMENT_TIMEOUT_MS` | `30000` |
| `BUSINESS_IMPORT_ACTOR_EMAIL` | el valor de `ADMIN_EMAIL` |

**NO cargar en producción**

- `CRM_MCP_*`: el MCP está deshabilitado.
- `R2_ENDPOINT`, `CRM_TEST_DATABASE*`, `CRM_DEV_*`, `PERF_*`, `CRM_PERF_*`, `CRM_STATE_PREFLIGHT*`.
- `MIGRATION_DATA_URL` / `MIGRATION_DATA_KEY`: solo para el importador de una única vez; si siguen cargadas, quitarlas.

**Lo que no es una variable de entorno**

- `USERSCRIPT_MIN_VERSION` es una constante del código (`1.5.0`).
- El interruptor global del registro automático del script es la fila `crm_userscript_auto_register` de `app_settings` (por defecto encendido), más un interruptor por usuario.
- `USERSCRIPT_CRM_BASE_URL` existe solo al construir; el `Dockerfile` no tiene `ARG` para ella, así que el build de producción usa el valor por defecto `https://crm.hospeda.com.ar`.

### 3.3 Migraciones

El contenedor las aplica solo al arrancar: `node scripts/migrate.mjs && exec node dist-server/index.js` (`Dockerfile`). Cada archivo corre en su propia transacción y se registra con checksum en `schema_migrations`; si uno falla, ese archivo se revierte, las anteriores quedan aplicadas y **el contenedor no arranca**. No hay paso manual de migración salvo que el propietario decida correrlas antes (`npm run db:migrate` con `DATABASE_URL` de producción, solo con su orden). Las migraciones son inmutables una vez aplicadas.

`git diff --name-only origin/main origin/staging -- migrations/` da 018–047 (30 archivos). Impacto leído del SQL:

| # | Qué hace | Tipo / bloqueo |
|---|---|---|
| 018 | Columnas de estado del negocio en `crm_accounts` (`status`, `recontact_at`, `referred_to_leandro`) | Aditiva |
| 019 | Columnas de gestión, tabla de motivos, etapas y motivos nuevos, `UPDATE crm_accounts SET is_client`, triggers y guardas | Aditiva + escribe `is_client` en todos los negocios |
| 020 | **Aborta** si hay gestiones vivas con etapa faltante, inactiva o sin clasificar. Rellena `status` y `recontact_at` en los negocios con `status` nulo, luego `NOT NULL` y 2 índices | Reescribe datos; revisar el preflight antes |
| 021 | Trigger de journal del estado del negocio | Aditiva |
| 022 | **Borra** datos de secuencias asistidas (el propietario confirmó que eran de prueba) y elimina `crm_sequence_runs` y columnas de `crm_messages`. Aborta ante referencias independientes | **Destructiva, sin vuelta**. `pnpm run db:preflight:communication-sequences` con base local antes (según `pendientes.md`) |
| 023 | Reemplaza la función/trigger del indicador de cliente (archivo) | Reemplazo de lógica |
| 024 | 4 índices parciales, borra `leads_nombre_idx` | Índices sin `CONCURRENTLY` |
| 025 | `UPDATE sessions` de vencimiento | Reescribe todas las sesiones |
| 026 | Reenlaza ~37 triggers de versión en vivo | `SHARE ROW EXCLUSIVE` por tabla, sin `lock_timeout` |
| 027 | Cambia constraints de resultado en `crm_tasks` y `crm_activities`, agrega `continuation_reason`, valida | Recorre ambas tablas |
| 028 | Guarda en `app_settings` el instante desde el que se rastrea «Anotá cómo salió» | En producción, el momento de aplicarla |
| 029–031 | Índices (eventos de pipeline, primeros pasos/usuarios, No contactar) | Índices sin `CONCURRENTLY` |
| 032 | `CREATE EXTENSION pg_trgm` + 4 índices GIN de búsqueda | Requiere privilegio; bloquea escrituras mientras indexa |
| 033 | Índice parcial de tareas hechas por día | Índice |
| 034 | 2 índices GIN de búsqueda (`leads`, origen) | Índice |
| 035 | Columna `purpose` en modelos | Aditiva |
| 036 | **`DELETE FROM message_templates`** y de la clave `crm_message_variables`; inserta 33 modelos y sus versiones | **Destructiva sobre modelos editados**; los mensajes enviados conservan su texto |
| 037 | Tabla `crm_inbound_messages`, constraint del journal, triggers | Aditiva |
| 038 | Columnas de hilo en `email_outbox`; corrige `headers`/`attachments` guardados como string | Aditiva + `UPDATE` sobre inbound |
| 039 | `crm_userscript_tokens`, `crm_messages.external_id` + índice único | Aditiva |
| 040 | Desenvuelve metadata guardada como string en `crm_commercial_journal` (solo `account_updated` y `business_assignment_rebalanced`); idempotente | **Escribe datos de producción** |
| 041 | `last_version` en tokens del script | Aditiva |
| 042 | `users.userscript_auto_register` (por defecto `true` por vendedor) y `_since`, `crm_auto_registrations`, constraints de estado | Aditiva + cambia constraints |
| 043 | 5 índices GIN para la Bandeja | Índices sin `CONCURRENTLY` |
| 044 | `crm_messages.delegated_task_id` + índice | Aditiva |
| 045 | Origen `instagram_webhook`, `is_outgoing`, `instagram_igsid`, tablas `crm_instagram_contacts` y `crm_integration_secrets`, índice en `crm_accounts` | Aditiva + índice |
| 046 | Tablas de Material de venta y clave `crm_sales_material` en ajustes. No toca `crm_documents` ni borra nada | Aditiva |
| 047 | Cambia triggers de auditoría/live de los envíos de material | Reemplazo de triggers |

Comprobación posterior: tras desplegar, `SELECT count(*) FROM schema_migrations;` y comparar con el esperado **(verificar)**.

### 3.4 Deploy en Coolify

No hay paso manual de deploy: el merge de 3.1 lo dispara (Coolify auto-deploy sobre `main`).

1. Antes del merge: variables de 3.2 cargadas y guardadas, respaldo hecho, ventana elegida.
2. Después del merge, abrir en Coolify el despliegue de la aplicación y seguir su log de build y de arranque **(verificar nombre actual de la app y la rama configurada)**. No disparar `deploy-vps.yml` desde un agente.
3. En el log del contenedor deben aparecer `Applied 0NN_...` por cada migración nueva y luego el servidor escuchando en `3001`. Cualquier error de migración detiene el arranque (ver sección 4).
4. Esperar a que `/_api/health/ready` responda OK antes de dar tráfico.

### 3.5 Configuración externa posterior al deploy

**Instagram Direct (spec 88).** Aplicar solo con 045 y las 4 variables cargadas.
1. En Meta (app ya creada y publicada): Callback URL `https://crm.hospeda.com.ar/_api/inbound/instagram` y verify token igual a `INSTAGRAM_VERIFY_TOKEN` de producción. Meta hace un `GET` de verificación: debe responder `hub.challenge`.
2. Suscribir el campo `messages` y activar la suscripción de la cuenta («Webhook subscription»).
3. Confirmar que las URLs de política de privacidad y de eliminación de datos cargadas en la app son las definitivas de Hospeda (spec 88 sección 7). **(verificar cuáles son; el repo no las define)**
4. En el CRM, un admin carga el token de la cuenta en Configuración → «Integraciones» → Instagram (`pendientes.md` lo ubica ahí; el texto en inglés de esa misma página dice «Settings → Communication → Instagram» y `settings.tsx` monta el componente cerca de la sección de Comunicación **(verificar la ruta en la pantalla)**). El token se guarda cifrado y no vuelve a mostrarse; no se valida contra Meta al guardarlo.
5. Solo recibe mensajes; el CRM no envía nada a Meta.

**Material de venta (spec 89), Cloudflare R2.** Pasos del propietario, detalle y JSON de CORS en `docs/COOLIFY_DEPLOY.md`:
1. Crear bucket **privado** (por ejemplo `hospeda-crm-material`), sin dominio público ni `r2.dev`.
2. Token de API «Object Read & Write» limitado a ese bucket.
3. CORS del bucket con origen `https://crm.hospeda.com.ar` y métodos `PUT, GET, HEAD`.
4. Cargar las 4 variables `R2_*` y **redesplegar** (se leen al arrancar; la CSP también suma el origen de R2 al arrancar).
5. Verificar con R2 real los overrides `response-content-*` y la subida firmada con `Content-Length` (`pendientes.md` lo marca pendiente).
6. Antes del deploy: el propietario borra a mano sus materiales de prueba en Configuración → «Biblioteca». Después del deploy la biblioteca vieja deja de mostrarse (filas inertes) y `/library` redirige a `/sales-material`.
7. `CRM_CLIENT_IP_HEADER`: producción usa `cf-connecting-ip` (el dominio pasa por Cloudflare; confirmado el 30/10/2026).

**Email entrante (spec 83 F1/F2).**
1. `INBOUND_EMAIL_TOKEN` en Coolify y el mismo valor como secret del Worker.
2. Desde `workers/inbound-email/`: `npx wrangler secret put INBOUND_EMAIL_TOKEN`, `npx wrangler secret put FORWARD_TO`, `npx wrangler deploy`. Confirmar que `CRM_BASE_URL` de `wrangler.toml` apunta a producción **(verificar)** y `TRUSTED_AUTHSERV_ID = mx.cloudflare.net`.
3. En Cloudflare Email Routing: catch-all de `hospeda.com.ar` y reglas de vendedores hacia el Worker `hospeda-inbound-email`. Hoy el catch-all debería estar en «Send to an email» tras las pruebas locales **(verificar estado actual)**.
4. «Responder»: `BREVO_SMTP_LOGIN`/`BREVO_SMTP_KEY` cargadas; falta verificar con envío real el hilo en Gmail y Outlook y el seguimiento/`List-Unsubscribe` de Brevo en respuestas 1 a 1 (`pendientes.md`).

**User script de WhatsApp (specs 83 F3, 84, 85, 86).**
1. El script se construye con `npm run build` y se sirve desde `/userscripts/hospeda-crm.user.js`; en git está en `1.2.0`, igual que `USERSCRIPT_MIN_VERSION`. Los scripts 1.1.x quedan bloqueados (HTTP 426) hasta actualizar, con aviso dentro de WhatsApp. **No hay un paso de «publicar» aparte**: la versión que sirve producción es la del build desplegado. `pendientes.md` dice «publicar una versión nueva (git sigue en 1.2.0)»: si el propietario quiere subir de versión antes de promover, es un cambio en `userscript/src/version.ts` por PR a `staging`. **Decisión del propietario.**
2. Cada vendedor instala/actualiza desde CRM → «User script de WhatsApp» (`/userscript`) y crea su token ahí.
3. El registro automático (spec 85) **arranca apagado** globalmente (`crm_userscript_auto_register` = `{enabled:false}` por defecto). Un admin lo enciende en Ajustes cuando decida. El interruptor de cada vendedor arranca encendido (migración 042), pero no hace nada mientras el global esté apagado.

### 3.6 Pruebas de humo por funcionalidad

Con un usuario admin y un vendedor. «OK» es el criterio de cada fila.

| Qué | Dónde | OK |
|---|---|---|
| Servidor | `https://crm.hospeda.com.ar/_api/health` y `/_api/health/ready` | Responde 200 (`ready` verifica la base). Sin errores 500 en el log |
| Login y sesiones | `/login` con admin y vendedor | Entra; el vendedor ve solo lo suyo. Un usuario sin contraseña conserva su flujo de registro |
| Datos intactos | `/accounts` | Mismo total de negocios que antes del deploy (≈1.600 según `COOLIFY_DEPLOY.md`; comparar con el conteo previo **(verificar)**). Filtros, búsqueda con y sin tildes (ñ ≠ n) |
| Estados y gestiones (018–023) | `/accounts/:id`, `/opportunities` | Cada negocio tiene estado; los ya trabajados no volvieron a «Nuevo» |
| Rediseño y vistas | Hoy (`/my-day`), tablero, ficha, vistas fijadas, orden de columnas, celular y modo oscuro | Sin pantalla rota; las vistas guardadas se conservan |
| Bandeja (043) | `/inbox` | Lista conversaciones, buscar por texto sin tildes funciona |
| Modelos (036) | Configuración → «Modelos de mensajes», `/templates` | 33 modelos (11 × Email, WhatsApp, Instagram); la firma del email al pie del diseño |
| Email entrante | Mandar un email de prueba a una casilla de vendedor | Aparece en la ficha del negocio asociado o en `/inbound` (Sin asociar); sigue reenviándose a Gmail |
| Responder por SMTP | «Responder» en un email recibido (con claves SMTP) | Se envía y Gmail lo agrupa en el mismo hilo. Sin claves, la acción no aparece |
| User script | `/userscript` | Muestra si el script instalado está al día; token creado; en WhatsApp Web el panel carga el contexto de un chat de prueba |
| Registro automático | Ajustes (interruptor global apagado) | Un registro automático responde 409 `global_disabled`; con el global encendido por el admin y un chat con un único negocio y gestión abierta se registra y se puede anular con motivo |
| Instagram | Meta → «Probar» el webhook; mensaje real a la cuenta | El `GET` de verificación pasa; el mensaje aparece en la Bandeja (asociado por usuario o Sin asociar); firma inválida responde 401 |
| Reglas comerciales (87) | Cerrar una gestión como Cliente | Pide acuerdo y persona aceptante; registrar respuesta permite elegir tareas a completar |
| Material de venta (89) | `/sales-material`, subir un archivo, abrirlo, generar un enlace `/m/<token>` | Sube directo a R2, vista previa OK, el enlace público abre y la vista previa social usa `PUBLIC_APP_URL`; `/library` redirige. Sin R2: «Almacenamiento no configurado» |
| Historial / metadata (040) | Historial de un negocio con edición en lote previa | Se muestra el detalle sin errores |

## 4. Rollback y qué hacer si algo falla

Lo que se puede y no se puede revertir:

- **Código:** Coolify permite volver a desplegar la imagen/commit anterior. **Con migraciones aplicadas, el código viejo contra el esquema nuevo puede romperse** (constraints de 027 y 042, `crm_messages` sin `run_id` por 022, estados nuevos). Probarlo en una copia antes de apostar a eso. **(verificar)**
- **Migraciones:** hacia adelante solamente. No hay migraciones `down` y editar un archivo aplicado rompe su checksum. Corregir = nueva migración numerada (048 en adelante).
- **Datos:** 022 (secuencias), 036 (modelos), 025 (sesiones) y 040 (metadata de journal) escriben o borran datos. La vuelta es el respaldo del checklist, restaurado en una base aislada y comparado antes de usarlo. **Nunca restaurar un dump completo encima de producción para recuperar pocos campos** (`decisiones.md`); recuperar selectivamente con un procedimiento revisado (`docs/business-metadata-recovery.md` como modelo).
- **Config externa:** Meta, R2, Worker y Email Routing se deshacen en sus paneles (quitar la suscripción del webhook, devolver el catch-all a «Send to an email», retirar las variables `R2_*`).

Si falla un paso:

| Síntoma | Acción |
|---|---|
| La app no arranca y el log dice `JWT_SECRET must be set...` | Corregir `JWT_SECRET` en Coolify (32+ caracteres, no un valor de ejemplo) y redesplegar. No hay efecto en la base |
| Una migración falla y el contenedor sale | Ese archivo se revirtió entero. Leer el error, no tocar `schema_migrations` a mano. 020 y 022 abortan a propósito si hay datos fuera de lo esperado: revisar su condición con consultas de solo lectura y decidir con el propietario. 032: ver privilegio de `CREATE` / `pg_trgm`. Si hace falta volver, redeploy de la versión anterior (con la advertencia de arriba) |
| Una migración queda esperando | Probable bloqueo por tráfico (026, índices). Esperar o cortar el tráfico; no matar la sesión de migración sin criterio |
| Todo arranca pero una función falla (Instagram, R2, email) | Son opcionales: quitar o corregir la variable, redesplegar. Sin variables el servidor arranca y la función se muestra deshabilitada |
| Los vendedores no pueden registrar con el script | Versión 1.1.x (426): actualizar desde `/userscript`. Registro automático global apagado es lo esperado |
| Datos incorrectos tras el deploy | Detener escrituras, conservar evidencia, no correr cleanups ni importadores heredados; evaluar recuperación selectiva con el propietario |

Después de un deploy estable: actualizar `docs/estado-desarrollo.md` y `docs/pendientes.md` con el PR, las pruebas que corrieron y el estado real («desplegado» solo con evidencia de Coolify o confirmación del propietario) y hacer el back-merge `main` → `staging` si hubo merge commit.

## 5. Pendientes que bloquean o necesitan decisión del propietario

| # | Tema | Qué falta | Fuente |
|---|---|---|---|
| 1 | Visto bueno del rediseño | «Terminamos» del propietario tras revisar celular real, modo oscuro y vista de vendedor | `pendientes.md` (Rediseño visual); memoria del proyecto |
| 2 | Bucket R2, token y CORS | No creados según `pendientes.md` (infra del propietario). Sin eso, Material de venta muestra «Almacenamiento no configurado». No bloquea el arranque | `COOLIFY_DEPLOY.md`, spec 89 sección 14, `pendientes.md` |
| 3 | Verificar R2 real | Overrides `response-content-*` y subida firmada con `Content-Length` sin probar con R2 real | `pendientes.md` (Material de venta) |
| 4 | Clave SMTP de Brevo | Generar la clave propia del CRM y probar el hilo en Gmail y Outlook; confirmar que Brevo permite desactivar seguimiento y `List-Unsubscribe` en respuestas 1 a 1 | `pendientes.md` (F2 de la spec 83) |
| 5 | Resolución de «email incierto» con webhook de Brevo | Falta verificar con un envío real que el webhook resuelva solo las respuestas por SMTP | `pendientes.md` (decisiones tras F3) |
| 6 | Instagram | Secreto de la app, ID de cuenta, token de producción y URLs de privacidad/eliminación de datos definitivas; el token no se valida al guardarlo | `pendientes.md` (Specs 87 y 88), spec 88 sección 7 |
| 7 | Versión del user script | Decidir si se sube de `1.2.0` antes de promover y comunicar que 1.1.x queda bloqueado | `pendientes.md` (specs 84–86), `userscript/src/version.ts` |
| 8 | Selectores de WhatsApp | Fixtures sintéticos aún sin reemplazar por capturas reales en todos los casos; Firefox declarado compatible pero no probado | `pendientes.md` (F3) |
| 9 | Modelos de mensajes | Confirmar que se acepta perder los modelos actuales (036) y exportarlos antes si hace falta | `estado-desarrollo.md` (#213), migración 036 |
| 10 | Estado real de migraciones 018–023 en producción | Ver checklist; confirmar con `schema_migrations` | `estado-desarrollo.md`, `rendimiento-y-arquitectura-2026-10.md` |
| 11 | Auto-deploy de Coolify | **Resuelto el 30/10/2026**: el merge a `main` despliega solo (confirmado con el #288) | `AGENTS.md`, `COOLIFY_DEPLOY.md` |
| 12 | Cloudflare Email Routing y Worker | Deploy del Worker, alta del catch-all y `CRM_BASE_URL` a producción | `pendientes.md` (F1), `workers/inbound-email/README.md` |
| 13 | Siguientes fases de 89 | No mergeadas; decidir si entran en esta promoción o en la siguiente | `pendientes.md` |
