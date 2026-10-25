# Hospeda CRM para WhatsApp Web

El script permite registrar en el CRM mensajes visibles del chat abierto, después de revisar una vista previa y confirmar. Solo lee WhatsApp Web: no envía mensajes, no hace clics allí ni modifica contactos o etiquetas. Los medios se guardan como marcadores, sin descargar archivos.

## Instalación

1. Instalá Tampermonkey en Chrome, Edge o Firefox.
2. En Chrome o Edge 138 o posterior, abrí los detalles de Tampermonkey y activá **Permitir scripts de usuario** (o el modo desarrollador). En Firefox, aceptá el permiso de Tampermonkey para acceder a todos los sitios.
3. En el CRM, abrí **User script de WhatsApp** y tocá **Instalar user script**. La misma página muestra si el script está instalado y al día en ese navegador.
4. Creá un token en esa página, abrí WhatsApp Web, tocá el botón de Hospeda de la barra izquierda y pegá el token en **Ajustes**.

Violentmonkey es una alternativa de código abierto compatible con las APIs estándar `GM_*` usadas por el script.

## Uso

Abrí un chat individual en WhatsApp Web. Revisá el negocio asociado y la vista previa, dejá seleccionados los mensajes que quieras y confirmá con **Registrar mensajes**. Los chats grupales no se admiten. El servidor decide duplicados y puede rechazar mensajes salientes si la regla de No contactar impide registrarlos.

Si aparece **No pude leer este chat**, tocá **Copiar diagnóstico del chat** en el panel. El diagnóstico oculta texto y enmascara teléfonos. Enviáselo al equipo para actualizar los selectores.

### Solución de problemas

- **No pude leer este chat:** WhatsApp pudo cambiar su estructura. Copiá el diagnóstico anonimizado desde el panel y registrá el mensaje manualmente mientras se actualizan los selectores.
- **Falta el token:** abrí el panel desde el botón de Hospeda y pegá el token personal en **Ajustes**.
- **Hay una versión nueva / Actualizá el script:** tocá **Actualizar** en el aviso y confirmá en Tampermonkey.
- Si el navegador bloquea la instalación, verificá el permiso de scripts de usuario en Chrome/Edge 138+.

## Selectores y fixtures

Los fixtures `current-*.html` reproducen la estructura de WhatsApp Web capturada el 25/10/2026 (contacto agendado, número sin agendar y grupo), con textos y teléfonos sintéticos. Los fixtures más viejos quedan como regresión de estructuras anteriores. Si WhatsApp cambia su pantalla, «Copiar diagnóstico del chat» (en «Ajustes» del panel) recopila la estructura sin textos ni teléfonos para actualizar los selectores.
