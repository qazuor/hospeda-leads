# Spec 89 — Material de venta

Estado: aprobada por el propietario — 26/10/2026. Decisiones D1–D9 y las cuatro confirmaciones de §17 resueltas.

## 1. Problema

Los vendedores necesitan mostrar y mandar a los clientes fotos, PDF, videos, audios y presentaciones de Hospeda. Hoy eso vive en la «Biblioteca» y no alcanza:

- **Almacenamiento:** los archivos se guardan en Postgres como base64 (`crm_document_versions.file_data`), con un tope de 2 MB (`app_settings.crm_communication.maxDocumentBytes` y `CHECK byte_size BETWEEN 1 AND 2097152`). Un video o un PDF pesado no entra, y cada archivo agranda la base y sus backups.
- **Tipos:** solo PDF, PNG, JPEG y TXT, con verificación de firma en `insertVersion` (`src/helpers/resourceService.ts`).
- **Subida:** el archivo viaja en el JSON de `POST /_api/resources` (límite de cuerpo de 3 MB en `src/server/bodyLimit.ts`).
- **Envío:** «Vincular» un recurso a un negocio (`crm_document_links`) no lo manda. No hay forma de mandarle al cliente un enlace ni un adjunto, ni de saber qué material recibió.
- **Una sola categoría** por documento (`crm_documents.category_id`) y un flujo borrador/aprobado que no se usa para material de venta.

## 2. Estado actual (verificado en código)

- **Tablas** (`migrations/010_communication_resources.sql`): `crm_document_categories`, `crm_documents` (`library=true` para la biblioteca, `false` para adjuntos de negocio, incluidos los `adjunto` históricos de `leads.archivo_adjunto`), `crm_document_versions`, `crm_document_links`. Auditoría con el trigger `crm_audit_resource` (journal `crm_resource_journal`, sin `file_data`) y live version `bump_crm_live_domain('communication')` (migración 026).
- **API:** `src/endpoints/resources.ts` (`get`, `post`, `download`) y `resources.schema.ts`; servicio `src/helpers/resourceService.ts` (`mutateResource`, `documentFor`). Rutas registradas en `src/server/app.ts` (no en `index.ts`, como dice `AGENTS.md`; ver Key Learnings).
- **UI:** `src/pages/library.tsx` («Materiales para ofrecer»), `ResourcesPanel` en Configuración → «Biblioteca» (`settings.tsx`, sección `library`, `manageLibrary`), en la ficha del negocio (`CommercialPanel`, pestaña «documentos») y en `LeadDetailDialog`. Paleta de comandos: «Biblioteca comercial» (`AppCommandPalette.tsx`). Guía: `src/content/user-guide.json`.
- **Búsqueda** (`src/endpoints/search.ts`): grupo «Archivos» sobre `crm_documents`, con `'/library'` para las filas de biblioteca.
- **Modelos de mensajes:** `message_templates` (+ `crm_message_template_versions`), editados en Configuración → «Modelos de mensajes» (`TemplatesContent`, `RichTemplateEditor`). Los modelos del user script (spec 84) **son los mismos** `message_templates` con `channel='whatsapp'`: `GET /_api/userscript/templates` los lista y `POST /_api/userscript/prepare` llama a `mutateCommunication({action:'prepare'})`. Variables `{{clave}}` con la regex `/{{([a-zA-Z0-9_]+)}}/` (`renderMessageTemplate.tsx`); `unresolvedTemplateVariables` usa la misma forma.
- **Envío:** `mutateCommunication` (`src/helpers/communicationService.ts`): `prepare`/`prepare_general` crean un borrador en `crm_messages`, `edit` lo cambia, `dispatch` hace:
  - WhatsApp: `whatsapp_opened` y devuelve una URL `wa.me` con el texto (no adjunta nada);
  - email: fila en `email_outbox` y `POST https://api.brevo.com/v3/smtp/email` **sin `attachment`** hoy.
  - Antes valida `assertAccountContactAllowed` (papelera, No contactar, archivado, gestión cerrada, restricciones por canal y persona).
- **Seguridad HTTP** (`src/server/security.ts`): CSP en modo report-only con `connect-src 'self'` e `img-src 'self' data: blob:`; `X-Frame-Options: DENY`; guardia de origen en POST `/_api/*`.
- **Migraciones:** la última en `staging` es `043_inbox_indexes.sql`. Hay ramas con `044_delegated_messages.sql` y `045_instagram_direct.sql`, así que esta spec usa **`046_sales_material.sql`** (a verificar al implementar: tomar el siguiente número libre en `staging`).
- **Dependencias:** no hay cliente S3 ni R2 en `package.json`.

## 3. Decisiones (propietario, 26/10/2026)

**D1. Nombre.** «Material de venta» reemplaza «Documentos», «Biblioteca» y «Materiales para ofrecer» en menús, Configuración, paleta de comandos, búsqueda y guía. Los adjuntos de un negocio siguen llamándose «Archivos del negocio».

**D2. Contenido.** El admin sube archivos (imágenes, PDF, video, audio, documentos de Office) o registra URLs externas. Cada material tiene:
- título, una o **más** categorías y un comentario (descripción);
- tipo **entregable** (se puede mandar a clientes) o **interno** (información solo para vendedores). El servidor lo impone: un interno nunca se comparte, ni desde el composer ni desde modelos;
- versiones: un archivo nuevo es una versión nueva y se conservan las anteriores;
- portada opcional para las vistas previas, que sube el admin. En una imagen, la portada por defecto es la imagen misma.

