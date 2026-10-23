# Hospeda CRM para WhatsApp Web

El script permite registrar en el CRM mensajes visibles del chat abierto, después de revisar una vista previa y confirmar. Solo lee WhatsApp Web: no envía mensajes, no hace clics allí ni modifica contactos o etiquetas. Los medios se guardan como marcadores, sin descargar archivos.

## Instalación

1. Instalá Tampermonkey en Chrome, Edge o Firefox.
2. En Chrome o Edge 138 o posterior, abrí los detalles de Tampermonkey y activá **Permitir scripts de usuario** (o el modo desarrollador). Firefox no requiere ese paso.
3. Abrí [instalar Hospeda CRM](https://crm.hospeda.com.ar/userscripts/hospeda-crm.user.js) y aceptá la instalación.
4. Abrí el menú de Tampermonkey, elegí **Configurar token** y pegá el token creado desde tu perfil en Hospeda CRM.

Violentmonkey es una alternativa de código abierto compatible con las APIs estándar `GM_*` usadas por el script.

## Uso

Abrí un chat individual en WhatsApp Web. Revisá el negocio asociado y la vista previa, dejá seleccionados los mensajes que quieras y confirmá con **Registrar en CRM**. Los chats grupales no se admiten. El servidor decide duplicados y puede rechazar mensajes salientes si la regla de No contactar impide registrarlos.

Si aparece **No pude leer este chat. Registrá a mano desde el CRM.**, abrí el menú de Tampermonkey y elegí **Copiar diagnóstico del chat**. El diagnóstico oculta texto y enmascara teléfonos. Enviáselo al equipo para actualizar los selectores.

### Solución de problemas

- **No pude leer este chat:** WhatsApp pudo cambiar su estructura. Copiá el diagnóstico anonimizado desde el menú y registrá el mensaje manualmente mientras se actualizan los selectores.
- **Configurá el token desde el menú de Tampermonkey:** guardá el token personal desde **Configurar token**.
- **Actualizá el script desde el menú de Tampermonkey:** usá la opción de comprobar actualizaciones o reinstalá desde el link.
- Si el navegador bloquea la instalación, verificá el permiso de scripts de usuario en Chrome/Edge 138+.

## Selectores y fixtures

Los fixtures incluidos son ejemplos sintéticos basados en estructuras conocidas; no se capturó WhatsApp Web real. Deben reemplazarse por HTML real y revisado antes de considerar los selectores validados en producción. El comando de diagnóstico permite recopilar una estructura redacted sin exponer el texto visible.
