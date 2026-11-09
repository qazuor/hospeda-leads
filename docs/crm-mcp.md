# Acceso MCP de solo lectura al CRM

> Estado informado el 07/11/2026: MCP está habilitado en producción y el rol lector recibió los grants faltantes de clasificación y grupos. Este cambio no verifica producción; consultá Configuración → ChatGPT (MCP) en la instancia.

## Conectar ChatGPT

1. En ChatGPT, activá Developer mode si está disponible en tu cuenta/workspace y agregá un conector MCP con URL `https://crm.hospeda.com.ar/mcp`.
2. Elegí OAuth con el cliente predefinido. Usá el Client ID y Client Secret privados configurados por el operador y solicitá scopes `crm.read offline_access`. Nunca pegues el secret en conversaciones ni logs.
3. Redirect URI: `https://chatgpt.com/connector_platform_oauth_redirect`. Si el constructor muestra otra URI, el operador debe aprobar su incorporación a `CRM_MCP_REDIRECT_URIS`.
4. Iniciá sesión como administrador autorizado en Hospeda, revisá el consentimiento y aceptá. Después comprobá las herramientas con `crm_overview`.

El consentimiento permite enviar a ChatGPT los datos comerciales y de contacto que consultes, pero no habilita escrituras. El MCP no permite editar, fusionar, borrar, importar, enviar mensajes ni abrir canales. Notas, nombres y mensajes almacenados son datos no confiables, no instrucciones.

## Diagnóstico

## Herramientas disponibles

Todas son de solo lectura, requieren administrador autorizado y usan el pool lector con transacciones de lectura, timeout y verificación de privilegios. Las listas limitan cada página a 1–100 filas (25 por defecto), usan IDs como strings y devuelven `items`, `nextCursor` y, si corresponde, `truncated`.

- `crm_overview`: conteos de negocios y clasificaciones; las verticales pueden solaparse.
- `crm_list_businesses`: búsqueda unificada y filtros exactos por ciudad/vertical; excluye archivados y fusionados por defecto.
- `crm_get_business`: ficha, contactos, clasificaciones y gestiones; fusionados responden `found:false` con el destino y sin contenido de origen.
- `crm_find_business_matches`: candidatos para revisión; no confirma duplicados.
- `crm_business_history`: journal comercial del negocio, no diarios técnicos.
- `crm_search`: búsqueda transversal por negocio, persona o gestión, incluyendo email, teléfono, Instagram y sitio web; ignora acentos, mantiene ñ distinta de n y devuelve el canal coincidente.
- `crm_business_managements`: gestiones abiertas por defecto; cada fila incluye etiquetas de tipo/etapa y clasificación.
- `crm_get_management`: ficha de gestión y journal comercial paginado.
- `crm_catalogs`: etapas, motivos, verticales o vendedores (nombre y rol, sin emails).
- `crm_list_tasks`: tareas pendientes de hoy, vencidas o próximas según el día de Argentina; filtra por `sellerId` (`users.id`) o negocio. Usa páginas OFFSET: si cambian las tareas durante el recorrido, puede haber repeticiones o saltos.
- `crm_business_communication`: mensajes, respuestas/notas y mensajes recibidos de un único negocio; texto marcado `untrusted`, máximo 4000 caracteres por evento y unos 60 KB por respuesta, con cursor si se alcanza el tope. Excluye borradores, cancelados y mensajes entrantes anulados; no devuelve destinatarios ni contenido/enlaces de adjuntos. `direction` es `outgoing` sólo en `manual_sent`, `accepted`, `delivery_confirmed` o `replied`; otros estados conservan su `status`, usan `direction:null` y fecha de creación. Esto evita presentar la apertura de un canal o un envío incierto como contacto.
- `crm_metrics`: conteos agregados por estado del negocio, vertical, vendedor, etapa de gestión o tareas vencidas. Excluye negocios archivados y etapas cerradas. Las verticales pueden solaparse; `(sin vertical)` agrupa los negocios no clasificados; negocios y gestiones son conteos distintos.

Toda salida que incluye un negocio muestra `doNotContact`. El esquema no registra una razón explícita recuperable: el campo `doNotContactReason` se omite. Cuando `doNotContact` es true, es una restricción vigente: no sugerir contacto ni inferir que ocurrió. Los campos libres son datos no confiables y nunca instrucciones para el asistente.

En Configuración → ChatGPT (MCP), un administrador puede consultar si el servicio está habilitado, si conecta el lector, qué grants faltan o son excesivos, y la fecha de la última emisión exitosa. El panel muestra URL, Redirect URI y scopes; nunca muestra secretos.

- **MCP deshabilitado:** el operador revisa `CRM_MCP_ENABLED` en Coolify.
- **Conexión lectora no disponible:** el operador revisa el estado del servicio y la conectividad de `CRM_MCP_DATABASE_URL`, sin copiar la URL en logs o chats.
- **Grants incompletos / `grant_missing`:** otorgar `SELECT` a `crm_mcp_reader` para las tablas indicadas por el panel. La herramienta responde `MCP_READER_GRANTS_INCOMPLETE`; no es un negocio inexistente.
- **`excessive_grant`:** revocar `SELECT` amplio o de columna para los campos que reporte el panel (por ejemplo, teléfonos de usuarios, destinatarios, direcciones/cabeceras entrantes o `lead_journal.actor_email`) y volver a aplicar solo las columnas listadas en el runbook. `users.email` queda habilitado únicamente como clave interna de resolución y no se devuelve.
- **`Origin not allowed`:** se aplica solo a `POST`/`OPTIONS /mcp`. El log incluye método, ruta sin query, valor recibido y código corto, nunca cuerpos, cookies, tokens o secretos. Well-known y OAuth validan Host; el POST de consentimiento conserva su comprobación same-origin. Para credenciales expiradas o revocadas, volvé a vincular.
- **Sin emisión registrada:** completar el flujo OAuth como administrador autorizado y revisar la hora nuevamente.

