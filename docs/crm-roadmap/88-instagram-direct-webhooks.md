# Spec 88 — Instagram Direct por la API oficial de Meta (F4 de la spec 83)

Estado: borrador para revisión del propietario — 26/10/2026. Reemplaza la sección 9 de la [spec 83](83-registro-automatico-canales.md), que proponía un user script en `instagram.com/direct`.

## 1. Por qué la API oficial

- **Desde qué cuenta se escribe:** los vendedores escriben desde la cuenta oficial de Hospeda (propietario, 26/10/2026). Un user script leería el HTML de Instagram, que está ofuscado y cambia seguido. La API oficial no depende de ese HTML y registra sin clics.
- **Prueba real del 26/10/2026:**
  - **App de Meta:** caso de uso «Manage messaging and content on Instagram», con «API setup with Instagram Login» y la cuenta profesional de Hospeda.
  - **Revisión:** no hizo falta. Con acceso estándar alcanza, porque la app es del mismo negocio que la usa.
  - **Modo desarrollo:** no se envía ningún aviso. Hay que **publicar** la app.
  - **Suscripciones:** además de suscribir el campo `messages`, hay que activar la suscripción de la cuenta («Webhook subscription»).
  - **Qué llega:**
    - el mensaje del cliente (`recipient.id` = la cuenta de Hospeda);
    - la respuesta de Hospeda enviada desde la app de Instagram, con `message.is_echo=true` (`sender.id` = la cuenta de Hospeda).
  - **Firma:** `X-Hub-Signature-256` es la HMAC-SHA256 del cuerpo con el secreto de la app de Instagram, y validó.
  - **Contenido del aviso:** `entry[].messaging[]` con `sender.id`, `recipient.id`, `timestamp`, `message.mid`, `message.text`.
  - **No trae el usuario de Instagram,** solo un identificador interno (IGSID).

## 2. Alcance

**Fase 1 (esta spec): recibir y registrar.**
- Todo mensaje directo que entra a la cuenta de Hospeda o sale de ella queda en el CRM.
- Se asocia al negocio por su usuario de Instagram.
- Se responde desde la app de Instagram, como hoy.

**Fuera de alcance:**
- responder desde el CRM, que sería la fase 2, con la ventana de 24 h de Meta;
- adjuntos (se guarda solo el aviso «Adjunto: imagen», sin descargar);
- comentarios en publicaciones;
- historias y menciones;
- otras cuentas que no sean la de Hospeda.

## 3. Recepción

- **Endpoint `GET /_api/inbound/instagram`:** responde la verificación de Meta (`hub.mode=subscribe`, `hub.verify_token` contra `INSTAGRAM_VERIFY_TOKEN`) devolviendo `hub.challenge`, o 403 si no coincide.
- **Endpoint `POST /_api/inbound/instagram`:**
  - valida `X-Hub-Signature-256` con `INSTAGRAM_APP_SECRET` sobre el cuerpo crudo, con comparación de tiempo constante. Sin firma válida devuelve 401 y no registra nada;
  - acepta solo `object='instagram'`;
  - responde 200 rápido: el procesamiento es corto y en la misma transacción, sin colas;
  - ignora eventos que no sean mensajes de texto o adjuntos: `messaging_seen`, reacciones, `postback`;
  - descarta entradas cuyo `entry.id` no sea la cuenta configurada (`INSTAGRAM_ACCOUNT_ID`).
- **Idempotencia:** Meta reintenta. `external_id = message.mid`, con `UNIQUE(channel, external_id)`, que ya existe en `crm_inbound_messages` y en `crm_messages`. Un reintento no duplica.
- **Límites:** cuerpo de hasta 1 MB y texto de hasta 50 000 caracteres, igual que `text_body`.

## 4. Quién es la otra persona

- **Cuál es el contacto:**
  - en un mensaje entrante es `sender.id`;
  - en un eco es `recipient.id`.
- **Cómo se obtiene su usuario:** el CRM consulta `GET graph.instagram.com/<IGSID>?fields=username,name` con el token de la cuenta y guarda el resultado en una tabla nueva, `crm_instagram_contacts`:
  - columnas `igsid`, `username`, `name`, `fetched_at`;
  - refresca a los 30 días;
  - si la consulta falla, el mensaje igual se guarda, como Sin asociar con `from_address = igsid`, y se reintenta en el próximo mensaje.
- **Asociación:** se compara el usuario normalizado (minúsculas, sin `@`, sin URL ni barra final) con `crm_accounts.perfil_instagram` normalizado igual. Se ignoran los negocios en Papelera.
  - **Un solo negocio:** se asocia.
  - **Ninguno, o más de uno:** queda Sin asociar y se resuelve a mano, con la pantalla que ya existe.
- **Índice:** expresión normalizada sobre `perfil_instagram`, en una migración nueva.

## 5. Qué se registra

- **Mensaje del cliente:** va a `crm_inbound_messages`, con:
  - `channel='social'` y `channel_detail='instagram'`;
  - `source='instagram_webhook'`, valor nuevo en el CHECK;
  - `match_method='instagram_handle'` o `none`;
  - `from_address=@usuario`, `from_name=name` y `received_at=timestamp`.
  - **Asociado a un solo negocio:** queda `pending_review` y aparece en «Mensajes recibidos» y «Respuestas nuevas», como el email.
  - **Sin asociar:** queda `unmatched`.
  - Registrarlo como respuesta sigue siendo una acción del vendedor, con el mismo camino que `response_create`.
