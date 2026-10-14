# Especificación de producto: Comunicación en Hospeda CRM

**Versión:** 1.4 — Decisión de Es cliente para Email/Brevo

**Fecha:** 13/10/2026

**Estado:** aprobado para implementación

**Código de producto:** comparado con la versión 1.3 en etapa 2

**Implementación:** en curso en `feat/communication-crm`

## 1. Propósito

Definir cómo el CRM prepara y registra comunicaciones relacionadas con negocios y gestiones comerciales. Esta especificación fija cuándo se puede iniciar un contacto, quién puede hacerlo, cómo se registra lo ocurrido, qué bloqueos aplican y qué efectos tienen las respuestas.

El CRM no será una bandeja de entrada sincronizada. Email se envía desde el CRM mediante Brevo solo después de que el usuario revise y confirme el envío. WhatsApp abre el cliente externo y requiere registrar luego el resultado declarado por el usuario. Ningún canal envía sin una acción explícita de la persona usuaria.

## 2. Alcance

Incluye:

- Contactos salientes por Email, WhatsApp, llamadas, redes sociales y otros canales aclarados por el usuario.
- Registro manual de respuestas recibidas, aunque hayan llegado por un canal externo.
- Contactos generales del negocio y contactos asociados a una gestión concreta.
- Selección de destinatario y destino, permisos, bloqueos y restricciones técnicas.
- Modelos compartidos de mensajes, variables, versiones y administración.
- Intentos, resultados, respuestas, recordatorios, correcciones e historial.
- Efectos acordados sobre No contactar y Es cliente.

Quedan fuera del alcance inicial una bandeja sincronizada, la detección automática de respuestas y el envío automático desde el CRM. La disponibilidad de recursos, adjuntos o materiales externos no se altera en esta definición; su integración se evaluará al comparar la spec con el producto actual.

También quedan fuera las secuencias asistidas que generan cadenas de tareas y borradores futuros. Se retiran para que el usuario tenga un solo flujo operativo de contacto y seguimiento. Los datos existentes que pertenezcan exclusivamente a secuencias se consideran de prueba y se eliminarán; antes de limpiar una base se hará un preflight para identificar los registros y sus relaciones, sin borrar tareas o comunicaciones independientes.

## 2.1 Recorrido habitual, con preguntas solo cuando hacen falta

El usuario debería completar un contacto común en un solo flujo corto, siempre que el negocio y el destinatario no tengan bloqueos. El CRM reutiliza el contexto desde el que se inició la acción y solicita datos adicionales solo cuando hay más de una opción válida o una regla lo exige:

1. **Contexto:** desde una gestión, esa gestión queda seleccionada y visible. Desde el negocio, si existen gestiones abiertas, el usuario elige General o una de ellas; si no hay gestiones abiertas y el estado permite contacto General, se usa General. En Nuevo, el único flujo disponible es Verificación.
2. **Propósito:** solo se solicita para General. En Nuevo se asigna Verificación automáticamente.
3. **Canal y destinatario:** el usuario elige el canal. Se preselecciona el único destino válido; se pregunta solo cuando hay varios. El canal general del negocio se ofrece si ninguna persona tiene un destino válido para Email/WhatsApp.
4. **Mensaje o registro:** Email/WhatsApp permite texto libre o modelo. Llamadas no muestra selector de modelos. Redes/Otros permite texto libre o modelo y copiar. Los campos de aclaración, resumen y destino aparecen únicamente cuando aplican.
5. **Resultado:** Email se envía por Brevo después de revisión explícita y muestra el estado del proveedor; WhatsApp queda No confirmado al abrir el cliente externo y se resuelve luego. Llamadas se registran en el mismo flujo. Redes/Otros deja un intento pendiente al copiar y permite completarlo luego.

Al registrar una respuesta desde una comunicación, tarea o timeline, el contexto disponible se preselecciona. En un formulario iniciado sin contexto se pide General o gestión; una respuesta recibida asociada a una gestión cerrada sigue siendo válida. El vínculo al contacto saliente se ofrece cuando existe uno relacionado, sin hacerlo obligatorio.

