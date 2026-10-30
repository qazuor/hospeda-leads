# Auditoría de fricción en recorridos del CRM

**Estado:** hallazgos iniciales implementados localmente; falta validación manual del propietario en navegador.
**Fecha:** 14/10/2026

## Alcance revisado

Se revisaron las reglas del servidor y los accesos principales de negocio y gestión: iniciar gestión desde Contactar, el detalle y la lista de gestiones; enviar o registrar una comunicación; usar tareas como punto de entrada; archivar/restaurar; y completar cierres. Se contrastaron los formularios con sus validaciones de servidor. La revisión se concentró en pasos que dejan avanzar al usuario antes de avisar una condición que ya conoce el sistema.

## Cambios aplicados

1. **Contactar → iniciar gestión con negocio Nuevo.** Antes se abría el formulario completo y el servidor rechazaba Guardar porque primero había que marcar Revisado. Ahora el formulario informa que el negocio está Nuevo y el botón dice **Marcar Revisado e iniciar gestión**. Esa acción confirma que el negocio existe y es válido, y guarda Revisado junto con la gestión en una sola transacción. Si falla el alta de la gestión, tampoco queda aplicado Revisado. El servidor conserva la regla y rechaza las altas directas sin confirmación.
2. **Acompañamiento de ficha antes de ser Cliente.** El tipo de gestión ahora aparece deshabilitado con el requisito visible cuando el negocio todavía no es Cliente. El servidor conserva su validación.
3. **Negocio Archivado.** Los accesos de inicio de gestión se deshabilitan en el detalle y en el recorrido de Contactar, con indicación de que hace falta desarchivar mediante un administrador. El contacto saliente también queda bloqueado en el diálogo; las validaciones del servidor siguen vigentes.
4. **Validación antes de enviar formularios.** Los campos de email usan validación nativa de formato; los motivos requeridos para archivar, eliminar, convertir o quitar la marca de Cliente exigen contenido antes del submit, con largo mínimo según el contrato del servidor.

## Recorridos revisados y criterio

- **Estados del negocio y gestión:** mantener la regla en servidor; anticipar requisitos conocidos en el punto de entrada y permitir completar el paso necesario sin perder el formulario.
- **Contacto saliente:** bloqueos por Papelera, Archivado, No contactar y permiso de responsable se verifican antes de habilitar el siguiente paso. Las comprobaciones finales siguen siendo de servidor.
- **Mensajes y modelos:** variables faltantes, destinatario y confirmación de contenido se controlan antes de abrir el canal; preparar o abrir un canal no se registra como envío confirmado.
- **Respuestas y cierres:** las respuestas requieren contexto; los cierres requieren resultado/motivo según catálogo. No se eliminan esas confirmaciones porque son datos comerciales necesarios.
- **Tareas:** delegar una tarea no cambia el responsable comercial ni concede permiso para iniciar contactos.

## Validación pendiente

`pnpm run typecheck`, `pnpm test` y `pnpm run build` pasaron. No se corrió Playwright ni una prueba de integración contra la réplica local porque esos recorridos crean y modifican registros. La prueba de navegador agregada queda disponible para ejecutarse contra la base sintética descartable. El propietario debe revisar el flujo visual desde Contactar en desktop y móvil antes de darlo por cerrado.

## Próximos candidatos

La revisión cubre recorridos principales, no todos los formularios y todas las combinaciones de permisos. La siguiente pasada debería recorrer desde el navegador todas las acciones de Perfil/Negocios, Pipeline, Mi día/Agenda y Configuración, incluyendo errores de red y cambios concurrentes, con fixtures descartables. No se detectó un nuevo bloqueo funcional que justifique alterar esas reglas durante esta pasada.
