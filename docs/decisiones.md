# Decisiones estables del CRM

Estas decisiones provienen del propietario y del comportamiento revisado. Cambiarlas requiere tratar el cambio como funcional, no esconderlo en una corrección estética. El estado de implementación y los pendientes están en documentos separados.

## Entidades y recorrido comercial

- Un negocio es una cuenta comercial. Puede tener varias personas y varias gestiones independientes.
- Alta manual/importación crea el negocio; no fabrica una gestión, actividad, conversación ni tarea.
- Iniciar gestión es explícito. Cancelar su formulario no crea nada. El nombre inicial editable es Presentación de Hospeda; no se elige arbitrariamente una etapa histórica como etapa inicial.
- El responsable del negocio y el de cada gestión se conservan como ámbitos distintos cuando ya difieren. Una tarea delegada no cambia el responsable comercial.
- Contactar debe ser el mismo recorrido desde negocio, gestión, Mi día, Agenda y próximo paso: elegir contexto/persona/canal, preparar libre o con modelo, revisar y ejecutar.
- Abrir WhatsApp/email/llamada no prueba envío, respuesta ni contacto realizado. Preparar un borrador no completa una tarea.
- Registrar actividad/resultado puede crear un próximo paso explícito en una transacción. No modifica otras tareas ni etapas por su cuenta.
- Acuerdo comercial, condición Cliente, cierre Ganada, pago y entrega son hechos distintos. No inferir pagos ni activar servicios automáticamente.

## Permisos y comunicación

- Historial global, Papelera y administración tienen permisos de admin; operaciones comerciales siguen el alcance del usuario. Comprobar en servidor, no solo ocultar botones.
- La lectura compartida de un negocio no otorga escritura o permiso de preparar mensajes en una gestión ajena.
- No contactar bloquea los canales correspondientes. Las tareas internas permitidas conservan sus controles propios.
- Un delegado puede registrar el resultado de su tarea. El envío/preparación de mensajes mantiene el permiso del responsable de la gestión o admin hasta acordar otra política.
- Email y WhatsApp tienen modelos para todos los perfiles, incluido Referente. Sin perfil/vertical explícito no excluir modelos arbitrariamente; con contexto conocido respetar su segmentación.
- La biblioteca es administrada: los vendedores seleccionan materiales existentes. Un vínculo o preview no equivale a enviarlos.
- No inventar promociones, precios, garantías, trayectoria investigada ni resultados de envío en textos/modelos.

## Búsqueda, filtros y vistas

- Búsqueda ignora mayúsculas y acentos, preserva el texto original y distingue ñ de n.
- El texto libre participa como filtro AND junto a los bloques avanzados; preservar AND/OR, exclusiones y rangos.
- Click en un badge activo modifica únicamente su valor. Campo y operador permanecen fijos: un filtro Responsable continúa filtrando Responsable.
- Catálogos usan sus valores reales; no renombrar verticales/perfiles históricos ni equipararlos silenciosamente.
- Guardar vista ofrece el recorrido correspondiente a vista nueva, vista elegida o modificaciones de una vista. Conservar identidad, filtros y restricciones.
- Ctrl/Cmd+K combina navegación/acciones y búsqueda de entidades. La búsqueda de archivos cubre título/nombre y permisos; no significa OCR ni búsqueda dentro de todos los PDFs. La búsqueda devuelve resultados acotados, no un listado exhaustivo.

## Diseño y UX

- Mantine es la biblioteca elegida. Usar wrappers y clases compartidas para corregir el sistema, no una página aislada.
- Header móvil de una fila con hamburguesa y menú Drawer. Mantener rutas, permisos, teclado y restauración de foco.
- Jerarquía clara, controles compactos, badges centrados, menús con espacio entre icono/texto, acciones por icono sin borde innecesario y foco visible discreto.
- No llenar cards con filas vacías; conservar contexto útil y acciones legibles en móvil.
- Auditoría visual significa operar la app: editar, filtrar, abrir menús/diálogos, guardar, cancelar, provocar errores y reintentar. Entrar a cada URL no basta.
- Pedidos visuales no autorizan cambiar endpoints, datos, permisos ni reglas comerciales.
- Loading visible en toda acción y listado; evitar doble clic/submit desde el comienzo; conservar el borrador ante error.
- Toasts pueden ofrecer destinos, reintento y Deshacer cuando sea realmente reversible. No prometer deshacer un envío o borrado definitivo.
- Fechas de calendario comercial se presentan en Argentina; no desplazar el día por una conversión UTC implícita.

## Archivo, Papelera y metadatos recuperados

- Archivar: conservar un negocio válido que ya no se trabajará activamente (`crm_accounts.archived_at`).
- Papelera del negocio: eliminación lógica por registro incorrecto o fuera de alcance (`crm_accounts.deleted_at`, autor y motivo). Es independiente de Archivo.
- Papelera de gestiones: consulta su `leads.deleted_at`; no equivale a eliminar el negocio. El antiguo filtro de oportunidad eliminada sigue refiriéndose a la gestión.
- Eliminación definitiva es una operación distinta y restringida. No sustituir soft delete por archivo ni presentar ambos como un cambio de nombre.
- `origin` y `source_reference` preservan origen/ref histórica sin reemplazar `discovery_source` ni `verification_urls` actuales.
- `review_status='filtered'` indica que el negocio fue revisado, se confirmó como válido y se decidió conservarlo. `NULL` queda pendiente de revisión; no es una etapa de venta.
- `subscription_label` es etiqueta histórica; no acredita pago ni convierte a Cliente.
- `source_lead_id` es referencia histórica/técnica, no autorización para recrear las gestiones eliminadas.

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

## IA en el CRM — alcance documental

- El propietario seleccionó 19 ideas para seguir definiendo y retiró las demás del inventario. El [documento 60](crm-roadmap/60-ideas-uso-ia.md) conserva esa selección.
- Se autorizó preparar una épica, una spec de base común de IA y una spec hija por idea, además de publicar la documentación para revisión. Esta autorización no aprueba implementación.
- Proveedor/modelo, clases de datos enviadas a terceros, retención/uso del proveedor, habilitación por rol, límites de gasto y tecnología de voz siguen sin decisión. Consultar la [épica 61](crm-roadmap/61-ai-in-crm-epic.md) y la [spec base 62](crm-roadmap/62-ai-platform-foundation-spec.md).
- Las reglas transversales que aparecen en las specs son propuestas para revisión hasta que el propietario las apruebe explícitamente. Las specs hijas pendientes no son autorización de código ni de acceso a datos productivos.
