# Hospeda CRM para WhatsApp Web e Instagram

El script permite registrar en el CRM mensajes visibles del chat abierto, después de revisar una vista previa y confirmar. Solo lee WhatsApp Web: no envía mensajes, no hace clics allí ni modifica contactos o etiquetas. Los medios se guardan como marcadores, sin descargar archivos.

Desde la versión 1.4.0 el mismo script también trabaja en Instagram Web: después de «Abrir Instagram» en el CRM, toca «Enviar mensaje» en el perfil y escribe el mensaje preparado, sin enviarlo ([spec 94](../docs/crm-roadmap/94-instagram-userscript.md)).

## Instalación

1. Instalá Tampermonkey en Chrome, Edge o Firefox.
2. En Chrome o Edge 138 o posterior, abrí los detalles de Tampermonkey y activá **Permitir scripts de usuario** (o el modo desarrollador). En Firefox, aceptá el permiso de Tampermonkey para acceder a todos los sitios.
3. En el CRM, abrí **User script de WhatsApp** y tocá **Instalar user script**. La misma página muestra si el script está instalado y al día en ese navegador.
4. Creá un token en esa página, abrí WhatsApp Web, tocá el botón de Hospeda de la barra izquierda y pegá el token en **Ajustes**.

Al actualizar a la 1.4.0, Tampermonkey pide **aprobar un sitio nuevo (instagram.com)** una sola vez. Si no se aprueba, el script sigue funcionando en WhatsApp y no hace nada en Instagram.

Violentmonkey es una alternativa de código abierto compatible con las APIs estándar `GM_*` usadas por el script.

## Uso

Abrí un chat individual en WhatsApp Web. Revisá el negocio asociado y la vista previa, dejá seleccionados los mensajes que quieras y confirmá con **Registrar mensajes**. Los chats grupales no se admiten. El servidor decide duplicados y puede rechazar mensajes salientes si la regla de No contactar impide registrarlos.

### Mandar un modelo con material de venta (versión 1.3.0)

En **Mandar un mensaje**, elegí el modelo y la persona. Si el modelo trae material de venta, la vista previa ya muestra sus enlaces: el CRM crea uno nuevo para cada mensaje. Si un material del modelo se archivó, pasó a interno o se borró, el panel lo avisa y no lo incluye. Para sumar otro material, tocá **Agregar material**, buscalo por título o descripción (busca el CRM, así aparece aunque haya mucho material) y tocá **Agregar**. Solo aparece material entregable y activo, y el botón no está disponible si el negocio tiene No contactar, una restricción de WhatsApp o está en estado Nuevo. El servidor vuelve a comprobar permisos y No contactar en cada material. Una vez pegado el texto, el borrador ya no admite material nuevo: tocá **Cambiar de modelo** y prepará otro mensaje.

Endpoints que usa (mismo token Bearer `hcu_…` y mismo control de versión 426 que el resto): `GET /_api/userscript/materials?accountId=<id>` y `POST /_api/userscript/material_add` `{messageId, revision, materialId}`, que devuelve `{revision, body}`. `POST /_api/userscript/prepare` suma `materialWarnings`.

Si aparece **No pude leer este chat**, tocá **Copiar diagnóstico del chat** en el panel. El diagnóstico oculta texto y enmascara teléfonos. Enviáselo al equipo para actualizar los selectores.

### Solución de problemas

- **No pude leer este chat:** WhatsApp pudo cambiar su estructura. Copiá el diagnóstico anonimizado desde el panel y registrá el mensaje manualmente mientras se actualizan los selectores.
- **Falta el token:** abrí el panel desde el botón de Hospeda y pegá el token personal en **Ajustes**.
- **Hay una versión nueva / Actualizá el script:** tocá **Actualizar** en el aviso y confirmá en Tampermonkey.
- Si el navegador bloquea la instalación, verificá el permiso de scripts de usuario en Chrome/Edge 138+.

## Conexión con el CRM (versión 1.5.0)

En las páginas del CRM el script, además de anunciar su versión, comprueba su token con `GET /_api/userscript/status` (vía `GM_xmlhttpRequest`, el token nunca sale del script) y publica en `<html>`:

