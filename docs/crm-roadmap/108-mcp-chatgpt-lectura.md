# Spec 108 — MCP para ChatGPT: conexión estable y lectura amplia

Estado: **propuesta para revisión** (07/11/2026). Fase 1: estabilizar la conexión de ChatGPT y ampliar las herramientas de consulta del CRM. El MCP continúa siendo de solo lectura y requiere OAuth. No habilita acceso a vendedores en esta fase.

## Problema

La conexión MCP actual no se completó desde ChatGPT. El último error reportado fue «Origin not allowed», pero el servidor no registra el valor rechazado. La validación de Host/Origin corre sobre todos los subrutas —incluidos metadatos y OAuth— y puede bloquear el flujo antes de que ChatGPT llegue a `/mcp`. Además, la cuenta lectora no tenía permisos sobre las tres tablas de clasificaciones/vínculos usadas por la ficha; el 07/11 se corrigieron con autorización del propietario. El wrapper presenta cualquier falla de herramienta como «No se pudo consultar», por lo que faltaban grants y errores de entrada se veían iguales.

Las cinco herramientas actuales cubren resumen, lista, ficha, candidatos de duplicado e historial comercial. No hay búsqueda transversal completa, lectura dedicada de gestiones, agenda, comunicación, métricas ni catálogos. Esto limita las preguntas que ChatGPT puede responder sin exportar información manualmente.

## Objetivos y no objetivos

### Objetivos

1. Completar una conexión OAuth desde ChatGPT de forma repetible, con diagnóstico seguro para el propietario.
2. Añadir herramientas de lectura amplias, paginadas y con salidas JSON estables, basadas en las reglas vigentes del CRM.
3. Mantener todas las lecturas MCP en una conexión PostgreSQL de solo lectura y hacer visibles los grants faltantes.
4. Explicar claramente el bloqueo «No contactar» y respetar el ámbito de datos de contacto de la aplicación.
5. Consolidar en `docs/crm-mcp.md` los pasos para conectar, herramientas disponibles y diagnóstico.

### No objetivos

- Herramientas que escriban, cambien estados, creen tareas, registren resultados o preparen borradores. **Siguiente fase:** herramientas de escritura con confirmación explícita (crear tarea, registrar qué ocurrió y preparar un borrador; nunca enviar).
- Exponer MCP a vendedores o redefinir permisos de la aplicación.
- Sincronizar datos, importar/exportar en bloque o dejar que el modelo confirme duplicados, contactos, aceptación, pago o entrega.
- Elegir proveedor/modelo o sustituir la revisión pendiente de privacidad y retención para datos enviados a OpenAI.

## Hallazgos

Verificado en el worktree actual, rama `docs/spec-108-mcp`, y con el estado de producción comunicado por el coordinador el 07/11/2026. Código citado en esta rama.

