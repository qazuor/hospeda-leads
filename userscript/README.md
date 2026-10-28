# Hospeda CRM para WhatsApp Web e Instagram

El script permite registrar en el CRM mensajes visibles del chat abierto, después de revisar una vista previa y confirmar. Solo lee WhatsApp Web: no envía mensajes, no hace clics allí ni modifica contactos o etiquetas. Los medios se guardan como marcadores, sin descargar archivos.

Desde la versión 1.4.0 el mismo script también trabaja en Instagram Web: después de «Abrir Instagram» en el CRM, toca «Enviar mensaje» en el perfil y pega el mensaje copiado, sin enviarlo ([spec 94](../docs/crm-roadmap/94-instagram-userscript.md)).

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

## Instagram (versión 1.4.0)

En la computadora, «Abrir Instagram» copia el mensaje y abre `https://www.instagram.com/<usuario>/#hospeda=<nonce>`. El script de Instagram:

1. Actúa solo con un traspaso de un solo uso: al abrir, la página del CRM genera un nonce aleatorio de 128 bits y se lo pasa al script de esa misma página (`postMessage`, misma ventana y origen) con el usuario, un vencimiento de 2 minutos y un hash del texto; el script lo guarda en la clave GM `hospeda-instagram-handoff`. En Instagram, el nonce de la URL tiene que coincidir, no haber vencido y el perfil tiene que ser el mismo. El traspaso se borra antes de actuar. Un `#hospeda` suelto, un enlace de otra página o un nonce reusado no hacen nada.
2. Busca «Enviar mensaje» / «Message» por nombre accesible (nunca por clases), espera el cuadro del chat (hasta 15 s cada uno) y, si está vacío, lee el portapapeles (el navegador pide permiso la primera vez).
3. Pega solo si el portapapeles coincide con el hash del mensaje del CRM: un evento `paste` sintético con `DataTransfer` y, si el editor quedó vacío, `execCommand('insertText')`.
4. **Nunca envía:** no aprieta Enter ni toca Enviar. Si algo falla, muestra un aviso abajo («No pude pegar el mensaje: pegalo con Ctrl+V.» y similares) y deja la página como estaba.

El módulo (`src/instagram/`) está aislado del resto: no lee el token ni otros valores de GM, no hace pedidos al CRM y no corre lógica de WhatsApp. Sin script que pegue, el CRM abre el perfil sin marcador y se pega a mano, como antes. En Firefox la lectura del portapapeles suele requerir un gesto, así que ahí normalmente se pega a mano.

## Selectores y fixtures

Los fixtures `current-*.html` reproducen la estructura de WhatsApp Web capturada el 25/10/2026 (contacto agendado, número sin agendar y grupo), con textos y teléfonos sintéticos. Los fixtures más viejos quedan como regresión de estructuras anteriores. Si WhatsApp cambia su pantalla, «Copiar diagnóstico del chat» (en «Ajustes» del panel) recopila la estructura sin textos ni teléfonos para actualizar los selectores.

Los fixtures `instagram-*.html` modelan la estructura accesible pública de Instagram Web (perfil en español e inglés, perfil propio sin «Enviar mensaje» y el chat con su editor), sin capturas reales. Si Instagram cambia, actualizá los fixtures y las listas `MESSAGE_BUTTON_NAMES` / `COMPOSER_LABELS` de `src/instagram/finders.ts`.