**D3. Vendedores.** Ven todos los materiales (filtros por categoría, tipo y búsqueda), los abren y los descargan. No crean, editan ni archivan: eso es solo del admin.

**D4. Almacenamiento en Cloudflare R2.**
- La subida va **directo del navegador a R2** con una URL PUT prefirmada que emite nuestra API. El archivo no pasa por el VPS.
- Límite de 500 MB por archivo y lista blanca de tipos MIME (§6.3).
- Ver y descargar usan URLs GET prefirmadas de vida corta, emitidas después de chequear permisos.
- Variables nuevas: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (§14.1). Nunca se versionan valores.
- **Dependencia nueva, a confirmar por el propietario** (§6.1).

**D5. Arranque de cero.**
- Tablas nuevas. No se reutilizan las filas de `crm_documents`.
- Las filas viejas de biblioteca (`crm_documents.library=true`) dejan de mostrarse y quedan inertes. **Ninguna migración borra filas de producción.**
- El propietario borra sus subidas de prueba desde la UI de admin actual **antes** del deploy (runbook en §14.3).
- Los adjuntos de negocio (`library=false`, incluido el `archivo_adjunto` histórico) no se tocan.

**D6. Envío a clientes por enlace propio.**
- Siempre `https://crm.hospeda.com.ar/m/<token>`, con **un token por envío** (por destinatario y mensaje), revocable de a uno.
- El enlace no vence y siempre muestra la versión **actual**. Si el admin archiva el material, la página dice «Este material ya no está disponible».
- La ficha del negocio registra qué material y qué versión se mandó, quién, cuándo, por qué canal y en qué mensaje.

**D7. Página pública `/m/<token>`.**
- HTML servido por nuestro servidor, sin login.
- Open Graph (`og:title`, `og:description`, `og:image`) para que WhatsApp y otras apps armen la vista previa.
- Para personas, muestra el material (imagen, visor de PDF, video, audio o botón a la URL externa) y un botón «Descargar».
- La URL real del archivo es una URL prefirmada de R2 de vida corta, usada solo como `src` o destino de descarga. La barra de direcciones queda en nuestro dominio.
- Los bots de vista previa no cuentan como apertura. **Una apertura no es evidencia** de contacto, respuesta ni aceptación: si se registra algo, es un «registro técnico de acceso», nunca «el cliente lo vio».
- Límite de tasa, `noindex`, tokens de 128 bits o más, sin enumeración. Un interno no se alcanza ni con un token forjado.

**D8. Email.**
- El enlace va siempre en el cuerpo.
- En materiales con archivo hay un checkbox opcional por material, «Adjuntar el archivo», deshabilitado con motivo si el archivo supera el límite de Brevo (§8.3).
- Se registra qué se adjuntó.
- WhatsApp: solo enlace, porque `wa.me` no adjunta.

**D9. Modelos.**
- Al editar modelos del CRM y del user script (que son los mismos, §2), el editor inserta materiales entregables desde un selector.
- El modelo guarda una referencia `{{material:<uuid>}}`, que se muestra con el título, nunca una URL.
- Al usar el modelo, cada referencia se resuelve en un token **nuevo** por envío. Un modelo de email puede dejar premarcado «Adjuntar el archivo».
- Si un material referenciado está archivado o pasó a interno, el editor avisa y el composer no lo manda, con un mensaje claro.
- El user script resuelve las referencias por la API, con autenticación, permisos y No contactar.

**Categorías.** Lista administrada por el admin: crear, renombrar y desactivar en Configuración, y crear una nueva desde el formulario del material. Un material puede tener varias.

**Etiquetas.** Ninguna por ahora. Una futura función genérica de etiquetas por usuario cubrirá esto. Consideración de diseño: esas etiquetas serían personales (cada vendedor las suyas), así que no deben mezclarse con las categorías, que son del equipo.

## 4. Modelo de datos: `migrations/046_sales_material.sql`

Todas las tablas nuevas llevan `resource_audit` (`crm_audit_resource`) y `resource_live` (`bump_crm_live_domain('communication')`), como `crm_documents`. Excepción: `crm_sales_material_uploads` lleva solo `resource_audit`; es contabilidad de subidas, no estado de la UI, y no debe invalidar las pantallas abiertas.

- **`crm_sales_material_categories`:**
  - `id bigserial PK`, `name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 100)`, `active boolean NOT NULL DEFAULT true`, `created_at`, `updated_at`;
  - `UNIQUE INDEX ON (lower(btrim(name)))`.
- **`crm_sales_materials`:**
  - `id uuid PK`, `title text NOT NULL CHECK(length BETWEEN 3 AND 200)`, `description text NOT NULL DEFAULT '' CHECK(length <= 4000)`;
  - `kind text NOT NULL CHECK(kind IN ('deliverable','internal'))`, `source text NOT NULL CHECK(source IN ('file','url'))`;
  - `status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived'))`, `archived_at`, `archived_by_email`;
  - `current_version integer` (NULL hasta la primera versión completa), `revision integer NOT NULL DEFAULT 1` (control de concurrencia, como `crm_messages.revision`);
  - portada: `cover_key text`, `cover_mime text`, `cover_bytes integer CHECK(cover_bytes <= 1048576)`;
  - `created_by_email`, `created_at`, `updated_at`;
  - índices: `(status, updated_at DESC)` y uno de búsqueda compatible con `searchSql` sobre título y descripción (a verificar cuál usa hoy `search.ts`).