1. `src/server/mcp/config.ts:2-11` requiere `CRM_MCP_ENABLED`, URL pública HTTPS, URL de DB lectora, client id/secret y secreto de tokens. La metadata actual declara PKCE S256, `resource` y `authorization_response_iss_parameter_supported` en `oauth.ts:12-15`.
2. `src/server/mcp/routes.ts:13-24` aplica Host/Origin a cada ruta MCP, permite solo el origen público y `https://chatgpt.com`, y habilita OPTIONS global. No deja registro del origen rechazado. `routes.ts:31-45` protege `/mcp` con Bearer, presenta `WWW-Authenticate` y registra cinco herramientas con `readOnlyHint`; `wrap` convierte cualquier error en un texto genérico (`:38`).
3. `src/server/mcp/oauth.ts:16-20,29-47,56-78` limita conexión y cada uso a admins activos en `authorized_emails`; guarda hashes de códigos/refresh, requiere consent y PKCE, access token de 1 h y refresh de 30 días. Authorization/token/revoke usan `helpers/db` principal; el MCP de datos usa el rol lector.
4. `src/server/mcp/data.ts:5-14` abre transacciones `REPEATABLE READ READ ONLY`, pone timeout de 5 s y rechaza roles con privilegios de escritura. `:17-30` lista/ficha; la búsqueda de lista solo usa `nombre ILIKE` (`:19`); detalle no excluye fusionados (`:25`) y devuelve `merged_into_id` sin una interpretación clara. `:32-58` contiene candidatos, resumen e historial.
5. `scripts/provision-mcp-reader.mjs:18-20` provisiona nueve tablas SELECT. `migrations/015_readonly_mcp.sql:1-13` crea únicamente credenciales OAuth. La spec 107 añadió grupos y la clasificación, y la cuenta lectora existente no recibió nuevos grants automáticamente.
6. `scripts/test-mcp.ts:23-33,57-80` prueba OAuth, paginación, roles, cinco herramientas, Origin malicioso y detección de UPDATE. No prueba preflight, grants incompletos con diagnóstico, ni trazas de Origin/OAuth.
7. `src/helpers/searchSql.ts:1-125` define búsqueda por tokens con acentos normalizados, distinción de ñ, teléfono e Instagram; `helpers/businessTable.ts:67-86` muestra fuentes de búsqueda de negocio. Reutilizar semántica, no la conexión `db` de esos helpers.
8. `helpers/businessManagement.ts:1-?` define etiquetas y etapas por tipo de gestión; `endpoints/work.ts:85-120` aplica visibilidad, filtros y orden de tareas/agenda; `endpoints/leads_stats_GET.ts:9-28` contiene conteos de negocio/gestión y fechas de Argentina. Consultar estos archivos al implementar para replicar reglas, no importar handlers que usan `db` primaria.
9. `helpers/crmPermissions.ts:14-19,44-52` restringe visibilidad a admin o responsable y evita que un vendedor vea negocios archivados o marcados «No contactar». `canEditBusinessContactData` (`:50-52`) delimita edición de contacto. `endpoints/work.ts:178-196,241` explicita el trato de DNC.
10. Producción: `CRM_MCP_ENABLED` y las cinco variables MCP están configuradas; `/.well-known/oauth-protected-resource/mcp` y `/.well-known/oauth-authorization-server` responden 200; `/mcp` sin token responde 401. `crm_mcp_credentials` tenía 0 filas: no se completó una conexión o no quedaron credenciales almacenadas. `crm_mcp_reader` carecía de SELECT en `crm_account_classifications`, `crm_account_seller_groups` y `crm_account_seller_group_members`; el propietario aprobó el GRANT el 07/11. Ahora tiene nueve tablas y cero privilegios distintos de SELECT.
11. El último bloqueo reportado fue «Origin not allowed». No se conoce el Origin real porque no se registraba. Documentación oficial de [autenticación de Apps SDK](https://developers.openai.com/apps-sdk/build/auth): protected resource metadata RFC 9728 con `resource` y `authorization_servers`; AS metadata con S256; CIMD (preferido), DCR o cliente predefinido; `resource` en autorización e intercambio de token para fijar audiencia; redirect `https://chatgpt.com/connector_platform_oauth_redirect` cuando se anuncia `authorization_response_iss_parameter_supported`; 401 con `WWW-Authenticate`; anotaciones de herramienta y `_meta["mcp/www_authenticate"]` para pedir re-vinculación.
12. La documentación está desfasada: `docs/crm-mcp.md` aún afirma que MCP no está habilitado en producción; `decisiones.md:426` dice que sí lo está; `pendientes.md:446-449` registra el GRANT de la spec 107 como pendiente aunque se aplicó el 07/11. `.env.example` conserva comentario «not enabled in production».

## Resumen de bloques

| Bloque | Alcance | Dependencia |
| --- | --- | --- |
| 1 | Conexión estable, OAuth, diagnósticos, logs | — |
| 2 | Política de permisos por usuario y tratamiento de contacto/DNC | 1 |
| 3 | Herramientas de lectura nuevas y ajustes a las existentes | 2, 4 |
| 4 | Grants, diagnóstico de esquema y límite de solo lectura | 3 |
| 5 | Integración, unitarios y regresiones MCP | 1–4 |
| 6 | Fuente de verdad documental y guía de producción | 1–5 |

Orden recomendado: 1 → 2 y 4 → 3 → 5 → 6. Se puede dividir en PRs pequeños a `staging`.

## 1. Conexión estable

### Reglas

- El middleware valida `Host` para todas las rutas MCP, contra el host fijo de `PUBLIC_APP_URL`; no confiar en `Forwarded` ni `X-Forwarded-Host`.
- Aplicar allowlist de `Origin` únicamente a `POST /mcp` (y OPTIONS de `/mcp`). Well-known y OAuth usan su protocolo/redirect/cliente; no se les debe exigir el origen del navegador ChatGPT. Mantener el chequeo same-origin de `POST /mcp/oauth/authorize` (consentimiento) y rechazar valores `Origin` no admitidos para MCP.
- Responder al preflight OPTIONS con métodos y headers mínimos requeridos, `Vary: Origin`, sin credenciales CORS. No responder `*`; no reflejar origins no permitidos.
- Registrar rechazos de Host/Origin con método, path, valor recibido y código corto, sin query string, tokens, cookies, email ni cuerpo. Registrar fallas OAuth con códigos acotados (`invalid_client`, `invalid_grant`, `invalid_request`, `admin_denied`, `db_error`), nunca secretos ni contenido de autorización.
- En fallos de herramienta devolver al modelo mensaje útil y seguro («No se pudo consultar; código X. Volvé a vincular o avisá al administrador»); adjuntar `_meta["mcp/www_authenticate"]` solo para credenciales expiradas/revocadas. En logs diferenciar `grant_missing`, `not_found`, `invalid_input`, `permission_denied`, `timeout` e `internal_error`.
- Agregar diagnóstico solo para administradores en Configuración: MCP habilitado, grants completos comparando lista requerida con grants efectivos, resultado de conexión/lectura, timestamp del último token exitoso. Nunca mostrar secreto, token ni URL de base con credenciales. No usar el diagnóstico para probar escrituras.

### Decisión D1 — registro del cliente ChatGPT

**Recomendación: A, cliente predefinido.** Ya está implementado y probado (`oauth.ts`, `scripts/test-mcp.ts`), y ChatGPT lo admite: el dueño pega `client_id` y `client_secret` una sola vez en la configuración avanzada de OAuth del conector. Es una sola cuenta (D2), así que el costo de configuración es mínimo. CIMD (B) queda como mejora posterior si ChatGPT deja de aceptar clientes predefinidos o si se suman más usuarios: requiere descargar y validar documentos de metadata externos. DCR (C) queda fuera por superficie (endpoint público de registro, persistencia y revocación de clientes).

Opciones: A) cliente predefinido (recomendada); B) CIMD, con allowlist del host de los documentos de metadata de ChatGPT, validación HTTPS y caché; C) DCR.