El CRM no vuelve a preguntar algo que ya se deduce de la pantalla de origen. Cada paso muestra solo los controles necesarios para esa elección. Esta presentación reduce preguntas repetidas, pero no cambia permisos, estados ni requisitos de registro.

## 3. Entidades y términos

- **Negocio:** cuenta comercial del CRM. Tiene estado propio, responsable, marca Es cliente y bloqueo No contactar.
- **Persona de contacto:** persona relacionada con un negocio que puede tener uno o más destinos de comunicación.
- **Gestión:** proceso comercial independiente del negocio. Un negocio puede tener más de una gestión abierta.
- **Contexto General:** comunicación asociada directamente al negocio, sin gestión. Siempre requiere un propósito general, salvo la verificación especial de negocios en estado Nuevo.
- **Contacto saliente:** acción o intento de contactar a un destinatario.
- **Respuesta recibida:** comunicación entrante informada manualmente por un usuario; no implica detección o validación automática.
- **Modelo compartido:** texto administrado por un administrador, disponible para los usuarios autorizados a iniciar contactos.
- **Intento:** registro persistente de una interacción aún no confirmada, pendiente o no realizada. Su existencia no prueba que un mensaje se haya enviado, copiado o recibido.

## 4. Reglas de elegibilidad por estado

### 4.1 Negocio en Nuevo

Solo se permite un contacto de verificación para confirmar que el negocio existe y validar sus datos y canales. La verificación:

- Tiene un propósito propio, separado de prospección y de los propósitos generales.
- No inicia una gestión ni cambia por sí sola el estado del negocio.
- Respeta bloqueos de Papelera, Archivado, No contactar y restricciones del destinatario/canal.

### 4.2 Negocio Revisado, En gestión, Sin seguimiento programado o Recontactar

El usuario autorizado puede iniciar un contacto General o elegir explícitamente una gestión abierta. Esto sigue permitido aunque existan otras gestiones abiertas. Una gestión cerrada no puede elegirse para iniciar un contacto saliente.

La fecha de Recontactar se muestra como contexto, pero no bloquea el contacto antes de esa fecha.

### 4.3 Negocio Archivado o en Papelera

Archivado bloquea contactos salientes y requiere desarchivo administrativo. Papelera bloquea todas las acciones de comunicación, incluido registrar respuestas, hasta que un administrador restaure el negocio.

Un negocio Archivado sí admite registrar respuestas entrantes. Eso no lo desarchiva ni reabre sus gestiones.

### 4.4 Etapas de gestión

Cualquier etapa abierta permite iniciar contactos, sujeto a permisos y bloqueos. Una gestión cerrada solo puede seleccionarse como contexto para registrar una respuesta entrante; hacerlo no reabre ni cambia estados.

## 5. Contexto, propósito y destinatario

### 5.1 Contexto

El contexto debe quedar claro, pero no requiere una elección redundante cuando ya se conoce por el punto de entrada:

- Desde una gestión concreta, esa gestión se preselecciona y se muestra. El usuario puede cambiar a General si el estado del negocio permite contactos generales.
- Desde la ficha del negocio con una o más gestiones abiertas, el usuario elige explícitamente General o una gestión abierta. Si no hay gestiones abiertas, se usa General directamente.
- **General:** asociado al negocio y visible en su historial; requiere propósito.
- **Gestión concreta:** asociada a una gestión abierta; la gestión aporta el contexto y no requiere propósito adicional.

Toda respuesta recibida requiere contexto: General o cualquier gestión abierta o cerrada. Puede vincularse opcionalmente al contacto saliente que la originó. La respuesta asociada a una gestión cerrada no la reabre.

### 5.2 Propósitos generales

Catálogo fijo y filtrable:

1. Presentación/primer contacto.
2. Retomar conversación.
3. Relación y novedades.
4. Acompañamiento/atención al cliente.
5. Coordinación operativa.
6. Otro, con aclaración obligatoria.

En estado Nuevo se utiliza el propósito de verificación definido en la sección 4.1.

