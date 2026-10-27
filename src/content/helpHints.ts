import type {HelpTopic} from '../components/HelpLink';

/** Placement-specific hints: one text per button, action group or section that shows a «?». */
export type PlacementHint='startManagement'|'extraTools'|'advancedView'|'saveView'|'moreViews'|'pinnedViews'|'columnOrder'|'rowActionsBusiness'|'rowActionsManagement'|'businessNextStep'|'otherActions'|'scheduleTask'|'logWhatHappened'|'scheduleMeeting'|'logMeeting'|'businessSummary'|'businessManagements'|'businessDocuments'|'attention'|'newReplies'|'inboxFilter'|'voided'|'stageSection'|'followUpSection';
/** Every key accepted by `HelpLink`'s `hint` prop: a page-level topic or a placement. */
export type HelpHintKey=HelpTopic|PlacementHint;

/** Short guidance grounded in the user guide articles and the current UI behaviour; the key is the placement, not the guide article. */
export const HELP_HINTS:Record<HelpHintKey,string>={
 // Page-level topics (also the default text when a placement has no specific hint).
 today:'Tu punto de partida del día: atendé primero lo vencido y después lo que toca hoy. Desde acá contactás, anotás cómo salió y agendás. Una lista vacía solo significa que no tenés tareas con los filtros elegidos.',
 reactivation:'Gestiones cerradas como perdidas con fecha para volver a hablar. El CRM no contacta ni reabre nada solo: elegís cómo retomar cada una.',
 inbox:'Conversaciones agrupadas por negocio. Descartar o registrar un mensaje no envía nada ni cambia la etapa de la gestión.',
 businesses:'Cada fila es un negocio. Abrilo para ver sus personas, el próximo paso y sus gestiones. Cargar un negocio nunca inicia una gestión.',
 managements:'Una gestión es lo que querés lograr con un negocio, por ejemplo venderle un plan. Acá seguís las que ya iniciaste; cargar un negocio no crea ninguna.',
 record:'Anotar lo que pasó guarda algo que ya ocurrió y te pide cómo sigue: agendar una tarea, esperar hasta una fecha o no agendar nada con un motivo.',
 analytics:'Etapas, actividad y conversión, con acceso directo a las gestiones que explican cada número. Los estados comerciales no acreditan pagos.',
 history:'Registro de cambios sobre negocios, contactos, gestiones, tareas y documentos, con la persona que los hizo y la fecha.',
 archived:'Negocios válidos que dejaste de trabajar por ahora. Conservan personas, gestiones, tareas e historial. Solo un administrador puede desarchivarlos.',
 trash:'Registros inválidos o cargados por error. Un negocio en la Papelera no se puede usar ni contactar hasta que un administrador lo restaure. Es distinto de archivar.',
 templates:'Los modelos de mensaje son compartidos y los administra el equipo administrador. Editar el texto de un contacto no modifica el modelo.',
 library:'Propuestas y materiales aprobados. Podés consultarlos y vincularlos a un negocio; no se envían automáticamente.',
 settings:'Usuarios, clasificaciones, comunicación y comportamiento general del CRM. Es un área de administración.',
 guide:'Buscá en la guía cómo usar cada parte del CRM.',
 inbound:'Emails que llegaron y no se pudieron asociar a un negocio: la dirección no está cargada, figura en más de un negocio o el remitente no se pudo verificar. Elegí el negocio y tocá «Asociar».',
 userscript:'Revisá los mensajes de WhatsApp Web que elijas y registralos en el CRM desde el panel del script.',
 filters:'Los filtros rápidos cambian solo la regla de su propio campo: las demás reglas y exclusiones se conservan.',
 columns:'Mostrá u ocultá columnas y arrastralas para ordenarlas. La elección se guarda en este navegador.',
 board:'El tablero organiza las gestiones por etapa. El filtro «Tipo de gestión» de la lista decide qué etapas se muestran, y tocar una tarjeta abre su vista previa.',
 communication:'Mensajes enviados y recibidos del negocio. Abrir o copiar un mensaje no prueba que el contacto se haya hecho.',
 businessTasks:'Tareas pendientes con fecha de este negocio. Para mover una fecha usá «Posponer» en vez de crear otra tarea.',
 businessHistory:'Reúne lo que se anotó en este negocio y los cambios en sus datos (por ejemplo, una persona quitada), con la persona que lo hizo y la fecha.',
 nextStep:'El próximo paso es lo que sigue pendiente con fecha para el negocio o la gestión.',
 stage:'La etapa pertenece a cada gestión y muestra en qué punto va. No es el Estado del negocio.',
 newSale:'Una gestión se inicia a propósito, sobre un negocio. Iniciarla no contacta al negocio ni registra una venta.',
 logResult:'Anotar lo que pasó guarda algo que ya ocurrió y te pide cómo sigue la gestión.',
 // Placement-specific hints.
 startManagement:'Una gestión es lo que querés lograr con un negocio (vender un plan, sumarlo como proveedor). Buscás el negocio, elegís el tipo y un nombre corto, y empieza en su primera etapa. Si el negocio todavía es Nuevo, te pide confirmar que existe y es válido, y queda Revisado. No se puede iniciar desde un negocio Archivado. Esto no lo contacta ni registra una venta.',
 extraTools:'«Importar CSV» (solo administradores) carga negocios nuevos: no inicia gestiones, no crea tareas ni contacta a nadie, y entran como Nuevo para revisarlos. «Buscar duplicados» te ayuda a comparar antes de decidir una fusión.',
 advancedView:'La vista simple muestra lo esencial: negocio, persona, relación y próximo paso. La avanzada suma el selector de columnas, los accesos para contactar y las acciones de editar y retirar gestiones.',
 saveView:'Guarda con un nombre la búsqueda, los filtros y el orden actuales para volver a aplicarlos con un clic. Las vistas guardadas son tuyas y las encontrás en la barra de vistas o en «Más vistas».',
 moreViews:'Acá están las vistas que sacaste de la barra. Podés aplicarlas o fijarlas de nuevo, y con «Elegir vistas de la barra» decidís cuáles se ven y en qué orden. Es personal: no cambia la barra de otras personas.',
 pinnedViews:'Fijá las vistas que querés tener siempre a mano y arrastralas para ordenarlas; las demás quedan en «Más vistas». «Todos» queda siempre fijada y las vistas que el administrador ocultó para el equipo no aparecen. «Volver a la barra del equipo» restaura el orden predeterminado.',
 columnOrder:'Arrastrá una columna para cambiar su posición. «Orden original» vuelve al orden de fábrica sin mostrar ni ocultar nada, y «Vista básica» deja solo las principales. Se guarda en este navegador.',
 rowActionsBusiness:'«Abrir» muestra la ficha del negocio (también con doble clic en la fila). En la vista avanzada podés editar el negocio o retirar sus gestiones, solo si sos su responsable o administrador.',
 rowActionsManagement:'«Abrir» muestra la gestión (también con doble clic en la fila). Editar y enviar a la papelera requieren ser el responsable o un administrador. La papelera es distinta de archivar.',
 businessNextStep:'Muestra qué sigue con este negocio: tu próxima tarea pendiente o, si no hay ninguna, un botón para agendar una. Si falta una persona o un canal, te lo pide primero; si el negocio está marcado No contactar, no se puede contactar: un vendedor solo lo consulta y solo un administrador puede modificarlo.',
 otherActions:'«Contactar ahora» prepara el mensaje por el canal que elijas; abrir o copiar no prueba que se haya contactado. «Anotar lo que pasó» guarda algo que ya ocurrió, con su fecha y hora real. «Agregar otro próximo paso» suma una tarea con fecha.',
 scheduleTask:'Dejá un próximo paso pendiente: algo que todavía hay que hacer, con título, tipo y fecha de vencimiento. Si ya existe una tarea para el mismo compromiso, actualizala en vez de duplicarla.',
 logWhatHappened:'Para algo que ya ocurrió y no tiene tarea. Podés ajustar la fecha y hora real, y después elegís cómo sigue: agendar una tarea, esperar hasta una fecha o no agendar nada con un motivo.',
 scheduleMeeting:'Agendá una visita o reunión futura. Queda como planificada en este Calendario hasta que ocurra.',
 logMeeting:'Anotá un encuentro que ya se realizó. Es distinto de agendar uno: esto registra lo que pasó, con su fecha y hora real.',
 businessSummary:'Datos del negocio, sus personas y su situación actual. Desde las otras pestañas ves el historial, las tareas, la comunicación, las gestiones y los documentos.',
 businessManagements:'Cada gestión es un objetivo comercial con su propia etapa; un negocio puede tener varias a la vez. Antes de iniciar otra, revisá si ya hay una abierta sobre el mismo objetivo. No se puede iniciar desde un negocio Archivado o en la Papelera.',
 businessDocuments:'Materiales vinculados a este negocio. Vincular un documento no lo envía a nadie.',
 attention:'Gestiones abiertas sin ninguna tarea pendiente: asignadas hace poco y sin contacto, o en etapas de interés. Agendales una tarea y salen de esta lista; «Contactar» abre el mensaje.',
 newReplies:'Mensajes recibidos (email o WhatsApp) que todavía nadie registró ni descartó. No incluye los registros automáticos. Abrí el negocio para registrar la respuesta, responder o descartar.',
 inboxFilter:'«A revisar» muestra los negocios con mensajes recibidos que nadie registró ni descartó. «Todas» muestra el resto de las conversaciones que podés consultar.',
 voided:'Solo para administradores. En el detalle de la conversación, muestra también los registros automáticos anulados, que normalmente no aparecen.',
 stageSection:'Vertical, perfil y etapa pertenecen a esta gestión; otras gestiones del mismo negocio pueden estar en otra etapa. La etapa no es el Estado del negocio y cambiarla no contacta a nadie.',
 followUpSection:'Fechas de esta gestión: cuándo se creó, el último contacto y la próxima acción. Para dejar un próximo paso con fecha, agendá una tarea.'
};