## 2. Permisos por usuario

### Decisión D2 — quién conecta

**Recomendación: solo admins autorizados**, igual que hoy. El propietario es el único usuario previsto para fase 1. Cada llamada vuelve a validar rol activo y allowlist. No relajar OAuth hasta implementar filtros de visibilidad equivalentes para todos los objetos del CRM.

Opciones: A) mantener admin-only (recomendada); B) habilitar vendedores con visibilidad CRM, usando reglas de `crmPermissions.ts` y `work.ts`. B exige revisar cada herramienta y no alcanza con filtrar por responsable del negocio: las gestiones y tareas tienen visibilidad propia.

### Datos sensibles y DNC

- Herramientas filtran por defecto fusionados, eliminados y archivados; permitir `includeArchived` solo a admin, con marca explícita. Negocio fusionado se devuelve como `found:false` y, si se incluye desde herramienta de gestión, referencia `mergedIntoId` sin exponer ficha duplicada.
- Todo resultado de negocio incluye `doNotContact: boolean` y `doNotContactReason` si existe. Descripción en español para el modelo: «No contactar» es una restricción vigente; no llamar, escribir, recomendar contacto ni inferir que hubo comunicación. Mostrar indicador y motivo sin neutralizarlo.
- Bajo D2, admin puede consultar datos de contacto que la aplicación permite a un administrador. Diseñar los mappers con `contactDataVisible(actor, account, hasOpenManagement)` equivalente a `canEditBusinessContactData`; no exponer campos personales sin motivo/permiso. Si luego se eligen vendedores, aplicar la función y omitir contacto cuando no corresponda.
- Historial de comunicación (D3, decisión del propietario): incluye el **texto completo** de los mensajes del negocio consultado (WhatsApp, Instagram, email, notas de comunicación), con canal, dirección, estado, fecha y actor. Siempre de **un solo negocio por llamada**, paginado y con tope por página. Cada texto va en un campo `text` marcado como contenido de terceros (`untrusted:true`), nunca concatenado con instrucciones; los adjuntos se listan por nombre y tipo, sin contenido. No incluye borradores sin enviar de otros usuarios.