- **Eco (respuesta de Hospeda):** va a `crm_messages` como mensaje enviado, con:
  - `channel='social'`, `status='manual_sent'` y `external_id=mid`;
  - el texto, el destinatario `@usuario` y la hora.
  - **Asociado:** queda en la ficha del negocio. Si hay una única gestión abierta, se vincula a ella; si no, queda solo a nivel del negocio.
  - **Sin asociar:** queda como inbound `unmatched`, marcado como saliente, para no perderlo. Ver la decisión D2.
  - **Autor:** no hay vendedor identificable, porque lo mandó «la cuenta de Hospeda». Se registra con un actor de sistema `instagram@hospeda`, y la ficha lo muestra como «Enviado desde Instagram de Hospeda».
- **Lo que no cambia:**
  - un mensaje recibido o enviado no es evidencia de aceptación, pago ni avance de etapa: no se cambia ninguna etapa;
  - No contactar y las restricciones solo se muestran como aviso en la ficha. No se bloquea la recepción, porque el mensaje ya existió.
  - Igual que con el email, nunca se envía nada por la API en esta fase.

## 6. Token de la cuenta

- La consulta del usuario necesita el token de la cuenta de Hospeda. El token de larga duración vence a los 60 días y se renueva con `GET graph.instagram.com/refresh_access_token`, que devuelve uno nuevo.
- Cómo se guarda y se renueva se decide en D1.
- **Si el token vence o es revocado:** los mensajes se siguen guardando como Sin asociar con el IGSID, porque la firma no depende del token, y Configuración → Integraciones muestra «Instagram: renová la conexión».

## 7. Configuración y producción

- **Variables en Coolify:**
  - `INSTAGRAM_APP_SECRET`;
  - `INSTAGRAM_VERIFY_TOKEN` (32 o más caracteres);
  - `INSTAGRAM_ACCOUNT_ID`;
  - más lo que defina D1.
  - **Sin `INSTAGRAM_APP_SECRET`:** el endpoint responde 503 y no registra nada.
- **En Meta:**
  - Callback URL `https://crm.hospeda.com.ar/_api/inbound/instagram`, con el mismo verify token;
  - campo `messages` y suscripción de la cuenta activados;
  - la app queda publicada.
- **Datos personales:** la app ya publicada exige URLs de política de privacidad y de eliminación de datos. Hay que confirmar que las URLs cargadas sean las definitivas de Hospeda.

## 8. Decisiones abiertas (propietario)

**D1. Cómo guardar y renovar el token.**
1. **Variable de entorno y renovación manual:**
   - qué es: `INSTAGRAM_ACCESS_TOKEN` en Coolify; cada menos de 60 días un admin genera uno nuevo y lo reemplaza;
   - a favor: simple, y el secreto vive donde viven los demás;
   - en contra: si nadie lo renueva, deja de asociar. El CRM avisa 7 días antes.
2. **Guardado en la base y renovado automáticamente:**
   - qué es: el token se guarda cifrado con una clave de Coolify y un proceso diario lo renueva;
   - a favor: no se vence;
   - en contra: guarda un secreto en la base y agrega un proceso programado nuevo, que hoy el servidor no tiene.
- **Recomendación: 1** para empezar, con el aviso de vencimiento. Se pasa a la 2 si la renovación manual molesta.

**D2. Ecos sin negocio asociado.**
1. **Guardarlos en «Sin asociar»** junto a los entrantes, para asociarlos a mano.
2. **Descartarlos.**
- **Recomendación: 1:** no se pierde lo que dijo Hospeda.

**D3. Mensajes de clientes asociados: ¿se registran solos?**
1. **Quedan en «Por revisar»,** como el email. El vendedor decide si es una respuesta y de qué categoría.
2. **Se registran solos como respuesta,** como el registro automático de WhatsApp de la spec 85.
- **Recomendación: 1:** la categoría de la respuesta (interesado, rechaza, etc.) la tiene que elegir una persona. El registro automático de la 85 registra el mensaje, no clasifica la respuesta.

## 9. Validación

- **Unitarias:** verificación GET; firma válida, inválida o ausente; normalización de usuarios; reintento idempotente; eventos ignorados.
- **Integración** (`scripts/test-instagram.ts`, con la API de Meta simulada):
  - entrante asociado, sin asociar y con dos negocios;
  - eco asociado, con y sin gestión abierta;
  - el mismo `mid` dos veces;
  - token vencido, que deja Sin asociar con el IGSID;
  - `entry.id` ajeno, que se descarta;
  - sin secreto, que responde 503.
- **Componentes:** el mensaje de Instagram en «Mensajes recibidos» y en la ficha, el eco con «Enviado desde Instagram de Hospeda» y el aviso de token en Configuración.
- **Prueba real con la app ya publicada:** un mensaje y una respuesta, contra el staging local con un túnel temporal, como en la prueba del 26/10/2026.
- **Guía de uso:** cómo llegan los mensajes de Instagram y qué hacer con los Sin asociar.
