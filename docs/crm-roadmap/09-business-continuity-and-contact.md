# Fase 4 — Ficha y contacto vinculado a una gestión

Base remota verificada: `main` en `ac3e5fe4eb3234034dcb6bd3745402d700fcd8bf`; feature en `b4bcd7210071e05d463b808547b42716a7e880fd`. Se continúa el PR #42. No se ejecuta limpieza, auditoría de producción, comunicación real, merge ni despliegue.

## Cambios

La ficha muestra nombre, responsable y Contactar en la cabecera. Próximo paso y última conversación/acción permanecen visibles al cambiar de sección. Las gestiones son la sección inicial; siguen Datos del negocio y personas opcionales. Los datos de relevamiento quedan en Datos del negocio. No hay dos listados de gestiones en la misma ficha. Las gestiones se abren en su página dedicada.

Cuando no hay pendiente se muestra Sin próximo paso programado y se conservan las acciones existentes para programar. Cuando faltan canales se puede editar teléfono/email directamente o guardar una persona opcional. No se cambian propósitos, delegaciones ni efectos de resultados sobre tareas.

Contactar desde la cabecera o Contactar ahora de esta ficha consulta las etapas configuradas. Con una gestión abierta la utiliza; con varias exige elegir. Las gestiones eliminadas y cerradas quedan fuera de la elección. Las etapas existentes y su clasificación se conservan; una gestión sin etapa mantiene el tratamiento abierto existente. Una falla al consultar etapas impide continuar sin verificarlas.

Si no hay gestión abierta, se ofrece preparar y guardar una mediante el formulario explícito. Cancelar Contactar o cancelar esa preparación no crea una gestión. Guardar crea la gestión por decisión expresa del usuario, sin afirmar contacto o envío. El nombre inicial es Presentación de Hospeda; propuesta/persona/cierre son opcionales; la vertical conocida se reutiliza y no se elige una etapa arbitrariamente. Después se continúa en el mismo recorrido.

Se elige canal, se verifica destinatario, se escoge modelo o mensaje libre y se revisa el contenido con el editor existente. Se recuerda el último canal y destinatario de una interacción de esa gestión, visible y editable. Una persona eliminada no se reutiliza. Cuando no hay interacción previa, se ofrece el canal del negocio sin exigir persona; los destinatarios adicionales permanecen disponibles. Si falta canal se ofrece agregarlo conservando el negocio.

El destinatario general se resuelve en servidor con teléfono/email actuales del negocio y sin inferir el nombre de una persona desde datos históricos de la gestión. Una persona elegida explícitamente conserva sus propios datos y nunca recurre silenciosamente al canal del negocio. Las restricciones y permisos existentes siguen validados antes de preparar/editar/ejecutar.

Los modelos se filtran por canal y por los datos comerciales conocidos. Un dato faltante de vertical/perfil no excluye modelos; una incompatibilidad conocida sigue rechazada en servidor. Se retira la exclusión de todos los WhatsApp para Referente que no tenía correspondencia en servidor. Los textos finales de modelos no se alteran.

Preparar usa un bloqueo desde el primer clic y conserva la clave de solicitud hasta recibir confirmación, para reintentar un resultado incierto. El servidor existente conserva su idempotencia/reutilización de borradores. El editor también bloquea acciones repetidas, muestra Guardando mensaje / Enviando email / Abriendo WhatsApp y bloquea cerrar/cambiar destinatario mientras procesa. Se conservan errores junto al formulario y lo escrito. Abrir WhatsApp no acredita envío; aceptar un email no acredita entrega.

## Validación

- TypeScript y pruebas unitarias existentes.
- Integración de comunicación en base descartable: canal general sin persona incluso con nombre histórico, modelos con datos comerciales faltantes y rechazo cuando hay incompatibilidad conocida. Las pruebas existentes simulan Brevo y verifican concurrencia, reintentos inciertos, restricciones, estados honestos y permisos.
- Playwright desktop/mobile contra API y PostgreSQL de CI: continuidad visible entre secciones, cancelar Contactar/preparación sin alta, preparación explícita, única gestión sin persona, borrador para email del negocio, elección obligatoria entre varias gestiones y acción cuando falta canal. No se envían esos borradores.
- Se conservan las regresiones de permisos, lista, importación, seguimiento y gestión independiente; evidencia en el PR.

## Decisiones pendientes y límites

**No se implementa creación automática al continuar el contacto**: depende del criterio exacto de etapa inicial. Hasta acordarlo, la creación dentro de Contactar es explícita y usa el formulario de preparación ya aprobado. No se introduce una etapa ni una transición nueva.

El registro guiado de resultados y la actualización de pendientes por respuestas espontáneas siguen pendientes de reglas. Se conserva la posibilidad existente de registrar una conversación desde Próximo paso, sin tarea previa, sin agregar automatismos de etapa ni cancelaciones. Los recorridos heredados de tareas generales que abren aplicaciones externas todavía requieren unificación; esta fase aplica el nuevo recorrido a la ficha del negocio. No se afirma que toda la app haya sido unificada.

Materiales dentro de gestiones, separación de historia comercial/técnica, toasts con acciones y loading del resto de módulos continúan por fases. La limpieza de oportunidades históricas sigue pendiente de auditoría y revisión del manifiesto/procedimiento; no forma parte de estas acciones.
