# Continuidad de pendientes

Reprogramar muestra el vencimiento original y la nueva fecha/hora en Argentina. Una fecha pasada se señala como vencida; no se transforma silenciosamente en una fecha futura. Cancelar pide un motivo específico y rechaza espacios vacíos, conservándolo ante errores.

Antes de crear o reprogramar se consultan posibles duplicados pendientes del mismo negocio, gestión (o seguimiento general), título sin acentos, tipo y día. La consulta no depende de la página de Mi día: cuenta todos los coincidentes y muestra hasta cinco. Respeta las tareas del usuario; solo admin consulta el equipo. Distintas horas del mismo día pueden ser intencionales: el aviso no bloquea ni reemplaza nada.

Después de guardar se invalida el seguimiento y el aviso identifica el próximo pendiente visible del mismo contexto. No se abre un canal automáticamente ni se cierra otra tarea. Los registros de tareas admiten foco para los accesos contextuales posteriores.

Validación: integración de alcance, permisos, acentos, exclusión al editar y canceladas; navegador de duplicados, reprogramación y cancelación con motivo; typecheck, unitarias, build y CI antes de merge.
