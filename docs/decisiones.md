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
- `status` es la única fuente de verdad para distinguir Nuevo de Revisado. `review_status` se conserva como dato histórico/compatibilidad para respaldar la migración, pero no se edita ni se ofrece como columna o filtro en la interfaz.
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

- Comunicación es saliente y permite registrar manualmente respuestas; no es una bandeja sincronizada. Email se envía por Brevo; WhatsApp prepara y abre el canal externo; llamadas, redes y Otros se registran manualmente.
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
- Comunicación prepara contactos salientes y registra respuestas manualmente; no es una bandeja sincronizada. Canales: Email por Brevo, WhatsApp asistido, llamadas, redes y Otros con aclaración.
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