## 3. Herramientas de lectura

Todas registradas con `readOnlyHint:true`, `destructiveHint:false`, descripciones en español que expliquen límites semánticos, IDs serializados como string, input Zod estricto, límite por página 1–100 (default 25 o menor) y respuesta `{items, nextCursor, truncated?}`. Cursor opaco o ID/fecha estable con orden determinista; no usar offset ilimitado. No entregar todo el CRM en una sola llamada.

| Herramienta | Entrada | Salida | Fuente y permiso |
| --- | --- | --- | --- |
| `crm_search` | `query` (1–200), `limit`, `cursor`, `entity?` | coincidencias con tipo (`business/contact/management`), IDs de negocio/gestión, nombre, ciudad, canal de coincidencia | Reusar reglas `searchSql.ts` y `businessTable.ts`; admins; búsqueda acento-insensible, ñ≠n, teléfono, email, Instagram, sitio web. Excluir borrados/fusionados; archivados con flag solo admin. |
| `crm_list_businesses` (mejorar) | existente + query unificada | negocio, verticales, estado, responsable, DNC/motivo, `mergedIntoId` solo si se solicita incluir fusiones | `data.ts:list`, lógica de negocio de `businessTable.ts`; ampliar search a teléfono/email/Instagram/web. Mantener filtros exactos de ciudad/vertical. |
| `crm_get_business` (mejorar) | `id` string | `{found,business,contacts[],managements[],sellerGroup?,doNotContact,doNotContactReason}` | `data.ts:business`; nunca confundir gestión con negocio. Excluir fusionado o devolver `{found:false, reason:'merged', mergedIntoId}` sin contenido del origen. Aplicar filtro de contacto. |
| `crm_business_managements` | `businessId`, `cursor`, `limit`, `includeClosed?` | gestiones `{id,title,type,typeLabel,stage,stageLabel,stageClass,owner,createdAt,nextActionAt}` | `businessManagement.ts`, `crm_stages`, `leads`; permisos por negocio/gestión de `crmPermissions.ts`; incluir etiquetas y clasificación, no inferir cierre/contacto más allá del estado registrado. |
| `crm_get_management` | `managementId` | detalle de gestión + journal paginado `{events:[date,kind,label,actor],nextCursor}` | `leads`, pipeline/journal; lectura de gestión dentro de negocio visible. Solo eventos comerciales pertinentes; sin diarios internos de seguridad. |
| `crm_list_tasks` | `range:today\|overdue\|upcoming`, `sellerEmail?`, `businessId?`, `cursor`, `limit` | tarea `{id,title,type,dueDate,dueTime,status,businessId,businessName,managementId,owner,doNotContact}` | Replicar filtros/semántica de `endpoints/work.ts`; días con `crmDates.tsx`/zona `America/Argentina/Buenos_Aires`; admin puede filtrar vendedor, límites pequeños. DNC siempre visible y no sugerir contacto. |
| `crm_business_communication` | `businessId`, `cursor`, `limit` (≤50), `since?` | `{id,channel,direction,status,date,actor,contactId?,managementId?,text,untrusted:true,attachments:[name,type]}` | Tablas de comunicación del CRM (mismas que la pestaña Comunicación de la ficha); un negocio por llamada; texto completo (D3); sin contenido de adjuntos. |
| `crm_metrics` | `groupBy:business_status\|vertical\|seller\|management_stage\|overdue_tasks`, fechas opcionales | `{metric,groups:[key,label,count],asOf}` | Reutilizar reglas de `leads_stats_GET.ts`; conteos agregados, fechas de Argentina; aclarar verticales solapadas y diferencia negocio/gestión. |
| `crm_catalogs` | `catalog:stages\|reasons\|verticals\|sellers` | catálogo versionado `{items:[id,label,active,role?,classification?]}` | `crm_stages`, razones vigentes, `crm_verticals`, usuarios activos. Admin-only; sin emails si no son necesarios para contexto (sellers: nombre y rol). |