### 5.3 Selección del destinatario

- Cada interacción saliente tiene un destinatario: una persona o el negocio.
- Si hay varias personas con el canal elegido, el usuario selecciona una explícitamente. Para contactar a otra persona se registra otra interacción.
- Si ninguna persona tiene Email o WhatsApp para ese canal, puede usarse el dato general del negocio; el negocio queda identificado como destinatario.
- Si la persona elegida tiene más de un email o teléfono del canal, se elige un destino específico. Si tiene uno solo, se preselecciona.
- Se guarda una instantánea de la persona o negocio y del dato exacto usado. También se conserva el perfil/identificador en redes sociales y la aclaración de destino para Otros.
- Un error en el canal general del negocio restringe solo negocio+canal general; no afecta los destinos personales.

## 6. Canales y ejecución

| Canal | Acción del CRM | Registro requerido |
|---|---|---|
| Email | Prepara texto editable, muestra vista previa y, tras confirmación explícita, lo envía mediante Brevo. | Texto exacto, contexto, destinatario/destino y estado del proveedor. Aceptación no equivale a entrega. |
| WhatsApp | Prepara texto editable y abre el cliente externo. El usuario confirma si lo envió. | Texto exacto, contexto, destinatario/destino y estado del intento. |
| Llamada | No ejecuta la llamada; permite registrarla manualmente. | Resultado y resumen obligatorio. |
| Red social | Permite copiar texto; el usuario abre y usa el canal externo. | Intento, destino, resultado y resumen; texto final si se usó un modelo. |
| Otro | Permite copiar texto; el usuario elige y usa el canal externo. Debe aclarar el canal y destino. | Intento, aclaraciones, resultado y resumen; texto final si se usó un modelo. |

Preparar o revisar un mensaje no lo envía. La confirmación de envío autoriza a Brevo a procesar Email; aceptación, entrega, rebote y respuesta son hechos distintos. Abrir WhatsApp no demuestra envío, entrega, lectura o respuesta.

### 6.1 Email mediante Brevo

El usuario puede redactar desde cero o usar un modelo, editarlo y revisar destinatario y contenido final. Una acción explícita **Enviar email con Brevo** autoriza el envío. Se conserva el texto exacto enviado, destinatario, contexto, actor y fechas.

El estado distingue evidencia técnica:

- **Envío en curso:** el CRM reclamó el envío antes de llamar al proveedor.
- **Aceptado por Brevo:** el proveedor aceptó procesarlo; todavía no prueba entrega.
- **Entrega confirmada:** llegó un evento autenticado y correlacionado de entrega.
- **Rebote/fallo:** Brevo informó rechazo o evento de error. Se conserva la causa disponible.
- **Resultado incierto:** timeout o error posterior a una posible aceptación. No se reenvía automáticamente; debe reconciliarse con el proveedor antes de intentar de nuevo.

El webhook de Brevo registra eventos correlacionados y actualiza el estado técnico. Las transiciones y sus actores/fechas se conservan en historial y journal. Los eventos de respuesta/rechazo registrados manualmente se mantienen diferenciados de los eventos del proveedor. Una falla permanente comprobable, como rebote definitivo o email inválido, puede activar la restricción técnica aprobada; errores temporales no la activan.

La política de reintento nunca repite un envío incierto automáticamente. Un nuevo envío es una acción explícita y conserva el intento anterior.

### 6.2 WhatsApp mediante cliente externo

Al confirmar la acción, el CRM abre WhatsApp con el texto preparado y crea un intento **No confirmado**, incluso si el navegador no logra abrir el cliente externo. La interfaz informa el fallo y permite reintentar; cada reintento crea otro intento. Abrir el enlace no prueba envío.

Un usuario autorizado puede resolver el intento posteriormente como **Enviado** o **No enviado**, sin reenviarlo. Se conserva la fecha/hora de inicio y quién/cuándo confirmó. El intento permanece No confirmado sin vencimiento ni tareas automáticas hasta que un usuario autorizado lo resuelva. El texto guardado es inmutable; corregirlo requiere un intento nuevo. Corregir un estado final exige nota y conserva el valor anterior y toda la auditoría.