- `data-hospeda-userscript-connection`: `connected`, `missing-token` (sin token, no hace pedido), `rejected` (401), `outdated` (426) o `unknown` (error de red, timeout o 5xx);
- `data-hospeda-userscript-user`: el email del dueño del token, solo con `connected`.

Avisa cada cambio con el mismo evento de instalación. Vuelve a comprobar al volver a la pestaña (enseguida si no está conectado; cada 2 minutos como máximo si lo está) y cuando la página dispara `hospeda-userscript-recheck` («Verificar de nuevo»). En la computadora, el CRM solo deja contactar por WhatsApp o Instagram con el script en la última versión, conectado y con el token de la misma cuenta. La versión mínima del servidor pasa a 1.5.0: un 1.4.x recibe 426 en WhatsApp Web. Detalle en la [spec 96](../docs/crm-roadmap/96-contact-three-clicks.md).

## Instagram (versión 1.4.0)

En la computadora, «Abrir Instagram» copia el mensaje (respaldo manual) y le pasa el texto al script; si el script confirma, abre `https://www.instagram.com/<usuario>/#hospeda=<nonce>`. Detalle en la [spec 94](../docs/crm-roadmap/94-instagram-userscript.md).

1. **Traspaso de un solo uso.** La página del CRM genera un nonce aleatorio de 128 bits y despacha en `document` el evento `hospeda-instagram-handoff` con un JSON `{nonce, username, expiresAt, text}` (texto de hasta 4000 caracteres, vence a los 2 minutos). El script de esa página lo valida, lo guarda en la clave GM `hospeda-instagram-handoff` y confirma con el atributo `data-hospeda-instagram-ack` = nonce. Sin confirmación en 300 ms, el CRM abre el perfil sin marcador y pide pegar a mano. Se usa un string porque cruza el sandbox de Tampermonkey (como `announce.ts`).
2. **En Instagram** el script actúa solo si el nonce de la URL coincide, no venció y el perfil es el mismo; borra el traspaso de ese nonce (y solo de ese: un segundo «Abrir Instagram» reemplaza al primero). Con un `#hospeda=<nonce>` sin traspaso válido muestra «No pude confirmar que lo abrió el CRM…» y no toca nada; un `#hospeda` suelto o mal formado no hace nada.
3. Toca «Enviar mensaje» / «Message» del encabezado del perfil (por nombre accesible, nunca por clases) y solo escribe si la página pasó a `/direct/t/<id>/`, en el cuadro de esa página (nunca en un chat flotante), si está vacío. Si se cambia de perfil mientras espera, aborta.
4. Escribe el texto del traspaso con un evento `paste` sintético con `DataTransfer` y, si el editor quedó vacío, `execCommand('insertText')`; verifica que el cuadro tenga exactamente ese texto.
5. **No lee el portapapeles** (el navegador no pide ningún permiso, y funciona igual en Firefox) y **nunca envía:** no aprieta Enter ni toca Enviar. Si algo falla, muestra un aviso abajo y deja la página como estaba.

El texto queda como máximo 2 minutos en el almacenamiento de Tampermonkey, que es propio del script y no lo leen las páginas. El módulo (`src/instagram/`) está aislado por código, no por permisos (los `@grant` valen para todos los `@match`): no lee el token ni otros valores de GM, no hace pedidos, no usa el portapapeles y no corre lógica de WhatsApp; un test estático lo controla.

## Selectores y fixtures

Los fixtures `current-*.html` reproducen la estructura de WhatsApp Web capturada el 25/10/2026 (contacto agendado, número sin agendar y grupo), con textos y teléfonos sintéticos. Los fixtures más viejos quedan como regresión de estructuras anteriores. Si WhatsApp cambia su pantalla, «Copiar diagnóstico del chat» (en «Ajustes» del panel) recopila la estructura sin textos ni teléfonos para actualizar los selectores.

Los fixtures `instagram-*.html` modelan la estructura accesible pública de Instagram Web (perfil en español e inglés, perfil propio sin «Enviar mensaje» y el chat con su editor), sin capturas reales. Si Instagram cambia, actualizá los fixtures y las listas `MESSAGE_BUTTON_NAMES` / `COMPOSER_LABELS` de `src/instagram/finders.ts`.
