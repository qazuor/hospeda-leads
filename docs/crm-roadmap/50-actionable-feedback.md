# Avisos con acciones

Guardar una persona ofrece Ver contacto, con foco en esa persona. Guardar una gestión o un mensaje ofrece Abrir gestión. Guardar un próximo paso ofrece Ver pendiente: Mi día muestra el registro seleccionado sin depender de la primera página de vencidas/hoy/futuras. Los permisos y el responsable se comprueban en la lectura; una tarea delegada sigue siendo accesible en su alcance.

Las lecturas fallidas de ficha y seguimiento ofrecen Reintentar tanto en pantalla como en el toast. El botón evita solicitudes simultáneas. No se reintentan envíos inciertos desde avisos. El Deshacer ya existente para cambios rápidos se conserva; no se promete revertir comunicaciones ni borrados definitivos.

Los accesos internos de los avisos usan la protección de navegación. Si hay datos sin guardar, el usuario puede seguir editando o descartarlos explícitamente antes de abrir el destino. Los destinos del mismo negocio reinician la vista para mostrar la sección y el registro solicitados.

Validación: navegador con guardado real de persona/tarea, apertura y foco de destinos, y protección del formulario; tipos, unitarias, build y CI completa antes de merge.