- **`crm_sales_material_category_links`:** `material_id uuid FK`, `category_id bigint FK`, `PRIMARY KEY(material_id, category_id)`, índice `(category_id)`.
- **`crm_sales_material_versions`:**
  - `id uuid PK`, `material_id uuid NOT NULL FK`, `version integer NOT NULL`, `UNIQUE(material_id, version)`;
  - `url text`, `object_key text UNIQUE`, `CHECK((url IS NULL) <> (object_key IS NULL))`;
  - `file_name text`, `mime_type text`, `byte_size bigint CHECK(byte_size BETWEEN 1 AND 524288000)`, `etag text`;
  - `actor_email`, `created_at`.
- **`crm_sales_material_uploads`** (subidas pendientes y limpieza):
  - `id uuid PK`, `object_key text NOT NULL UNIQUE`, `purpose text CHECK(purpose IN ('file','cover'))`, `material_id uuid NULL`;
  - `declared_mime`, `declared_bytes`, `file_name`, `actor_email`;
  - `status text CHECK(status IN ('pending','deleting','completed','discarded'))` (`deleting` lo fija el barrido mientras borra en R2, fuera de toda transacción), `claimed_at`, `created_at`, `expires_at`, `completed_at`, `deleted_at`;
  - índice `(status, expires_at) WHERE status='pending'`.
- **`crm_sales_material_shares`** (un envío):
  - `id uuid PK`, `token_hash text NOT NULL UNIQUE` (sha256 del token; el token en claro solo queda en el cuerpo del mensaje enviado);
  - `material_id uuid NOT NULL FK`;
  - `account_id`, `original_account_id`, `lead_id NULL`, `contact_id NULL`, con las mismas FK que `crm_messages`;
  - `message_id uuid NULL FK crm_messages ON DELETE SET NULL`, `channel text NOT NULL CHECK(channel IN ('email','whatsapp'))`;
  - `prepared_version integer`, `sent_version integer` (se fija cuando el mensaje sale del borrador);
  - `attach boolean NOT NULL DEFAULT false`, `attached_version integer` (lo que efectivamente se adjuntó en Brevo);
  - `created_by_email`, `created_at`, `revoked_at`, `revoked_by_email`, `revoke_reason text CHECK(length BETWEEN 3 AND 500)`;
  - registro técnico (propuesta, a confirmar): `technical_access_count integer DEFAULT 0` y `last_technical_access_at`, sin IP ni user agent;
  - índices: `(account_id, created_at DESC)`, `(message_id)`, `(material_id)`.
- **Ajustes:** `app_settings` clave `crm_sales_material`, con `{"maxUploadBytes":524288000,"maxEmailAttachmentBytes":<a verificar §8.3>,"pendingUploadHours":24}`. Se crea con `ON CONFLICT DO NOTHING`.
- **Lo que la migración no hace:** no lee, migra ni borra `crm_documents`, no cambia `crm_communication.maxDocumentBytes` y no corre limpiezas.

## 5. API

Patrón de pares: `src/endpoints/salesMaterials.schema.ts` (Zod, tipos y funciones fetch) y `src/endpoints/salesMaterials.ts` (`get`, `post`, `uploadUrl`, `file`, `revokeShare`), con lógica en `src/helpers/salesMaterialService.ts` y R2 en `src/helpers/r2.ts`. Las rutas se registran en `src/server/app.ts` antes de `applyStaticFallback`. Errores con `crmError` y la misma tabla de estados que `resources.ts` (401, 403, 409).

| Endpoint | Entrada → salida | Permiso |
| --- | --- | --- |
| `GET /_api/sales_materials` | `search`, `categoryId`, `kind`, `includeArchived` → `{materials[], categories[], limits}`. Cada material lleva sus categorías, la versión actual (sin `object_key`) y `hasCover` | Cualquier usuario autenticado. `includeArchived` y versiones anteriores, solo admin |
| `POST /_api/sales_materials` | Unión discriminada por `action`: `create`, `update` (título, descripción, tipo, `categoryIds`, `revision`), `version` (`uploadId` o `url`, `revision`), `cover` (`uploadId` o `null`, `revision`), `archive`, `restore`, `category_create`, `category_update` | Solo admin |
| `POST /_api/sales_materials/upload_url` | `{purpose, fileName, mimeType, byteSize, materialId?}` → `{uploadId, putUrl, headers:{'Content-Type'}, expiresAt}` | Solo admin |
| `GET /_api/sales_materials/file` | `versionId`, `disposition=inline\|attachment` → 302 a GET prefirmado (5 min; 6 h para audio y video), `Cache-Control: no-store` | Cualquier autenticado: ver material no da acceso a nada más |
| `POST /_api/sales_materials/share_revoke` | `{shareId, reason}` → `{ok}` | Admin, el autor del envío o quien tenga escritura sobre el negocio (`assertAccountWritable`) |

- **`create`** recibe `id` (uuid del cliente, idempotente como `resources`), `source` y la primera versión (`uploadId` o `url`).
- **URLs externas:** solo `https:` sin credenciales, como `insertVersion`.
- **`version` con `uploadId`:**
  - toma el upload `pending` del mismo admin, sin vencer;
  - hace `HEAD` en R2: el objeto existe, `Content-Length` coincide con `declared_bytes` y es ≤ `maxUploadBytes`, y `Content-Type` coincide;
  - lee los primeros 16 bytes con un GET de rango y verifica la firma del tipo (PDF `%PDF-`, PNG, JPEG, ZIP `PK` para Office moderno, `ftyp` para MP4/M4A, `ID3` o frame sync para MP3, etc.);
  - si algo falla, borra el objeto, marca `discarded` y devuelve un error claro;
  - si está bien: inserta la versión, sube `current_version` y `revision` y marca el upload `completed`, todo en una transacción con `setWorkActor`.
