# Comunicación: análisis de brechas entre la spec y el código

- **Fecha:** 13/10/2026
- **Spec de referencia:** [56 — Comunicación, versión 1.4](56-communication-product-spec.md)
- **Estado:** etapa 2 completada; etapa 3 autorizada y en implementación
- **Implementación:** en curso en `feat/communication-crm`; sin ejecutar migraciones ni operaciones de base de datos

## Resumen ejecutivo

Este documento registra la brecha que se encontró antes de implementar. La app ya contaba con modelos para Email/WhatsApp, envío de Email por Brevo, restricciones, secuencias asistidas, eventos e historiales. El estado de implementación posterior se anota al final; la evidencia de pruebas y límites corresponde al checkout aislado.

La spec 1.4 define un flujo más amplio y sencillo: contactar al negocio sin crear una gestión, registrar respuestas como hechos propios, sumar llamadas/redes/Otros al mismo flujo y aplicar las reglas por estado y bloqueo. Email conserva el envío por Brevo por decisión del propietario.

Las principales brechas son:

1. **No se puede iniciar un contacto general directamente.** El flujo desde Negocio exige una gestión abierta o propone crearla. La preparación del mensaje también exige `leadId`.
2. **Email se envía desde el CRM mediante Brevo.** Se conserva por decisión del propietario para mantener evidencia de entrega y rebotes.
3. **No están los canales sociales/Otros ni el ciclo de intento manual pendiente.** Las mutaciones de mensaje aceptan únicamente Email y WhatsApp.
4. **Las respuestas son actividades/resultados generales.** No existe el catálogo aprobado de respuestas ni la corrección auditable de respuesta que la spec define.
5. **No contactar se activa desde resultados de trabajo o por acción administrativa.** No existe el diálogo único para confirmar el bloqueo y elegir gestiones a cerrar; tampoco la corrección automática que levanta el bloqueo.
6. **Las reglas no aplican los estados comerciales nuevos en el servidor.** La comprobación de salida evalúa papelera, No contactar y restricciones, pero no el estado `Nuevo`, `Archivado` ni si la gestión está abierta.
7. **El sistema de modelos no mantiene versiones restaurables.** La edición cambia el mismo registro; el historial conserva snapshots de mensajes, no versiones administrables del modelo.
8. **Las secuencias asistidas actuales se retirarán.** Generan cadenas de tareas y borradores sin enviar automáticamente; el propietario prioriza un único flujo más sencillo y autorizó limpiar sus artefactos de prueba atribuibles.

No ejecuté tests, migraciones, llamadas a la base ni acciones de UI. El análisis es del código presente en el worktree, no una afirmación sobre producción.

## Alcance y confiabilidad de la inspección

- Revisé UI, endpoints, servicios, permisos, migraciones y pruebas existentes relacionados con comunicación, trabajo, modelos e historial.
- El worktree está en `feat/business-management-state-model`, HEAD `b360836a3ecbb7aa5b4bdd6ba22898860a9c2c4a`, con numerosas modificaciones locales sin commit. La referencia remota consultada para `main` fue `fdd9e14fb2672b6c30ba37d81e2e1b6dd0771284`.
- Por eso, el informe describe el **código de este worktree** —incluidos cambios locales— y no atribuye sus modificaciones a un commit estable.
- Las instrucciones indicaban leer `.qz/project.json`, pero ese archivo no existe en la raíz del worktree. Se usaron las instrucciones del proyecto facilitadas por el propietario y la documentación disponible.
- No se leyó `.env` ni otra fuente de secretos. No se conectó a ninguna base de datos.
- Se inspeccionaron suites Playwright existentes, pero no se ejecutaron. La guía advierte que los tests/seed deben correr solo contra bases locales descartables; este worktree contiene un socket de réplica y el objetivo era read-only.

## Cómo funciona hoy

### Desde el negocio

