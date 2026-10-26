# Spec 87 — Reglas comerciales: acuerdo al ganar, tareas al responder y mensajes por delegación

Estado: aprobada por el propietario — 26/10/2026. Resuelve las cuatro preguntas abiertas de la [revisión de reglas comerciales](48-commercial-rules-review.md) (`pendientes.md`, «Reglas comerciales: decisiones pendientes»).

## 1. Decisiones

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Evidencia para cerrar como ganada y campos obligatorios del acuerdo | **Mínimo obligatorio cuando el cierre convierte en Cliente:** «Qué se acordó» y «Persona que aceptó». |
| 2 | Si una respuesta espontánea propone completar pendientes | **Proponer sin decidir solo:** el diálogo lista las tareas pendientes de la gestión, sin marcar, y el vendedor tilda las que da por resueltas. |
| 3 | Si un delegado puede preparar o enviar mensajes | **Sí, solo dentro de la tarea delegada**, con las restricciones de siempre y la constancia «por delegación de». |
| 4 | Registro de pagos en el CRM | **No.** Los pagos viven en su sistema de origen y el CRM nunca afirma que alguien pagó. No se implementa nada. |

## 2. Acuerdo obligatorio al ganar (decisión 1)

- **Cuándo aplica:** el cierre como ganada marca al negocio como Cliente, en cualquiera de estos casos:
  - `main:won` y `partner:won`, que marcan siempre;
  - `editor:proposal_won` o una etapa ganada heredada sin tipo, cuando se tilda «Marcar este negocio como cliente».
- **Qué exige:** `closing.agreement` («Qué se acordó») y `closing.person` («Persona que aceptó»), cada uno con al menos 3 caracteres útiles, después de recortar espacios.
- **Cuándo no aplica:** los demás cierres ganados, que no convierten en Cliente, siguen como hoy:
  - `provider:participates`;
  - `editor:collaborates`;
  - `accompaniment:completed`;
  - `editor:proposal_won` sin tildar.
- **Servidor:** la transición rechaza el cierre sin esos campos con «Completá qué se acordó y quién aceptó para marcar al negocio como Cliente.». «Revisar acuerdo y entrega» no permite vaciarlos después en una gestión que convirtió en Cliente.
- **Interfaz:** los dos campos se marcan como obligatorios solo cuando aplica. El botón explica qué falta.
- **Sin migración ni cambios sobre lo existente:** los cierres anteriores no se tocan. El resto del acuerdo (material, responsable de la entrega, fecha) sigue opcional.

## 3. Tareas al registrar una respuesta (decisión 2)

- **Qué ve el vendedor:** si la gestión de la respuesta tiene tareas pendientes, el diálogo «Registrar respuesta» las muestra, sin marcar, con su título y su fecha, bajo «¿Esta respuesta resuelve alguna tarea?».
- **Qué cambia en `response_create`:** admite `resolveTaskIds: uuid[]`, con hasta 20 ids. En el servidor, en la misma transacción:
  - cada tarea tiene que estar pendiente, ser de esa gestión o de su negocio sin gestión, y el usuario tiene que poder registrar su resultado;
  - si una no cumple, se rechaza la respuesta entera, sin registro parcial;
  - las tareas tildadas se completan con el resultado «Resuelta por la respuesta del cliente» y el vínculo `communication_response_id` a la respuesta, que ya existe;
  - el reintento idempotente de la misma respuesta no vuelve a completar nada.
- **Lo que no cambia:** nada se completa ni se cancela sin que el vendedor lo tilde. Las secuencias asistidas mantienen su regla.

## 4. Mensajes por delegación (decisión 3)

- **Quién:** el asignado de una tarea **pendiente**, que no es responsable de la gestión ni admin, puede preparar y enviar mensajes **desde esa tarea**:
  - a los contactos del negocio de la tarea;
  - con los modelos compatibles con su gestión.
- **Mismos controles que el responsable:** No contactar, restricciones por canal, permisos de lectura, revisión de modelos y límites de envío.
- **Constancia:** el mensaje guarda `delegated_task_id` y el actor real. En la ficha y el historial se ve «Enviado por [delegado] por delegación de [responsable]». El journal registra la delegación.
- **Lo que no puede:**
  - cambiar la etapa, cerrar o reabrir la gestión;
  - escribir desde la ficha fuera de la tarea;
  - usar la tarea después de completarla o cancelarla: el permiso se evalúa en cada envío.
- **Servidor:** el permiso de comunicación acepta un `taskId` opcional. Sin él, la regla de hoy no cambia: solo el responsable de la gestión o un admin. Con él, valida que la tarea esté pendiente, sea del usuario y corresponda al negocio y a la gestión del mensaje.
- **Migración:** `crm_messages.delegated_task_id uuid NULL` con su FK a `crm_tasks`, más el índice.

## 5. Validación

- **Integración:**
  - ganar `main` o `partner` sin acuerdo es rechazado, y con acuerdo es aceptado;
  - `provider` gana sin acuerdo;
  - `editor:proposal_won` exige acuerdo solo si se tilda «Marcar como cliente»;
  - no se puede vaciar el acuerdo después;
  - respuesta con tareas: se completan las tildadas, una tarea ajena rechaza todo y el reintento es idempotente;
  - delegado: envía desde su tarea pendiente, recibe 403 sin tarea, con la tarea completada o con un contacto de otro negocio, y queda bloqueado por No contactar; la constancia queda en el journal.
- **Componentes:** campos obligatorios condicionales, lista de tareas en el diálogo y acción de mensajes en la tarea delegada.
- **Guía de uso:** actualizar cerrar como ganada, registrar respuesta y tareas delegadas.
