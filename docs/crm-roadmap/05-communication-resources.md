# Fase 5: comunicación, secuencias asistidas, documentos y biblioteca

Base remota verificada: main `c175aaa7d1ee2cea6ae9c1f17d160f3e0c597015`. Fases 1–4 y documentación revisadas. No existe AGENTS.md en el checkout. Rama `feature/crm-communication-resources`. Sin deploy ni mensajes reales de prueba.

## Comunicación y snapshots

Desde Email/WhatsApp de una oportunidad se selecciona contacto, template o mensaje libre. Preparar conserva un borrador en DB; no contacta al proveedor. Los nombres vacíos permanecen vacíos. Las variables y condicionales se renderizan con el motor existente. WhatsApp conserva negrita, cursiva, tachado, enlaces y saltos tanto en Node como en navegador.

El usuario edita asunto y cuerpo final. Email utiliza TipTap; WhatsApp permite editar directamente el texto con sus marcadores. Guardar genera el HTML completo de Hospeda y texto plano de email, que son exactamente los guardados/enviados. Preview en iframe sandbox sin scripts. Sanitización conserva etiquetas de formato admitidas y vínculos HTTP(S)/mailto, elimina scripts, otras etiquetas y atributos ejecutables. No se reinterpreta una variable escrita en el mensaje final. Para email se exige asunto y contenido; para WhatsApp un teléfono normalizable sin ambigüedad. No se inventa el 9 móvil argentino.

Template snapshot: contenido original, asunto, nombre, ID, fecha de edición, contexto de variables y versión SHA-256. Es una versión por contenido/fecha, independiente de futuras ediciones o baja del template; no pretende reconstruir versiones anteriores sin evidencia. Mensaje conserva destinatario y nombre observados, cuerpo final, HTML/texto enviados, actor, actividad, outbox y secuencia/paso opcionales. Tras utilizarlo no se edita; las evidencias posteriores quedan auditadas como cambios de estado/resultado. Un cambio de canal del contacto exige preparar un nuevo borrador. El aviso reciente muestra fecha, canal, estado y autor de mensajes observados del mismo canal/destinatario dentro del negocio (ventana configurable); no afirma conocer contactos externos al CRM ni toda la historia previa.

Revisión/checkbox explícito antes de enviar/abrir. UUID estable del mensaje y bloqueo transaccional garantizan una sola reclamación de envío. Confirmaciones, controles y eventos usan el mismo orden de bloqueos breves de tablas CRM para coordinar escrituras con la fusión; nunca se retienen durante la llamada de red. Conflicto de revisión no se resuelve sobrescribiendo. Live Mode refresca listados sin remount del editor que descartaría texto en preparación. La ruta histórica `send_template_email` devuelve 409: se usa el flujo revisable.

## Estados honestos

| Estado | Evidencia |
| --- | --- |
| Borrador | Contenido preparado; no enviado |
| WhatsApp abierto | CRM autorizó abrir el enlace con el texto revisado; no prueba pulsación de Enviar, recepción ni entrega. El navegador puede bloquear una ventana; en ese caso tampoco existe prueba de apertura externa |
| Envío confirmado manualmente | Usuario declara que envió WhatsApp |
| Envío en curso | Reclamación persistida antes de llamar Brevo; no admite otro envío |
| Email aceptado por proveedor | Respuesta HTTP exitosa de Brevo; no prueba entrega |
| Entrega confirmada | Evento autenticado `delivered` correlacionado |
| Rebote/fallo | Rechazo HTTP o evento de rebote/bloqueo/email inválido/error; sin reintento automático |
| Resultado incierto | Timeout, error de red o persistencia posterior a aceptación; no admite reenvío |
| Respuesta/rechazo registrado manualmente | Declaración explícita del usuario; detiene seguimiento |
| Cancelado | Borrador de secuencia detenido; no enviado |

WhatsApp abierto crea actividad de tipo Otra, para no proyectar un contacto efectivo. La confirmación manual cambia a Mensaje. Email aceptado crea una única actividad; eventos ajustan su evidencia de entrega/fallo, conservando auditoría. Respuesta/rechazo manual no se sobrescribe por un evento posterior de entrega; outbox conserva el estado técnico independiente. Apertura/clic se guardan como eventos, nunca como respuesta. Registro de contacto anterior y actividades manuales con Respondió/Interesado/No interesado también detienen secuencias. No se detectan respuestas externas automáticamente.