Las herramientas de gestión, tareas, comunicación y métricas deben limitarse a filas no borradas y respetar estados actuales. El diario de negocio existente `crm_business_history` continúa siendo paginado y no se presenta como historial técnico completo.

## 4. Acceso a datos y grants

### Decisión D4 — consultas MCP

**Recomendación: toda lectura MCP en el pool `CRM_MCP_DATABASE_URL`**, con transacción `READ ONLY`, timeout y verificación de rol ya implementados en `data.ts:5-14`. No importar helpers/handlers que consultan `helpers/db` principal: implementar consultas equivalentes o extraer mappers puros que reciban datos ya leídos. OAuth y su almacenamiento de credenciales permanecen en DB primaria; no es lectura MCP de negocio.

Opciones: A) consultas MCP específicas en rol lector (recomendada); B) reutilizar helpers Kysely con DB principal y crear wrapper global, que amplía alcance de privilegios y vuelve difícil probar que todos los caminos usan la conexión segura.

- Mantener un manifiesto `REQUIRED_MCP_TABLES` único para provisión, diagnóstico y test. Incluir solo tablas requeridas por las herramientas de fase 1 (cuentas, contactos, gestiones, stages, verticales/subtipos/clasificaciones/grupos de vendedores, journal comercial, tareas, tipos, actividades, mensajes y tablas mínimas de journal de comunicación/catálogos).
- Actualizar `provision-mcp-reader.mjs` con grants SELECT nuevos. Para instalaciones existentes no confiar en re-ejecutar el script: runbook SQL `GRANT SELECT ON ... TO crm_mcp_reader` para cada tabla nueva, incluido por defecto-grant futuro si el rol no es dueño.
- Al iniciar/diagnosticar, consultar `has_table_privilege` contra el manifiesto, registrar por tabla `grant_missing` (sin URL/credenciales) y bloquear herramientas dependientes con error explícito `MCP_READER_GRANTS_INCOMPLETE`. No deshabilitar la validación de privilegios de escritura.
- La falta de grants no debe parecer «No encontrado». Diagnóstico admin compara las tablas requeridas y concedidas y señala nombres faltantes.

## 5. Tests

Extender `scripts/test-mcp.ts` usando solo la base descartable declarada por el flujo de integración:

