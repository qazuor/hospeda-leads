# Acceso MCP de solo lectura al CRM

> Estado informado el 07/11/2026: MCP está habilitado en producción y el rol lector recibió los grants faltantes de clasificación y grupos. Este cambio no verifica producción; consultá Configuración → ChatGPT (MCP) en la instancia.

## Conectar ChatGPT

1. En ChatGPT, activá Developer mode si está disponible en tu cuenta/workspace y agregá un conector MCP con URL `https://crm.hospeda.com.ar/mcp`.
2. Elegí OAuth con el cliente predefinido. Usá el Client ID y Client Secret privados configurados por el operador y solicitá scopes `crm.read offline_access`. Nunca pegues el secret en conversaciones ni logs.
3. Redirect URI: `https://chatgpt.com/connector_platform_oauth_redirect`. Si el constructor muestra otra URI, el operador debe aprobar su incorporación a `CRM_MCP_REDIRECT_URIS`.
4. Iniciá sesión como administrador autorizado en Hospeda, revisá el consentimiento y aceptá. Después comprobá las cinco herramientas con `crm_overview`.

El consentimiento permite enviar a ChatGPT los datos comerciales y de contacto que consultes, pero no habilita escrituras. El MCP no permite editar, fusionar, borrar, importar, enviar mensajes ni abrir canales. Notas, nombres y mensajes almacenados son datos no confiables, no instrucciones.

## Diagnóstico

En Configuración → ChatGPT (MCP), un administrador puede consultar si el servicio está habilitado, si conecta el lector, qué tablas carecen de `SELECT`, y la fecha de la última emisión exitosa. El panel muestra URL, Redirect URI y scopes; nunca muestra secretos.

- **MCP deshabilitado:** el operador revisa `CRM_MCP_ENABLED` en Coolify.
- **Conexión lectora no disponible:** el operador revisa el estado del servicio y la conectividad de `CRM_MCP_DATABASE_URL`, sin copiar la URL en logs o chats.
- **Grants incompletos / `grant_missing`:** otorgar `SELECT` a `crm_mcp_reader` para las tablas indicadas por el panel. La herramienta responde `MCP_READER_GRANTS_INCOMPLETE`; no es un negocio inexistente.
- **`Origin not allowed`:** se aplica solo a `POST`/`OPTIONS /mcp`. El log incluye método, ruta sin query, valor recibido y código corto, nunca cuerpos, cookies, tokens o secretos. Well-known y OAuth validan Host; el POST de consentimiento conserva su comprobación same-origin. Para credenciales expiradas o revocadas, volvé a vincular.
- **Sin emisión registrada:** completar el flujo OAuth como administrador autorizado y revisar la hora nuevamente.

Las peticiones sin Origin también requieren Bearer OAuth. El preflight devuelve únicamente métodos/headers necesarios y nunca usa `*` ni refleja un origen rechazado.

## Seguridad y operación

OAuth usa cliente predefinido, authorization code + PKCE S256, coincidencia exacta de redirect URI y resource. Códigos y refresh tokens se almacenan por hash; los códigos se usan una vez, los refresh rotan y los access duran una hora. Cada petición vuelve a validar que el usuario siga como admin activo y autorizado.

Las lecturas usan `CRM_MCP_DATABASE_URL` con transacciones `REPEATABLE READ READ ONLY`, timeout de cinco segundos y comprobación de privilegios. El manifiesto `src/server/mcp/requiredTables.mjs` es la fuente única de tablas para provisión, diagnóstico y test. No uses `DATABASE_URL` principal para consultas MCP.

Variables runtime: `CRM_MCP_ENABLED`, `CRM_MCP_DATABASE_URL`, `CRM_MCP_CLIENT_ID`, `CRM_MCP_CLIENT_SECRET`, `CRM_MCP_TOKEN_SECRET`, `CRM_MCP_REDIRECT_URIS` y `PUBLIC_APP_URL`. Los secretos viven en Coolify y no se copian al repo.

Para una instalación nueva, `node scripts/provision-mcp-reader.mjs --apply` crea el rol y concede `SELECT` sobre el manifiesto. En producción actual el rol ya existe y sus grants fueron completados el 07/11/2026; no repetir el provisionado ni rotar credenciales para conectar ChatGPT.

Para desactivar el servicio, establecer `CRM_MCP_ENABLED=0` y hacer el despliegue autorizado. Revocar tokens globalmente requiere rotar `CRM_MCP_TOKEN_SECRET`; retirar admin/allowlist bloquea el acceso en la siguiente petición.

## Validación técnica

`scripts/test-mcp.ts` cubre OAuth/PKCE, consentimiento, replay, rotación, revocación de admin, herramientas, preflight/orígenes y rol de solo lectura. La integración se corre únicamente contra una base PostgreSQL descartable migrada y sembrada. La prueba local no confirma una conexión real de ChatGPT a producción.