## Restricciones y permisos

Restricción append-only por persona y canal email/WhatsApp/todos; en contacto original se vincula a la oportunidad. Guarda motivo, fecha y autor; levantar registra nuevo motivo/fecha/autor, sin borrar la restricción. No elimina contactos ni equivale a consentimiento legal. Una restricción de persona aplica a sus distintas oportunidades del mismo negocio; los datos genéricos históricos tienen su propio alcance. No se infiere que dos personas con teléfono compartido son la misma.

| Acción | Permiso backend |
| --- | --- |
| Preparar/editar/usar comunicación; iniciar/controlar secuencia; bloquear | Admin o responsable del negocio/oportunidad |
| Modificar/usar borrador ajeno | Solo admin; user requiere además ser propietario del borrador |
| Levantar restricción | Solo admin |
| Configurar secuencias/categorías; aprobar recurso | Solo admin |
| Crear documento contextual/vincular recurso | Admin o responsable del contexto |
| Crear recurso sin contexto | Usuario autenticado, queda borrador propio |
| Nueva versión/archivar/baja de documento | Responsable del documento o admin |
| Leer/descargar documento | Responsable, admin, responsable del contexto o recurso de biblioteca aprobado |

El backend comprueba no contactar general del negocio y restricciones al preparar, editar y reclamar un envío. Admin no las omite. La reclamación es el límite transaccional: una restricción posterior no puede retirar un mensaje ya entregado al proveedor. Las restricciones cancelan seguimiento asistido pendiente, conservando trabajo realizado. Levantarlas no reanuda automáticamente. Los canales del diálogo de tarea general también ocultan enlaces bloqueados; llamadas/enlaces externos no ofrecen verificación de envío. No es posible interceptar acciones fuera del CRM.

## Brevo: configuración y eventos

Documentación oficial consultada para esta implementación:

- https://developers.brevo.com/docs/secured-webhooks
- https://developers.brevo.com/docs/transactional-webhooks
- https://developers.brevo.com/docs/send-a-transactional-email
- https://developers.brevo.com/reference/create-webhook

Sin configuración externa no se afirma entrega ni validación externa exitosa. No se envían mensajes reales para pruebas. Fixtures sustituyen fetch y reproducen eventos, aceptación, rebotes, duplicados y fallos de persistencia.

Configuración pendiente operativa:

1. `BREVO_API_KEY`, remitente/dominio verificado, ajustes de remitente/reply-to en DB o remitente del usuario. `PUBLIC_APP_URL` público correcto.
2. Crear secreto aleatorio de al menos 32 caracteres en `BREVO_WEBHOOK_TOKEN`; pasarlo al contenedor. Compose y workflow manual admiten variable/secret homónimo. No se guardan ni muestran secretos en DB/UI/logs.
3. Exponer por HTTPS `POST /_api/brevo/events` mediante reverse proxy. En Brevo configurar webhook transactional con `auth: {type: "bearer", token: "<mismo secreto>"}`. Brevo documenta esa autenticación: no se inventa una firma HMAC. La API key autentica la creación de webhook en Brevo, no el callback recibido.
4. Suscribir sent/request, delivered, softBounce, hardBounce, blocked, invalid, error y opcionalmente opened/click/deferred. La configuración del webhook se realiza externamente; esta fase no llama a crear webhooks ni modifica la cuenta del proveedor.
5. Verificar funcionamiento real separadamente con autorización explícita. Sin secreto válido el receptor devuelve 503, token incorrecto 401.

Receptor acotado a 256 KiB y 100 eventos. Requiere email/message-id y timestamp UTC real (`ts_event`, `ts`, o `ts_epoch`); no adivina timezone de `date` CET/CEST. Autenticación con comparación de tiempo constante. Huella semántica (mensaje/destinatario/tipo/instante) evita eventos repetidos. Message-id ignora corchetes angulares, exige destinatario coincidente. Tag `hospeda-<UUID>` permite correlación temprana si la aceptación aún no se persistió. Una entrega o respuesta manual que llega antes de la respuesta HTTP de aceptación se conserva; ambos caminos reutilizan la misma actividad y aceptación no sobrescribe la respuesta manual. Eventos sin correlación se conservan y se relacionan al guardar message-id; no actualizan un outbox arbitrario. `id` del payload puede identificar el webhook, por eso no se usa como ID único de evento.