1. Tool count exacto/nombres esperados, anotaciones, esquemas inválidos y shape JSON estable para cada herramienta.
2. Casos por herramienta: búsqueda por acentos/ñ/teléfono/email/Instagram/web; paginación sin repetidos; negocio fusionado; etiquetas de gestión; fechas local/Argentina para hoy/vencidas; filtros de visibilidad; texto de comunicación marcado `untrusted` y limitado a un negocio; agregados; catálogos activos.
3. DNC visible con razón; confirmar que descripciones/mappers nunca recomiendan contacto y no filtran estados falsos. Probar contacto oculto cuando la regla de permiso no lo habilita.
4. OAuth: cliente predefinido (D1), `resource` en authorize/token, redirect exacto, PKCE S256, `WWW-Authenticate` con metadata de recurso y relink para token revocado/expirado.
5. Origin: OPTIONS válido, origen permitido y malicioso, OAuth y well-known sin rechazo indebido, consent POST conserva same-origin. Verificar evento estructurado para Origin rechazado sin secretos ni query.
6. Grants: rol completo funciona; quitar SELECT a una tabla requerida produce diagnóstico por tabla y error `grant_missing`, no `not_found`. Ganar UPDATE sigue bloqueando todo MCP.
7. Pruebas unitarias junto a mappers puros: formato estable, estado fusionado, DNC, etiquetas y cursor; no duplicar lógica SQL en pruebas unitarias.

No ejecutar suites contra producción. Suite de integración solo cuando se confirmó `DATABASE_URL` local descartable, según `AGENTS.md`.

## 6. Documentación y configuración

- Reescribir `docs/crm-mcp.md` como fuente única de verdad: estado confirmado (con fecha), arquitectura de permisos, lista de herramientas, privacidad, conexión paso a paso desde ChatGPT Developer mode → Add connector → `https://crm.hospeda.com.ar/mcp` → OAuth, qué autoriza el consentimiento, cómo desconectar/revocar y diagnóstico.
- Corregir afirmaciones en `decisiones.md` y `pendientes.md`; registrar que el grant de 07/11 fue aplicado, sin presentarlo como migración ni runbook pendiente. `.env.example` debe describir habilitación/variables sin afirmar que producción está deshabilitada; nombres solamente, sin valores reales.
- Paso de conexión: iniciar sesión en ChatGPT, activar Developer mode según disponibilidad de cuenta, agregar conector MCP URL indicada, completar consentimiento en CRM y comprobar las herramientas. No copiar tokens ni secretos. Si CIMD no está aceptado, documentar el fallback explícito aprobado en D1.

## Permisos y contratos

- Todas las herramientas validan token y admin activo en cada petición. La autorización nunca se delega a las anotaciones MCP.
- Input estricto, IDs bigint como strings en wire format, fechas RFC 3339 o fecha local `YYYY-MM-DD` documentada, ordenación estable, cursores no editables por cliente, `limit` default 25 y máximo 100.
- Shape de error interno: `{code, retryable, userMessage}`; no incluir SQL, nombre de host, stack, token o contenido de fila. Mensaje común al modelo describe paso siguiente útil. Para expiración/revocación usar `mcp/www_authenticate` con desafío Bearer/metadata.
- No añadir scopes de escritura. Scope `crm.read` se conserva. Consentimiento enumera tipos de datos realmente expuestos, incluidos contactos y el texto de los mensajes.
- Los datos CRM son contexto no confiable: descripciones de herramientas instruyen al modelo a tratar notas, nombres y texto libre como datos, nunca como instrucciones. El texto de los mensajes se devuelve en un campo propio marcado `untrusted:true`; la descripción de la herramienta lo explica.

## Componentes y funciones