- **Cambiar `kind` a `internal`:** se permite. Todos los enlaces existentes muestran «no disponible» desde ese momento (§7). La UI lo advierte antes de guardar.
- **Composer:** acciones nuevas en `communicationMutation` (§8).
- **User script:** endpoints en §9.
- **Búsqueda:** `search.ts` deja de devolver filas de `crm_documents` con `library=true` y suma el grupo «Material de venta», con URL `/sales-material?material=<id>`, visible para todo usuario autenticado.

## 6. Integración con R2

### 6.1 Cliente (dependencia a confirmar)

1. **`aws4fetch`:**
   - qué es: firma SigV4 sobre `fetch`;
   - a favor: unos KB y sin dependencias; lo usa la documentación de R2 para prefirmar (`signQuery: true`, `allHeaders: true` para firmar `Content-Type`). Alcanza para todo lo que necesitamos: prefirmar PUT y GET, `HEAD`, GET de rango y `DELETE`;
   - en contra: sin helpers de multipart ni de paginación de `ListObjectsV2`. No hacen falta, porque la limpieza usa la tabla de uploads y no lista el bucket.
2. **`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`:**
   - a favor: oficial, tipado completo, multipart si algún día se suben archivos de más de 5 GB;
   - en contra: decenas de paquetes transitivos y un bundle de servidor mucho más grande (tsup).

- **Recomendación: 1 (`aws4fetch`).** Un PUT simple soporta hasta 5 GB en R2, así que 500 MB no requiere multipart. Agregar la dependencia necesita OK del propietario.

### 6.2 Configuración

- `src/helpers/r2.ts` lee `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET` de `process.env`, con el endpoint `https://<account>.r2.cloudflarestorage.com`.
- **Sin variables:** el servidor arranca igual. Material de venta muestra «Almacenamiento no configurado», `upload_url` y `file` responden 503, y la página pública muestra «no disponible». Mismo criterio que `BREVO_SMTP_*`.
- **Token de R2:** «Object Read & Write» limitado a ese bucket.
- **Bucket privado:** sin dominio público ni `r2.dev`. Las URL prefirmadas solo funcionan sobre el dominio S3 de R2, no sobre dominios propios.

### 6.3 Subida

- **Claves:**
  - archivos: `materials/<materialId>/v<n>-<uuid>.<ext>`;
  - portadas: `covers/<materialId>/<uuid>.<ext>`;
  - el `uuid` evita sobrescribir. Si el material todavía no existe, se usa el `id` que generó el cliente para `create`.
- **PUT prefirmado:** vence en 30 minutos y firma `Content-Type`. El navegador sube con `XMLHttpRequest` para mostrar el progreso y permitir cancelar.
- **Lista blanca:**
  - imágenes: `image/jpeg`, `image/png`, `image/webp`, `image/gif`;
  - `application/pdf`;
  - video: `video/mp4`, `video/webm`, `video/quicktime`;
  - audio: `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`;
  - Office: `docx`, `xlsx`, `pptx` (sus MIME de OpenXML), `application/msword`, `application/vnd.ms-excel`, `application/vnd.ms-powerpoint`;
  - extensión y MIME tienen que coincidir.
- **Portadas:** solo imágenes, de hasta 1 MB. Para imágenes y PDF, la UI propone generarla en el navegador (canvas a JPEG de 1200×630, y para PDF la primera página con el `pdf.js` que ya se usa para miniaturas). El admin la puede reemplazar.
- **CORS del bucket:**
  ```json
  [{"AllowedOrigins":["https://crm.hospeda.com.ar","http://localhost:5173"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["Content-Type"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
  ```
  Staging o los worktrees agregan su origen si suben archivos.
- **CSP:** sumar el origen `https://<account>.r2.cloudflarestorage.com` a `connect-src`, `img-src`, `media-src` y `frame-src` de `CSP_REPORT_ONLY`. Hoy es report-only, así que no bloquea, pero tiene que quedar correcta para cuando se aplique.

### 6.4 Lectura, versiones y limpieza

- **GET prefirmado:**
  - vence en 5 minutos (6 horas para audio y video, para que la reproducción y el avance sigan andando);
  - usa `response-content-disposition` (`inline` o `attachment; filename*=UTF-8''<nombre>`) y `response-content-type`. A verificar que R2 respete esos parámetros en URLs prefirmadas;
  - como un video o un audio vuelve a pedir rangos al adelantar, el `src` siempre apunta a nuestra ruta (`/_api/sales_materials/file` o `/m/<token>/file`), que redirige a una URL prefirmada nueva en cada pedido.
- **Versiones:** se conservan todos los objetos. Archivar no borra nada en R2.
- **Uploads abandonados:**
  - un barrido cada 6 horas, con `pg_try_advisory_lock` y un temporizador interno como el de la spec 88 (a verificar si ya está en `staging` para reutilizarlo);
  - toma los `pending` con `expires_at` (creación + `pendingUploadHours`) vencido, hace `DELETE` en R2 (un 404 cuenta como borrado) y los marca `discarded`.
- **Sin borrado definitivo** de materiales en esta spec: solo archivar.

## 7. Página pública `/m/<token>`

- **Rutas** en `app.ts`, fuera de `/_api`, antes del fallback del SPA:
  - `GET /m/:token`: página HTML;
  - `GET /m/:token/file`: 302 a un GET prefirmado inline;
  - `GET /m/:token/download`: 302 a un GET prefirmado como adjunto;
  - `GET /m/:token/cover`: la portada.
