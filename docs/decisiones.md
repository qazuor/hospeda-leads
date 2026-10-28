# Decisiones estables del CRM

Estas decisiones provienen del propietario y del comportamiento revisado. Cambiarlas requiere tratar el cambio como funcional, no esconderlo en una corrección estética. El estado de implementación y los pendientes están en documentos separados.

## Entidades y recorrido comercial

- Un negocio es una cuenta comercial. Puede tener varias personas y varias gestiones independientes.
- Alta manual/importación crea el negocio; no fabrica una gestión, actividad, conversación ni tarea.
- Iniciar gestión es explícito. Cancelar su formulario no crea nada. El nombre inicial editable es Presentación de Hospeda; no se elige arbitrariamente una etapa histórica como etapa inicial.
- El responsable del negocio y el de cada gestión se conservan como ámbitos distintos cuando ya difieren. Una tarea delegada no cambia el responsable comercial.
- Contactar debe ser el mismo recorrido desde negocio, gestión, Hoy y próximo paso: elegir contexto/persona/canal, preparar libre o con modelo, revisar y ejecutar. Siempre termina en «¿Cómo salió?» y «¿Cómo sigue?» (ver «UX de octubre de 2026»).
- Abrir WhatsApp/email/llamada no prueba envío, respuesta ni contacto realizado. Preparar un borrador no completa una tarea.
- Después de cada contacto o resultado hay que elegir cómo sigue: agendar una tarea o «No agendar nada» con motivo (2B, 20/10/2026). Se crea en una transacción. No modifica otras tareas; la etapa de una gestión solo cambia si la persona marca la casilla sugerida (9A).
- Acuerdo comercial, condición Cliente, cierre Ganada, pago y entrega son hechos distintos. No inferir pagos ni activar servicios automáticamente.

## Permisos y comunicación