### 6.3 Llamadas, redes sociales y Otros

Para llamadas el usuario registra el resultado declarado: **Realizado/Enviado** o **Intento sin respuesta/contacto**, y un resumen obligatorio. No se infiere una respuesta entrante.

Para redes sociales y Otros, copiar crea un intento pendiente, incluso si falla la copia al portapapeles. La interfaz avisa del fallo y permite seleccionar/copiar manualmente el texto. El intento pendiente no afirma que el texto se haya copiado ni enviado. Volver a copiar el mismo texto reutiliza el mismo intento pendiente.

Quien inició el intento o un administrador lo completa con uno de estos resultados y un resumen obligatorio:

- Realizado/Enviado.
- Intento sin respuesta/contacto.
- No realizado.

Se guardan inicio y finalización, y quién realizó cada acción. No hay vencimiento ni recordatorio automático. Si el texto debe corregirse después de copiarlo, se cierra el intento anterior como No realizado y se crea otro; no se sobrescribe. Si se corrige por error un resultado o resumen ya cerrado, quien inició el intento o un administrador puede corregirlo con nota obligatoria; se preserva el valor anterior y la autoría/fecha de la corrección.

Cuando se usa un modelo, se guarda el texto final utilizado y el resumen por separado. Si se redacta texto libre sin modelo, solo se exige guardar el resumen. En redes sociales y Otros, el CRM ofrece copiar el texto; el usuario abre el canal externo por su cuenta.

## 7. Respuestas recibidas

Las respuestas se registran manualmente y contienen:

- Contexto General o gestión abierta/cerrada, obligatorio.
- Categoría fija, obligatoria.
- Resumen, obligatorio.
- Texto exacto recibido, opcional.
- Persona que registró y fecha/hora.
- Vínculo opcional al contacto saliente relacionado.

Catálogo común a todos los canales y contextos:

1. Interés/acepta avanzar.
2. Pide información.
3. Quiere retomar más adelante.
4. No le interesa/rechaza.
5. No puede ahora.
6. Consulta operativa.
7. Pidió no contactar.
8. Otro, con aclaración obligatoria.

Una respuesta no cambia etapas ni estado del negocio por sí sola, salvo los efectos explícitos de **Pidió no contactar**. Registrar una respuesta en una gestión cerrada no la reabre.

Las respuestas se pueden registrar en negocios Archivados, con No contactar o con una restricción técnica. Son registros pasivos: no habilitan salidas ni levantan bloqueos. Papelera es la excepción: no permite registrar hasta restauración administrativa.

### 7.1 Recordatorio por “Quiere retomar más adelante”

Al elegir esta categoría, el CRM pregunta si se desea crear un recordatorio. Si se crea, la fecha es obligatoria; el usuario puede omitirlo. Se asigna por defecto al responsable del contexto (negocio para General, gestión cuando se eligió una). El responsable del contexto o un administrador puede reasignarlo. El recordatorio no cambia estados.

### 7.2 Corrección de una respuesta

Quien registró la respuesta o un administrador puede corregir categoría, resumen o texto. Se exige una nota de motivo; se conserva el valor anterior, quién/cuándo corrigió y la nota, visible a todo lector del negocio.

Si la corrección cambia a **Pidió no contactar**, la confirmación del bloqueo y la selección opcional de gestiones se resuelven en el mismo diálogo de la sección 8; no se solicita una segunda confirmación. Si se corrige desde esa categoría a otra, se muestra una confirmación breve indicando que se habilitarán los contactos. Cancelar deja la respuesta y el bloqueo sin cambios.

## 8. No contactar y cierres de gestiones

**Pidió no contactar** activa el bloqueo global del negocio, sin importar si la solicitud se refería a una persona o canal. Bloquea todos los propósitos y canales salientes; tampoco un administrador puede omitirlo para enviar. Cualquier usuario puede activarlo al registrar o corregir una respuesta a esa categoría. Solo administradores pueden levantarlo manualmente, con motivo e historial; corregir la respuesta a otra categoría lo levanta automáticamente.