- **Token:**
  - 32 bytes aleatorios en base64url (256 bits), validados con `/^[A-Za-z0-9_-]{43}$/` antes de tocar la base;
  - búsqueda por `sha256`;
  - token inválido o inexistente: 404 con la página genérica «Este enlace no es válido», igual en tiempo y contenido para cualquier token desconocido.
- **Qué se muestra:**

  | Caso | Respuesta |
  | --- | --- |
  | Token revocado | 410, «Este enlace ya no está disponible» |
  | Material archivado, `kind='internal'` o sin versión actual | 410, «Este material ya no está disponible». Un interno nunca se sirve, aunque el token exista |
  | Imagen | `<img src="/m/<t>/file">` |
  | PDF | `<iframe src="/m/<t>/file">` en escritorio, más el botón «Abrir PDF». Android Chrome no muestra PDF embebidos: ahí se ve la portada y «Abrir PDF», que termina en el dominio de R2 (limitación aceptada) |
  | Video y audio | `<video controls preload="metadata">` y `<audio controls>` |
  | Office | Portada, nombre, tamaño y «Descargar» |
  | URL externa | Portada y descripción, y un botón «Abrir» con `rel="noopener noreferrer"`. No redirige solo, para no perder la vista previa ni hacer de open redirect |

  Siempre se muestran el título, la descripción, «Descargar» (si es archivo) y el logo de Hospeda. No se muestran el negocio, el vendedor ni datos internos.
- **Open Graph:**
  - `og:title` = título, `og:description` = descripción recortada a 200 caracteres, `og:type=website`, `og:url` = la URL del token;
  - `og:image` = `<PUBLIC_APP_URL>/m/<t>/cover`, más `twitter:card=summary_large_image`;
  - portada: la portada del material; si no tiene y es una imagen de hasta 1 MB, la imagen misma; si no, `/hospeda-logo.jpg`;
  - `/cover` sirve la portada **a través de nuestro servidor** (hasta 1 MB, con `Cache-Control: public, max-age=3600`). Así los rastreadores no dependen de seguir un 302 a una URL que vence. Es la única excepción a «el archivo no pasa por el VPS», y se limita a portadas chicas. A confirmar con el propietario.
  - A verificar en la prueba real: tamaño máximo de imagen que acepta WhatsApp para la vista previa, y que solo el primer enlace de un mensaje arma vista previa.
- **Bots:** se detectan por user agent (`WhatsApp`, `facebookexternalhit`, `Facebot`, `Twitterbot`, `Slackbot`, `TelegramBot`, `LinkedInBot`, `Discordbot`, `Googlebot`, `bingbot`, `SkypeUriPreview`, `Applebot` y genéricos `bot|crawler|spider|preview`), con el patrón en un helper con tests. Los bots y los `HEAD` reciben el mismo HTML pero no suman al registro técnico.
- **Registro técnico:**
  - si se confirma, suma `technical_access_count` y `last_technical_access_at` solo en `GET /m/:token` de no bots, como mucho una vez cada 10 minutos por token;
  - la ficha lo muestra como «Accesos técnicos al enlace: N (último …)», con la ayuda «No confirma que el cliente lo haya visto»;
  - nunca cambia etapas, tareas, respuestas ni estados de mensaje.
- **Cabeceras:**
  - `X-Robots-Tag: noindex, nofollow, noarchive` y `<meta name="robots" content="noindex">`;
  - `Cache-Control: no-store` en el HTML y en los 302;
  - `Referrer-Policy: no-referrer`, para que el token no viaje a R2 ni a URLs externas;
  - CSP propia que se aplica (no report-only): `default-src 'none'; img-src 'self' <r2>; media-src 'self' <r2>; frame-src 'self' <r2>; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`. La página no usa JavaScript.
- **Límite de tasa:**
  - en memoria, por IP: 300 pedidos por minuto en `/m/*` (generoso a propósito: IP compartidas, solo corta ruido), y 20 tokens inexistentes cada 10 minutos (después responde 429 **solo a los tokens que no resuelven**: un enlace válido nunca se bloquea);
  - el mapa tiene tope (10.000 entradas, se descartan las más viejas) y no hace barridos completos;
  - la IP sale de una sola fuente configurable con `CRM_CLIENT_IP_HEADER` (`x-real-ip` por defecto, `cf-connecting-ip`, `x-forwarded-for` último salto, `none`); ver `docs/COOLIFY_DEPLOY.md`;
  - `/m/<token>/` y un `.`, `,` o `)` pegados al final por un autoenlazador redirigen (308) a `/m/<token>`; los tokens siempre terminan en un carácter alfanumérico;
  - `og:url` y `og:image` salen solo de `PUBLIC_APP_URL` (sin ella se omiten, nunca se usa `Host`).
- **Móvil:** HTML de una columna, `viewport`, estilos inline mínimos con los tokens de color de `base.css` copiados como constantes, y botones de 44 px.
- **Plantilla:** `src/server/materialPage.ts`, que escapa todo valor con un helper (título y descripción son texto del admin).

## 8. Composer y email

### 8.1 Acciones nuevas en `communicationMutation`

- **`material_add`** `{id, revision, materialId, attach:boolean}`, sobre un borrador propio:
  1. valida `kind='deliverable'`, `status='active'` y versión actual;
  2. vuelve a chequear `assertAccountContactAllowed` con el canal del mensaje;
  3. crea el share (token nuevo y `prepared_version`);
  4. agrega al cuerpo `«<título>: <url>»` (WhatsApp) o un párrafo con el enlace (email);
  5. sube `revision`.
  `attach` solo vale en email y en materiales con archivo dentro del límite (§8.3).
