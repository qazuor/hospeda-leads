# Spec 85 — Registro automático desde el user script, con anulación

Estado: aprobada por el propietario — 26/10/2026. Es la fase F5 de la spec 83 («captura automática»), con las condiciones aprobadas el 25/10/2026 (`decisiones.md`, «User script de WhatsApp: revisión y próximos pasos»).

## 1. Problema

Hoy cada mensaje de WhatsApp entra al CRM solo si el vendedor abre la vista previa y toca «Registrar mensajes». Se olvida, y la ficha queda incompleta. Registrar solo tiene un riesgo: si el script se equivoca de negocio o registra algo que no correspondía, hoy no hay forma de deshacerlo.

## 2. Objetivo

Registrar sin clic los mensajes nuevos, recibidos y enviados, de los chats donde no hay duda: **un único negocio emparejado**, sin exigir una gestión abierta. En el resto de los chats se sigue preguntando. Cada registro automático queda marcado como tal y se puede **anular con motivo**. Anular deshace sus efectos y libera el mensaje para registrarlo bien.

## 3. Principios

- El script sigue sin enviar, sin hacer clics en WhatsApp y sin leer chats que el vendedor no abrió.
- Un registro automático tiene exactamente los mismos efectos que uno manual (spec 83, spec 84). No hay reglas de negocio nuevas, solo un disparador nuevo.
- El servidor vuelve a validar todas las condiciones. El script no decide solo.
- Anular no borra nada: deja constancia de quién, cuándo y por qué, y devuelve cada efecto a su estado anterior.

## 4. Cuándo registra solo

Se cumplen todas estas condiciones:

1. El interruptor global está activo (admin) y el del vendedor también (§7).
2. El chat abierto se emparejó con **un solo negocio** (por código o por teléfono). Grupos, chats sin asociar y chats con varios negocios quedan fuera.
3. El negocio no está en estado Nuevo, no tiene No contactar ni una restricción activa para WhatsApp, y no está archivado ni fusionado.
4. El vendedor tiene acceso de escritura al negocio. **No se exige una gestión abierta:** el registro de WhatsApp queda a nivel negocio, y así cubre la posventa y los negocios con gestiones cerradas. Un chat personal registrado por error se anula con «Mensaje personal».
5. El mensaje es **posterior a la marca de inicio del chat**: lo que pase primero entre el momento en que se activó el registro automático para ese vendedor y las últimas 24 horas. Nunca se registra historial viejo solo por abrir un chat; para eso sigue «Registrar mensajes».
6. Un enviado solo se registra cuando WhatsApp lo muestra como enviado (una tilde o más). Los que están «pendiente» (reloj) o con error se saltean hasta que cambien.
7. El mensaje no fue anulado antes (§6.4).

El script mira el chat mientras está abierto. Ante cambios en la conversación espera 5 segundos sin cambios y manda un lote, con un máximo de un lote cada 10 segundos por chat y 50 mensajes por lote. Usa el mismo `POST /_api/userscript/register`, con `automatic: true`.

Si falla una condición, el panel dice por qué en una línea («Registro manual: este chat tiene 2 negocios») y todo sigue como hoy.

## 5. Servidor

### 5.1 Migración `042_userscript_auto_register.sql`

- `crm_auto_registrations`: `id uuid`, `account_id`, `user_email`, `channel` ('whatsapp'), `direction` ('in'|'out'), `external_id text NOT NULL`, `message_id uuid NULL` (FK `crm_messages`), `inbound_id NULL` (FK `crm_inbound_messages`), `effects jsonb NOT NULL`, `created_at`, `voided_at`, `voided_by_email`, `void_reason text CHECK (length 3..500)`. Un índice único sobre `(channel, external_id) WHERE voided_at IS NULL` y un índice sobre `(account_id, created_at DESC)`.
- `users.userscript_auto_register boolean NOT NULL DEFAULT true`, el interruptor del vendedor.
- Se agrega el estado `voided` a los CHECK de `crm_messages.status` y de `crm_inbound_messages.status`. En `crm_inbound_messages`, `external_id` pasa a admitir NULL solo si `status='voided'`.