| Archivo/componente | Cambio previsto |
| --- | --- |
| `src/server/mcp/routes.ts` | Middleware Host/Origin por ruta, preflight, logs estructurados, errores tipados, health/grant check, tools y anotaciones. |
| `src/server/mcp/oauth.ts` | cliente predefinido (D1); resource/audience, códigos de error y log seguro, revocación/relink. |
| `src/server/mcp/data.ts` | Lecturas nuevas solo sobre pool lector; filtros DNC/merged/archive y paginación acotada. |
| `src/server/mcp/permissions.ts` (nuevo) | Política admin, contacto visible y visibilidad por entidad centralizada. |
| `src/server/mcp/mappers.ts` + spec (nuevo) | Formatos JSON, labels, flags y cursores puros. |
| `scripts/provision-mcp-reader.mjs` | Manifiesto de tablas y SELECT grants en rol nuevo. |
| `scripts/test-mcp.ts` | OAuth, herramientas, Origin, logs, grants y lectura segura. |
| Configuración (componente nuevo o existente) | Indicador admin de disponibilidad/grants/último token exitoso sin secretos. |
| `docs/crm-mcp.md`, `docs/decisiones.md`, `docs/pendientes.md`, `.env.example` | Guía única, decisiones coherentes y variables documentadas. |

## Riesgos

- **Prompt injection:** notas, nombres, URLs o metadatos ingresados por usuarios pueden intentar instruir al modelo. Tratar cada campo como dato no confiable, devolver los textos en campos marcados `untrusted:true`, agregar límites/etiquetas; el MCP no debe ejecutar instrucciones encontradas en esos campos.
- **Exposición a tercero:** el usuario decide consultar datos del CRM a través de OpenAI. Fase 1 conserva admin-only y consentimiento explícito, incluye el texto de los mensajes de un negocio por consulta (D3) y debe advertir que se pueden enviar datos de negocio/contacto a ChatGPT. El propietario revisa retención y condiciones antes de ampliar el acceso.
- **Vida de token:** access 1 h y refresh 30 días actuales; rotar refresh, revalidar admin en cada request, registrar emisión/revocación sin token. D1 puede cambiar almacenamiento de client credentials.
- **Abuso/costo:** añadir rate limit por usuario/IP para OAuth y llamadas MCP, límites de concurrencia y máximo de filas/texto por salida; el body limit de 64 KB no limita respuestas.
- **Salidas grandes:** paginación obligatoria, default pequeño, resumen para métricas, truncamiento explícito y timeout 5 s. No aceptar exportación de todo el CRM en una llamada.
- **Falla silenciosa:** falta de SELECT en tablas agregadas puede dejar herramientas parcialmente rotas. Manifiesto y diagnóstico son requisito previo para habilitar herramientas.

## Runbook de producción

### Variables (nombres solamente)

`CRM_MCP_ENABLED`, `CRM_MCP_DATABASE_URL`, `CRM_MCP_CLIENT_ID`, `CRM_MCP_CLIENT_SECRET` (solo si se mantiene cliente predefinido), `CRM_MCP_TOKEN_SECRET`, `CRM_MCP_REDIRECT_URIS`, `PUBLIC_APP_URL`.

### Grants para un rol ya existente

El operador revisa manifiesto final y ejecuta en la base de producción, con aprobación para ese cambio de infraestructura:

```sql
GRANT USAGE ON SCHEMA public TO crm_mcp_reader;
GRANT SELECT ON public.<tabla_nueva_1>, public.<tabla_nueva_2> TO crm_mcp_reader;
```

No modificar `migrations/015_readonly_mcp.sql` ni usar migraciones para conceder permisos del rol. Confirmar que no hay privilegios de escritura y que el rol no es superuser/owner.

### Conexión y smoke

1. Confirmar configuración en Coolify sin imprimir valores secretos; desplegar el PR a `staging`, revisar CI y luego promover según el flujo de proyecto.
2. En ChatGPT: Developer mode → Add connector → URL `https://crm.hospeda.com.ar/mcp` → OAuth; iniciar sesión como admin autorizado y aceptar consentimiento.
3. Comprobar metadata protegida y authorization server en 200, `/mcp` sin token en 401 con `WWW-Authenticate`, preflight permitido, y conexión que lista todas las tools.
4. Consultar un negocio conocido y un catálogo; verificar DNC visible, gestión y paginación; verificar que el historial de comunicación trae el texto marcado como no confiable. Confirmar panel de diagnóstico verde y timestamp de token exitoso.
5. Revisar logs de los smoke sin extraer tokens, cookies, datos de contactos ni queries.

