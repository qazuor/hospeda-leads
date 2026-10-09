# Historial comercial

En la ficha, Historial muestra conversaciones y resultados por fecha real,
con estado honesto de mensajes, propósito de continuidad y compromisos pendientes
con fecha y responsable. Los cambios de datos permanecen en una auditoría colapsada.

Las actividades vinculadas a mensajes se muestran una sola vez. Se excluyen
borradores/cancelados y registros de gestiones eliminadas. La lectura conserva el
permiso del negocio, incluidos negocios archivados exclusivos de administradores,
y la familia de negocios fusionados. Se consultan páginas de 50 eventos; los primeros
10 compromisos se acompañan del total y un acceso a la ficha/seguimiento.

No infiere entregas, pagos, respuestas del destinatario ni envíos por abrir WhatsApp.
Las mutaciones existentes invalidan la lectura del historial. Incluye carga, error y
reintento. Validación: PostgreSQL con paginación/deduplicación/permisos, navegador en
390 y 1280 px, typecheck, unitarias, build y CI completa.