### 5.2 Registro con `automatic: true`

- `registerSchema` admite `automatic?: boolean`. Con `true`:
  - el servidor exige las condiciones 1, 3 y 4 de §4 (sin gestión abierta);
  - rechaza el lote entero con `{ error, reason: "auto_disabled" | "not_eligible" }` y estado 409, sin registrar nada;
  - y rechaza por mensaje los ids anulados antes (`status: 'rejected'`, `reason: 'Anulado antes; registralo a mano si corresponde.'`).
- Cada mensaje creado en modo automático deja una fila en `crm_auto_registrations` con `effects`, la lista exacta de lo que cambió:
  - **Recibido:** `{ inboundId }`. Sigue entrando como `pending_review`, para que el vendedor lo revise como hoy.
  - **Enviado suelto** (`registerUserscriptSent`): `{ messageId, created: true, activityId }`.
  - **Enviado que completó un intento** (`completeUserscriptOpened` / `completeUserscriptManual`): `{ messageId, before: { status, body, textBody, summary, completedAt, completedByEmail, lastInteractionAt, revision }, activity: { id, created } | { id, previousResult }, taskId?, clientMarked?: true }`.
  - **Enviado que solo se vinculó** (envío ya confirmado a mano): `{ messageId, linkedOnly: true }`.
- Los registros manuales no cambian y no dejan fila.
- `GET /_api/userscript/context` devuelve `autoRegister: { enabled, reason?, since }` para el negocio emparejado, con la misma evaluación que el servidor.

### 5.3 Ajustes

- Global: clave `crm_userscript_auto_register` en `app_settings` (`{ "enabled": boolean }`, por defecto `false`), editable por admin en Ajustes del CRM.
- Vendedor: `users.userscript_auto_register`, editable desde «Ajustes» del panel y desde `/userscript` en el CRM (`POST /_api/userscript/preferences`).

## 6. Anular

### 6.1 Quién y dónde

- Pueden anular el vendedor que generó el registro o un admin, con acceso de escritura al negocio.
- **En el CRM:** los mensajes registrados automáticamente llevan la marca «Automático» en «Mensajes y borradores» y en «Mensajes recibidos». Su menú tiene «Anular registro».
- **En el panel:** «Registrados solos» lista los registros automáticos de este chat de los últimos 7 días, con «Deshacer» en cada uno.
- Las dos rutas piden el motivo:
  - «Era de otro negocio»
  - «No era de esta gestión»
  - «Mensaje personal»
  - «Otro», con texto obligatorio.
- `POST /_api/communication` admite la acción nueva `auto_registration_void { id, reason }`, y el script usa `POST /_api/userscript/void`. Las dos llaman a la misma función.

### 6.2 Qué deshace

Todo pasa en una transacción con bloqueo de la comunicación del negocio, y en el orden inverso al que se produjo.

| Caso | Deshace |
|---|---|
| Recibido en `pending_review` o `dismissed` | Pasa a `voided`, se libera `external_id` (queda en el registro de anulación). |
| Recibido en `registered` | **No se anula.** Aviso: «Ya registraste una respuesta con este mensaje. Corregí la respuesta primero.» |
| Enviado suelto | Pasa a `voided`, se libera `external_id` y la actividad se borra lógicamente (`deleted_at`). |
| Enviado que completó un intento | El mensaje vuelve exactamente a `before`: «WhatsApp abierto» o «Intento pendiente» otra vez. Se libera `external_id`. La actividad se borra si la creó este registro; si ya existía, vuelve a su `result` anterior. Si este registro completó la tarea, vuelve a `pending`, siempre que siga como la dejó. Si este registro lo marcó como cliente, se desmarca, siempre que nadie lo haya cambiado después. |
| Enviado que solo se vinculó | Se libera `external_id`. El envío confirmado a mano queda como estaba. |

