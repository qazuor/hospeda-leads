# Revisión de reglas comerciales

## Comportamiento comprobado

- Las etapas se cambian explícitamente según el catálogo del equipo. Registrar una respuesta no cambia la etapa.
- Ganada expresa un cierre comercial explícito; el acuerdo y la entrega se registran por separado. Ni Ganada, Cliente ni Entrega confirmada acreditan pago.
- Una respuesta espontánea se registra como actividad y puede planificar un próximo paso explícito. No completa ni cancela otras tareas ordinarias. Las secuencias asistidas conservan su regla existente de detenerse ante una respuesta comprobada.
- Una tarea delegada permite a su asignado editarla y registrar su resultado, sin cambiar el responsable comercial. El permiso de preparar mensajes sigue perteneciendo al responsable de la gestión o admin.

## Ajuste de interfaz

Contactar y el selector de modelos reflejan ahora el mismo permiso que comprueba el servidor. Un usuario delegado ve por qué no puede preparar mensajes; no se ofrece una acción que termine en 403. Las restricciones, la llamada y el registro permitido de la tarea siguen sus controles actuales. No se amplían permisos productivos ni se migran etapas históricas. La fecha del acuerdo se rotula como fecha acordada, sin presentarla como entrega confirmada. En ventas ganadas, Registrar entrega abre una actividad con propósito Entrega; el usuario registra qué ocurrió y cómo continuar, conservando etapa y pagos.

## Decisiones funcionales todavía necesarias

1. Qué evidencia obliga a considerar aceptada/cerrada una propuesta y si algún campo del acuerdo debe ser obligatorio.
2. Si una respuesta espontánea debe proponer completar un pendiente seleccionado, además de registrarse como actividad.
3. Si un delegado debe poder preparar/enviar mensajes únicamente para su tarea, y bajo qué restricciones y auditoría.
4. Si se necesita un registro estructurado de pagos dentro del CRM, su fuente y el responsable de confirmarlo.

La revisión y la corrección de permisos no resuelven estas definiciones ni autorizan inventar automatismos. Se pueden continuar miniaturas, feedback, loading y UI mientras se acuerdan.
