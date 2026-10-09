# Contactar desde tareas

Email y WhatsApp desde Mi día, Agenda y Próximo paso usan el selector de destinatario y el editor compartido: mensaje libre o modelo, revisión, ejecución y confirmación factual. No quedan enlaces mailto ni wa.me en el diálogo de tareas. Llamar conserva tel y permite registrar el resultado después.

Las tareas vinculadas mantienen su gestión, incluso cerrada. No se redirigen a otra gestión abierta. Las tareas generales pasan por Contactar del negocio: elegir una gestión abierta o guardarla explícitamente. Cancelar no crea gestiones; la tarea conserva leadId nulo y su registro sigue siendo general. Preparar un mensaje nunca completa la tarea.

Se conservan los permisos de comunicación y las restricciones existentes; una tarea delegada no otorga permisos nuevos sobre una gestión. La revisión de esos permisos corresponde a reglas comerciales.

El diálogo usa Mantine, estados de carga y reintento. También se completa la búsqueda sin acentos del selector de modelos, preservando ñ.

Validación: typecheck, pruebas unitarias y build; recorridos de navegador existentes ampliados para tarea general sin gestión, cancelación sin creación, mensaje en gestión cerrada, canal general del negocio y continuidad del destinatario seleccionado. CI completa antes del merge.