- **`material_remove`** `{id, revision, shareId}`: revoca el share con el motivo «Quitado del borrador» y saca el enlace del cuerpo.
- **`material_attach`** `{id, revision, shareId, attach}`: cambia el checkbox.
- **Al resolver modelos** (`prepare`, `prepare_general`): cada `{{material:<uuid>}}` pasa por `material_add` internamente.
  - Las referencias inválidas (archivado, interno, inexistente) se quitan del texto y la respuesta trae `materialWarnings: [{materialId, title, reason}]`. El composer las muestra y el script también.
  - El borrador reutilizado (`reusedDraft`) conserva sus shares.
- **Al cancelar** (`cancel_draft` o `discardDraft`): se revocan los shares del borrador. El enlace nunca salió.
- **Al pasar el borrador a `whatsapp_opened` o `submitting`** en `dispatch`, dentro de la misma transacción del claim:
  - vuelve a validar cada share (activo, entregable y no revocado);
  - si alguno dejó de ser válido, responde 409 «El material X ya no está disponible. Quitalo del mensaje.» y no envía;
  - si están todos bien, fija `sent_version` y deja constancia en `communicationJournal` (`materials: [{materialId, version, attach}]`).
- **`manual_not_sent`** no revoca: el texto pudo haber quedado en el chat. El vendedor puede revocar a mano.

### 8.2 UI del composer

- En `MessageComposer` (lo usan `ContactTemplateDialog`, `GeneralMessageStep` y `TaskContactDialog`), un botón «Agregar material de venta» abre un selector con búsqueda, filtro por categoría, solo entregables activos y miniatura.
- Lista de materiales incluidos, con «Quitar» y, en email, «Adjuntar el archivo» (deshabilitado con el motivo «Supera el límite de adjuntos de email (X MB)» o «Es un enlace externo»).
- **Ficha del negocio:** la acción «Enviar material» en la pestaña de Comunicación abre «Contactar» con el material ya agregado. No hay shares sin mensaje.

### 8.3 Adjuntar en Brevo

- **En `dispatch` de email:** para cada share con `attach=true`, se agrega `attachment: [{url: <GET prefirmado de 1 h>, name: <file_name>}]` al POST a `/v3/smtp/email`. Brevo descarga el archivo desde R2, así que no pasa por el VPS. Al aceptar, se fija `attached_version`.
- **Límite:** Brevo admite adjuntos por `url` o `content` base64. La documentación (`developers.brevo.com`, «Send a transactional email», consultada el 27/10/2026) **no publica el tope de tamaño**: `maxEmailAttachmentBytes` arranca en 10 MB (configurable) y la suma de adjuntos de un mensaje no puede superarlo.
- **Extensiones:** Brevo solo adjunta una lista cerrada (xlsx, xls, ods, docx, docm, doc, csv, pdf, txt, gif, jpg, jpeg, png, tif, tiff, rtf, bmp, cgm, css, shtml, html, htm, zip, xml, ppt, pptx, tar, ez, ics, mobi, msg, pub, eps, odt, mp3, m4a, m4v, wma, ogg, flac, wav, aif, aifc, aiff, mp4, mov, avi, mkv, mpeg, mpg, wmv, pkpass, xlsm). Vive en una sola constante (`BREVO_ATTACHMENT_EXTENSIONS`, `src/helpers/salesMaterialMessage.ts`). Un archivo con otra extensión (por ejemplo webp o webm) o sin nombre no se puede adjuntar: va solo el enlace, con el motivo «Brevo no adjunta este tipo de archivo». `dispatch` lo vuelve a comprobar y el nombre del adjunto es siempre el `file_name` de la versión.
- **Errores de Brevo:** antes de guardar el texto del rechazo en `email_outbox.last_error` o en el historial se quita la firma (`X-Amz-*`) de toda URL prefirmada.
- **Si Brevo rechaza por el adjunto:** el mensaje queda `failed` como hoy, sin reintento automático. El composer ofrece «Reintentar sin adjuntos», que crea un borrador nuevo con los mismos enlaces.

### 8.4 Registro en la ficha («Comunicación»)

- Cada mensaje muestra los materiales enviados: título, versión enviada, «adjunto» si corresponde, autor y fecha (los del mensaje), canal y estado del enlace (activo o revocado), más «Revocar enlace» con motivo.
- El estado del mensaje sigue siendo el de hoy: `whatsapp_opened` **no** significa enviado ni recibido.
- Endpoint de lectura: `GET /_api/communication` suma `materials[]` por mensaje. A verificar el punto exacto de la consulta en `communication.ts`.

## 9. Modelos y user script

- **Editor de modelos** (`RichTemplateEditor` y el campo de WhatsApp de `TemplatesContent`):
  - botón «Insertar material de venta» con el mismo selector;
  - inserta `{{material:<uuid>}}`, que el editor muestra como chip con el título (nodo atómico de TipTap en email y texto con chip en WhatsApp, a definir en la implementación);
  - en email, el chip tiene la opción «Adjuntar el archivo», guardada como `{{material:<uuid>:attach}}`.