- Historial global, Papelera y administración tienen permisos de admin; operaciones comerciales siguen el alcance del usuario. Comprobar en servidor, no solo ocultar botones.
- La lectura compartida de un negocio no otorga escritura o permiso de preparar mensajes en una gestión ajena.
- No contactar bloquea el negocio completo: no se contacta por ningún canal y, para quienes no son admin, el negocio es de solo lectura (1C, #192); se cancelan sus tareas pendientes (D3). Solo un admin lo levanta. Ver «UX de octubre de 2026».
- Un delegado puede registrar el resultado de su tarea. El envío/preparación de mensajes mantiene el permiso del responsable de la gestión o admin hasta acordar otra política.
- Email y WhatsApp tienen modelos para todos los perfiles, incluido Referente. Sin perfil/vertical explícito no excluir modelos arbitrariamente; con contexto conocido respetar su segmentación.
- La biblioteca es administrada: los vendedores seleccionan materiales existentes. Un vínculo o preview no equivale a enviarlos.
- No inventar promociones, precios, garantías, trayectoria investigada ni resultados de envío en textos/modelos.

## Auditoría de estados

- Cada cambio de estado del negocio, fecha de recontacto, marca Cliente, No contactar o derivación a Leandro debe dejar evidencia en el journal del negocio y en el historial global.
- Cada cambio de etapa de una gestión debe aparecer en el historial del negocio asociado y en el historial global. Las etapas se conservan como eventos inmutables de pipeline.
- La auditoría de campos de estado del negocio vive en la base para cubrir cambios indirectos o automáticos, además de las rutas de UI/API.
- Si un estado del negocio cambia como consecuencia de otra operación, conservar al usuario que inició la operación y mostrar además que el cambio fue automático, junto con la causa cuando se conoce. Un cambio desde el control del campo se muestra como directo.

## Búsqueda, filtros y vistas

- Búsqueda ignora mayúsculas y acentos, preserva el texto original y distingue ñ de n.
- El texto libre participa como filtro AND junto a los bloques avanzados; preservar AND/OR, exclusiones y rangos.
- Click en un badge activo modifica únicamente su valor. Campo y operador permanecen fijos: un filtro Responsable continúa filtrando Responsable.
- Catálogos usan sus valores reales; no renombrar verticales/perfiles históricos ni equipararlos silenciosamente.
- Guardar vista ofrece el recorrido correspondiente a vista nueva, vista elegida o modificaciones de una vista. Conservar identidad, filtros y restricciones.
- Ctrl/Cmd+K combina navegación/acciones y búsqueda de entidades. La búsqueda de archivos cubre título/nombre y permisos; no significa OCR ni búsqueda dentro de todos los PDFs. La búsqueda devuelve resultados acotados, no un listado exhaustivo.

## Diseño y UX

- Mantine es la biblioteca elegida. Usar wrappers y clases compartidas para corregir el sistema, no una página aislada.
- Los grupos del listado de Negocios pueden limitar cuántas líneas se ven en la tabla; sin límite se muestran todos. Los datos ocultos se consultan en un popover que conserva etiquetas, editores y permisos. La grilla muestra todos los miembros porque tiene espacio.
- Header móvil de una fila con hamburguesa y menú Drawer. Mantener rutas, permisos, teclado y restauración de foco.
- Jerarquía clara, controles compactos, badges centrados, menús con espacio entre icono/texto, acciones por icono sin borde innecesario y foco visible discreto.
- No llenar cards con filas vacías; conservar contexto útil y acciones legibles en móvil.
- Auditoría visual significa operar la app: editar, filtrar, abrir menús/diálogos, guardar, cancelar, provocar errores y reintentar. Entrar a cada URL no basta.
- Pedidos visuales no autorizan cambiar endpoints, datos, permisos ni reglas comerciales.
- Loading visible en toda acción y listado; evitar doble clic/submit desde el comienzo; conservar el borrador ante error.
- Toasts pueden ofrecer destinos, reintento y Deshacer cuando sea realmente reversible. No prometer deshacer un envío o borrado definitivo.
- Fechas de calendario comercial se presentan en Argentina; no desplazar el día por una conversión UTC implícita.

## UX de octubre de 2026 — decisiones del propietario

Revisión de usabilidad para vendedores sin experiencia en CRM. Decisiones del 20 y 21/10/2026; el estado de implementación está en [estado-desarrollo.md](estado-desarrollo.md) (mergeado en `staging`, sin deploy).

- **1C (20/10) — Lectura para el responsable.** Un negocio archivado o No contactar sigue legible para su responsable (`crm_accounts.assigned_user_email`) con un banner rojo («No contactar · Pidió no ser contactado el {fecha}. Solo un administrador puede levantar el bloqueo.»); todas las acciones de contacto quedan deshabilitadas. Solo un administrador modifica o levanta el bloqueo. Desde #192 (21/10) un negocio No contactar es de solo lectura para quienes no son admin aunque no esté archivado. Quien solo tuvo una gestión sobre ese negocio no gana acceso. Crear un duplicado de un negocio No contactar se bloquea («Ese negocio pidió no ser contactado. Consultá con un administrador.»), también para admins, que levantan el bloqueo en el registro existente. Reemplaza la regla anterior de que solo un administrador consulta archivados.
- **D1 (21/10, propietario) — Quién registra «Pidió no ser contactado».** Solo el responsable del negocio, el de alguna de sus gestiones o un admin; el servidor lo exige y la interfaz oculta o deshabilita la opción con una explicación.
- **16A (20/10) — Alcance del aviso.** El banner de No contactar también refleja una respuesta registrada como «Pidió no ser contactado» (`do_not_contact_response`), no solo el cierre de una gestión.
- **D3 (21/10, propietario) — Tareas al quedar No contactar.** Se cancelan todas las tareas pendientes del negocio con el motivo «Se canceló porque el negocio quedó marcado No contactar.», que queda en el historial. Al levantar el bloqueo no se restauran.
- **D4 (21/10, propietario) — Contacto pasado de acompañamiento en un negocio No contactar.** Registrar como realizado un contacto de acompañamiento (`care`) ya ocurrido (completar un intento manual o corregir su resultado) sigue guardando lo que pasó, pero solo marca el negocio como Es cliente si lo registra un admin. Para el resto no da error: el contacto queda registrado y el negocio no cambia. En negocios sin No contactar no cambia nada.
- **2B (20/10) — Después de contactar.** Tras cualquier contacto, desde cualquier entrada, la cadena «¿Cómo salió?» → «¿Cómo sigue?» no se puede omitir: hay que agendar una tarea o elegir «No agendar nada» con motivo (presets u «Otro (contame)» con texto). 14A: se puede salir del diálogo sin anotar el resultado tras confirmar, pero el contacto queda como pendiente visible en Hoy («Anotá cómo salió») hasta resolverlo.
- **3A (20/10) — Una sola lista de resultados:** No respondió · Respondió, le interesa · Pidió que lo contacte más adelante · No le interesa · Pidió no ser contactado · Otro (contame), más los extras propios de cada propósito (p. ej. «Entrega confirmada»). Los valores antiguos se muestran mapeados; no se reescribe el historial. Migración 027.
- **9A (20/10) — Etapa sugerida.** Al elegir un resultado se ofrece la casilla «¿Pasar la gestión a {etapa sugerida}?», desmarcada por defecto. Si se marca, la gestión pasa como un cambio de etapa común hecho por la persona, con una nota neutra. Solo sugiere avanzar a etapas abiertas; los resultados de cierre no sugieren nada.
- **7A (20/10) — Recontactar con fecha.** Crea la tarea «Volver a contactar» para el responsable del negocio en esa fecha (una por negocio y fecha) y avisa «Agendamos «Volver a contactar» para el {fecha}». Cambiar la fecha mueve la tarea. Al borrar la fecha, cambiar el estado o archivar, la tarea se cancela solo si sigue pendiente y sin tocar. Al marcar No contactar se cancelan todas las tareas pendientes del negocio (D3).
- **Recontacto al cerrar una gestión (21/10, propietario, #196).** Cuando se cierra la última gestión abierta con una fecha de recontacto, el único recordatorio es la tarea de la gestión «Recontactar según lo acordado»: no se crea ni se mueve «Volver a contactar» del negocio, y la tarea del negocio que siga sin tocar en el día guardado se cancela (motivo «cambió a otro día» si el día difiere; si es el mismo, «Se canceló porque la gestión ya tiene su propia tarea de recontacto para ese día.»). Sin fecha, el cierre cancela la tarea sin tocar con el motivo habitual. En un negocio archivado el cierre no escribe fecha ni toca tareas. Al cambiar el responsable del negocio (edición, edición masiva, derivación a Leandro y su reversión), la tarea «Volver a contactar» sin tocar pasa al nuevo responsable; si se borra el responsable no se hace nada.
- **Dueño del recordatorio al cerrar (21/10, propietario).** La tarea «Recontactar según lo acordado» que crea un cierre con fecha queda a cargo del responsable del negocio (`crm_accounts.assigned_user_email`); si el negocio no tiene responsable, del responsable de la gestión y, si tampoco hay, de quien cierra. Solo cambia esa tarea; el resto de las tareas de la gestión sigue igual. Como ahora es la misma persona, la cancelación de la «Volver a contactar» sin tocar deja un único recordatorio. Al cambiar el responsable del negocio, esa tarea sin tocar también pasa al nuevo responsable.
- **Volver a guardar Recontactar después de un cierre (21/10, propietario).** Si el negocio se guarda otra vez como Recontactar con fecha y existe la tarea «Recontactar según lo acordado» sin tocar (pendiente, sin hora, sin reprogramar, a cargo del responsable del negocio, en la fecha guardada), esa tarea se mueve a la nueva fecha (misma fecha: no cambia nada) y no se crea «Volver a contactar». Si no existe, se aplica 7A.
- **Salir de Recontactar después de un cierre (21/10, propietario).** Cuando el negocio deja Recontactar (otro estado, se quita la fecha o se archiva), la tarea «Recontactar según lo acordado» sin tocar del día guardado se cancela junto con «Volver a contactar», con el mismo motivo que esa tarea para cada caso. Una tarea reprogramada, con hora, reasignada o renombrada sigue pendiente. Al cerrar con fecha, si quien cierra no es el responsable del negocio, el aviso le dice «La tarea «Recontactar según lo acordado» quedó agendada para {nombre}.».
- **8A (20/10) — Datos de contacto con gestión abierta.** Quien tiene una gestión abierta sobre el negocio puede editar teléfono, email, WhatsApp y personas (agregar o editar; no borrar personas ni cambiar la Principal), no responsable, estado ni datos estructurales. Todo queda auditado. Excluye negocios No contactar (valor por defecto del coordinador, aplicado en #172 sin objeción), para que una gestión abierta no pueda borrar un teléfono No contactar y desactivar el bloqueo de re-alta.
- **13B (20/10) — Teléfono de persona.** Si coincide exactamente con el de un negocio No contactar, solo se advierte al guardar («Este teléfono es de un negocio que pidió no ser contactado.»). El bloqueo duro queda para volver a dar de alta el mismo negocio (teléfono o WhatsApp exactos, o nombre y ciudad). **D2 (21/10, propietario):** además hay un aviso no bloqueante al contactar (Contactar, llamada, contacto desde tarea) cuando el teléfono de la persona elegida coincide con el de un negocio No contactar.
- **4A y 5A (20/10) — Vistas y navegación del vendedor.** Por defecto «Mis negocios» y «Mis gestiones», con «Todos» a un clic; el admin conserva «Todos». Menú del vendedor: Hoy (pestañas Lista, Calendario y Para retomar, que absorben Agenda y Reactivación), Negocios, Gestiones y Ayuda. «Más opciones» es solo admin y se llama «Administración».
- **6a–6d (20/10) — Vocabulario.** Se mantiene «Gestión» con una explicación; se mantienen los nombres de tipos de gestión con una línea de ayuda por tipo; «Sin seguimiento programado» pasa a «Sin tarea agendada» (solo la etiqueta; el valor no cambia). Términos: Negocio, Persona, Contactar solo como verbo, Gestión, Etapa (gestión) y Estado (negocio), Agendar tarea, Anotar lo que pasó / Anotar cómo salió, «¿Cómo salió?», Responsable del negocio / de la gestión / tarea «Asignada a», Borrar (cargada por error) y «Ya no hace falta». La fuente es `src/content/vocabulary.ts`, protegida por un test de términos prohibidos.
- **15B (20/10) — Color por rubro.** Cada vertical tiene un color fijo y estable (contraste mínimo 4,5:1, tema claro y oscuro).
- **Notas de etapa (20/10, 23:26).** Las notas de cambio de etapa de una gestión (`crm_pipeline_events.management_note`) se muestran en «Qué pasó» a todo usuario que pueda leer el negocio.
- **Ctrl/Cmd+K y archivados (21/10, valor por defecto del coordinador).** Muestra los negocios archivados («· Archivado») a su responsable actual y a admins; nunca los de Papelera ni fusionados; los colegas no ven los archivados ajenos.
- **Primeros pasos en Hoy (21/10, valor por defecto del coordinador).** «Contactá a un negocio» cuenta solo envíos confirmados (enviado manualmente, aceptado, entrega confirmada, respondido) o una actividad con resultado de contacto real. Un intento sin respuesta tilda solo «Anotá cómo salió». Abrir WhatsApp, guardar borradores o no enviar nunca cuentan.
- **Sin email diario (20/10, decisión 10B)** por ahora.
- Flujo de integración: cada PR a `staging` con CI verde y revisión fresca; nunca a `main` (decisión 11).

## Archivo, Papelera y metadatos recuperados

- Archivar: conservar un negocio válido que ya no se trabajará activamente (`crm_accounts.archived_at`).
- Papelera del negocio: eliminación lógica por registro incorrecto o fuera de alcance (`crm_accounts.deleted_at`, autor y motivo). Es independiente de Archivo.
- Papelera de gestiones: consulta su `leads.deleted_at`; no equivale a eliminar el negocio. El antiguo filtro de oportunidad eliminada sigue refiriéndose a la gestión.
- Eliminación definitiva es una operación distinta y restringida. No sustituir soft delete por archivo ni presentar ambos como un cambio de nombre.
- `origin` y `source_reference` preservan origen/ref histórica sin reemplazar `discovery_source` ni `verification_urls` actuales.
- `status` es la única fuente de verdad para distinguir Nuevo de Revisado. `review_status` se conserva como dato histórico/compatibilidad para respaldar la migración. El Estado sigue siendo la única fuente de verdad; la columna/badge Revisados edita `status` entre Nuevo y Revisado (decisión del propietario, 22/10/2026).
- `subscription_label` es etiqueta histórica; no acredita pago ni convierte a Cliente.
- `source_lead_id` es referencia histórica/técnica, no autorización para recrear las gestiones eliminadas.

## Migración del modelo de estados

- La evolución empieza con columnas aditivas; la primera migración no reescribe historiales ni elimina `review_status`.
- El nuevo `status` queda nullable durante la compatibilidad. Los históricos solo se convierten después de un preflight de solo lectura sobre una copia reciente y una lista explícita de ambiguos.
- Filtrado debe conservarse como evidencia y convertirse a Revisado uno a uno; Papelera, Archivo, cliente, No contactar, asignaciones, motivos y fechas son datos independientes que no se infieren ni se limpian en el primer deploy.
- Ningún backfill ni despliegue de migración de estados queda autorizado en producción por el pedido de implementación local. Consultar el plan 55 antes de preparar una ejecución.

## Estados de negocio y gestiones — definición aprobada

- Entre etapas abiertas de una gestión se permite cualquier cambio, incluso retroceder. Solo administradores pueden reabrir una gestión cerrada; eligen una etapa abierta y el cierre anterior permanece en el historial.
- Los catálogos de etapas y motivos son fijos en la aplicación por ahora. Los motivos de cierre se separan por vertical y resultado; `Otro` siempre requiere nota.
- Una propuesta comercial de Editor cerrada ganada pregunta si corresponde marcar el negocio como Cliente. La colaboración editorial no lo activa automáticamente.
- El acompañamiento de ficha es una gestión separada: Pendiente de iniciar → Contactado (opcional) → Trabajando en la ficha → Cerrada completada / Cerrada no completada. La completada no exige motivo; la no completada sí.
- Una fecha de recontacto acordada en una gestión crea una tarea/recordatorio visible para su responsable. `Recontactar` en el negocio con fecha crea además la tarea «Volver a contactar» (decisión 7A, 20/10/2026; ver «UX de octubre de 2026»). Sin fecha no se crea tarea.
- Al derivar a Leandro, la gestión conserva su etapa previa; Leandro puede avanzar mientras esté derivada. Si un administrador desactiva la derivación, la gestión vuelve a la etapa previa y el negocio se reasigna al responsable original u otro elegido por el administrador.
- Solo administradores desarchivan. Se restaura Revisado si existe evidencia histórica de revisión; en caso contrario, Nuevo.
- Si se cierra una gestión con `Pidió no ser contactado`, se activa No contactar y se archiva el negocio; se pregunta si cerrar también las otras gestiones abiertas.
- Los motivos específicos acordados por vertical y resultado, así como el flujo completo, están en [spec 53](crm-roadmap/53-business-and-management-state-model.md).
- El negocio marcado Cliente de la réplica local permanece como Cliente y se mapea a Revisado; no se infiere una gestión desde los journals.

## Comunicación — producto aprobado

- Comunicación es saliente y permite registrar manualmente respuestas. Email se envía por Brevo; WhatsApp prepara y abre el canal externo; llamadas, redes y Otros se registran manualmente. **Revisión del 22/10/2026 (propietario):** se suma el registro automático de entrantes según la spec 83 (`docs/crm-roadmap/83-registro-automatico-canales.md`), todavía no implementada.
- **Registro automático (22/10/2026, propietario).** Email entrante por un Cloudflare Email Worker en el catch-all de `hospeda.com.ar`, que siempre reenvía primero a la casilla del propietario y después avisa al CRM. Las respuestas desde el CRM salen por el relay SMTP de Brevo para conservar el hilo (la API no acepta `In-Reply-To`/`References`; probado el 22/10). WhatsApp e Instagram se registran con un user script de Tampermonkey que solo lee y nunca envía; un número de WhatsApp Business compartido, con código CRM (`H<id>`) en el nombre del contacto. Recibir un mensaje se registra solo; clasificarlo como respuesta lo decide una persona.
- **Spec 83, decisiones abiertas resueltas (22/10/2026, propietario).** Cliente SMTP `nodemailer`. Con No contactar activo se permite solo responder, desde "Responder", a un mensaje que el negocio inició, sin levantar la restricción ni habilitar otros envíos. Mensajes entrantes con retención indefinida. Registro desde el navegador con un user script de Tampermonkey (Chrome, Edge y Firefox), servido y actualizado desde el CRM, con versión mínima controlada por el CRM; reemplaza la extensión descomprimida elegida antes. El Worker pasa al CRM solo el correo dirigido a casillas de usuarios y a la dirección de respuesta general.
- **WhatsApp Coexistence / Cloud API:** queda como opción futura, no planificada. Su PRD se eliminó para no confundir.
- Se permiten contactos generales con propósito y contactos dentro de gestiones abiertas. Nuevo solo admite verificación; Archivado y No contactar bloquean salidas; Papelera bloquea todo hasta restauración administrativa.
- Toda respuesta entrante requiere contexto. “Pidió no contactar” bloquea el negocio completo; solo admin levanta el bloqueo. Quién puede registrarlo está en D1 («UX de octubre de 2026»). Confirmaciones y correcciones quedan auditadas.
- Las etapas y motivos de gestión son catálogos fijos. Admin administra modelos compartidos; se conservan sus versiones y se pueden restaurar.
- Se retiraron las secuencias asistidas. La limpieza de registros de prueba se limitó a los artefactos identificables al aplicar la migración 022 en la réplica local; no autoriza escrituras en producción.
- El flujo acordado está en [spec 56 — Comunicación](crm-roadmap/56-communication-product-spec.md).

## Modelo de estados de negocio y gestiones — qué está implementado

Definición de producto en la [spec 53](crm-roadmap/53-business-and-management-state-model.md) (el documento original del propietario decía «no se ha revisado ni implementado todavía»; ya no es así). Está mergeado en `staging` (PRs #99–#103) y no desplegado a producción:

- El ciclo del negocio está separado de las etapas de sus gestiones; un negocio puede tener varias gestiones abiertas.
- Estados del negocio: Nuevo, Revisado, En gestión, Sin tarea agendada (antes «Sin seguimiento programado»; solo cambió la etiqueta), Recontactar y Archivado. Recontactar admite una fecha opcional; con fecha crea la tarea «Volver a contactar» (7A). La fecha de espera de una gestión pertenece a la gestión.
- Cliente, No contactar, Derivado a Leandro y Eliminado (Papelera) son condiciones independientes del estado general. La Papelera solo la ven administradores y no permite operar hasta restaurar. Derivar cambia la gestión a Derivado a Leandro y asigna el negocio a Leandro sin cambiar el estado general; cualquiera puede derivar y solo admin desactiva (ver definición aprobada más arriba).
- Cada tipo de gestión tiene su catálogo fijo de etapas. Cerrar exige motivo (por vertical y resultado; «Otro» requiere nota). Entre etapas abiertas se permite cualquier cambio; solo un admin reabre una gestión cerrada (reglas en `d173889` y #168). La matriz de transiciones que faltaba definir quedó resuelta así.
- Los negocios históricamente Filtrados deben conservarse como Revisados sin borrar el dato ni su historial; está implementado en el código y las migraciones, pero la conversión sobre datos productivos no se ejecutó (ver «Migración del modelo de estados»).

Sigue sin hacerse: el despliegue a producción, el backfill productivo con su preflight, y la revisión visual completa. No inferir ninguno de ellos del merge a `staging`.

## Datos reales, fusiones y multivertical

- Compartir domicilio, teléfono municipal, propietario o sitio central no confirma identidad entre registros.
- Revisar posibles fusiones y verticales adicionales sobre negocios existentes antes de ejecutar cambios. No fusionar/reclasificar/reasignar por iniciativa de una auditoría estética.
- La revisión productiva multivertical depende de recuperar acceso/evidencia; fue pospuesta, no cancelada.
- La limpieza masiva de octubre fue excepcional, con autorización específica y respaldo/ensayo. No generalizar esa autorización a registros futuros ni automatizarla en migraciones.
- Respaldo y procedimiento de recuperación son independientes del deploy. Nunca restaurar un dump antiguo completo encima de producción para recuperar pocos campos.

## Estados y Comunicación — producto aprobado

- El estado del negocio y la etapa de cada gestión son independientes; un negocio puede tener varias gestiones abiertas. Cliente, No contactar, Eliminado y Derivado a Leandro son marcas separadas del estado general según la spec 53.
- Las gestiones usan catálogos fijos por tipo. Los cierres exigen motivo; la derivación a Leandro conserva historial y solo admin puede desactivarla. La migración debe preservar los negocios Filtrados como Revisados y no restaurar elementos de Papelera.
- Comunicación prepara contactos salientes y registra respuestas manualmente. Canales: Email por Brevo, WhatsApp asistido, llamadas, redes y Otros con aclaración. Ver la revisión del 22/10/2026 más arriba.
- Las salidas respetan contexto, permisos y bloqueos; respuestas entrantes se pueden registrar sin habilitar envíos. No contactar bloquea el negocio completo y solo admin levanta el bloqueo.
- Se retiran las secuencias asistidas. El usuario autorizó limpiar sus registros de prueba con una migración que limita la eliminación a artefactos atribuibles y se detiene si detecta referencias independientes.
- Especificaciones aprobadas: [estados](crm-roadmap/53-business-and-management-state-model.md) y [Comunicación](crm-roadmap/56-communication-product-spec.md).
- La autorización cubre integrar y probar el código. No implica ejecutar migraciones ni escribir en bases de datos productivas.

## Desarrollo y continuidad

- Feature/fix/docs branch, PR, CI verde y merge. Corregir fallos antes de integrar; avanzar sin confirmaciones redundantes dentro del trabajo autorizado.
- Estado comprobado del código, resultado de CI, deploy observado y confirmación del operador son evidencias diferentes; documentarlas como tales.
- `AGENTS.md` es la instrucción común; `CLAUDE.md` importa esa instrucción. Documentos de estado/decisiones/pendientes compartidos y versionados son la memoria entre herramientas.
- Registrar solamente contexto de este CRM. No copiar memorias personales del usuario ni instrucciones del portal turístico a este proyecto.

## IA en el CRM — definición funcional para las specs

- El propietario seleccionó 19 ideas para seguir definiendo y retiró las demás del inventario. El [documento 60](crm-roadmap/60-ideas-uso-ia.md) conserva esa selección.
- Se autorizó preparar una épica, una spec de base común de IA y una spec hija por idea, además de publicar la documentación para revisión. Esta autorización no aprueba implementación.
- La experiencia combinará chat general y acciones contextuales. El chat explicará cómo usar el CRM y responderá preguntas sobre el negocio que el usuario esté viendo; no buscará otros negocios.
- Todo usuario autenticado podrá usar IA, sujeto a los permisos que ya exige cada función del CRM. En el contexto de un negocio se permite enviar su ficha e historial completos si el usuario puede leerlos.
- Los prompts y respuestas de interacciones vinculadas a un negocio se guardarán en su journal. En operaciones sobre varios negocios, cada journal recibirá un prompt sin referencias a otros negocios y solo el fragmento de su negocio; el prompt original y el informe completo quedan en pantalla para quien lo generó. Las consultas generales sin negocio asociado no se guardarán en un journal de negocio.
- El informe de cartera tendrá período inicial de últimos 30 días y desglose por responsable. Sus métricas iniciales serán negocios por estado actual; gestiones por etapa/resultados; contactos y respuestas registrados en el período; tareas abiertas/vencidas actuales y tareas completadas en el período. El resumen de cambios usa fecha elegida y no guarda marca de revisión; dictado queda fuera de la primera etapa.
- La spec se mantiene agnóstica a proveedor/modelo; habrá que elegirlos antes de implementar la conexión real. Antes de enviar datos reales, verificar condiciones de privacidad, retención, entrenamiento, región y contrato.
- Configurar límites antes de habilitar el servicio, informar uso y errores y bloquear solicitudes al alcanzar el límite. Dictado queda fuera de la primera etapa.
- Estas decisiones completan la definición funcional documental; no autorizan todavía la implementación ni el acceso/escritura a datos productivos.

## Spec 83, decisiones tras F3 (23/10/2026, propietario)

- **WhatsApp abierto y el user script.** Un mensaje enviado que se registra con el script completa el intento `whatsapp_opened` más antiguo del mismo vendedor (o de cualquiera si es admin), del mismo negocio y al teléfono del chat, preparado entre 24 h antes y 10 min después del envío, con los mismos efectos que «Sí, lo envié». La evidencia del envío es el mensaje visto en el chat más la confirmación explícita en la vista previa, no la apertura del canal. Un `manual_sent` sin id de WhatsApp en esa ventana solo se vincula. La vista previa avisa antes de confirmar.
- **Email con resultado incierto.** Primero lo resuelve el webhook de Brevo si llega un evento. Si no, un administrador lo marca como enviado (`accepted`, entrega no confirmada) o no enviado (`failed`), con un motivo obligatorio de lo que revisó, y queda en el journal. Aplica a `unknown` y a `submitting` sin cambios por más de 15 minutos. Nunca se reenvía automáticamente.
- **Metadata del historial guardada como string.** Se repara con la migración 040, idempotente y limitada a `account_updated` y `business_assignment_rebalanced`. Se aplica en el deploy.

## Ficha del negocio: estructura (23/10/2026, propietario)

- La ficha `/accounts/:accountId` tiene un encabezado compacto (nombre y estado, datos con responsable, persona principal y canales, último contacto), luego Próximo paso como única tarjeta destacada, y cuatro solapas por tarea: «Historial» (por defecto), «Tareas» (oculta en solo lectura), «Comunicación» y «Gestiones · Personas · Datos».
- Los valores viejos de `?section=` siguen funcionando: `que-paso`/`history` → Historial; `work` → Tareas (Historial en solo lectura); `communication` → Comunicación; `gestiones`, `opportunities`, `personas`, `contacts`, `datos`, `documents`, `summary` → la cuarta solapa.
- La explicación de cada estado del negocio queda en la ayuda «?» junto al badge; la tarjeta de estado completa ya no se muestra en la ficha.
- Pendiente de revisar con el propietario: si conviene una variante de dos columnas en escritorio.

## Rediseño visual del CRM (24/10/2026, propietario)

- Identidad de colores vivos (referencia FlowTask): primario azul `#2563EB` sobre fondo gris azulado `#EEF2F8`, tarjetas blancas, ocho tonos (azul, celeste, verde, naranja, rojo, violeta, rosa, pizarra) en versión sólida, suave y de texto. Tipografía única Plus Jakarta Sans.
- Estados del negocio: Nuevo pizarra, Revisado celeste, En gestión azul, Sin tarea agendada naranja, Recontactar violeta, Archivado pizarra. Etapas: abiertas azul, ganadas verde, perdidas rojo. `src/helpers/tones.ts` es la fuente única.
- Botones en cuatro niveles: primario sólido, secundario neutro con borde, texto y destructivo rojo suave.
- La v1 del rediseño es solo visual/UX sobre datos y endpoints existentes. Se entrega por fases a `staging`, cada una con un mockup aprobado antes. Orden: sistema de diseño, shell (sidebar, breadcrumbs, nav inferior en el celular), ficha, listas, Hoy, kanban, drawers de alta y edición.
- Se pueden renombrar etiquetas si el propietario las aprueba en el mockup; la Ayuda, la guía y los e2e se actualizan en el mismo PR.
- Quedan para después de la v1, con análisis propio: contadores en la sidebar, KPIs con agregados nuevos, Bandeja unificada de conversaciones, drag & drop (kanban y columnas) y destacados por usuario.


## Rediseño visual v1, Fase 7: crear y editar en paneles — 25/10/2026

- Los formularios largos de alta y edición usan `DialogContent side` (panel derecho; pantalla completa en el celular). Las confirmaciones cortas siguen centradas para distinguir completar un formulario de confirmar una acción.
- El editor amplio de gestión (`_index.tsx`, 1060 px) queda como ventana grande: no entra en un panel de 560 px.

## Rediseño visual v1, Fase 4: tablero de Gestiones — 25/10/2026

- El color de cada columna sale del orden de la etapa abierta dentro de su tipo de gestión (paleta cíclica), ganada verde y perdida roja; no se cargan colores por etapa.
- El tipo de gestión del tablero lo define el filtro rápido (un único valor); el tablero no tiene selector propio. Sin un único tipo, la vista por etapas pide elegir uno; «Vista simple» sigue mostrando todos los tipos.
- En el celular el tablero es un acordeón por etapa en lugar de columnas deslizables.
- La vista previa guarda solo el id de la gestión y se deriva de la lista actual.

## Registro automático desde el user script — 26/10/2026 (propietario)

Spec 85 (`docs/crm-roadmap/85-userscript-auto-register.md`) aprobada.
- Registra solo los mensajes nuevos de chats con un único negocio emparejado, que no esté en Nuevo ni tenga No contactar. **No exige gestión abierta**, lo que reemplaza la condición «y están en gestión» del 25/10/2026.
- Interruptor global apagado por defecto (lo activa un admin) y uno por vendedor, encendido por defecto.
- Solo mensajes posteriores a la activación y de las últimas 24 horas.
- Cada registro automático guarda sus efectos y se puede anular con motivo. Pueden anularlo el vendedor que lo generó o un admin, sin límite de tiempo. Anular deshace los efectos que no cambiaron después, y el automático no vuelve a registrar ese mensaje.

## Modelos desde WhatsApp y registro por texto — 25/10/2026 (propietario)

- Pegar un modelo desde el user script deja el intento en «WhatsApp abierto», igual que «Contactar»; el envío se registra recién con el mensaje enviado. El script nunca envía.
- Pegar reemplaza el texto de la caja: el modelo que pegó el script sin preguntar, cualquier otro texto solo con confirmación. Todo reemplazo cierra como no enviado el intento anterior.
- El popover de los modelos muestra la plantilla cruda (variables sin completar), para no crear borradores al mirar.
- Registrar un enviado completa un intento abierto solo si el texto se parece al preparado (al menos la mitad de las palabras en común). Un mensaje escrito a mano se registra suelto y no se atribuye al modelo. Rige también para «Contactar».

## Instagram Direct por la API oficial de Meta — 26/10/2026 (propietario)

Detalle en la [spec 88](crm-roadmap/88-instagram-direct-webhooks.md). Reemplaza el user script de Instagram que preveía la spec 83.
- Los vendedores escriben desde la cuenta oficial de Hospeda. El CRM recibe por webhook los mensajes de los clientes y las respuestas de Hospeda, y los asocia por `perfil_instagram`.
- Probado el 26/10/2026: no hace falta la revisión de Meta, pero la app tiene que estar publicada.
- **D1:** el token de la cuenta se guarda cifrado en la base y se renueva solo todos los días.
- **D2:** las respuestas de Hospeda sin negocio asociado quedan en «Sin asociar».
- **D3:** los mensajes de clientes asociados quedan «Por revisar», como el email. Nada se registra ni se clasifica solo.
- Sin envío por la API en esta fase.

## Reglas comerciales: preguntas abiertas resueltas — 26/10/2026 (propietario)

Detalle en la [spec 87](crm-roadmap/87-commercial-rules-decisions.md).
1. **Ganar y convertir en Cliente exige un mínimo de acuerdo:** «Qué se acordó» y «Persona que aceptó». Los cierres ganados que no convierten en Cliente siguen sin exigirlo. No se pide evidencia documental ni una respuesta previa.
2. **Una respuesta del cliente propone, no decide:** el diálogo lista las tareas pendientes de la gestión y el vendedor tilda las que da por resueltas. Nada se completa solo.
3. **Mensajes por delegación:** el asignado de una tarea pendiente puede preparar y enviar mensajes desde esa tarea, a ese negocio y con los mismos controles, con la constancia «por delegación de». No puede cambiar etapas ni escribir fuera de la tarea.
4. **El CRM no registra pagos:** los pagos viven en su sistema de origen. Ninguna etapa, marca ni entrega acredita pago. Si hiciera falta verlos en la ficha, la vía es una integración de solo lectura, con análisis propio.

## User script de WhatsApp: negocio no visible — 26/10/2026 (propietario)

- Si el teléfono o el código de un chat coincide con un negocio que el vendedor no puede leer (archivado y de otro responsable), el script no muestra ningún dato de ese negocio. Tampoco dice «Sin CRM» ni «Sin asociar».
- **En la lista de chats:** el chat queda sin insignia (`kind: 'hidden'`).
- **En el panel:** aparece «Este número está en un negocio que no podés ver. Consultá a un administrador antes de escribirle.» (`hiddenMatches` en `context`).
- **Tradeoff aceptado:** un vendedor puede saber que el número existe en el CRM. Se prefiere eso al riesgo de tratarlo como un contacto nuevo y escribirle a un negocio con No contactar.

## User script de WhatsApp: revisión y próximos pasos — 25/10/2026 (propietario)

- **Teléfono de chats `@lid`:** primero el código y el teléfono visibles en el DOM; solo si no hay ninguno, el teléfono del estado interno de WhatsApp (fiber de React vía `unsafeWindow`). Si no se encuentra, el chat queda sin asociar: nunca se adivina.
- **Instalación desde el CRM:** el script se instala con el botón de `/userscript` y se actualiza desde el mismo origen. El script corre también en el CRM, donde solo deja su versión en `<html>` para que la página lo detecte; no hace nada más ahí.
- **Botón en la barra de WhatsApp:** se dibuja en una capa propia, superpuesta a la barra izquierda, sin insertar nodos en el árbol de React de WhatsApp. El panel sigue arriba a la derecha.
- **Token y ajustes globales:** el token se pega en el panel («Ajustes»), no en el menú de Tampermonkey, y funciona sin un chat abierto.
- **Versión mínima 1.3.0** (subida el 27/10/2026 con el material de venta, decisión del propietario: un script 1.2.x no mostraba los avisos de material no disponible; desde el deploy, un 1.2.x recibe 426 y debe actualizar) y aviso proactivo de versión nueva (al cargar, cada 30 minutos y al volver a la pestaña). Cada token guarda la última versión reportada, aunque el CRM la haya rechazado.
- **Aprobado para las próximas specs:** registro automático también de los enviados, solo con un único negocio emparejado y gestión abierta. Esto reemplaza, para esos chats, la regla de spec 83 de que un envío por el script necesita confirmación en la vista previa. Condición: cada registro automático se marca como tal y se puede anular con motivo, deshaciendo sus efectos (por ejemplo, reabrir el `whatsapp_opened` que completó). Los templates desde WhatsApp se pegan en la caja sin enviarse: el script sigue sin enviar mensajes. Las insignias del CRM son propias; no se tocan las etiquetas de WhatsApp Business.

## Gestiones y Hoy: tipo de gestión, vencidas abiertas y mes completo — 25/10/2026

- `managementType` es campo del filtro avanzado de Gestiones (igualdad por categoría); en Negocios se rechaza porque un negocio puede tener gestiones de varios tipos.
- «Vencidas» y «Hoy» del filtro rápido «Próximo paso» implican gestiones abiertas, igual que los tiles: la clasificación se deriva del filtro en cada consulta y nunca reemplaza una elegida.
- El mini calendario de Hoy consulta `mode=month` (solo tareas pendientes, campos mínimos, la grilla visible de hasta 42 días, mismo alcance de responsable, localidad y rubro que la lista).

## Rediseño visual v1, Fase 5: Hoy — 25/10/2026

- Hoy usa los datos que ya carga (`getWork` modo día y `getInboundReview`) para los indicadores. El mini calendario pasó luego a `mode=month` (ver la decisión siguiente en el tiempo).
- Un indicador cuya sección no se muestra queda deshabilitado; un conteo desconocido se muestra «–», nunca 0.
- Los filtros de trabajo quedan siempre visibles y la ayuda de Hoy vive en el «?» del encabezado.

## Rediseño visual v1, Fase 3b: tabla de Gestiones — 25/10/2026

- Los filtros rápidos son un componente compartido (`ListQuickFilters`); cada filtro de fecha declara qué operadores le pertenecen (`on`/`between`/`empty` por defecto; «Próximo paso» suma `before` para «Vencidas»), así no pisa reglas del editor en otras listas.
- La tabla es la vista inicial de Gestiones en todos los anchos.
- Sin filtro rápido «Tipo de gestión» hasta que el servidor admita `managementType` como campo del filtro avanzado (cambio de contrato, fuera de la v1 visual).

## Rediseño visual v1, Fase 3a: lista de Negocios — 25/10/2026

- Tocar una fila abre una vista previa de solo lectura (aprobado por el propietario); el nombre sigue llevando a la ficha. La vista previa usa `getCommercialDetail` con la misma clave de consulta que las acciones de fila. «Contactar» sigue las reglas de la fila (`canActOnBusiness`) y «Editar» la regla canónica `canModifyBusiness`.
- Los filtros rápidos solo son dueños de un grupo: para campos de catálogo, el único grupo formado solo por reglas «es» sobre ese campo; para Último contacto, el único grupo con una regla `on`/`between`/`empty`. Si hay más de un candidato o reglas ajenas sobre el campo, el filtro rápido queda de solo lectura. Nunca modifica otros grupos ni exclusiones.
- Las fechas SQL `date` llegan como medianoche UTC: se comparan con `calendarDay`, no con `localDay`.
- Se quita el botón «Abrir» (ojo) de filas y tarjetas: el nombre y «Abrir ficha» lo cubren.

## Rediseño visual v1, Fase 2c — 24/10/2026

- En la ficha completa, las acciones rápidas preseleccionan email o WhatsApp. El composer compartido usa presentación flotante solo desde esa ficha y en viewport de 768 px o más; el resto conserva el diálogo actual. El panel puede minimizarse manteniendo el borrador. Escape y el cierre siguen las mismas reglas que los diálogos: respetan pickers, diálogos hijos, operaciones en curso, pasos de resultado y la guarda de cambios sin guardar. Cerrar el composer flotante termina el flujo de contacto en escritorio; el composer modal no flotante conserva el comportamiento previo del caller (desde ficha, vuelve a «Contactar»). En teléfonos se conserva el diálogo.
- En Documentos, «Agregar documento» revela el formulario de vinculación sin alterar sus avisos ni permisos. Tras vincular, el formulario se pliega, la confirmación queda visible fuera del formulario y el foco vuelve al botón. Crear un documento propio sigue en «Agregar documento o recurso».
# Vistas fijadas por usuario

Cada usuario configura por separado las vistas fijadas de Negocios y Gestiones. Las vistas ocultas por administración siguen ocultas; por defecto todas las disponibles están fijadas y «Todos» siempre queda fijada. El orden se cambia únicamente arrastrando con `@dnd-kit`. La preferencia vive en `appSettings` bajo `view_pins:<userId>`.
# Bandeja de conversaciones

- Una conversación se identifica por negocio (`account_id`), gestión (`lead_id`, NULL para General) y canal.
- «A revisar» cuenta solo inbound con `pending_review` y `is_automatic=false`; no existe estado leído/no leído. `unmatched` queda en administración. `dismissed` se conserva visible en el hilo como descartado, pero no suma pendientes ni determina actividad reciente.
- **Visibilidad (propietario, 26/10/2026): una sola regla para listas, búsqueda e hilos**, la de `reviewGET` (Hoy, «Respuestas nuevas») y la pestaña «Comunicación» del negocio. Admin ve todo. Un vendedor ve un mensaje cuando el **negocio** está asignado a él **o** la **gestión** está asignada a él: el responsable del negocio ve también lo que entra y sale por gestiones de otros vendedores en su negocio; el responsable de una gestión en un negocio ajeno ve solo esa gestión (no General ni otras gestiones). Negocio borrado: excluido para todos. Gestión en la papelera: excluida de listas, búsqueda y contadores para todos, como en Hoy; el admin puede abrir su hilo por enlace directo. Negocio archivado: como `assertAccountViewable`, solo el admin o el responsable del negocio, así las listas y la búsqueda nunca muestran algo que el hilo después rechace con 403. `scope=all` solo amplía para admin; para un vendedor equivale a `scope=mine`. Implementado una vez en `visibleRow()` de `src/helpers/inboxQueries.ts`.
- Errores: entrada inválida (Zod, cursor, rango de fechas) → 400 antes de consultar datos; negocio o gestión inexistente (o gestión de otro negocio) → 404 con mensaje en castellano; sin acceso, archivado ajeno, borrado → 403.
- Los cursores guardan el instante con microsegundos y se comparan como `texto::timestamptz`: postgres.js serializa un parámetro tipado `timestamptz` con `new Date()` y perdería los microsegundos.
- La búsqueda incluye `crm_messages.subject/body/summary` y `crm_inbound_messages.subject/text_body`, usando `normalizeSearchSql()` (acentos insensibles y ñ distinta de n). El término es literal: `%`, `_` y `\` se escapan (`ESCAPE '\'`), y los índices trigram se siguen usando.
- La migración 043 (`043_inbox_indexes.sql`; era 042 antes de integrar la 042 de registro automático) agrega solo índices trigram (sin índices de orden temporal: ninguna consulta los usaba para ordenar, y con datos sintéticos el planner recorría el índice temporal parcial en lugar de los trigram, con una búsqueda unas 10 veces más lenta). Son índices transaccionales: las escrituras en cada tabla esperan durante la construcción de su índice.
- Pantalla (B2): las acciones sobre un mensaje recibido («Responder», «Registrar respuesta», descartar) son un único componente, `InboundMessageActions`, y el registro usa `ResponseRecordDialog`; la pestaña «Comunicación» y la Bandeja usan los mismos, con las mismas mutaciones y la misma invalidación (`communication`, que incluye Hoy, e `inbox`). Las acciones de la Bandeja se arman con las filas del hilo (`inbox_thread` trae asunto, automático, mensaje vinculado, disponibilidad de respuesta y registro automático activo), así un mensaje fuera de las 200 filas de `communication` conserva sus acciones; `communication` solo alimenta el diálogo de respuesta. «Nuevo mensaje» abre el «Contactar» de siempre (`BusinessContactDialog`) con la gestión de la conversación preseleccionada.
- **Registros anulados (integración de la spec 85, 26/10/2026):** `voided` (mensaje o recibido) queda fuera de listas, contadores, última actividad y búsqueda, en ambas direcciones, igual que `cancelled`. En el hilo se oculta por defecto, como en «Comunicación»; un admin lo ve con «Anulados» (`includeVoided=1`, ignorado para vendedores), atenuado como un descartado y con la etiqueta «Registro anulado», sin acciones. «Automático» y «Anular registro» siguen la regla de la ficha: registro activo, contexto con permiso de escritura y el usuario que registró o un admin. El diálogo de anulación es un componente compartido (`AutoRegistrationVoid`).
- Pantalla (B2): el intento de respuesta a un email (id e «incierto») vive en un almacén por `QueryClient`, no en el componente: cambiar de conversación no habilita un segundo envío. «Responder» sigue bloqueado tras un resultado incierto hasta que el mensaje de respuesta (su id es el del intento) tiene un estado final; un reintento tras un fallo de red reusa el mismo id.
- Pantalla (B2): listas de negocios e hilo son consultas infinitas (`useInfiniteQuery`) con la clave de todos sus filtros; una invalidación recarga todas las páginas cargadas. En teléfono, el panel visible sale de la URL (sin negocio → lista; negocio sin conversación → conversaciones; selección completa → detalle). El nombre del negocio llega con `inbox_threads`. El mínimo de búsqueda cuenta caracteres visibles (grafemas sin espacios, tras el mismo `trim` que Zod) en cliente y servidor.
- Pantalla (B2): el resaltado de la búsqueda ubica la coincidencia con el mismo normalizador que el servidor (`normalizeSearchText`, acentos no, ñ sí) mapeado al texto original (`findSearchMatch`). El contador dice «N resultados cargados» mientras haya cursor, porque la API no devuelve un total. En la URL, `channel` es el canal de la conversación elegida; el filtro «Canal» de la lista de negocios es estado propio de la pantalla.

## Actualización en vivo y ayuda contextual — 26/10/2026

- La actualización en vivo está siempre activa y su control es solo informativo: verde activa, celeste mientras se recargan datos, rojo «Sin conexión» o «Con problemas». Se quitaron el interruptor y «Actualizar datos ahora»; una preferencia `hospeda-live-mode=off` guardada se ignora y se borra.
- La ayuda contextual es un «?» (`HelpLink`) junto al título de cada página y de las secciones que lo necesitan, y abre el artículo de la guía (`/guide#<id>`). No hay botón de ayuda en la barra superior ni popovers por página.
- Las tablas de Gestiones y Negocios comparten encabezado, íconos de orden, checkbox y estilo de la columna de selección. Las acciones de fila son íconos siempre visibles; en Negocios solo «Archivar» (admin) queda en «…».

## Comunicación en la ficha del negocio (spec 90) — 27/10/2026

- «Comunicación» del negocio es una sola conversación cronológica, con «Requiere acción» arriba y «Borradores» aparte. Las acciones de «Por revisar» están solo en «Requiere acción».
- Las restricciones técnicas por canal se editan solo en «Preferencias y restricciones de contacto» (columna izquierda); la pestaña muestra un aviso. La vista de gestión conserva el editor en su pestaña.
- Ficha apilada (contenedor ≤900 px): la columna del negocio va primero como tarjeta compacta, con «Personas» y «Datos del negocio» plegados al abrir la ficha; después, próximo paso y solapas. Reemplaza la decisión del 24/10/2026 (próximo paso y solapas primero). El plegado se decide al montar y no pisa lo que la persona abrió o cerró.
- Instagram se nombra igual en todas partes; una red social registrada a mano que no es Instagram es «Red social».

## Segunda pasada de «Comunicación» (spec 91) — 27/10/2026

- Las acciones de «Por revisar» viven solo en la burbuja; «Requiere acción» es un resumen que lleva al ítem. «¿Lo enviaste?» se muestra en las dos partes y comparte el bloqueo de doble envío (reemplazado por la spec 92: los envíos sin confirmar viven solo en «Requiere acción»).
- Las acciones secundarias de cada ítem van en «⋯»; lo pendiente (confirmar envío, «¿Cómo salió?», responder un email) queda visible.
- «Nuevo desde tu última visita» se guarda por usuario y negocio en `crm_communication_reads`: no es contacto ni actividad, no va al journal ni al historial, nunca retrocede y no acepta fechas futuras. Se marca con la hora del ítem más nuevo cargado, solo desde la vista del negocio.
- «Preparar respuesta» (nombre distinto del «Responder» por SMTP) solo prepara email o WhatsApp; con No contactar queda deshabilitado y con restricción activa (también `all`) o remitente desconocido abre el composer normal con el motivo. Nunca preselecciona un destinatario distinto del remitente: el canal propio del negocio solo se preselecciona cuando nadie más puede recibir por ese canal y, en WhatsApp, cuando coincide con `telefono` (y con `whatsapp` si está cargado).
- Un ítem registrado después de la visita pero con fecha anterior nunca se marca como nuevo: la comparación usa la fecha del ítem.

## Variables de entorno en desarrollo y pruebas — 27/10/2026 (propietario)

- `npm run dev` carga el `.env` de la raíz (ignorado por Git) en la API con `--env-file-if-exists=.env`: **todas** sus variables, sin lista previa, así que agregar una variable nueva no requiere cambios de código. Un `.env` ausente no falla. Lo exportado en la shell gana sobre el archivo (Node no pisa variables ya presentes, tampoco las vacías).
- `npm run local` incluye todas las variables del `.env` y encima aplica solo sus valores propios: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `PORT`, `PUBLIC_APP_URL`, `NODE_ENV`, `CRM_DEV_*` y `BREVO_API_KEY` vacía (nunca se envían emails reales desde una base de desarrollo). Precedencia: valores propios de `npm run local` > `.env` > shell base.
- Los scripts `test:*` y `db:seed:test` cargan `.env.test` (ignorado por Git, plantilla `.env.test.example`) con `--env-file-if-exists=.env.test` y **nunca** `.env`. CI no tiene `.env.test` y exporta su entorno, así que no cambia.
- Producción (`npm start`, Docker, Coolify) no lee ningún archivo `.env`: las variables se configuran en Coolify.
- «Conversación» es una ventana de chat (pedido del propietario tras probar): un marco con encabezado y pie fijos y un cuerpo con scroll propio. Todo el desplazamiento (abrir en el último, «Ir al último», «Ver anteriores», ir a un ítem de «Requiere acción») ocurre en el cuerpo; la página no salta. Alto: crece con el contenido hasta `clamp(420px, 100dvh − 90px, 900px)` en escritorio y `max(360px, min(70dvh, 100dvh − 150px))` en móvil, solo CSS.
- La pestaña abierta del negocio va en `?tab=` (spec 91 §13): se cambia con `replace` (Atrás sale del negocio, no recorre pestañas), `?section=` queda como entrada heredada y valores desconocidos u ocultos abren Resumen. El fondo del cuerpo de la conversación es un token propio (`--chat-wallpaper`, menta suave `#E3EFE6` / `#0F1D1B` en oscuro, solo color, sin patrón ni recursos de terceros).
- Cada ítem lleva el color de su plataforma (tokens `--platform-*`): el lado dice enviado o recibido y el color la plataforma. Recibido: burbuja blanca con borde izquierdo de 3px; enviado: tinte del color con borde derecho de 3px (reemplaza el azul de marca); llamadas y respuestas sin mensaje: caja compacta centrada con tinte de su canal. Los separadores de día son píldoras.
- Cada ítem de la conversación son dos líneas: encabezado compacto (hora · canal · quién · marcas y estado · acciones chicas · ⋯) y la burbuja. No quedan filas de marcas o estado debajo de la burbuja.
- Cada ítem dice su lado antes del remitente: «Nosotros» (enviado, llamada) o «Negocio» (recibido, respuesta registrada sin mensaje). «Cómo leer el chat», junto al título «Conversación», es la leyenda (lado, fondo, color por plataforma, borde punteado, caja centrada). La burbuja punteada (canal abierto, envío sin confirmar) explica al pasar o enfocar que no sabemos si se envió; el borde punteado es de 2px y usa el color de la plataforma.
- Los avisos (toasts) van siempre por encima de todo, diálogos apilados incluidos (pedido del propietario): la escala de capas vive en `src/helpers/layers.ts` (`LAYERS`), los diálogos se apilan desde 410 y se limitan por debajo del aviso (`DIALOG_LAYER_MAX`), y el aviso usa `LAYERS.toast` en línea. Reemplaza la regla anterior que dejaba los avisos (390) debajo de diálogos y popovers. Con un diálogo abierto el aviso pasa arriba al centro (vuelve abajo a la derecha al cerrarlo) para no tapar el pie del diálogo, donde están las acciones principales; la caja del avisador no toma clics, solo las tarjetas.

## Instagram desde el composer (spec 92) — 27/10/2026 (propietario: D1–D4 opción 1)

- Un intento de Instagram es una fila `channel='social'` con `destination_detail='instagram'` y destinatario `@usuario`; siempre va al usuario del negocio. El estado `instagram_opened` es «abierto, envío no confirmado», igual que `whatsapp_opened`.
- El eco de Meta confirma el mismo intento (sin fila nueva) con la regla de similitud del userscript (Dice ≥ 0,5), ventana de 24 h antes y 10 min después, el más nuevo gana. Espera de 15 minutos antes de preguntar «¿Lo enviaste?».
- Cuando el eco llega antes del intento, el eco queda `voided` con `external_id` NULL y el mid pasa al intento: el índice único `(channel, external_id)` no permite que lo conserven los dos (desvío de D3, mismo criterio que la anulación del autoregistro). Un reintento de Meta sigue sin efecto.
- La resolución automática actúa como sistema (`triggered_by='instagram-webhook'`, sin actor): no depende del acceso actual del dueño ni de No contactar, y nunca marca cliente a un negocio con No contactar.
- `ig.me` no funciona en Instagram Web (prueba del propietario, 27/10/2026): en la computadora «Abrir Instagram» abre el perfil `https://www.instagram.com/<usuario>/` y la vendedora toca «Enviar mensaje»; en el celular sigue `ig.me/m/<usuario>`, que abre el chat en la app. El servidor devuelve solo el usuario validado y la elección vive en un único helper del cliente (`instagramTarget`, por puntero grueso).
- Revisión de la 92: la ventana del eco se ancla en el momento de abrir (journal `instagram_opened_unconfirmed`), no en `last_interaction_at`, que «Sí, se envió» mueve; solo los intentos con ese journal pueden recibir un eco, y un registro manual de «Red social» escrito «instagram» se guarda como «Instagram (manual)».
- Envíos sin confirmar fuera de «Conversación» (propietario, 27/10/2026, todos los canales): un WhatsApp o Instagram abierto y sin confirmar (`whatsapp_opened`, `instagram_opened`, también durante la espera de 15 minutos de Instagram) no se muestra en la conversación; vive solo en «Requiere acción», con el texto preparado, «Sí, se envió» / «No se envió» y, en Instagram, «Copiar y abrir de nuevo». Al confirmarse (a mano, por el userscript o por el eco) aparece como enviado en su hora. Un envío «No se envió» (`manual_not_done`, salvo llamadas) solo se ve con «Mostrar anulados». Ninguno de los dos cuenta para «Nuevo desde tu última visita» ni para marcar la visita. Reemplaza «¿Lo enviaste?» en las dos partes con bloqueo compartido (spec 91): ahora hay una sola copia. El email con resultado incierto no cambia: el mensaje sí salió del CRM y sigue en la conversación con borde punteado.
- La Bandeja sigue la misma regla (propietario, 27/10/2026): un envío abierto sin confirmar no aparece en negocios, conversaciones, conteos, última actividad, vista previa, búsqueda ni hilo hasta confirmarse; «No se envió» solo en el hilo de un admin con anulados. El material de un envío sin confirmar se ve y se revoca desde «Requiere acción» (también para quien no puede contestar el envío).

## Email: entrega, aperturas y clicks (spec 93) — 27/10/2026

- **Entregado.** `delivered` de Brevo sigue llevando el email a `delivery_confirmed`; el ítem muestra «Entregado · <fecha hora>» con la primera entrega. Prueba que el servidor del destinatario lo recibió, no que alguien lo leyó.
- **La entrega le gana a un rebote temporal.** Un `soft_bounce` o `deferred` antes de la entrega, o en el mismo segundo, nunca deja el email fallido. Un `hard_bounce`, `blocked`, `invalid_email` o `error` posterior a la entrega sigue ganando (rebote asincrónico). Un `soft_bounce` solo, sin entrega, sigue siendo «Rebote/fallo», como antes.
- **La conciliación corre solo con evidencia nueva.** `reconcileEvents` se ejecuta cuando el webhook guarda un evento terminal nuevo o cuando hay eventos huérfanos del mismo mensaje. Aperturas, clicks, spam, `deferred`, `unsubscribed` y eventos repetidos se guardan y no hacen nada más. Antes cada evento reescribía el resultado de la actividad y volvía a agregar una restricción automática que un admin había levantado.
- **Aperturas y clicks son informativos.** «Abierto», «Click en un enlace» y «Marcado como spam» no cambian el estado, no cuentan como contacto ni respuesta, no completan tareas, no tocan el último contacto y no escriben journal ni historial (D2, confirmada por el propietario el 27/10/2026).
- **Aperturas aproximadas.** Tooltip y leyenda: «Aproximado: algunos clientes de correo abren los emails automáticamente (Apple Mail) y otros bloquean las imágenes.» Las `proxy_open` / `unique_proxy_open` se muestran aparte como «Posible apertura automática» y no suman a «Abierto» (D1, confirmada por el propietario el 27/10/2026).
- **Conteo.** Aperturas = `max(cantidad de opened, min(cantidad de unique_opened, 1))`, porque Brevo puede mandar ambos en la primera apertura. Los enlaces del click se muestran como texto (host y ruta, sin query ni fragmento, hasta 3), nunca como enlace.
- **Spam y baja no restringen.** Spam es un aviso; `unsubscribed` solo se guarda. Agregar una restricción automática por spam es un cambio de política que decide el propietario (D3, confirmada por el propietario el 27/10/2026).
- **Sin migración.** La consulta agregada usa el índice existente `crm_email_events_outbox (outbox_id, occurred_at)`.

## Instagram Web con el user script (spec 94) — 28/10/2026 (propietario: D1, D6 y D7)

- **Un solo script (D1).** Instagram es un módulo del mismo «Hospeda CRM» (`@match https://www.instagram.com/*`, versión 1.4.0), no un segundo script: las vendedoras instalan y actualizan uno solo. `main.ts` elige el módulo por host (`siteFor`). Al actualizar, Tampermonkey pide aprobar instagram.com una vez; sin aprobarlo, WhatsApp sigue funcionando.
- **Aislamiento por código, no por permisos.** Los `@grant` valen para todos los `@match`, así que el aislamiento lo da el código: el módulo de Instagram no lee el token ni otro valor de GM (solo la clave del traspaso, a través de un `HandoffStore` que arma `main.ts`, con borrado compare-and-delete), no hace pedidos, no usa el portapapeles, no corre lógica de WhatsApp y no importa nada fuera de `userscript/src/instagram/`. Lo cubren `instagramIsolation.spec.ts` y un chequeo estático (imports dinámicos, `sendBeacon`, `WebSocket`, `EventSource`, `new Image`, `GM_*`, `unsafeWindow`, storage, portapapeles).
- **Traspaso de un solo uso (D6).** Un `#hospeda` suelto permitiría que cualquier sitio abra `instagram.com/<atacante>/#hospeda` y haga escribir algo en un DM con el atacante. Por eso el CRM genera un nonce de 128 bits y despacha en `document` un evento con un JSON (string, cruza el sandbox de Tampermonkey) `{nonce, usuario, vencimiento de 2 min, texto}`; el script lo guarda y confirma con el atributo `data-hospeda-instagram-ack`. Solo con esa confirmación (300 ms) se abre `#hospeda=<nonce>`; si no, el perfil sin marcador y pegado manual. En Instagram actúa solo si coinciden nonce, vencimiento y perfil, y borra el traspaso de ese nonce antes de actuar. Con un marcador sin traspaso válido muestra un aviso neutro y no toca nada; dos aperturas seguidas: vale la última.
- **El texto viaja en el traspaso; nunca se lee el portapapeles en Instagram (D7, segunda revisión).** Leerlo desde el script le da el permiso del portapapeles al origen instagram.com, y cualquier código de Instagram podría usarlo. Costo aceptado: el texto queda como máximo 2 minutos en el almacenamiento propio del script en Tampermonkey (las páginas no lo leen) y se borra al usarse. Tope de 4000 caracteres; más largo, pegado manual. El CRM igual copia al portapapeles como respaldo. No hay pedido de permiso y Firefox funciona igual.
- **Solo en el chat que abrió el clic.** Siempre toca «Enviar mensaje» del encabezado del perfil (vuelve a verificar el perfil justo antes) y solo escribe si la página pasó a `/direct/t/<id>/`, en el cuadro de esa página y vacío. Nunca usa un chat flotante: una etiqueta o un mensaje con el nombre (un grupo, `target_fan`, «@target») no prueban el destinatario. Si cambia de página, aborta. Verifica el texto por igualdad. Nunca envía: ningún Enter, ningún clic en Enviar.
- **Sin script, como antes.** Sin script que pegue (o en el celular) el CRM abre el perfil sin marcador y el toast indica pegar a mano. El script de Instagram no reporta versión ni muestra aviso de actualización: el estado «En este navegador» y el aviso de WhatsApp ya cubren el script compartido.
- **Riesgos aceptados.** El DOM de Instagram puede cambiar (el respaldo es el pegado manual con aviso), los términos de Instagram prohíben la automatización (solo un clic y un pegado en la sesión propia, sin enviar: riesgo bajo, no nulo) y es solo para computadora. Instagram puede ver el nonce en la URL antes de que el script lo quite; no le sirve: es de un solo uso, atado al perfil, y no lleva el texto.