Al registrar o corregir una respuesta a Pidió no contactar se presenta un único diálogo que confirma la clasificación, explica que el bloqueo afectará todos los contactos del negocio y permite decidir qué gestiones cerrar. No se encadenan una confirmación y luego un segundo diálogo de cierres. El diálogo:

- Pide confirmación para guardar la respuesta y activar el bloqueo global.
- Lista individualmente las gestiones abiertas.
- Permite seleccionar las gestiones que se desean cerrar; ninguna aparece seleccionada inicialmente.
- Permite cerrar solo las gestiones cuyo responsable sea el usuario actual o para las que sea administrador.
- Identifica claramente las gestiones que el usuario no puede cerrar. Esas quedan abiertas.
- Permite continuar sin cerrar ninguna gestión.

Las gestiones seleccionadas se cierran con el resultado correspondiente a su tipo y el motivo **Pidió no ser contactado**. Se aplican las reglas generales de estados: mientras quede una gestión abierta, el negocio sigue En gestión; al cerrar la última con ese motivo, pasa a Archivado. Las gestiones que queden abiertas no permiten contactos mientras el bloqueo global siga activo.

La corrección de Pidió no contactar a otra categoría levanta el bloqueo, pero no desarchiva el negocio ni reabre gestiones. Solo un administrador desarchiva explícitamente. Si quedan gestiones abiertas, permiten contactos de inmediato tras levantar el bloqueo, sujetos a otras restricciones.

El journal muestra la corrección y el alta/baja automática del bloqueo como eventos distintos vinculados, marcados como automáticos y atribuidos al usuario que originó la corrección.

## 9. Restricciones técnicas por destinatario y canal

Estas restricciones son independientes del bloqueo global y nunca lo reducen ni lo levantan.

- Se aplican a una persona+canal o a negocio+canal general.
- Se crean automáticamente solo ante fallas permanentes comprobables, como rebote definitivo o número/cuenta inválidos. Fallas temporales no bloquean.
- Un administrador puede aplicarlas manualmente al detectar datos inválidos; debe explicar el motivo.
- Las restricciones automáticas se levantan cuando el canal confirma que el destino volvió a funcionar. Si el canal no provee resultado verificable, un administrador confirma la recuperación.
- Las restricciones manuales solo las levanta un administrador, con motivo.
- Una respuesta entrante por un destino restringido sigue pudiendo registrarse; no levanta la restricción ni permite salidas.
- Cada alta y baja aparece en el historial del negocio y en el journal global con destinatario, canal, fecha, origen (automático/admin) y causa o evidencia.

## 10. Permisos

| Acción | Permiso requerido |
|---|---|
| Iniciar contacto General | Responsable del negocio o administrador. |
| Iniciar contacto de una gestión | Responsable de esa gestión o administrador. |
| Leer el historial de comunicación | Cualquier usuario con permiso de lectura del negocio. |
| Registrar una respuesta recibida | Cualquier usuario; no requiere permiso comercial. Cualquier usuario también puede activar No contactar al registrar esa respuesta. |
| Corregir una respuesta | Quien la registró o administrador. |
| Confirmar/rectificar intento Email/WhatsApp | Usuario autorizado para iniciar ese contacto o administrador. |
| Completar/corregir intento manual pendiente/cerrado | Quien inició el intento o administrador. |
| Cerrar gestión desde diálogo No contactar | Responsable de esa gestión o administrador; solo se cierran las seleccionadas y autorizadas. |
| Administrar modelos compartidos/versiones | Administrador. |
| Levantar bloqueos manualmente | Administrador, con motivo e historial. |
| Reasignar recordatorio de una respuesta | Responsable del contexto o administrador. |

Leer el negocio o tener una tarea delegada no concede permiso para iniciar contactos. El registro de una respuesta entrante no concede permisos de envío.

## 11. Modelos compartidos

### 11.1 Canales y selección

Se permiten modelos para Email, WhatsApp, redes sociales y Otros; no para llamadas. Los canales son comunes a verticales y tipos de gestión. Los modelos pueden adaptarse al tipo de gestión y vertical.