- **Validación al guardar:** el servidor rechaza referencias a materiales inexistentes o internos. A verificar dónde se guardan hoy los modelos (`settings_save_POST.ts` u otro) y que la validación de variables no rechace la forma `material:`.
- **Aviso:** al abrir un modelo con referencias archivadas o internas, aparece «Este modelo incluye “X”, que ya no está disponible. No se va a enviar». La lista de modelos muestra un indicador.
- **Render:** las regex actuales (`{{([a-zA-Z0-9_]+)}}`) no tocan `{{material:…}}`. El reemplazo lo hace `prepare` en el servidor antes de devolver el cuerpo, así que el script recibe el texto final con los enlaces sin cambios en `GET /_api/userscript/templates`.
- **User script** (`userscript/src/compose.ts`, `api.ts`):
  - `POST /_api/userscript/prepare` ya devuelve el cuerpo con los enlaces y suma `materialWarnings`, que el panel muestra;
  - nuevo `GET /_api/userscript/materials?accountId=<id>`: entregables activos (id, título, categorías, tipo de archivo) si el negocio no está `blocked`, con la misma autenticación Bearer `hcu_…`, control de versión 426 y lógica de `blocked` que `templates`;
  - nuevo `POST /_api/userscript/material_add` `{messageId, revision, materialId}`: solo mensajes de WhatsApp (como `scriptWhatsapp`), llama a `material_add` con el usuario del token y devuelve `{revision, body}`. Mismo tratamiento de origen que `/_api/userscript/prepare`;
  - en la vista «Mandar un mensaje», un botón «Agregar material» después de elegir el modelo. La vista previa se actualiza y «Pegar en el chat» pega el texto con los enlaces;
  - subir la versión del script y anunciarla, según el mecanismo de PR #244.

## 10. Permisos y No contactar

- **Admin:** crea, edita, versiona, archiva, cambia portadas y administra categorías. Todo se valida en el servicio, no solo en la UI.
- **Vendedor:** lista, ve y descarga. Ver un material no da acceso a ningún negocio.
- **Crear un share** (composer, modelos, script) exige, igual que `prepare`:
  - acceso de escritura a la gestión o al negocio;
  - `assertAccountContactAllowed` para el canal y la persona (papelera, archivado, No contactar, restricciones, gestión cerrada);
  - material entregable y activo;
  - se vuelve a chequear en `dispatch`.
- **Revocar:** admin, autor o quien tenga escritura sobre el negocio. Cada revocación queda en el journal con el motivo.
- **No contactar después de un envío:** no revoca los enlaces ya enviados (el cliente ya los tiene). Impide los envíos nuevos.

## 11. Casos borde

- **Doble clic en subir o en crear:** `id` idempotente con `pg_advisory_xact_lock`, como `resources`. Un upload solo se completa una vez.
- **Dos admins editando:** `revision` desajustada responde 409 «La versión cambió».
- **Subida cortada o pestaña cerrada:** queda `pending` y el barrido la borra. La UI muestra error y «Reintentar», que pide una URL nueva sin perder lo cargado.
- **Material de URL externa:** sin adjunto. La página pública muestra el botón «Abrir».
- **Cambio de versión entre preparar y enviar:** se registra `sent_version` al despachar, y el enlace muestra siempre la actual.
- **Material restaurado:** sus enlaces vuelven a funcionar. **Pasado de interno a entregable:** también.
- **Negocio fusionado:** los shares conservan `original_account_id`. A verificar que la fusión mueva `account_id` como en `crm_messages`.
- **Cuerpo editado por el vendedor que borra el enlace a mano:** el share sigue activo. Al despachar, si la URL del share no está en el cuerpo, se revoca con «Quitado del texto» y no se registra como enviado.
- **R2 caído:** `file` y `/m/*/file` responden 503 con una página simple. La subida muestra el error, y el resto del CRM sigue funcionando.

## 12. UI

- **Admin: recomendación, una página propia `/sales-material` con modo de administración** (botones de crear y editar visibles solo para admin), en lugar de una sección en Configuración. Ve la misma lista que el vendedor y no duplica componentes.
  - En Configuración queda solo «Categorías de material».
  - La sección `library` de Configuración se elimina, y `/library` redirige a `/sales-material`.
  - Alternativa: sección «Material de venta» en Configuración, como hoy, con el costo de duplicar la vista.
- **Página «Material de venta»:**
  - grilla de tarjetas con portada, título, categorías, tipo («Entregable» o «Interno», con badge) y formato;
  - filtros por categoría (varias), tipo y búsqueda (sin tildes, `searchText`);
  - el detalle abre un panel con vista previa (imagen, PDF, video y audio vía `/_api/sales_materials/file`), descripción, versiones (admin) y «Descargar»;
  - admin: «Nuevo material» (archivo o URL, título, categorías con creación al vuelo, descripción, tipo, portada), «Nueva versión», «Archivar» y «Restaurar», con barra de progreso, cancelar y bloqueo de doble envío.
- **Ficha del negocio:** la pestaña «Archivos del negocio» (`ResourcesPanel` con `accountId`) sigue igual, sin el filtro de biblioteca. Los envíos de material se ven en «Comunicación» (§8.4).
- **Cambios de nombre:** `library.tsx` (pasa a ser la página nueva), `settings.tsx` (sección `library`), `AppCommandPalette` («Biblioteca comercial»), `search.ts`, `user-guide.json`, menú y `PageHeader topic`.
- **Ocultar lo viejo:**
  - `GET /_api/resources` sin `accountId` deja de listar `library=true`;
  - `ResourcesPanel` pierde `manageLibrary`;
  - `POST /_api/resources` rechaza `create` con `library=true` y `link`, con el error «La biblioteca fue reemplazada por Material de venta»;
  - las filas quedan en la base.

## 13. Validación

- **Unitarias (Vitest):**
  - schemas Zod (acciones, lista blanca, tamaños);
  - firmas de archivo por tipo;
  - claves R2;
  - firma de URLs con `aws4fetch` (fecha fija);
  - generación y hash de tokens;
  - regex de bots;
  - render de la página pública: escape, OG, cada tipo, estados 404 y 410, sin datos internos;
  - resolución de `{{material:…}}`, incluido `:attach`;
  - selector, composer y editor de modelos con Testing Library.
