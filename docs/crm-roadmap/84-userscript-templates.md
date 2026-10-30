# Templates del CRM desde WhatsApp Web (user script)

**Estado:** Aprobado; en implementación
**Fecha:** 2026-10-25
**Base:** `staging` en `05943cf` (PR #244, user script 1.2.0)
**Mockup aprobado:** https://claude.ai/artifact/SVWYec9ocdExyT58i2MyhV (tableros 3a, 3b y 3c)

## 1. Problema

Para mandar un modelo del CRM por WhatsApp, el vendedor tiene que ir a la ficha, elegir «Contactar», preparar el mensaje y abrir WhatsApp desde ahí. Si ya está conversando con el negocio en WhatsApp Web, ese ida y vuelta lo saca del chat y no lo usa.

## 2. Objetivo

Desde el panel de Hospeda en WhatsApp Web, elegir un modelo compatible con la gestión del negocio, ver el texto con los datos ya completos y dejarlo escrito en la caja del chat para que el vendedor lo revise y lo envíe.

## 3. Principios

- **El script nunca envía.** El texto se pega en la caja de WhatsApp o se copia. Enviar es siempre la tecla Enter o el botón de WhatsApp, apretados por una persona.
- **Misma lógica comercial que el CRM.** Preparar usa la acción `prepare` de Comunicación: compatibilidad de modelos, estado Nuevo, No contactar, permisos de escritura y render de variables. No se duplica ninguna regla en el script.
- **Pegar no es enviar.** Pegar o copiar marca el mensaje como «WhatsApp abierto · envío no confirmado» (`dispatch`, igual que abrir WhatsApp desde el CRM). El envío se confirma cuando el mensaje aparece enviado en el chat y se registra (#227 ya completa ese `whatsapp_opened`).
- **Nunca a otra persona.** Si el teléfono del chat se conoce y no coincide con el de la persona elegida, no se pega.

## 4. Servidor

Tres endpoints nuevos, con la misma autenticación que el resto del script (Bearer `hcu_…` y control de versión 426) y Zod para cada entrada. Todos usan las funciones de `communicationService` con el usuario del token.

### 4.1 `GET /_api/userscript/templates?accountId=<id>`

Devuelve lo que el panel necesita para elegir:

- `leads`: gestiones **abiertas** del negocio que el usuario puede modificar, con `id`, nombre, tipo de gestión y etapa.
- Por gestión, `templates`: modelos de WhatsApp activos y compatibles (`templateCompatibility` + `orderTemplatesBySpecificity`, como `ContactTemplateDialog`), con `id`, nombre y si es el recomendado (el primero por especificidad).
- Por gestión, `contacts`: personas elegibles con nombre y teléfono, y cuál es la predeterminada (la que `resolveCommercialContact` elige sin `contactId`).
- `blocked`: motivo si no se puede preparar nada (estado Nuevo, No contactar activo en WhatsApp, sin gestiones abiertas, sin permiso de modificar). El texto es el que muestra el panel.

Solo lectura. Sin acceso al negocio responde como `context` (sin filtrar datos de otros).

### 4.2 `POST /_api/userscript/prepare`

Entrada: `{ id: uuid, leadId, contactId: id|null, templateId }`. Llama a `mutateCommunication` con `action: 'prepare'` y `channel: 'whatsapp'`. Reutiliza el borrador si ya existe (comportamiento actual de `prepare`).

Salida: `{ messageId, revision, body, recipient, recipientName, unresolved: string[] }`, donde `body` es el texto final para WhatsApp y `unresolved` las variables sin dato (`unresolvedTemplateVariables`). Errores de negocio (Nuevo, No contactar, incompatibilidad, sin teléfono) vuelven con su mensaje y status 403/400.

### 4.3 `POST /_api/userscript/dispatch`

Entrada: `{ id: uuid, revision }`. Llama a `mutateCommunication` con `action: 'dispatch'`, `confirm: true`. El mensaje pasa a `whatsapp_opened`. Se llama justo antes de pegar o copiar. Si el borrador cambió (409), el panel vuelve a preparar.

### 4.4 «No lo voy a enviar»

`POST /_api/userscript/outcome` con `{ id, event: 'manual_not_sent' }`, que usa la acción `outcome` existente. Deja constancia de que el WhatsApp abierto no se envió.

## 5. Script

### 5.1 Entrada

En la vista del negocio, junto a «Registrar mensajes», el botón «Mandar un mensaje». Deshabilitado con motivo si `blocked` (mockup 3c).

### 5.2 Vista «Mandar un mensaje» (mockup 3a)

- Si hay más de una gestión abierta, un selector de gestión.
- Lista de modelos como opciones; el recomendado primero, marcado «Recomendado para la etapa actual».
- Selector «Persona» con la predeterminada elegida.
- Al elegir modelo o persona, `prepare` y vista previa con el texto final. Variables sin dato resaltadas; con `unresolved` no vacío, «Pegar en el chat» queda deshabilitado con el aviso «Falta …» (mockup 3c).
- Aviso fijo: «El mensaje no se envía solo: se pega en el chat para que lo revises y aprietes Enter.»
- Botones «Pegar en el chat» (principal) y «Copiar».

### 5.3 Pegar (mockup 3b)

1. Verificar que el chat abierto sigue siendo el del negocio (`isCurrentChat`) y, si el teléfono del chat se conoce, que coincide con `recipient` (comparando solo dígitos). Si no, aviso y no se pega.
2. `dispatch`.
3. Escribir el texto en la caja de WhatsApp conservando los saltos de línea: primero un `paste` nativo (lo que hace Ctrl+V) y, si no entra, línea por línea con `insertText` e `insertLineBreak` (nunca Enter). Si la caja ya tenía texto: el modelo que pegó el script se reemplaza sin preguntar; cualquier otro texto se reemplaza solo si el vendedor confirma «Reemplazar». Todo reemplazo cierra como no enviado el intento pegado antes (el script lo recuerda por negocio durante una semana, aunque se recargue WhatsApp).
4. Verificar que la caja contiene el texto. Si no, mostrar «No pude escribir en la caja de WhatsApp. Copialo y pegalo con Ctrl+V.» con «Copiar texto» y «Reintentar» (mockup 3c).
5. Vista «Listo, está en el chat» con «Volver al negocio», «Cambiar de modelo» y «No lo voy a enviar».

«Copiar» hace `dispatch` y copia al portapapeles, con la misma confirmación.

### 5.4 Fuera de alcance

Editar el texto dentro del panel (se edita en la caja de WhatsApp), email, adjuntos, programar envíos y modelos generales sin gestión (`prepare_general`).

## 6. Validación

- Unit (script): elección de recomendado y persona predeterminada, bloqueo por `blocked` y por `unresolved`, verificación de teléfono, escritura en la caja con fallback a copiar, y que nunca se dispara un envío (ningún clic en el botón de enviar ni Enter sintético).
- Integración (`scripts/test-userscript.ts`): `templates` filtra por compatibilidad, gestiones abiertas y permisos; `prepare` respeta Nuevo, No contactar e incompatibilidad y reutiliza borrador; `dispatch` deja `whatsapp_opened`; registrar luego el enviado completa ese intento; `outcome` deja `manual_not_done`.
- Manual en WhatsApp real: pegar en un chat de prueba, enviar y registrar.

## 7. Decisiones (propietario, 25/10/2026)

- Aprobado con el mockup 3a–3c. El script no envía; pegar equivale a «WhatsApp abierto».
- Va antes que el registro automático (spec siguiente) y las insignias en la lista de chats.
- Ajustes tras la prueba en WhatsApp real: botones fijos al pie con la lista con scroll propio; pegar reemplaza el texto como se describe en 5.3; al pasar el mouse por un modelo, un popover muestra la plantilla cruda con las variables sin completar (sin preparar borradores).
- Registrar un enviado completa un «WhatsApp abierto» (o un envío confirmado a mano sin id de WhatsApp) solo si su texto se parece al preparado: comparten al menos la mitad de las palabras (`userscript/src/textMatch.ts`). Un mensaje escrito a mano se registra como envío suelto y el intento queda abierto para cerrarlo. Rige también para «Contactar» del CRM.