Se muestran todos los modelos aplicables, ordenando los más específicos primero y manteniendo disponibles los genéricos. Si falta vertical o tipo, se muestran los genéricos y también los específicos, claramente etiquetados.

### 11.2 Administración y versiones

Solo administradores crean, editan, publican, desactivan, reactivan, duplican y restauran modelos compartidos. Los cambios y modelos nuevos se aplican inmediatamente al guardar. Desactivar quita el modelo de usos nuevos, conservando historial; reactivar conserva el historial y ofrece la última versión guardada. Un modelo desactivado se puede editar. Duplicar produce una copia nueva e independiente.

Se conserva cada versión anterior. Un administrador puede consultarla o restaurarla; restaurar crea una nueva versión y no borra la secuencia histórica. Un borrador que ya esté en edición conserva su texto; los cambios del modelo solo afectan usos nuevos.

Cualquier usuario autorizado a iniciar ese contacto puede usar el modelo y editar su copia para esa interacción. No puede guardar modelos personales ni alterar el compartido.

### 11.3 Texto libre y variables

Email y WhatsApp permiten redactar desde cero o partir de un modelo editable. Redes sociales y Otros también permiten texto libre o modelo editable, y ofrecen copiar el texto para abrir el canal externo por cuenta del usuario.

Variables iniciales:

- Nombre de la persona de contacto.
- Nombre del negocio.
- Vertical/tipo.
- Responsable asignado.
- Enlace a la ficha pública de Hospeda, si existe.

Solo se utilizan datos confiables existentes en el CRM. Si falta una variable, se marca y el usuario debe completarla o quitarla antes de abrir/copiar el mensaje. No se inventan valores ni se dejan variables sin resolver.

## 12. Historial, visibilidad y auditoría

Todo usuario con permiso de lectura del negocio puede ver fecha, contexto, canal, destinatario y destino exacto, resumen, texto guardado y correcciones. El mismo permiso rige para intentos, eventos y texto exacto; leer el historial no permite iniciar contactos.

Cada comunicación se refleja en:

- Historial del negocio.
- Timeline de la gestión cuando se vincula a una.
- Journal global, sujeto al mismo permiso de lectura del negocio.

Se identifican claramente los estados No confirmado, pendiente y No realizado, para que no se confundan con envíos exitosos. Se registra quién inició, completó, confirmó o corrigió y cuándo. Inicio y finalización son eventos distintos vinculados al mismo intento. Los cambios automáticos se muestran como automáticos y se vinculan al usuario que produjo el evento desencadenante.

Cada alta/baja de bloqueo técnico, activación/levantamiento de No contactar y efecto sobre Es cliente también se registra en historial y journal. Las notas obligatorias de corrección son visibles para los lectores del negocio.

## 13. Efecto sobre Es cliente

Acompañamiento/atención al cliente está disponible aunque el negocio no esté marcado Es cliente. Antes de iniciar, se muestra exactamente: **“Si registrás el contacto como realizado, se marcará Es cliente. ¿Continuar?”** Confirmar permite seguir, pero no marca al negocio todavía.

- Un contacto manual de acompañamiento marcado Realizado/Enviado marca automáticamente Es cliente.
- Un intento sin respuesta/contacto o No realizado no lo marca.
- Abrir WhatsApp y dejarlo No confirmado no lo marca.
- Al confirmar Enviado en WhatsApp, cualquier usuario autorizado marca Es cliente. Una rectificación autorizada a Enviado también lo marca.
- Email por Brevo marca Es cliente cuando Brevo acepta el envío (`accepted`); la aceptación no equivale a entrega. La entrega posterior se registra aparte. Un rebote posterior no quita la marca automáticamente; solo un administrador puede desactivarla.
- Corregir luego Enviado a No enviado no desactiva Es cliente.
- Solo un administrador puede desactivar manualmente Es cliente.
- Cada cambio queda en el historial del negocio y el journal global.

## 14. Requisitos de interfaz y manejo de fallos