El botón **Contactar** abre `BusinessContactDialog`. Carga gestiones, modelos y mensajes recientes. Si hay una gestión abierta, permite elegir una (cuando hay varias) y un canal Email o WhatsApp; si no hay ninguna, pide preparar una gestión antes de contactar. No ofrece contexto General desde este flujo. Luego abre otro diálogo para elegir el destinatario y modelo o escribir desde cero. Ver [BusinessContactDialog](../../src/components/BusinessContactDialog.tsx#L18) y [CommercialPanel](../../src/components/CommercialPanel.tsx#L98).

### Desde una tarea o una gestión

`TaskContactDialog` conserva el contexto de la tarea. Para una llamada puede abrir `tel:` y luego registrar el resultado. Para Email/WhatsApp abre el editor de mensaje; las tareas generales vuelven a `BusinessContactDialog`, que termina exigiendo una gestión para preparar mensajes. Tener una tarea delegada no concede permiso de envío. Ver [TaskContactDialog](../../src/components/TaskContactDialog.tsx#L20) y [reglas de acceso](../../src/helpers/crmPermissions.ts#L10).

### Preparar y enviar un mensaje

`ContactTemplateDialog` selecciona destinatario, muestra modelos compatibles y permite texto libre. El mensaje se guarda como borrador; `MessageComposer` permite editarlo, guardar y revisar una vista final, marcar que revisó contenido/destinatario y ejecutar la acción.

- **Email:** el servidor lo envía directamente por Brevo. Conserva outbox, estado de proveedor, resultado incierto y webhook de eventos. La app distingue aceptación de entrega.
- **WhatsApp:** el servidor registra `whatsapp_opened` y devuelve un enlace `wa.me`; el usuario debe confirmar manualmente si lo envió. Abrir el enlace no se toma como envío.
- El mensaje conserva canal, destinatario, persona, gestión, plantilla snapshot, autor y actividad vinculada. Un borrador se puede editar o cancelar; mensajes utilizados no tienen flujo de corrección de estado final como el de la spec.

Evidencia: [composer](../../src/components/MessageComposer.tsx#L27), [mutaciones/API](../../src/endpoints/communication.schema.ts#L4), [dispatch y estados](../../src/helpers/communicationService.ts#L137), [webhook Brevo](../../src/endpoints/communication.ts#L17), [tablas de comunicación](../../migrations/010_communication_resources.sql#L2).

### Resultados y respuestas

La respuesta se registra como `crm_activity` o como resultado de mensaje/tarea. Hay outcomes como `no_answer`, `interested`, `replied`, `not_interested`, `do_not_contact` y otros vinculados al propósito. El registro admite actividad general o por gestión, canal, resumen/notas, autor, fecha y contactos. No existe un registro de respuesta con el catálogo de ocho categorías de la spec ni un campo separado para texto exacto recibido.

Cuando el resultado de trabajo es `do_not_contact`, el servidor activa el booleano global del negocio. El flujo no pide confirmar el alcance, no muestra el diálogo de gestiones opcionales a cerrar y no limita la operación a una respuesta entrante. La mutación está sujeta al responsable del negocio/gestión, administrador o ciertos permisos de tarea delegada; no a cualquier usuario como requiere la spec. Ver [resultados](../../src/helpers/workOutcomes.ts#L1), [guardado y permisos de trabajo](../../src/endpoints/work.ts#L131) y [activación actual](../../src/endpoints/work.ts#L163).

El bloqueo también se puede cambiar desde `ContactPolicy`, pero esa acción está reservada al administrador y pide motivo. La corrección de una actividad que tenía `do_not_contact` no desactiva automáticamente el booleano; la lógica comprobada activa el valor cuando corresponde, pero no implementa la corrección con desactivación automática.

### Restricciones técnicas

`crm_contact_restrictions` conserva restricciones por cuenta, persona o gestión, con canal `email`, `whatsapp` o `all`, motivo, actor y levantamiento auditado. El servidor bloquea la preparación/envío si encuentra No contactar o una restricción activa.

- La UI de `CommunicationPanel` considera que puede escribir el responsable del negocio o de la gestión, pero la mutación pasa por `leadFor(..., write=true)`, que exige responsable de la gestión o administrador. Para un responsable del negocio que no lleve esa gestión, el control de alta puede aparecer habilitado y terminar en 403.
- Puede crear una restricción un usuario con acceso de escritura al contexto, no solamente un administrador.
- Levantarla sí está reservado a administradores y requiere motivo.
- El webhook de Brevo registra y reconcilia aceptación/entrega/rebote, pero no crea automáticamente una restricción por falla permanente.
- Una restricción de canal general sin persona queda asociada a una gestión mediante `lead_id`; la spec requiere alcance negocio+canal general, independiente de cada gestión.
- La tabla no modela redes/Otros ni diferencia una restricción técnica automática de una marcada manualmente por administrador.

Ver [servicio de comunicación](../../src/helpers/communicationService.ts#L23), [mutaciones](../../src/helpers/communicationService.ts#L87), [endpoint de configuración de No contactar](../../src/endpoints/pipeline.ts#L89) y [esquema de restricciones](../../migrations/010_communication_resources.sql#L2).

### Modelos

Los modelos son registros `message_templates` activos, limitados por esquema a Email/WhatsApp. El panel de modelos permite crear, editar, duplicar y desactivar (baja lógica). La edición actualiza el mismo registro; no hay versiones consultables/restaurables. Los mensajes guardan un snapshot del modelo al prepararse, lo cual conserva el texto usado en esa interacción, pero no permite a un administrador restaurar versiones del catálogo.

La compatibilidad usa canal, vertical y perfil comercial. Cuando falta el dato de contexto se muestran todos; cuando existe, se excluyen modelos con una vertical/perfil distinto. La lista de contacto no ordena específicamente primero los modelos más específicos. Las variables disponibles son más amplias que el catálogo aprobado (persona, ciudad, teléfono, Email, web, tipo/subtipo y remitente). Los valores faltantes se sustituyen por texto vacío; no se marca la variable ni se pide completarla o quitarla.

Evidencia: [tabla y snapshots](../../migrations/001_initial.sql#L141), [render de variables](../../src/helpers/renderMessageTemplate.tsx#L1), [compatibilidad](../../src/helpers/messageTemplatePolicy.ts#L1), [guardado de modelo](../../src/endpoints/settings_save_POST.ts#L287), [snapshot al preparar](../../src/helpers/communicationService.ts#L32).

### Secuencias asistidas

La sección **Mensajes y seguimiento asistido** permite a responsables y administradores iniciar una secuencia configurada por un administrador. Cada paso crea una tarea futura y un borrador vinculado. El usuario debe revisar y enviar cada mensaje; la secuencia no envía sola. Se puede pausar, reanudar con fecha o cancelar. Ciertos resultados, cierres, Cliente y No contactar detienen secuencias.

Esto no aparece en la spec 1.2 y queda pendiente decidir cómo encaja con el recorrido simplificado. Mantenerlo puede añadir una vía paralela y conceptos adicionales. Retirarlo afecta tareas, borradores y ejecuciones históricas, por lo que no debe decidirse implícitamente.

Evidencia: [panel](../../src/components/CommunicationPanel.tsx#L13), [creación de tareas y borradores](../../src/helpers/communicationService.ts#L104), [modelo de datos](../../migrations/010_communication_resources.sql#L10) y [parada por resultados](../../migrations/012_contextual_work.sql#L1).

### Historial

- El historial del negocio presenta actividades con resultados y mensajes usados, agrupa el mensaje con su actividad y conserva texto, canal, destinatario y estado visible.
- El timeline de una gestión muestra sus mensajes y journal.
- El journal global incorpora journals comercial, de trabajo, recursos y pipeline. Los cambios de mensaje/restricción generan filas en `crm_resource_journal`; actividades generan `crm_work_journal`.

Esto ofrece buena cobertura histórica, pero la spec requiere eventos por cada transición de intento, respuesta y bloqueo, con vínculo explícito entre evento origen y efecto automático. No hay una entidad respuesta independiente ni una operación de rectificación con nota obligatoria que garantice ese encadenamiento. El journal de recursos registra antes/después por fila; no equivale por sí solo al historial de correcciones de producto requerido.

Evidencia: [historial del negocio](../../src/helpers/businessHistoryServer.ts#L5), [presentación](../../src/components/BusinessHistory.tsx#L24), [unión global](../../src/helpers/globalHistoryServer.ts#L8), [auditoría de recursos](../../migrations/010_communication_resources.sql#L60) y [auditoría de trabajo](../../migrations/006_tasks_activities.sql#L61).

## Matriz de brechas

| Área de la spec | Estado | Evidencia y efecto |
|---|---|---|
| Contexto General sin gestión | **No implementado** | Mensaje requiere `leadId`; desde Negocio sin gestión se propone crear una. Impide cumplir el contacto General sin crear una gestión. |
| General o cualquier gestión abierta | **Parcial** | Se ofrece selección entre varias abiertas, pero desde Negocio no se ofrece General y no se elige explícitamente cuando hay una sola. |
| Verificación de negocio Nuevo | **No implementado** | No hay propósito Verificación ni regla de elegibilidad por estado en `assertContactAllowed`. |
| Bloqueo de Archivado y cierre de gestión | **No implementado en comunicación** | La autorización histórica `archivedAt` permite lectura administrativa; `assertContactAllowed` no bloquea por `archivedAt` ni por `crm_accounts.status`. Las gestiones cerradas también pueden alcanzarse desde tareas; el servicio no verifica clasificación abierta antes de preparar/dispatch. |
| Email por Brevo | **Alineado en la decisión de producto** | Se conserva el envío desde el CRM para mantener estados de proveedor, entrega y rebote. Falta adaptar las reglas restantes y decidir cuándo Acompañamiento marca Es cliente. |
| WhatsApp con estado No confirmado | **Parcial** | Abre `wa.me` y registra `whatsapp_opened`; no registra estado No enviado ni una operación de rectificación con nota como la spec. |
| Llamadas, redes y Otros unificados | **Parcial/no implementado** | Hay llamada `tel:` y registro manual de actividad; las mutaciones de mensaje y la tabla aceptan solo Email/WhatsApp. Redes/Otros no tienen intento pendiente ni snapshot de destino. |
| Respuestas entrantes estructuradas | **No implementado como entidad/flujo** | Hay outcomes y notas de actividad, pero no catálogo aprobado, campo separado de texto recibido, corrección con motivo ni enlace opcional al mensaje origen. |
| Cualquier usuario registra respuesta | **Brecha de permisos** | La escritura en `work` requiere usuario responsable, administrador o excepción de tarea delegada. La spec permite registrar respuesta a cualquier usuario. |
| No contactar por respuesta | **Parcial** | `do_not_contact` activa flag global al guardar resultado de trabajo; no ofrece el diálogo único con selección opcional, ni activa por una respuesta dedicada. |
| Corrección y levantamiento automático de No contactar | **No implementado** | Cambiar el resultado de la actividad no levanta automáticamente el booleano; no hay confirmación previa ni eventos vinculados de corrección + levantamiento. |
| Restricción técnica por persona/canal | **Parcial** | Email/WhatsApp/todos se guardan y auditan. Falta creación automática por falla permanente, distinción de origen, otros canales, recuperación automática y alcance global de negocio+canal general. Además, el permiso que habilita la UI no coincide completamente con el que exige el servidor para crearla. |
| Modelos y variables | **Parcial** | Admin gestiona modelos, baja lógica y snapshots; faltan versiones restaurables, canales nuevos, precedencia de especificidad y resolución explícita de variables faltantes. |
| Es cliente por Acompañamiento | **Brecha confirmada** | El envío realizado/confirmado no activa `isClient`. La spec v1.4 define activarlo cuando Brevo acepta Email; entrega y rebote quedan como eventos separados y un rebote no lo desactiva automáticamente. |
| Historial negocio/gestión/global | **Parcial** | Hay mensajes, actividades y journals visibles; faltan registros formales de respuestas y ciclos de intentos/correcciones como exige la spec. |
| Secuencias asistidas | **Decidido retirar y limpiar datos de prueba** | No habrá nuevas secuencias. El propietario indica que las existentes fueron pruebas y autoriza eliminar sus registros y artefactos atribuibles; antes de una limpieza se requiere preflight con conteos y relaciones. |
| Recordatorio por “Quiere retomar más adelante” | **Parcial** | Seguimiento y tareas generales existen, pero no se crea/proponen desde una respuesta tipificada ni se usa el responsable del contexto con reglas de la spec. |

## Diferencias y decisiones que requieren resolución

El propietario decidió mantener Email por Brevo para conservar evidencia de entrega y rebotes. También decidió conservar el aviso de contacto reciente de 72 horas como aviso no bloqueante.

### 2. Secuencias asistidas

El propietario decidió retirar la función de secuencias para reducir complejidad y evitar dos formas de organizar el seguimiento. Indicó que las secuencias iniciadas fueron pruebas y autorizó limpiar por completo sus datos. La implementación debe identificar y eliminar configuración, ejecuciones y artefactos generados exclusivamente por esas secuencias (tareas, borradores/mensajes y registros de prueba vinculados). Antes de ejecutar limpieza en una base se hará un preflight y se confirmará que los registros identificados corresponden al alcance; no se borrarán tareas o comunicaciones independientes. Esta decisión de producto no ejecuta por sí misma cambios en una base.

### 3. Aviso de contacto reciente

Hoy existe una advertencia configurable (por defecto 72 horas) para no repetir pronto un contacto al mismo destinatario. Se conserva como aviso no bloqueante. Al ampliar canales y contextos habrá que revisar su presentación y alcance para que no se convierta accidentalmente en una barrera.

### 4. Respuestas y tareas

La spec dice que solo **Quiere retomar más adelante** pregunta si crear recordatorio; los otros resultados no crean tareas automáticamente. Hoy el registro de trabajo ofrece continuaciones y próxima tarea para varios resultados. Se debe evitar trasladar mecánicamente toda la UI actual a la nueva respuesta. El flujo de actividad general/tarea seguiría existiendo para notas operativas, separado del nuevo registro de respuesta.

## Propuesta de transición para la etapa 3

Sujeta a aprobación del informe y a resolver los tres puntos anteriores:

1. **Un único punto de entrada “Contactar”.** Desde una gestión conserva ese contexto; desde el negocio ofrece General o una gestión abierta. General no crea gestión. Implementa elegibilidad y bloqueos también en el servidor.
2. **Una entidad de interacción independiente de la gestión.** Debe admitir negocio como contexto General o gestión, destinatario/snapshot, canal, propósito, contenido/resumen, estados y fechas/actores. La gestión sería opcional; no se deben usar tareas como sustituto de la interacción.
3. **Una respuesta como registro de primer nivel.** Guarda categoría, resumen, texto opcional, autor/fecha y vínculo opcional al contacto. Las correcciones crean historia inmutable con nota.
4. **Una política central para No contactar y restricciones.** Respuesta, corrección, restricciones, cierre opcional de gestiones, estado del negocio e historial deben ejecutarse transaccionalmente, con permisos de cada objeto comprobados por el servidor.
5. **Adaptadores por canal con estados honestos.** Email/WhatsApp deben representar intento no confirmado y resultado posterior; llamadas/redes/Otros, inicio y cierre manual. No reutilizar `failed` de proveedor como equivalente a “No enviado” sin conservar el origen.
6. **Biblioteca de modelos versionada.** Conservar modelos históricos y snapshot de cada uso; sumar restauración como nueva versión y validación de variables faltantes. No mezclar las opciones administrativas con el flujo del vendedor.
7. **Historial y migración antes de retirar flujos.** Mapear los registros y preservar comunicaciones reales, `email_outbox`, `crm_email_events`, actividades, restricciones, snapshots y journals. Eliminar solo la configuración y los artefactos de secuencias identificados como pruebas (incluidos `crm_sequence_runs`, borradores/mensajes y tareas generadas exclusivamente por ellas). La clasificación histórica como “enviado”, “respuesta”, “entregado” o “no confirmado” solo se asignará con evidencia existente; no inferir estados faltantes.
8. **Migración ensayada en base descartable y en la réplica local autorizada**, con preflight, conteos por estado, preservación de IDs/relaciones, rollback y verificación de lectura. Producción requiere alcance y autorización propios; este informe no ejecutó ni autoriza escrituras.

## Cobertura observada

Hay pruebas de navegador para Contactar desde negocio y tareas, preparación/revisión de WhatsApp, políticas de modelos, permisos de tareas delegadas, restricciones, secuencias y presentación del historial. Por ejemplo, `tests/browser/business-contact.e2e.ts` comprueba que iniciar contacto sin gestiones no crea una gestión al cancelar y que se debe crear una antes de continuar; `tests/browser/communication-resources.e2e.ts` recorre WhatsApp, secuencias y restricciones.

No encontré cobertura del comportamiento objetivo de la spec para contacto General sin gestión, envío Brevo integrado al nuevo flujo, redes/Otros, la taxonomía de respuestas, el diálogo No contactar con cierres seleccionables, rectificación de respuestas, versiones de modelos ni recordatorio originado por respuesta. No se ejecutaron pruebas en esta etapa.

## Recomendación de orden

1. Preparar un preflight para identificar y limpiar los artefactos de secuencias de prueba atribuibles, sin tocar tareas ni comunicaciones independientes.
2. Aprobar el modelo conceptual de interacción General/gestión y respuesta independiente.
3. Implementar elegibilidad, permisos y bloqueos en el servidor antes de abrir nuevos canales.
4. Implementar el recorrido sencillo de contacto y los estados honestos de cada canal.
5. Incorporar respuestas, No contactar, rectificaciones y recordatorios.
6. Migrar/preservar historiales y restricciones en base descartable; revisar conteos en la réplica local.
7. Agregar modelos versionados y recorridos de escritorio/móvil.
8. Validar flujos completos con pruebas relevantes y revisión humana antes de autorizar la migración productiva.

## Qué no se había hecho al cerrar la etapa 2

En la etapa 2 no se modificó código, no se corrieron tests/seed/migraciones ni hubo conexiones a bases. La autorización posterior del propietario inició la etapa 3 en el worktree aislado.

## Avance de implementación — 14/10/2026

La etapa 3 se ejecuta en `feat/communication-crm`. El detalle de producto sigue en el documento 56; esta sección registra implementación y verificación, no reemplaza la revisión visual.

| Requisito | Implementado en código | Evidencia/estado |
|---|---|---|
| Contacto General sin crear gestión | Sí: Email/WhatsApp desde Contactar y llamada/red/Otros desde Comunicación del negocio | Prueba backend de contacto general sin gestión; UI lista para navegador |
| Contexto de gestión abierta | Sí; contexto General o gestión, bloqueos y responsable se verifican en servidor | Suite `test:communication` cubre permisos y bloqueos existentes |
| Llamadas, redes y Otros | Sí: inicio persistente, destino/texto, pendiente, finalización y corrección | Integración de llamada manual aprobada; falta recorrido UI de portapapeles |
| Respuestas y No contactar | Sí: catálogo, resumen, contexto/vínculo, corrección y activación/levantamiento global auditado | Integración probó activación, corrección y eventos automáticos vinculados |
| Cierre opcional de gestiones en No contactar | Sí: selección no marcada por defecto; backend valida asignación/etapa/motivo | Falta recorrido de navegador para selección múltiple y permisos mixtos |
| Recordatorio “retomar más adelante” | Sí: fecha obligatoria, responsable contextual y reasignación admin | Código y migración; falta integración/UI dirigida |
| Restricciones técnicas | Sí: restricción manual admin; rebote permanente y entrega de Brevo crean/levantan las automáticas; el bloqueo global queda separado | Webhook ejercitado con payloads sintéticos, sin servicio externo real |
| Modelos compartidos | Sí: uso editable, segmentación por gestión/vertical/perfil, especificidad, versiones, restaurar/desactivar/reactivar/duplicar | Suite de settings/modelos y pruebas unitarias existentes; falta revisión visual completa |
| Historial y autoría | Sí: comunicación en negocio/gestión/journal global; eventos automáticos conservan actor desencadenante | Integración verificó eventos DNC automáticos; cobertura de los demás eventos no exhaustiva |
| Retiro de secuencias | Sí: UI y endpoints removidos; 022 limpia artefactos vinculados y bloquea datos referenciados independientemente | Migración probada vacía; el preflight de solo lectura no se ejecutó sobre datos existentes |

Verificaciones realizadas en base descartable PostgreSQL 17: `pnpm run db:migrate` aplicó 001–022; `pnpm run db:seed:test`; `pnpm run test:communication` pasó, incluidas las dos pruebas de migración y los recorridos backend. `pnpm test` pasó (101 pruebas). No se usó la réplica local de producción. No se ejecutó limpieza sobre datos existentes.

Pendiente antes de considerar la etapa 3 cerrada: recorrer en navegador los casos General, respuestas, mensajes manuales, bloqueos y plantillas; resolver o aislar los errores de typecheck/build en `InlineBusinessBadge.tsx`, `Pipeline.tsx` y `business-list.tsx`; revisar el diff y la migración completa. Producción requiere una ejecución futura explícita, con respaldo y preflight revisado. No hay commit.
