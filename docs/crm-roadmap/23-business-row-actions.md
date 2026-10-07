# Acciones en la tabla de negocios

Botones uniformes de iconos Lucide, 32×32 px: Abrir, Contactar y Archivar negocio (admin). Todos tienen nombre accesible y tooltip propio. Contactar se bloquea en negocios ajenos y reutiliza el recorrido existente de elección de gestión/canal/modelo. Abrir sigue disponible para lectura compartida.

La información se carga al pedir una acción, con diálogo y texto específicos desde el primer clic, reintento y cancelación. Se vuelve a comprobar el responsable con el detalle recuperado; el servidor conserva sus controles de acceso.

Archivar reutiliza confirmación/motivo existentes, conserva datos, personas, gestiones e historial y ofrece Ver archivados. No se llama Eliminar a un archivo reversible ni se incorpora borrado permanente.

La columna sigue siendo configurable y fijada por defecto. Los botones conservan igual tamaño incluso al mostrar loading. No se amplían automáticamente anchos personalizados; el usuario puede ajustarlos por drag.

Validación local y CI documentadas en el PR. Pruebas de navegador previstas: geometría de botones, contacto sin persona/gestión, cancelación sin crear gestión, lectura ajena con contacto bloqueado, archivo con motivo y reintentos. No enviar comunicaciones reales.