- Seguir el recorrido de la sección 2.1: contexto conocido preseleccionado, destino único preseleccionado y preguntas condicionales solo donde sean necesarias.
- Mantener una acción principal por paso y evitar pedir dos veces el mismo dato. Mostrar el contexto activo durante todo el flujo y permitir corregirlo antes de guardar.
- Separar preparación y registro de envío: el usuario debe poder reconocer claramente si algo está en borrador, pendiente, No confirmado, Enviado o No enviado.
- Los modelos y acciones administrativas se mantienen fuera del camino habitual de contacto; el usuario que solo contacta no necesita conocer el versionado.
- La interfaz muestra loading en acciones que guardan o abren un canal y evita doble submit.
- Si falla una operación, conserva el texto ingresado y ofrece reintento pertinente.
- Un reintento nunca repite automáticamente un envío; crea un nuevo intento cuando así se define para ese canal.
- Cancelar confirmaciones de bloqueo o desbloqueo deja respuesta y bloqueos en su estado anterior.
- Los controles distinguen claramente acciones disponibles, bloqueadas y pendientes, en escritorio y móvil.
- Los intentos pendientes o inciertos permanecen visibles y no se resuelven por vencimiento automático.

## 15. Criterios de aceptación del producto

La solución final deberá permitir verificar, como mínimo, estos recorridos:

1. Negocio Nuevo: usuario autorizado registra una verificación con propósito propio; no se crea gestión ni cambia el estado.
2. Negocio Revisado con varias gestiones abiertas: se puede elegir General o una gestión abierta; las cerradas no aparecen como destino saliente.
3. Email: usuario revisa y confirma el envío por Brevo; el historial distingue aceptación, entrega, rebote/fallo y resultado incierto. WhatsApp: se guarda intento No confirmado y texto exacto aun si falla abrir el cliente; reintento crea otro intento; usuario autorizado confirma Enviado/No enviado con auditoría.
4. Llamada: se registra Realizado/Enviado o Intento sin respuesta/contacto con resumen obligatorio.
5. Redes/Otros: copiar crea o reutiliza el pendiente apropiado; falla de portapapeles se comunica; el intento se completa o cierra No realizado sin sobrescribir el texto.
6. Respuesta entrante: exige contexto, categoría y resumen, admite texto exacto opcional y permite vínculo opcional al contacto de origen.
7. Quiere retomar más adelante: ofrece recordatorio opcional con fecha obligatoria y responsable contextual por defecto.
8. Pidió no contactar: activa bloqueo global y muestra diálogo con gestiones abiertas, ninguna seleccionada, permisos de cierre claros y resultados/motivo correctos.
9. Correcciones de respuesta: exigen nota, preservan historial y advierten/solicitan confirmación antes de activar o levantar No contactar.
10. Restricción técnica: afecta solo persona/canal o negocio/canal general; falla temporal no bloquea, respuesta entrante no la levanta.
11. Acompañamiento de negocio no cliente: muestra confirmación y solo marca Es cliente cuando el contacto queda realizado/enviado según las reglas de canal.
12. Modelo compartido: respeta canal, vertical/tipo, especificidad, versiones, variables faltantes y permisos administrativos.
13. Historial: negocio, gestión y journal muestran los eventos aplicables, el texto y destino según lectura del negocio, e identifican autoría y automatismos.
14. Papelera, Archivado, No contactar y restricciones aplican las barreras exactas de esta especificación.

## 16. Límites de esta aprobación

La aprobación de esta spec cierra la definición de producto. La inspección estática quedó documentada en [57 — análisis de brechas](57-communication-code-gap-analysis.md). El propietario autorizó implementar la spec en la rama aislada `feat/communication-crm`; eso no autoriza ejecutar migraciones, limpiar datos ni operar sobre producción. La migración 022 queda preparada para revisión y validación en una base descartable.

Al cerrar la implementación se informarán los recorridos cubiertos, pruebas efectivamente ejecutadas, errores heredados de la base, migración pendiente y límites de verificación. No se crearán commits, pushes ni merges sin confirmación posterior.