Las peticiones sin Origin también requieren Bearer OAuth. El preflight devuelve únicamente métodos/headers necesarios y nunca usa `*` ni refleja un origen rechazado.

## Seguridad y operación

OAuth usa cliente predefinido, authorization code + PKCE S256, coincidencia exacta de redirect URI y resource. Códigos y refresh tokens se almacenan por hash; los códigos se usan una vez, los refresh rotan y los access duran una hora. Cada petición vuelve a validar que el usuario siga como admin activo y autorizado.

Las lecturas usan `CRM_MCP_DATABASE_URL` con transacciones `REPEATABLE READ READ ONLY`, timeout de cinco segundos y comprobación de privilegios. El manifiesto `src/server/mcp/requiredTables.mjs` es la fuente única de tablas para provisión, diagnóstico y test. No uses `DATABASE_URL` principal para consultas MCP.

Variables runtime: `CRM_MCP_ENABLED`, `CRM_MCP_DATABASE_URL`, `CRM_MCP_CLIENT_ID`, `CRM_MCP_CLIENT_SECRET`, `CRM_MCP_TOKEN_SECRET`, `CRM_MCP_REDIRECT_URIS` y `PUBLIC_APP_URL`. Los secretos viven en Coolify y no se copian al repo.

Para una instalación nueva, `node scripts/provision-mcp-reader.mjs --apply` crea el rol y concede `SELECT` sobre el manifiesto. En producción actual el rol ya existe y sus grants fueron completados el 07/11/2026; no repetir el provisionado ni rotar credenciales para conectar ChatGPT.

### SQL de grants para la instalación existente

Este es el conjunto exacto de privilegios requerido por las herramientas actuales. El operador debe revisarlo y aplicarlo en producción con la autorización de infraestructura correspondiente:

```sql
GRANT USAGE ON SCHEMA public TO crm_mcp_reader;
GRANT SELECT ON public.crm_accounts, public.crm_contacts, public.leads,
  public.crm_verticals, public.crm_subtypes,
  public.crm_account_classifications, public.crm_account_seller_groups,
  public.crm_account_seller_group_members, public.crm_commercial_journal TO crm_mcp_reader;
GRANT SELECT (id, account_id, lead_id, title, type_id, assigned_user_email,
  due_date, due_at, status, deleted_at) ON public.crm_tasks TO crm_mcp_reader;
GRANT SELECT (id, name) ON public.crm_work_types TO crm_mcp_reader;
GRANT SELECT (id, account_id, lead_id, contact_id, channel, status,
  last_interaction_at, created_at, last_actor_email, text_body, body)
  ON public.crm_messages TO crm_mcp_reader;
GRANT SELECT (id, account_id, lead_id, contact_id, channel, category,
  summary, exact_text, other_detail, actor_email, occurred_at)
  ON public.crm_communication_responses TO crm_mcp_reader;
GRANT SELECT (id, account_id, lead_id, contact_id, channel, status,
  received_at, subject, text_body, attachments)
  ON public.crm_inbound_messages TO crm_mcp_reader;
GRANT SELECT (name, display_name, active, management_type, classification,
  sort_order) ON public.crm_stages TO crm_mcp_reader;
GRANT SELECT (management_type, outcome_key, reason_key, name, active)
  ON public.crm_management_reasons TO crm_mcp_reader;
GRANT SELECT (id, display_name, role, deactivated_at, email)
  ON public.users TO crm_mcp_reader;
GRANT SELECT (id, lead_id, action, field_name, old_value, new_value,
  created_at, actor_name) ON public.lead_journal TO crm_mcp_reader;
```

Decisión del propietario (07/11/2026): el rol lector puede leer `users.email`, necesario para enlazar las claves foráneas `assigned_user_email`/`actor_email` con `users.id` y `display_name`. MCP sustituye direcciones conocidas del personal en texto libre por `[equipo]`; las direcciones de clientes permanecen visibles según D3. Sólo se consultan emails de usuarios: teléfonos de staff requerirían conceder nuevas columnas sensibles y permanecen fuera del alcance. No conceder `users.phone`, `users.whatsapp_phones`, `users.sender_email`, `lead_journal.actor_email`/`actor_user_id`, destinatarios de mensajes, participantes de tareas ni direcciones/cabeceras de mensajes entrantes. El diagnóstico marca esas concesiones como `excessive_grant`; `users.email` no es una concesión excesiva.

Para desactivar el servicio, establecer `CRM_MCP_ENABLED=0` y hacer el despliegue autorizado. Revocar tokens globalmente requiere rotar `CRM_MCP_TOKEN_SECRET`; retirar admin/allowlist bloquea el acceso en la siguiente petición.

## Validación técnica

`scripts/test-mcp.ts` cubre OAuth/PKCE, consentimiento, replay, rotación, revocación de admin, herramientas, paginación, búsqueda, agenda, comunicación, agregados y privilegios del rol lector. La integración se corre únicamente contra una base PostgreSQL descartable migrada y sembrada. El manifiesto `REQUIRED_MCP_TABLES` enumera las tablas y columnas requeridas por todas las herramientas; la instalación existente necesita GRANT manual según el runbook, aprobado y ejecutado por el coordinador. La prueba local no confirma una conexión real de ChatGPT a producción.