Último evento terminal por timestamp determina entrega/fallo; orden de llegada no importa. Empates tienen orden determinista por nombre de evento. Eventos request/open/click/deferred no rebajan un terminal ni generan respuesta. Se conserva el payload recibido en DB para diagnóstico, accesible operacionalmente, no expuesto en listados públicos.

Antes de llamar Brevo se persisten outbox y estado submitting. Un error posterior a aceptación jamás habilita reenviar el mismo UUID. Si el proceso muere, submitting también bloquea reenvío. Tags/eventos pueden reconciliar entrega/fallo incluso cuando faltó guardar el message-id, reconstruyendo la actividad si es necesario. Sin evento correlacionable, un administrador debe revisar logs de Brevo; no hay botón de reintento ni promesa de exactly-once entre PostgreSQL y un proveedor externo. Un mensaje nuevo es una decisión distinta y debe hacerse solo después de esa revisión.

## Secuencias asistidas

Admin define nombre, alcance descriptivo y hasta 12 pasos con espera de 0–365 días desde el anterior, canal y template. El alcance es información de uso previsto, no un segmento que inscriba contactos automáticamente. Configuración en DB; sin secuencias comerciales ficticias precargadas. Templates deben estar activos y ser compatibles con cada oportunidad al iniciar.

Inicio explícito, contacto seleccionado y confirmación: una transacción congela configuración/template/contexto y genera todas las tareas y borradores. Esperas acumuladas en días calendario de Argentina desde inicio (no hábiles, no después de envío). Cada paso guarda tarea e ID estable. UUID de ejecución idempotente y una sola ejecución activa/pausada por oportunidad/contacto. No hay cron, worker, API WhatsApp ni envío automático; vencimiento únicamente hace visible el seguimiento.

Un paso no se despacha antes de su vencimiento ni con pasos anteriores pendientes/fallidos. Su tarea debe seguir pendiente y sin baja; una tarea completada/cancelada manualmente no habilita despachar el borrador. Fechas DATE usan el mismo conversor calendario de fase 2. El usuario abre el borrador en Comunicación, edita, guarda, revisa y ejecuta explícitamente. Pausa cancela temporalmente tareas pendientes de esa ejecución con motivo específico; borradores permanecen, pero backend bloquea envío. Reanudar restaura solo las tareas pausadas con borradores aún pendientes; conserva vencimientos originales, incluso si quedaron atrasados. Cancelar cancela tareas pendientes/borradores, no mensajes usados ni tareas ordinarias. Completada cuando todos los pasos tienen evidencia de uso; el envío aceptado completa el paso, sin esperar entrega y sin afirmar respuesta.

Detención irreversible de esa ejecución ante respuesta/rechazo manual, estado Respondió/No interesado, cierre ganado/perdido, conversión de negocio a cliente, baja de oportunidad o no contactar. Triggers cubren cambios por editores y APIs anteriores. La política conserva realizados y cancela únicamente pendientes generados por secuencia. Restricción de un canal detiene conservadoramente el seguimiento del contacto, aunque queden otros pasos por otro canal. No se reanuda por levantar una restricción, restaurar una oportunidad o volver a abrir una venta: requiere un nuevo inicio explícito. Sin deshacer de envíos ni de respuestas.

## Documentos y biblioteca

Archivos pequeños reales o vínculo HTTP(S), tipo libre, responsable real, fecha de alta, vencimiento opcional por versión, contexto cuenta/oportunidad/actividad, categoría y estado borrador/aprobado/archivado. Nuevas versiones inmutables; cada alta de versión devuelve el documento a borrador y requiere aprobación nueva. Responsable/autor del archivo y aprobación quedan separados. Recursos aprobados se vinculan con `crm_document_links`, sin duplicar el documento/bytes. Cambiar versión aprobada actualiza la referencia compartida, conservando versiones anteriores. Biblioteca permite búsqueda por título y filtro por categoría configurable; usuario común ve sus borradores y recursos aprobados, no borradores ajenos. Versiones no aprobadas de un recurso aprobado no se exponen a lectores de biblioteca.

PDF, PNG, JPEG y TXT UTF-8 hasta 2 MiB, configurable a un valor inferior en `app_settings.crm_communication.maxDocumentBytes`. Se validan base64 canónico, cantidad de bytes, extensión, MIME y firma básica/formato. No admite HTML, SVG, ejecutables ni ZIP. Descarga autenticada con attachment, nosniff y no-store; no se sirve desde carpeta pública ni se ejecuta el documento. La firma básica no equivale a antivirus ni análisis completo del PDF. Vínculos no se descargan/proxyfican, no se valida disponibilidad externa y no se autoriza acceso al sitio externo. Vencimiento se informa, no borra ni renueva contenido.

