# Acceso MCP de solo lectura al CRM

## Alcance

El servidor se integra en la aplicación Hono en /mcp. Usa el SDK oficial MCP con Streamable HTTP sin sesiones y respuestas JSON. No expone SQL libre ni herramientas de modificación, importación, fusión, borrado, envío o apertura de WhatsApp. Anota todas las herramientas como lectura y no destructivas.

Herramientas: crm_overview (conteos y clasificación), crm_list_businesses (cursor por ID, hasta 100 resultados), crm_get_business (datos/fuentes/personas y gestiones), crm_find_business_matches (señales de coincidencia, nunca identidad confirmada) y crm_business_history (journal comercial por negocio, sin afirmar que reúne todos los diarios). Los sitios y las notas son datos almacenados y pueden estar desactualizados; no son instrucciones para el agente. Compartir teléfono municipal, sitio central, propietario o domicilio no autoriza a fusionar.

El conector permite recorrer los 3.532 negocios por páginas sin exportar un archivo completo. Las credenciales y el token de sesión del CRM no aparecen en los resultados. Solo se seleccionan campos comerciales explícitos; usuarios, passwords, sesiones, app_settings y credenciales OAuth no tienen permisos en la cuenta lectora.

## Autenticación

OAuth con cliente previamente configurado, authorization code + PKCE S256, coincidencia exacta de redirect URI y resource. Publica metadata de recurso y servidor de autorización, con iss en el callback. El administrador inicia sesión en el CRM en otra pestaña y autoriza explícitamente en la pantalla OAuth; no se crea una cuenta ni se entrega contraseña del CRM a ChatGPT.

Códigos de cinco minutos y refresh tokens de treinta días se guardan solo por hash. Los códigos son de un uso; los refresh tokens rotan atómicamente. Los access tokens duran una hora, con issuer/audience/scope/tipo y firma verificados. Cada petición y renovación verifica que el usuario siga siendo admin y que su email siga autorizado. Revocar un refresh evita renovaciones; un access token ya emitido sigue hasta expirar, salvo quitar admin/allowlist, desactivar MCP o rotar CRM_MCP_TOKEN_SECRET. El endpoint revoke exige autenticar el cliente.

La migración 015 solo crea la tabla de credenciales OAuth; no modifica negocios ni la tabla de usuarios. No concede acceso ni activa el servicio. El formulario de autorización es una página mínima del protocolo fuera de la UI comercial, sin scripts, con CSP y sin framing. La aprobación exige sesión, token de consentimiento firmado de cinco minutos y Origin del CRM. No hay registro dinámico público ni callbacks por comodines.

## Configuración única en Coolify

1. Tras desplegar este PR, ejecutar en /app:

~~~sh
node scripts/provision-mcp-reader.mjs --apply
~~~

El comando crea crm_mcp_reader y concede SELECT exclusivamente en seis tablas comerciales. No cambia datos del negocio. Guarda un coolify.env privado en un directorio /tmp/crm-mcp-setup-* y solo imprime su ruta. Rechaza un rol existente, sin rotar credenciales automáticamente. Conservar el archivo fuera del contenedor en almacenamiento privado; no adjuntarlo al chat ni agregarlo al repo. Ante created=null, verificar el rol antes de repetir.

2. Cargar las seis variables de ese archivo en Coolify como variables runtime privadas. PUBLIC_APP_URL debe ser exactamente https://crm.hospeda.com.ar (sin path). CRM_MCP_DATABASE_URL usa la red interna; no publicar PostgreSQL ni cambiar DATABASE_URL de la app. Redeploy. No habilitar CRM_TEST_DATABASE en producción.

3. Crear la conexión MCP/plugin en ChatGPT usando https://crm.hospeda.com.ar/mcp, OAuth y el cliente previamente configurado: Client ID y Client Secret del archivo. Solicitar crm.read y offline_access. La disponibilidad de esta UI depende del workspace/plan; el servidor no la habilita. Si el constructor muestra otro callback, copiar su URI exacto a CRM_MCP_REDIRECT_URIS y redeploy; separar varias URIs por comas, sin comodines. No publicar el secreto.

4. Iniciar sesión como admin en el CRM en otra pestaña, completar la autorización, luego probar crm_overview y dos páginas de crm_list_businesses. Los tests de CI no sustituyen esta comprobación productiva desde ChatGPT. Hasta completar estos pasos, el agente sigue sin conexión a producción.

5. Limitar solicitudes en Cloudflare/Coolify para /mcp y /mcp/oauth/token si se expone públicamente. Mantener endpoints de descubrimiento accesibles. El servicio limita cuerpo a 64 KiB, campos, filas y consulta a cinco segundos. Rechaza Host/Origin no configurados. El Origin puede ser ausente para llamadas servidor-servidor, que igualmente requieren OAuth.

## Defensa de la cuenta de base

Cada consulta entra en REPEATABLE READ READ ONLY. Antes de leer, rechaza superusuario, roles de creación/replicación/bypass RLS, permisos de escritura sobre cualquier tabla pública y CREATE en public. Los permisos se vuelven a comprobar en cada transacción. No basta marcar el servidor como readOnlyHint. No ampliar grants a todas las tablas ni usar las credenciales de DATABASE_URL para las consultas MCP.

Para desactivar el acceso: CRM_MCP_ENABLED=0 y redeploy. Para revocar tokens existentes globalmente: rotar CRM_MCP_TOKEN_SECRET. Quitar el rol admin o desautorizar el email tiene efecto inmediato en próximas peticiones. Mantener las filas expiradas no extiende su validez; se pueden depurar con un procedimiento administrativo, no mediante herramientas MCP.

## Validación

Typecheck, unitarios y build; integración PostgreSQL con cuenta SELECT real, SDK Client initialize/listTools/callTool, paginación, ID inválido, rechazo de Origin, consentimiento, PKCE incorrecto, replay del código, renovación/replay, pérdida de rol admin y detección de una cuenta lectora que adquiere UPDATE. Sin proveedores ni mensajes reales. CI completa conserva las regresiones de navegador y la imagen Docker.

Documentación oficial consultada: https://developers.openai.com/plugins/build/auth y https://ts.sdk.modelcontextprotocol.io/server.