Si un efecto cambió después del registro, ese efecto no se toca y la respuesta lo informa. Por ejemplo: la tarea se editó, o el negocio se desmarcó como cliente a mano. Ejemplo de respuesta: «Anulado. La tarea no se reabrió porque se modificó después.»

### 6.3 Constancia

- `crm_auto_registrations.voided_at`, `voided_by_email` y `void_reason`.
- Una entrada `auto_registration_voided` en el journal de comunicación, con el antes y el después de cada efecto deshecho y la lista de lo que no se tocó.
- En el historial del negocio se ve «Registro automático anulado: <motivo>».

### 6.4 Después de anular

- El id anulado queda bloqueado para el registro automático, que nunca lo vuelve a registrar.
- «Registrar mensajes» (manual) sí puede registrarlo. Lo puede hacer el mismo vendedor en el negocio correcto, o un admin reasignándolo.

### 6.5 Visibilidad de `voided`

- `voided` queda fuera del historial, la búsqueda, `recentMessages`, Hoy y los conteos de contactado, igual que `cancelled`.
- Se ve solo en el journal y, para admin, en un filtro «Anulados» de «Mensajes y borradores».

## 7. Script

- **Ajustes del panel:** «Registrar solo los chats seguros», interruptor con el estado del servidor. Si el admin lo apagó globalmente, aparece deshabilitado con «Desactivado por un administrador».
- **Vista del chat:** una línea de estado:
  - «Registro automático activo · 3 registrados hoy», con «Ver»;
  - o el motivo por el que este chat no se registra solo.
- **«Registrados solos»:** la lista con fecha, dirección y texto recortado, «Deshacer» y el selector de motivo.
- **Ante un error de red:** reintenta el mismo lote con espera creciente, como máximo 3 veces. Después deja el aviso «No pude registrar 4 mensajes. Registralos con «Registrar mensajes».» y no vuelve a intentar hasta que cambie el chat. Reintentar es seguro porque el servidor deduplica por id.
- **Caché local:** guarda los ids ya enviados, igual que el registro manual, para no reenviarlos.

## 8. Fuera de alcance

- Registrar chats no abiertos o en segundo plano.
- Anular registros manuales; para eso ya existe «Corregir interacción».
- Anular en lote.
- Medios: siguen como «[imagen]», «[audio]».
- Instagram.

## 9. Validación

- **Unit (script):**
  - elegibilidad (un negocio, gestión abierta, marca de inicio de 24 h);
  - salteo de enviados pendientes;
  - espera de 5 s y tope de un lote cada 10 s;
  - reintentos con tope;
  - que un id anulado no se reenvía;
  - estados del panel y «Deshacer».
- **Integración (`scripts/test-userscript.ts`):**
  - `automatic` rechazado con el interruptor global o el del vendedor apagado, en estado Nuevo, con No contactar o sin acceso de escritura; aceptado sin gestión abierta;
  - cada caso de `effects`;
  - anular cada caso de la tabla de §6.2, incluido el que no puede deshacer un efecto modificado después;
  - recibido `registered` no anulable;
  - id anulado rechazado en automático y aceptado en manual;
  - `voided` fuera del historial y de Hoy;
  - permisos: otro vendedor no puede anular.
- **Manual en WhatsApp real:**
  - activar, recibir y enviar en un chat de prueba y ver que se registra solo;
  - abrir un chat con dos negocios y ver que no se registra;
  - anular desde el panel y desde el CRM y comprobar que el intento vuelve a «WhatsApp abierto».

## 10. Decisiones (propietario, 26/10/2026)

1. **Valor inicial:** el interruptor global arranca apagado y lo activa un admin. El del vendedor arranca encendido.
2. **Quién anula:** el vendedor que lo generó o un admin, sin límite de tiempo.
3. **Marca de inicio:** se registran solo los mensajes posteriores a la activación y de las últimas 24 horas.
4. **Sin gestión obligatoria:** alcanza con un único negocio emparejado, que no esté en Nuevo ni tenga No contactar. Esto reemplaza la condición «y están en gestión» del 25/10/2026.