### Rollback

Deshabilitar con `CRM_MCP_ENABLED=0` y redeploy. Esto debe hacer que metadatos y MCP respondan 404. No borrar `crm_mcp_credentials` ni revocar grants automáticamente. Si hubo exposición sospechada, revocar tokens/credenciales mediante procedimiento admin separado y rotar secretos en Coolify.

## Orden de implementación (PRs a `staging`)

1. **PR A — Conexión y diagnóstico:** Origin/OPTIONS, errores/logging, comprobación de grants y pantalla admin mínima.
2. **PR B — Contratos/permisos y mappers:** D2/D3, shapes, flags DNC/fusionado y tests unitarios puros.
3. **PR C — Lecturas de negocio y gestión:** búsqueda, ficha, gestiones/detalle/journal, catálogos.
4. **PR D — Agenda, comunicación y métricas:** queries acotadas, zonas horarias, texto de comunicación de un negocio por llamada.
5. **PR E — Integración y documentación:** ampliar `test-mcp.ts`, actualizar docs/env y ejecutar el verificador del proyecto.

Los PRs se pueden reagrupar si cada uno queda revisable y ejecuta sus pruebas enfocadas. No desplegar a producción ni ejecutar grants desde el PR.

## Aceptación

- ChatGPT completa OAuth con el registro de cliente decidido; protección de recurso, audience y redirect validan los requisitos publicados por OpenAI.
- Origen no permitido no bloquea well-known/OAuth válidos; `/mcp` rechaza origen no autorizado, acepta OPTIONS y deja log seguro.
- Panel admin diferencia servidor apagado, grants incompletos, token emitido y última autenticación exitosa sin revelar secretos.
- Las herramientas documentadas están registradas, todas read-only, paginadas, limitadas y con IDs string; búsqueda semántica iguala las reglas CRM.
- Fusión, DNC, datos de contacto, permisos por entidad, fecha de Argentina y texto de mensajes marcado como no confiable cubiertos con fixtures/regresiones.
- Un grant faltante produce diagnóstico y error claro; un privilegio de escritura bloquea la lectura MCP.
- `docs/crm-mcp.md`, decisiones, pendientes y `.env.example` describen un único estado coherente.

## Decisiones

| Decisión | Opciones | Resultado |
| --- | --- | --- |
| D1 Registro ChatGPT | Cliente predefinido / CIMD / DCR | **Decidido (propietario, 07/11/2026):** **Cliente predefinido** (ya implementado); CIMD como mejora posterior; DCR fuera. |
| D2 Usuarios MCP | Admin-only / vendedores con visibilidad CRM | **Decidido (propietario, 07/11/2026):** **Admin-only** en fase 1; owner único previsto. |
| D3 Texto de comunicación | Metadatos / incluir cuerpos visibles en CRM | **Decidido (propietario, 07/11/2026): texto completo**, un negocio por llamada, marcado `untrusted:true`. |
| D4 Acceso a datos | Pool principal con wrapper / consultas en pool lector | **Decidido (propietario, 07/11/2026):** **Todas las lecturas en el pool lector**. |
| D5 Health check | Endpoint público / diagnóstico admin | **Decidido (propietario, 07/11/2026):** **Panel autenticado admin**; no exponer detalles de grants públicamente. |

## Migraciones y datos

No se prevé migración de esquema de negocio. `015_readonly_mcp.sql` ya gestiona códigos/refresh; no editar una migración aplicada. Añadir grants nuevos a `provision-mcp-reader.mjs` y ejecutar manualmente GRANT al rol existente conforme al runbook. No leer ni modificar datos de producción desde tests; credenciales OAuth de prueba solo en base descartable.