- **Integración** (`scripts/test-sales-material.ts`, contra Postgres descartable migrado y sembrado; R2 simulado con un servidor HTTP local que implementa PUT, HEAD, GET de rango y DELETE, apuntado por una variable `R2_ENDPOINT` solo para tests):
  - admin crea, versiona, archiva y restaura; un vendedor recibe 403 en cada escritura;
  - upload con tamaño o tipo que no coincide: se descarta y se borra;
  - barrido de uploads pendientes con el lock tomado;
  - un interno no se comparte desde el composer, los modelos ni el script, y un token de un material que pasó a interno da 410;
  - `material_add` con No contactar, restricción de canal, papelera o gestión cerrada: 403;
  - `dispatch` con material archivado entre preparar y enviar: 409 y nada enviado;
  - email con adjunto (Brevo simulado, como en `test:communication`): el payload lleva `attachment.url` y se fija `attached_version`;
  - revocación: el token da 410;
  - el registro técnico no cuenta bots ni `HEAD`;
  - límite de tasa;
  - el journal registra cada acción;
  - la migración no toca `crm_documents`;
  - agregar el script a `.github/workflows/ci.yml` en el orden de los demás.
- **Navegador (Playwright):** admin sube un PDF chico (R2 simulado), un vendedor lo encuentra y lo agrega a un WhatsApp, y `/m/<token>` muestra el visor y el OG. Más una vista móvil de `/m/<token>`.
- **Prueba real (manual, con el bucket de staging):**
  - subir 400 MB de video;
  - vista previa en WhatsApp y en Telegram;
  - email con adjunto de 5 MB y otro sobre el límite;
  - PDF en Android e iOS.

## 14. Puesta en producción

### 14.1 Infra (propietario)

1. Crear el bucket R2 privado (por ejemplo `hospeda-crm-material`) y un token de API «Object Read & Write» limitado al bucket.
2. Configurar el CORS de §6.3.
3. Cargar en Coolify `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET`, y documentarlas en `docs/COOLIFY_DEPLOY.md` sin valores.

### 14.2 Deploy

- `npm run db:migrate` aplica `046_sales_material.sql`, que solo crea tablas y la clave de ajustes.
- El deploy es manual (`deploy-vps.yml` es `workflow_dispatch`). Un merge no es un deploy.

### 14.3 Runbook: subidas de prueba

- **Antes de desplegar F1:** el propietario entra a Configuración → «Biblioteca» y borra a mano sus materiales de prueba con la acción existente (`action:'delete'`, que marca `deleted_at`).
- **Ningún agente** borra ni modifica filas de producción, ni corre SQL de limpieza.
- Las filas que queden con `library=true` simplemente no se muestran.

## 15. Fases (cada una se mergea a `staging` por separado)

- **F1. Almacenamiento, modelo y admin:**
  - dependencia, `r2.ts`, migración 046, servicio y endpoints de §5 (sin shares);
  - página `/sales-material` con administración y categorías en Configuración;
  - barrido de uploads, CSP y documentación de Coolify;
  - ocultar la biblioteca vieja y renombrar en la UI.
- **F2. Vista del vendedor y página pública:**
  - filtros y vista previa;
  - `/m/<token>` completo (OG, bots, límites, estados), con shares que solo puede crear un endpoint de prueba en tests.
  - Queda listo para enlazar.
- **F3. Composer y email:**
  - `material_add`, `material_remove` y `material_attach`, validación en `dispatch` y adjunto en Brevo;
  - registro en «Comunicación», revocar, y «Enviar material» desde la ficha.
- **F4. Modelos y user script:**
  - referencias en el editor de modelos y resolución en `prepare`;
  - endpoints del script, UI del panel y nueva versión del script.

## 16. Fuera de alcance

- Etiquetas (función genérica por usuario, futura).
- Borrado definitivo de materiales u objetos R2, y migrar o borrar filas de `crm_documents`.
- Mover a R2 los adjuntos de negocio existentes.
- Estadísticas de apertura o «visto», y cualquier cambio de etapa o tarea a partir de un acceso.
- Enviar desde el CRM por Instagram u otros canales.
- Transcodificar video, generar miniaturas en el servidor (requeriría `sharp` u otra dependencia) o subidas de más de 500 MB o multipart.
- Vencimiento automático de enlaces.

## 17. A verificar o confirmar

- **Propietario (aprobado el 26/10/2026):**
  - dependencia `aws4fetch` (§6.1): sí;
  - portadas servidas a través del VPS (§7): sí;
  - registro técnico de accesos (§4 y §7): sí, solo contador y último acceso, sin bots y rotulado como técnico;
  - página propia `/sales-material` en lugar de Configuración (§12): sí.
- **Técnico:**
  - tope de tamaño de adjuntos de Brevo y que acepte `attachment.url` prefirmado (§8.3). La lista de extensiones ya está confirmada en la documentación (27/10/2026); conviene revisarla si Brevo la cambia;
  - que R2 respete `response-content-disposition` y `response-content-type` en GET prefirmados (§6.4);
  - tamaño de imagen OG que acepta WhatsApp, y que siga el `og:image` (§7);
  - cabecera de IP real detrás del proxy de Coolify (§7);
  - número de migración libre al implementar (§2);
  - dónde se guardan y validan hoy los modelos (§9);
  - si el temporizador interno de la spec 88 ya existe para reutilizarlo (§6.4);
  - cómo una fusión de negocios mueve `account_id` en tablas hijas (§11);
  - índice de búsqueda usado por `searchSql` (§4).