Se guarda base64 y SHA-256 de bytes en PostgreSQL para estos tamaños, evitando almacenamiento efímero del contenedor y un segundo volumen que los backups existentes pudieran omitir. Base64 añade ~33% de espacio; no es adecuado para videos o archivos grandes. Tamaños/metadata se consultan sin cargar bytes; descargas los leen solo con permiso. Tope de listado: 200 documentos y últimas 200 comunicaciones/100 ejecuciones. Bajas lógicas conservan versiones e historial y deniegan descarga normal; no hay UI de restauración/purga de documentos en esta fase.

010 adapta **todos** los `archivo_adjunto` existentes (incluida papelera) a documentos borrador con su referencia original exacta; no modifica el lead ni afirma que una URL histórica es válida o aprobada. Ediciones posteriores del adjunto antiguo agregan una versión mediante trigger. Vaciar ese campo no elimina el documento ya conservado. Referencias no HTTP(S) permanecen en histórico, pero no se redirigen a esquemas inseguros. No se copia un archivo que solo existía en un servicio externo ni se garantiza su permanencia externa.

## Docker, backups y fusiones

No se añade un volumen de archivos: `hospeda-leads-db` ya contiene documentos/versiones/mensajes. Rebuild/reinicio del contenedor app conserva bytes. El backup PostgreSQL completo (`pg_dump` formato custom) cubre tablas y contenido; respaldar únicamente código o un snapshot JSON de leads no los incluye. No encontré automatización de backups en el repo: esta entrega documenta el procedimiento, no afirma que el VPS tenga backups activos.

Procedimiento manual orientativo desde el directorio Compose, ajustando usuario/DB:

~~~bash
# No eliminar el volumen ni ejecutar down -v.
docker compose exec -T postgres pg_dump -U hospeda -d hospeda_leads -Fc > hospeda-crm.dump
# Restaurar exclusivamente en una DB aislada de verificación, nunca sobre producción sin plan.
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" hospeda-crm.dump
~~~

Guardar dump cifrado fuera del VPS y verificar restauración periódicamente. En una restauración: comprobar `schema_migrations`, recuento/versiones, SHA-256 de bytes, permisos y descarga de una muestra. Secretos/configuración de webhook y correo deben respaldarse separadamente con controles adecuados; no se incluyen en el dump por estar en variables de entorno. No iniciar envíos reales ni flujos de producción desde una restauración de prueba.

La fusión de fase 4 incluye mensajes, restricciones, ejecuciones, documentos y vínculos en snapshot, locks y movimientos transaccionales. IDs/contactos/tareas/actividades permanecen; `original_account_id` conserva atribución en mensajes/ejecuciones/documentos/vínculos. Restricciones conservan actor/fecha originales. Auditoría de recursos es append-only con antes/después, sin copiar bytes del archivo en journal. Historial y contenido anteriores no se reescriben; documentos compartidos siguen siendo una sola entidad. Nuevas relaciones no hacen reaparecer un origen fusionado.

## Verificación

- Typecheck, Vitest, build y diff check.
- Migración aislada 001–009 con adjuntos de papelera/email histórico; aplicar 010 sin cambiar originales ni inventar entrega.
- Integración: permisos, snapshots, nombre vacío, bloqueo/levantamiento, apertura/manual, outbox aceptación, doble despacho, autenticación/correlación/idempotencia/orden de eventos, timeout y fallo inyectado después de aceptación, inicio/reenvío/pausa/respuesta de secuencia, validación de archivos, versiones/conflicto, biblioteca/permisos/descarga, reutilización, fusión y baja lógica.
- Regresiones de fases 1–4 y auth. Playwright del flujo comercial actualizado al preview/confirmación y nueva prueba de WhatsApp con `window.open` capturado, restricción, documento, aprobación, biblioteca y claro/oscuro/móvil.
- CI agrega suite y prueba de persistencia: el contenedor de producción descarga exactamente los bytes del documento fixture creado previamente por las pruebas de código fuente contra la misma DB PostgreSQL 17. Sin Brevo/WhatsApp real. No valida configuración del VPS ni restauración de un backup productivo.
