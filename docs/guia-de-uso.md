# Usar Hospeda, paso a paso

Guía para personas sin experiencia en CRM o ventas. Disponible en Ayuda (menú principal). El contenido se mantiene en src/content/user-guide.json.

## Empezar y orientarse

Entendé las palabras de la aplicación y elegí dónde comenzar.

### Qué significa cada cosa

**Cuándo usarlo:** Antes de cargar datos o cuando una palabra te genere dudas.

1. Negocio: el comercio o establecimiento. Se carga una sola vez; después le sumás personas y gestiones.
2. Persona: alguien del negocio con quien hablás. Tiene sus propios datos (cargo, teléfono, email). Si todavía no conocés a nadie, podés usar el teléfono o el email del negocio.
3. Gestión: lo que querés lograr con ese negocio, por ejemplo venderle un plan o sumarlo como proveedor. Un negocio puede tener varias gestiones a la vez. Iniciar una gestión no significa que ya se vendió.
4. Estado y etapa no son lo mismo. El Estado es del negocio y dice en qué situación está: Nuevo, Revisado, En gestión, Sin tarea agendada, Recontactar o Archivado. La Etapa pertenece a cada gestión y muestra en qué punto va.
5. Es cliente, No contactar y Derivado a Leandro son marcas aparte; no son estados. La Papelera es para registros inválidos o cargados por error.
6. Tarea: algo que falta hacer, con una fecha. Cuando la hacés, la anotás con «Anotar cómo salió» y queda guardado lo que pasó en «Qué pasó», dentro del negocio.
7. Responsable: la persona que se encarga del negocio, de la gestión o de la tarea.

**Qué queda al terminar:** Podés distinguir negocio, persona, gestión y tarea, y no confundís el Estado del negocio con la Etapa de una gestión.

**Ejemplo:**

- Cabañas Camino Claro es el negocio. Ana es una persona. Publicación de cabañas es una gestión. Llamar a Ana el jueves es una tarea. Cuando la llamás y anotás cómo salió, queda registrado lo que pasó.

**Tené en cuenta:**

- Cerrar una gestión no cierra las demás. Ganada no verifica cobros ni activa servicios del portal turístico.
- Si una palabra de la pantalla te genera dudas, buscá el ícono ⓘ al lado: explica el término en una frase.

### Tu primer día: la lista de Primeros pasos

**Cuándo usarlo:** Cuando recién empezás a usar Hospeda y no sabés por dónde arrancar.

1. Entrá en «Hoy». Si todavía no usaste la aplicación, arriba aparece el cuadro «Primeros pasos» con cuatro pasos.
2. Los pasos son: abrir una tarea, contactar a un negocio, anotar cómo salió y agendar la próxima tarea. Se tildan solos a medida que trabajás; no hace falta marcarlos.
3. Si todavía no tenés tareas, tocá «Agendar mi primera tarea» o entrá en «Negocios» para buscar un comercio y abrirlo.
4. Cuando quieras sacar el cuadro, tocá «Ocultar». No se pierde nada: es solo una ayuda.

**Qué queda al terminar:** Sabés qué hacer en tus primeros días y la aplicación te marca el avance sin que tengas que anotarlo.

**Ejemplo:**

- Abrís una tarea, tocás «Contactar», mandás el mensaje, anotás cómo salió y dejás la próxima tarea con fecha. Con eso completaste los cuatro pasos.

**Tené en cuenta:**

- Los pasos se tildan por lo que hacés de verdad, no por mirar una pantalla.
- Si ya trabajaste antes, el cuadro no aparece.

**Dónde ir:** Ir a Hoy (/my-day)

### Estado del negocio y etapa de la gestión

**Cuándo usarlo:** Cuando necesitás saber qué significa un estado, una etapa o cuál cambiar.

1. Nuevo significa que todavía no se verificó el negocio. Antes de iniciar una gestión, primero comprobá que exista y corresponda al registro, y pasalo a Revisado.
2. Revisado confirma que el negocio fue comprobado. El badge «Revisados» cambia el Estado entre Nuevo y Revisado; su filtro solo encuentra negocios. Status sigue siendo la única fuente de verdad.
3. En gestión aparece mientras haya al menos una gestión abierta. Si cerrás la última sin fecha, el negocio pasa a Sin tarea agendada. Si cerrás con fecha para volver a hablar, el negocio queda automáticamente en Recontactar y se crea solo la tarea «Recontactar según lo acordado», a cargo del responsable del negocio (si no tiene, del responsable de la gestión o de quien hizo el cierre). Al guardar otra fecha de Recontactar, el CRM mueve esa misma tarea si nadie la modificó; salir de Recontactar la cancela si sigue intacta. No se crea una segunda tarea.
4. Para cambiar el Estado, usá el badge «Estado del negocio» en la columna de la lista o en la ficha. Puede hacerlo el administrador o el responsable del negocio. Un negocio Nuevo solo puede pasar a Revisado; En gestión se actualiza al iniciar o cerrar gestiones.
5. Archivado aparta un negocio válido que no vas a trabajar por ahora. Solo un administrador puede desarchivarlo; vuelve a Revisado si ya había sido verificado y, si no, a Nuevo.
6. Las Etapas pertenecen a cada gestión y dependen de su tipo: verticales principales, Partners, Proveedores, Editores o Acompañamiento de ficha. No hace falta pasar por todas ni seguir un orden fijo entre etapas abiertas.
7. Es cliente, No contactar y Derivado a Leandro son marcas independientes. En verticales principales y Partners, cerrar una gestión como ganada marca al negocio como cliente; solo un administrador puede quitar esa marca.
8. La Papelera es distinta de Archivado. Un negocio en la Papelera no se puede usar ni contactar hasta que un administrador lo restaure.

**Qué queda al terminar:** Sabés qué Estado o qué Etapa cambiar y cuándo corresponde, sin confundir el negocio con una gestión.

**Ejemplo:**

- Un negocio puede estar En gestión y tener una gestión de Partners abierta y otra de Acompañamiento de ficha. Si una se cierra y la otra sigue abierta, el negocio continúa En gestión.

**Tené en cuenta:**

- No contactar bloquea todos los contactos salientes hasta que un administrador levante la restricción. Al marcarlo, el CRM cancela todas las tareas pendientes del negocio y deja anotado el motivo: el negocio quedó marcado No contactar. Si después se levanta el bloqueo, esas tareas no vuelven: si hace falta, agendá una nueva.
- Si elegís Recontactar con fecha sin una tarea intacta de una gestión asociada, se agenda «Volver a contactar» para el responsable del negocio (o para quien hizo el cambio si no tiene responsable). Si ya existe la tarea intacta creada al cerrar una gestión, se actualiza esa tarea. Si alguien la editó o completó, el CRM no la mueve ni la cancela.

**Dónde ir:** Abrir Negocios (/accounts)

### Vertical, perfil, prioridad y otros datos

**Cuándo usarlo:** Cuando ves campos que no sabés cómo completar.

1. Vertical indica el rubro del negocio; Subtipo lo describe con más detalle. Usá las opciones del equipo y completá solo lo que conozcas.
2. Perfil comercial ayuda a elegir mensajes modelo adecuados. No es la Etapa de la gestión ni la diferencia entre cliente y potencial cliente.
3. Prioridad indica qué merece atención antes. La aplicación puede mostrar una prioridad sugerida y explicar por qué; no reemplaza la prioridad que elegís vos.
4. Origen y Fuente de referencia explican de dónde salió el dato. Guardá la fuente real, no una suposición.
5. Notas conserva información útil. Para una conversación que ya tuviste usá «Anotar lo que pasó»; para un compromiso pendiente usá «Agendar tarea».
6. Suscripción y Cierre estimado describen información comercial registrada. No prueban cobros ni activación de servicios.

**Qué queda al terminar:** Cada campo ayuda a describir el caso, sin confundirse con el resultado de una gestión.

**Ejemplo:**

- Vertical: Alojamientos. Subtipo: Cabañas. Prioridad: la que realmente requiere el caso. Una propuesta abierta puede pertenecer a un negocio que ya es cliente.

**Tené en cuenta:**

- No hace falta completar todos los campos para empezar. Ante un dato desconocido, dejalo en blanco y agendá una tarea para confirmarlo.

### Dónde encuentro cada cosa

**Cuándo usarlo:** Cuando no sabés qué pantalla abrir.

1. «Hoy» es tu punto de partida: tus tareas vencidas, las de hoy y las que vienen. Tiene tres solapas: «Lista», «Calendario» y «Para retomar».
2. «Negocios»: buscá comercios, cargá uno nuevo con «Nuevo negocio» y abrilo para ver qué pasó, sus gestiones, sus personas y sus datos.
3. «Gestiones»: mirá las propuestas concretas, ordenadas por etapa. Abrí una para ver Resumen, Seguimiento, Notas, Comunicación y Documentos.
4. «Calendario» (dentro de Hoy) muestra visitas y reuniones con fecha. No reemplaza la lista de tareas.
5. «Para retomar» (dentro de Hoy) reúne las gestiones cerradas que tienen una fecha para volver a hablar. Reabrir una gestión cerrada requiere un administrador.
6. «Ayuda» es esta guía. Con Ctrl+K (o el botón de accesos rápidos) buscás cualquier negocio, gestión o explicación desde cualquier pantalla.
7. En el menú «Administración» están «Configuración», «Estadísticas», «Historial del equipo», «Papelera», «Negocios archivados», «Importar CSV» y «Buscar duplicados». Si no los ves, son del administrador.

**Qué queda al terminar:** Sabés dónde buscar según lo que querés hacer.

**Ejemplo:**

- Querés ver qué tenés que hacer hoy: «Hoy». Querés encontrar a un comercio: «Negocios». Querés ver todas las propuestas abiertas: «Gestiones».

**Tené en cuenta:**

- Los materiales aprobados se vinculan desde «Datos y documentos», dentro del negocio. Solo un administrador administra la biblioteca.

**Dónde ir:** Ir a Hoy (/my-day)

### Qué hago al empezar y terminar el día

**Cuándo usarlo:** Todos los días de trabajo.

1. Abrí «Hoy». Atendé primero «Vencidas» y después «Para hoy». Revisá si cada tarea todavía corresponde. Si aún no tenés tareas, empezá por «Negocios».
2. Antes de contactar, leé lo último que pasó con el negocio y cuál es el próximo paso. Comprobá a quién le vas a escribir y si hay restricciones.
3. En cada tarea tocá «Contactar» para hablar. Cuando termines, tocá «Anotar cómo salió».
4. Elegí qué pasó y respondé «¿Cómo sigue?»: agendá una tarea con fecha, esperá hasta una fecha o elegí «No agendar nada» con un motivo. Siempre tiene que quedar una de las tres.
5. Si no podés hacer una tarea hoy, tocá «Posponer» y elegí «Mañana», «En 3 días», «Lunes» o «Elegir fecha…».
6. Mirá «Próximas acciones» para las fechas futuras. Si no encontrás algo, revisá «Filtros de trabajo».
7. Al terminar, comprobá que no te queden contactos sin anotar: aparecen arriba, en «Anotá cómo salió».

**Qué queda al terminar:** El equipo puede continuar el trabajo sin depender de tu memoria.

**Ejemplo:**

- Ana pidió que le mandes la propuesta mañana. No alcanza con escribirlo en una nota: agendá una tarea con esa fecha.

**Tené en cuenta:**

- Una lista vacía solo significa que no tenés tareas con esos filtros; no demuestra que toda la cartera esté atendida.
- Las gestiones que necesitan un próximo paso aparecen en «Gestiones sin tarea agendada». Agendá una tarea para sacarlas de esa lista.

**Dónde ir:** Ir a Hoy (/my-day)

## Negocio y primer contacto

Cargá un negocio, usá sus canales o una persona conocida y dejá el primer paso.

### Cargar o completar un negocio

**Cuándo usarlo:** Cuando el establecimiento todavía no está en el CRM.

1. Entrá en «Negocios» y buscá el nombre. Revisá ciudad y canales para no crear un duplicado.
2. Si no existe, tocá «Nuevo negocio». Alcanza con el nombre; sumá ciudad y teléfono si los conocés. No inventes lo que falte.
3. Si ya hablaste con alguien, completá «Persona con la que hablaste (opcional)»: queda como persona principal del negocio.
4. Mientras escribís, el CRM revisa si ya existe algo parecido. Si aparece el mismo negocio, abrilo en lugar de crear otro. Solo si ninguno es el tuyo, marcá «Ninguno de estos es mi negocio, crear igual».
5. Tocá «Crear negocio». Después podés abrirlo y completar el resto con «Editar negocio».
6. Usá los teléfonos y emails generales para recepción, central o email del establecimiento. Si falta responsable o la asignación es incorrecta, pedile al administrador que la revise.

**Qué queda al terminar:** El negocio queda guardado. Cargarlo no crea una gestión, ni tareas, ni envía mensajes.

**Ejemplo:**

- Nombre: Cabañas Camino Claro. Ciudad: Colón. Teléfono: el de recepción. El email personal de Ana irá en su propia ficha de persona.

**Tené en cuenta:**

- Si el negocio parecido está marcado No contactar, el CRM no te deja crear un duplicado: abrilo en lugar de crear otro. Si ya existe con otro responsable, el aviso también lo dice.

**Dónde ir:** Abrir Negocios (/accounts)

### Revisar negocios precargados

**Cuándo usarlo:** Cuando recibís una lista de negocios que todavía no se verificó.

1. Entrá en «Negocios» y usá la columna «Revisados» o su filtro para encontrar los negocios verificados y los que todavía no. Si podés modificar el negocio, tocá el badge para pasar de Nuevo a Revisado o volver a No revisado.
2. Abrí cada negocio y comprobá que exista y que sea el establecimiento correcto. Contrastá nombre, ciudad y canales con fuentes confiables, como su sitio o perfil oficial.
3. Si confirmás que es real, guardá las fuentes y la fecha en «Editar negocio» → «Ubicación y relevamiento (opcional)». Después marcá Revisado en esa columna o en el Estado del negocio; también podés confirmarlo al iniciar una gestión.
4. Si todavía no podés confirmarlo, dejalo en Nuevo. Anotá qué falta comprobar en «Notas del negocio» y volvé a revisarlo más tarde.
5. Si es un registro inválido, seleccioná solo ese negocio y tocá «Enviar a papelera», o abrilo y usá «Más acciones del negocio» → «Enviar a Papelera · registro inválido». Escribí un motivo concreto y confirmá.
6. Si el negocio existe pero no lo vas a trabajar por ahora, no lo mandes a la Papelera: usá «Archivar negocio válido».

**Qué queda al terminar:** Los negocios verificados quedan Revisados. Los inválidos quedan en la Papelera y los pendientes siguen visibles como Nuevo.

**Ejemplo:**

- Un perfil oficial confirma que Cabañas Camino Claro existe en Colón: guardás el vínculo y la fecha de revisión, y lo pasás a Revisado.
- El domicilio y las fuentes muestran que otro registro no es un establecimiento real: lo enviás a la Papelera con el motivo, sin borrar sus personas ni su historial.

**Tené en cuenta:**

- Revisado significa que se comprobó que el negocio existe y corresponde al registro. La columna «Revisados» edita el Estado del negocio: de Nuevo a Revisado o de Revisado a No revisado.
- Enviar a la Papelera conserva personas, gestiones e historial, y un administrador puede restaurarlo.
- Solo podés enviar a la Papelera negocios que podés modificar. Si no aparece la acción o el servidor la rechaza, pedí ayuda al responsable o al administrador.

**Dónde ir:** Revisar negocios (/accounts)

### Contactar desde la ficha del negocio

**Cuándo usarlo:** Cuando querés escribir o llamar sin buscar primero una tarea.

1. Abrí el negocio y tocá «Contactar». Revisá su estado, los canales disponibles y las restricciones antes de seguir.
2. En «¿Sobre qué?» elegí «Sin gestión (contacto general)» o una gestión abierta. Las gestiones cerradas solo sirven para anotar una respuesta recibida, no para empezar un contacto nuevo.
3. Si es un contacto general, elegí el «Propósito del contacto». Si es sobre una gestión, la gestión ya da el contexto.
4. Si el negocio es Nuevo, solo podés hacer una verificación para comprobar que existe. Para iniciar una gestión confirmá que ya lo verificaste con «Iniciar gestión y continuar»: queda Revisado y se crea la gestión en el mismo paso.
5. Elegí el canal: «Email», «WhatsApp», «Llamada», «Red social» u «Otro canal». Después tocá «Continuar con el mensaje».
6. Elegí la «Persona de contacto» o «Usar el dato general del negocio» si no hay una persona con ese canal. Con varias personas o direcciones, elegí la correcta.
7. Elegí un «Mensaje modelo (opcional)» o «Escribir desde cero», revisá el texto y el destino, y tocá «Preparar email» o «Preparar WhatsApp».
8. Al terminar, el CRM te pregunta «¿Cómo salió?» y «¿Cómo sigue?». Es el mismo recorrido para todos los canales.

**Qué queda al terminar:** El contacto queda asociado al negocio y al propósito o gestión correctos, y siempre termina anotando cómo salió y cómo sigue.

**Tené en cuenta:**

- Archivado y No contactar bloquean las salidas. Las restricciones técnicas también pueden bloquear un canal concreto.
- Si falla abrir el email o WhatsApp, el CRM guarda un intento sin confirmar. No lo reenvíes de nuevo: primero revisá su estado.
- Si no ves «Contactar», puede ser porque el negocio es No contactar o porque no sos su responsable. Mirá el artículo No puedo modificar un negocio, en Resolver dudas y errores.

**Dónde ir:** Abrir Negocios (/accounts)

### Agregar personas y elegir con quién hablar

**Cuándo usarlo:** Cuando conocés a alguien del negocio o hay varias personas involucradas.

1. Abrí el negocio y entrá en la solapa «Personas». Tocá «Agregar persona». Cargar una persona es opcional: «Contactar» también permite usar el teléfono o el email del negocio.
2. Completá el nombre, el teléfono o el email. Cargo y Canal preferido ayudan a elegir cómo hablarle; pueden quedar vacíos.
3. Marcá Principal si es la referencia habitual del negocio y guardá.
4. Si el teléfono que cargás es el de un negocio que pidió no ser contactado, el CRM te muestra un aviso con el nombre del negocio. Podés guardar a la persona, pero antes tenés que tildar «Entendido, no voy a contactar a ese negocio». No uses ese teléfono para contactar sin consultar a un administrador.
5. Agregá a las demás personas como fichas distintas. En una gestión podés elegir quién es su persona principal.
6. Antes de escribir o llamar, revisá a quién va dirigido el mensaje. El canal general del negocio y los canales de una persona son opciones diferentes.
7. Cuando agregás una persona desde el próximo paso aparece «Volver al próximo paso», que te lleva de nuevo al resumen del negocio para seguir.

**Qué queda al terminar:** Cada persona conserva sus datos. Principal reemplaza a la referencia anterior, sin cambiar la persona elegida en cada gestión.

**Ejemplo:**

- Ana administra las cabañas y Luis autoriza la contratación. Guardá a los dos; una propuesta puede tener a Luis como persona principal aunque Ana siga siendo la principal del negocio.

**Tené en cuenta:**

- No hace falta inventar una persona para usar el teléfono o el email general del negocio.

### Cuándo crear una gestión y cómo hacerlo

**Cuándo usarlo:** Cuando vas a trabajar una propuesta concreta. No hace falta para cada llamada general.

1. Abrí el negocio, entrá en la solapa «Gestiones» y tocá «Iniciar gestión». Para empezar, el negocio tiene que estar Revisado.
2. Si figura Nuevo pero acabás de verificarlo, confirmalo en el formulario con «Marcar Revisado e iniciar gestión»: queda Revisado al guardar la nueva gestión.
3. Elegí el «Tipo de gestión»: verticales principales, Partners, Proveedores, Editores o Acompañamiento de ficha. Acompañamiento de ficha es para ayudar a un cliente con su ficha después de que aceptó.
4. Escribí un «Nombre de la gestión» corto y concreto, por ejemplo: Plan de alojamiento 2027, Propuesta para una institución o Completar la ficha de Hospeda. El responsable se toma del negocio; solo un administrador puede cambiarlo.
5. Si hace falta, abrí «Más datos (opcional)» para agregar tema, fecha estimada o persona principal. Guardá: la gestión empieza en su primera etapa. Esto no contacta al negocio ni registra una venta.
6. A medida que avanza, cambiá la etapa según lo que realmente ocurrió. Podés pasar entre etapas abiertas sin recorrerlas todas. Cerrala cuando tengas un resultado real y completá el motivo que te pide.

**Qué queda al terminar:** La gestión queda vinculada al negocio con un recorrido propio y separado de las otras gestiones.

**Ejemplo:**

- Creá Publicación de cabañas para una oferta de publicación. Para averiguar quién atiende el establecimiento, alcanza con una tarea general: no hace falta crear una gestión.

**Tené en cuenta:**

- Antes de crear otra, revisá si ya existe una gestión abierta sobre el mismo objetivo.
- No se puede iniciar una gestión desde un negocio Archivado ni en la Papelera.
- Si al anotar un resultado ves una casilla que pregunta si querés pasar la gestión a otra etapa, es una sugerencia: la etapa solo cambia si la marcás.

**Dónde ir:** Buscar el negocio (/accounts)

### Dejar un próximo paso con fecha

**Cuándo usarlo:** Cuando hay algo pendiente: llamar, enviar una propuesta, visitar o confirmar una entrega.

1. Desde «Hoy» tocá «Agendar tarea». También podés usar el botón de próximo paso dentro del negocio o «Agendar otra tarea» en su solapa «Qué pasó».
2. Si empezaste desde Hoy, buscá y elegí el negocio. En «Contexto» elegí una gestión o «Sin gestión (general del negocio)».
3. Antes de guardar, mirá si el CRM avisa «Ya hay tareas pendientes para este negocio». Si ya existe una para el mismo compromiso, abrila y actualizala en lugar de duplicarla.
4. Escribí un título concreto en «Qué hay que hacer». Elegí «Tipo», la fecha de vencimiento y, si sirve, «Hora (opcional)». Revisá el «Propósito».
5. Para la fecha podés usar los atajos «Mañana», «En 3 días», «Lunes», «En 1 semana» o «Elegir fecha».
6. Conversación comercial sirve para una oferta; Entrega para cumplir lo acordado; Acompañamiento para ver cómo le va; Retomar conversación para volver sobre un contacto anterior.
7. En «Participantes y notas (opcional)» agregá detalles. Después tocá «Agendar tarea».

**Qué queda al terminar:** Se guarda una tarea pendiente. Aparece en Hoy según su fecha y, si su tipo está configurado para el calendario, también en «Calendario».

**Ejemplo:**

- Título: Llamar a Ana para conocer qué necesita. Propósito: Conversación comercial. Tipo: llamada. Fecha: la que acordaron.

**Tené en cuenta:**

- La fecha y la hora se interpretan en horario de Argentina. Las notas no reemplazan una tarea con fecha.
- Para cambiar la fecha de una tarea existente no hace falta crear otra: usá «Posponer» o «Cambiar fecha o datos».

**Dónde ir:** Ir a Hoy (/my-day)

### Contactar por email, WhatsApp, llamada u otro canal

**Cuándo usarlo:** Cuando llega el momento de una tarea o de una conversación necesaria.

1. Desde una tarea tocá «Contactar». Desde el negocio, tocá «Contactar» y elegí sobre qué es el contacto. Los canales son «Email», «WhatsApp», «Llamada», «Red social» y «Otro canal».
2. Para email y WhatsApp, revisá la persona y el dato exacto. Si no hay una persona con ese canal, podés usar el canal general del negocio.
3. El email se prepara y sale desde el CRM. El CRM te muestra si el servicio de envío aceptó el pedido; eso no confirma que llegó.
4. WhatsApp abre la aplicación con el texto preparado. Al volver, el CRM pregunta «¿Lo enviaste?»: tocá «Sí, lo envié» solo si lo mandaste de verdad, «No, no lo envié» si no, o «Todavía no sé, lo anoto después».
5. Para una llamada, elegí a quién llamás. En el celular tocá «Llamar ahora»; en la computadora tocá «Copiar número» y llamá desde tu teléfono. Cuando termines tocá «Ya llamé: anotar cómo salió». Si no te atendieron: desde el negocio podés tocar «No me atendieron»; desde una tarea tocá «Ya llamé: anotar cómo salió» y elegí «No respondió».
6. Para «Red social» y «Otro canal», el CRM crea un intento pendiente (podés «Crear intento y copiar texto»). Cuando termines, completá cómo salió.
7. En todos los casos el contacto termina en «¿Cómo salió?» y «¿Cómo sigue?». Abrir una aplicación, copiar texto o iniciar un intento no confirma envío ni respuesta.

**Qué queda al terminar:** Abrir un canal solo prepara o inicia la comunicación; lo que realmente pasó se anota después, siempre con su próximo paso.

**Ejemplo:**

- Mensaje inicial: Hola Ana, soy del equipo de Hospeda. ¿Sos la persona indicada para conversar sobre la difusión de las cabañas?

**Tené en cuenta:**

- El canal tiene que estar disponible y sin restricciones. No contactar bloquea todas las salidas, sin excepción.
- Si salís sin anotar cómo salió, no se pierde: el contacto queda en «Anotá cómo salió», arriba en Hoy, hasta que lo completes.
- Si la persona elegida tiene el mismo teléfono que un negocio No contactar, el CRM muestra un aviso con el nombre del negocio. No te bloquea, pero no uses ese teléfono para contactar sin consultar a un administrador.

### Anotar cómo salió y decidir cómo sigue

**Cuándo usarlo:** Después de hacer la tarea o de un contacto, incluso si no hubo respuesta.

1. Una tarea es algo pendiente con fecha; lo que ya ocurrió se anota con «Anotar cómo salió» (en una tarea) o con «Anotar lo que pasó» (cuando no hay tarea). La etapa describe el punto en que está la gestión.
2. En «¿Qué pasó?» elegí una opción: «No respondió», «Respondió, le interesa», «Pidió que lo contacte más adelante», «No le interesa» u «Otro (contame)». Cuando anotás algo nuevo con «Anotar lo que pasó» también aparece «Pidió no ser contactado» (ver el último paso). En entregas y acompañamientos suman «Entrega confirmada», «Falta confirmar», «Necesita ayuda» o «Revisión realizada».
3. En «Detalles del resultado» escribí en pocas palabras qué ocurrió. «Otro (contame)» pide una aclaración.
4. Respondé «¿Cómo sigue?»: «Agendar una tarea» (con título y fecha), «Esperar hasta una fecha y retomar» o «No agendar nada» (con un motivo). No se puede guardar sin elegir una.
5. Si el CRM muestra una casilla para pasar la gestión a la etapa sugerida, marcala solo si es lo que pasó. Si no la marcás, la etapa no cambia.
6. Revisá el resumen «Revisá lo que se guardará» y tocá «Guardar resultado» (o «Guardar y programar» si dejaste una tarea nueva).
7. Si la persona pidió que no la contacten, abrí el negocio y usá «Anotar lo que pasó» (no «Anotar cómo salió» de una tarea), o en «Comunicación» tocá «Registrar respuesta recibida». Elegí «Pidió no ser contactado». El CRM te pide confirmar el bloqueo con «Bloquear contacto» y te deja elegir si además querés cerrar gestiones abiertas. Solo lo puede hacer el responsable del negocio, el responsable de una de sus gestiones o un administrador.

**Qué queda al terminar:** Se completa la tarea y queda guardado lo que pasó. Si dejaste una tarea nueva, se crea con su fecha. Las demás tareas se conservan.

**Ejemplo:**

- Resultado: Respondió, le interesa. Detalles: Quiere revisar la propuesta con Luis. Cómo sigue: Agendar una tarea. Qué hay que hacer: Consultar la decisión con Ana.

**Tené en cuenta:**

- Anotar una respuesta en una gestión cerrada no la reabre ni cambia su estado.
- «Pidió no ser contactado» lo anota el responsable del negocio, el responsable de una de sus gestiones o un administrador. Solo un administrador puede levantar el bloqueo.
- Si te equivocaste, buscá la tarea ya completada (en «Tareas finalizadas o canceladas», dentro del negocio), abrí su menú y tocá «Corregir cómo salió».

## Propuesta, decisión y cierre

Avanzá según lo que realmente ocurrió, con dudas y acuerdos visibles.

### Entender la necesidad y preparar la propuesta

**Cuándo usarlo:** Cuando la persona quiere conocer la oferta.

1. Entrá en «Gestiones» y abrí la gestión. Revisá su tipo y su etapa actual.
2. Usá la ayuda «Cómo avanzar con esta gestión» como orientación. Las etapas disponibles dependen del tipo y no hace falta pasar por todas.
3. Anotá conversaciones, tareas y acuerdos en sus lugares: «Seguimiento», «Notas» y «Comunicación». Un mensaje abierto o enviado no cambia la etapa por sí solo.
4. Cuando haya una aceptación, cerrá con el resultado correcto: venta o aceptación, participación, colaboración o cierre de acompañamiento, según el tipo.
5. Si no avanzó, elegí una etapa abierta que describa el momento real o cerrá como no concretada con el motivo que corresponda.

**Qué queda al terminar:** La etapa describe la situación real de esa gestión, sin confundir una actividad con una aceptación.

**Ejemplo:**

- Ana quiere más consultas fuera de temporada. Preparás la publicación de cabañas y acordás revisar la propuesta el jueves.

**Tené en cuenta:**

- Abrir un paso de la ayuda no cambia la etapa. Las etapas disponibles son fijas y dependen del tipo de gestión.
- Solo el responsable de esa gestión o un administrador puede cambiar su etapa. Si el botón está deshabilitado, el texto de ayuda dice quién puede hacerlo.

**Dónde ir:** Abrir Gestiones (/opportunities)

### Anotar una duda u objeción

**Cuándo usarlo:** Cuando algo impide decidir, pero todavía puede resolverse.

1. Abrí la gestión y desplegá «Dudas y objeciones» en el Resumen.
2. Tocá «Agregar objeción», elegí el tipo que corresponda y escribí «Notas / resolución».
3. Dejá el estado en Pendiente mientras falte resolverla y guardá.
4. Agendá una tarea para responder esa duda. Cuando la resuelvan, tocá «Editar / resolver» y pasala a Resuelta; si dejó de corresponder, usá Descartada.

**Qué queda al terminar:** La dificultad queda visible para el equipo sin dar la gestión por perdida.

**Ejemplo:**

- Ana dice: Tengo que consultarlo con Luis. Anotá quién decide y agendá cuándo preguntar por la respuesta.

**Tené en cuenta:**

- Una objeción no significa que la persona haya rechazado la oferta. No cierres como perdida solo porque surgió una duda.

### Cerrar una gestión con resultado favorable

**Cuándo usarlo:** Cuando hay una aceptación real de la propuesta.

1. Abrí la gestión, andá a «Etapa y prioridad» y tocá «Cambiar etapa».
2. Elegí el cierre favorable que corresponde al tipo: Cerrada ganada, Participa, Colabora o Cerrada completada.
3. En los cierres comerciales o de participación, elegí el «Motivo de cierre». Si elegís Otro, agregá una nota. Cerrada completada en Acompañamiento de ficha no pide motivo.
4. Completá lo que sepas de «Acuerdo y entrega» cuando corresponda. Es una evidencia útil; no inventes lo que falte.
5. En Editores, al ganar una propuesta comercial el formulario te pregunta si querés «Marcar este negocio como cliente». En colaboración editorial no se marca solo.
6. Al cerrar como ganada una gestión de verticales principales o Partners, el negocio se marca solo como cliente. En participación de Proveedores no.
7. Guardá y revisá las otras gestiones y tareas del negocio. Solo se cierra esta gestión.

**Qué queda al terminar:** La gestión conserva su motivo y su historial de cierre. El negocio y sus otras gestiones siguen con sus propias reglas.

**Ejemplo:**

- Ana y Luis aceptaron la publicación. Anotá el material acordado y quién lo entregará. Dejá una tarea para confirmar la entrega.

**Tené en cuenta:**

- Un resultado favorable no acredita pagos ni activa servicios del portal.
- Si el negocio ya era cliente antes de usar el CRM, usá «Más acciones del negocio» → «Registrar cliente previo» y explicá la relación. Para una venta trabajada acá, cerrá la gestión como ganada.

### Cerrar una gestión sin resultado favorable

**Cuándo usarlo:** Cuando hay una decisión real de no avanzar con esa propuesta.

1. Abrí la gestión, andá a «Etapa y prioridad» y tocá «Cambiar etapa».
2. Elegí el cierre no favorable que corresponde al tipo y el «Motivo de cierre». Otro exige una nota breve.
3. Si acordaron volver a hablar, tocá «Definir fecha para retomar» y elegí la fecha. Al cerrar se crea una sola tarea «Recontactar según lo acordado», a cargo del responsable del negocio (si no tiene, del responsable de la gestión o de quien hizo el cierre). Si era la última gestión abierta, el negocio queda automáticamente en Recontactar. Guardar otra fecha de Recontactar mueve esa tarea solo mientras nadie la haya modificado. La opción no aparece cuando el motivo es Pidió no ser contactado.
4. Si el motivo es Pidió no ser contactado, el negocio queda No contactar y se archiva automáticamente. Podés elegir si también se cierran otras gestiones abiertas para las que tengas permiso.
5. Guardá y revisá los próximos pasos. Una gestión ya cerrada solo la puede reabrir un administrador; el cierre anterior queda en el historial.

**Qué queda al terminar:** La gestión se cierra sin concretarse y conserva su historia. Si dejaste fecha de recontacto, aparece en «Para retomar».

**Ejemplo:**

- No contratarán esta temporada por presupuesto. Anotá el motivo real y una fecha para retomar solo si tiene sentido.

**Tené en cuenta:**

- No respondió puede ser un motivo de cierre, pero anotar un intento sin respuesta no cierra por sí solo la gestión.
- No le interesa no es lo mismo que pedir que no lo contacten. Usá el motivo que represente lo que la persona dijo.

### No respondió o pidió esperar

**Cuándo usarlo:** Cuando falta una respuesta o acordaron conversar más adelante.

1. Si no hubo respuesta a tu contacto, tocá «Anotar cómo salió», elegí «No respondió» y respondé «¿Cómo sigue?». Si la persona sí respondió, elegí la opción que corresponda.
2. Si pidió que la vuelvas a llamar en otro momento, elegí «Pidió que lo contacte más adelante». El CRM te ofrece «Elegir una fecha para retomar»: tocalo, poné la fecha acordada y queda una tarea para ese día.
3. Si el negocio no es para ahora pero hay que volver a hablarle, cambiá el Estado del negocio a «Recontactar» y poné una «Fecha de recontacto (opcional)». El CRM agenda la tarea «Volver a contactar» para esa fecha a nombre del responsable del negocio; si es otra persona, te avisa su nombre antes de guardar. Si cambiás la fecha, la tarea se mueve al nuevo día. Si borrás la fecha, cambiás el Estado a otro, lo marcás No contactar o lo archivás, la tarea se cancela sola y el historial dice por qué. Si alguien ya la renombró, la reprogramó o la completó, no se toca.
4. Si la gestión sigue abierta, elegí una etapa abierta que refleje lo que pasó. Las etapas no cambian solas al anotar un resultado.
5. Si decidís cerrar la gestión como perdida, elegí el motivo y, si querés, una fecha de recontacto. Esa fecha agenda una tarea.
6. Si pidió que no la contacten, abrí el negocio y usá «Anotar lo que pasó» para elegir «Pidió no ser contactado» (desde «Anotar cómo salió» de una tarea no aparece). Lo puede hacer el responsable del negocio, el responsable de una de sus gestiones o un administrador; las demás personas no ven esa opción. El bloqueo es global y solo un administrador puede levantarlo; corregir esa respuesta más tarde también es cosa de un administrador.

**Qué queda al terminar:** Queda anotado lo que ocurrió y una tarea concreta cuando corresponde. No se envían mensajes ni se reabre o cierra una gestión automáticamente.

**Ejemplo:**

- Ana pidió que la llames después de hablar con Luis. Qué hay que hacer: Consultar decisión de Ana y Luis. Fecha: la acordada.

**Tené en cuenta:**

- Si eligió no recibir más contactos, usá «Pidió no ser contactado» y respetá el bloqueo, en lugar de agendar otro intento.
- Si más adelante querés volver a hablar con alguien de una gestión cerrada, mirá «Para retomar» dentro de Hoy.

### Retomar una conversación o reabrir una gestión

**Cuándo usarlo:** Cuando querés retomar una gestión cerrada que tiene fecha de recontacto.

1. Entrá en «Hoy» y abrí la solapa «Para retomar». Ahí están las gestiones cerradas como perdidas con fecha para volver a hablar. Podés filtrar por «Estado de retoma».
2. Revisá qué acción ya existe. Si el cierre generó «Recontactar según lo acordado», abrila desde «Abrir tarea» para anotar o consultar el resultado. Si hay una gestión relacionada, abrila desde la fila.
3. Tocá «Elegir cómo retomar». Si solo querés volver a conversar, elegí «Crear seguimiento y conservar cerrada».
4. Si la misma propuesta vuelve a negociarse, pedile a un administrador que elija «Reabrir esta gestión y crear seguimiento» con una etapa abierta del mismo tipo. El cierre anterior queda en el historial.
5. Si querés trabajar otra propuesta del mismo tipo, elegí «Crear otra gestión del mismo tipo y seguimiento». Para una propuesta de otro tipo, iniciá la gestión desde la ficha del negocio.
6. Antes de contactar, revisá si el negocio está Archivado, en la Papelera o marcado No contactar. Los tres los resuelve un administrador.

**Qué queda al terminar:** Retomás el caso con su historia conservada y sin generar un contacto automático.

**Ejemplo:**

- La publicación fue rechazada hace meses. Primero consultás si cambió la necesidad; dejás la gestión cerrada hasta que realmente haya una nueva negociación.

**Tené en cuenta:**

- El CRM no contacta ni reabre nada automáticamente.
- Si el negocio quedó Recontactar, su fecha resume el seguimiento; la tarea es lo que hay que completar.

**Dónde ir:** Abrir Para retomar (/my-day?view=retomar)

## Entrega y clientes

Cumplí lo acordado, acompañá al cliente y ofrecé una nueva propuesta cuando corresponda.

### Verificar la entrega y completar el acuerdo

**Cuándo usarlo:** Después de concretar una gestión o cuando falta confirmar algo acordado.

1. Abrí la gestión ganada y revisá «Acuerdo y entrega». Tocá «Revisar acuerdo y entrega» para completar o corregir lo que sepas.
2. Agendá una tarea con el propósito Entrega para comprobar que se cumplió lo acordado. Vinculala a esa gestión si corresponde.
3. Cuando la hagas, tocá «Anotar cómo salió». Según lo ocurrido elegí «Entrega confirmada», «Falta confirmar» o «Necesita ayuda».
4. Escribí qué se entregó o qué falta. En «¿Cómo sigue?» agendá una tarea para cada compromiso pendiente.

**Qué queda al terminar:** El acuerdo y el trabajo de entrega quedan registrados sin reabrir la gestión.

**Ejemplo:**

- Faltan confirmar las fotografías. Anotá esa falta y dejá una tarea para pedirlas, en lugar de marcar la entrega como confirmada.

**Tené en cuenta:**

- Si otra persona cambió el acuerdo mientras lo editabas, abrilo de nuevo y revisá la versión actual. El CRM no ejecuta la entrega ni verifica pagos.

### Acompañar a un cliente

**Cuándo usarlo:** Cuando querés saber cómo le fue o ayudar con algo que ya contrató.

1. Acompañamiento / atención al cliente es un propósito de contacto general. Si el negocio todavía no es cliente, confirmá la marca cuando registres el contacto como realizado. Si está marcado No contactar, solo un administrador puede marcarlo Es cliente desde un contacto de Acompañamiento; para el resto, el contacto queda anotado y el negocio no cambia.
2. Acompañamiento de ficha es un tipo de gestión aparte, para ayudar a un negocio que ya aceptó a crear o mejorar su ficha.
3. Para abrir esa gestión, el negocio tiene que ser cliente y estar Revisado. Tocá «Iniciar gestión», elegí Acompañamiento de ficha y agendá el próximo paso.
4. Anotá los avances cambiando de etapa: Pendiente de iniciar, Contactado o Trabajando en la ficha. No hace falta pasar por todas.
5. Al terminar, cerrá como Cerrada completada. Si no se pudo completar, elegí Cerrada no completada y el motivo.

**Qué queda al terminar:** El seguimiento del cliente queda separado de una nueva propuesta comercial.

**Ejemplo:**

- Preguntás si recibió consultas y si necesita ayuda para actualizar el material. Eso es acompañamiento, no una gestión nueva.

**Tené en cuenta:**

- No crees una gestión solo para registrar una consulta general de atención. Usá «Sin gestión (contacto general)» al contactar.
- Si el negocio está No contactar, solo un administrador puede marcarlo Es cliente desde un contacto de Acompañamiento. Otros contactos no cambian esa marca.

**Dónde ir:** Buscar un cliente (/accounts)

### Iniciar otra gestión con el mismo cliente

**Cuándo usarlo:** Cuando existe una propuesta nueva, distinta de la anterior.

1. Abrí el negocio existente; no crees otro negocio por tratarse de una segunda gestión.
2. En la solapa «Gestiones» tocá «Iniciar gestión». Poné un nombre concreto y revisá la persona principal.
3. Guardá y agendá una tarea con propósito Conversación comercial vinculada a esta nueva gestión.
4. Trabajá propuesta, decisión y cierre dentro de ella. Seguí usando las tareas de acompañamiento para lo que contrató antes.

**Qué queda al terminar:** La nueva propuesta tiene su propio recorrido. La anterior conserva su cierre, su acuerdo y su historial.

**Ejemplo:**

- Publicación de cabañas ya está ganada. Más adelante ofrecés Campaña de temporada como otra gestión del mismo negocio.

## Mensajes y herramientas

Usá modelos, documentos, calendario y filtros cuando ayudan a tu trabajo.

### Preparar y registrar una comunicación

**Cuándo usarlo:** Cuando trabajás una gestión y querés usar un modelo o guardar un borrador.

1. Tocá «Contactar», elegí «¿Sobre qué?» (un contacto general con su propósito o una gestión abierta) y el canal.
2. Elegí una «Persona de contacto» y el dato concreto o, si no hay persona con ese canal, «Usar el dato general del negocio». Comprobá el destinatario antes de seguir.
3. Usá un «Mensaje modelo (opcional)» compartido o «Escribir desde cero». Podés editar el texto para este contacto. Si faltan datos del modelo, completalos o quitalos.
4. El email sale desde el CRM. WhatsApp abre la aplicación y el CRM te pregunta después «¿Lo enviaste?». Si falla la apertura, queda un intento sin confirmar.
5. Las llamadas se anotan a mano con un resumen. En «Red social» y «Otro canal» podés copiar el texto; queda un intento pendiente que después completás.
6. Si el contacto quedó sin confirmar o pendiente, resolvelo más tarde sin sobrescribir el texto. Para corregir uno ya confirmado, usá la acción de corrección y explicá el motivo.

**Qué queda al terminar:** El CRM conserva el contenido y el estado del mensaje. Lo que pasó y cómo sigue se anotan aparte, en «¿Cómo salió?» y «¿Cómo sigue?».

**Ejemplo:**

- Usá un modelo de presentación, cambiá la pregunta para Ana y verificá el número antes de abrir WhatsApp.

**Tené en cuenta:**

- Los modelos compartidos los administra el equipo administrador. Editar el texto de un contacto no modifica el modelo.
- Abrir o copiar no prueba que el contacto se haya hecho.

### Guardar, retomar o cancelar un borrador

**Cuándo usarlo:** Cuando el mensaje todavía no está listo para enviarse.

1. Tocá «Contactar» y elegí una gestión abierta o un contacto general con su propósito. Guardar un borrador no inicia ni confirma un contacto.
2. Para retomarlo, entrá en la solapa «Qué pasó» del negocio y buscalo en «Comunicación». Revisá de nuevo el destinatario, los datos y el texto antes de usarlo.
3. El email sale desde el CRM; WhatsApp se abre afuera y queda sin confirmar hasta que informes el resultado.
4. Si salís con cambios sin guardar, elegí volver o descartarlos. No reenvíes un mensaje cuyo resultado sea incierto: primero revisá el estado del intento.

**Qué queda al terminar:** El borrador queda separado de los intentos de contacto y de las comunicaciones realizadas.

**Ejemplo:**

- Preparaste la propuesta pero falta confirmar el precio con el equipo. Guardá el borrador y volvé cuando tengas el dato; no lo envíes para probar.

### Buscar y vincular materiales al negocio

**Cuándo usarlo:** Cuando necesitás una propuesta, folleto o documento para trabajar una gestión.

1. Abrí el negocio y entrá en la solapa «Datos y documentos», o abrí una gestión y entrá en «Documentos».
2. Buscá el recurso en el selector de la biblioteca y elegí un documento aprobado.
3. Revisá el destino y tocá «Vincular documento al negocio» o «Vincular documento a la gestión». Desde un negocio podés elegir una gestión propia o dejarlo como documento general.
4. Si sos administrador y necesitás un documento propio del caso, tocá «Agregar documento o recurso», completá título, tipo y un vínculo o archivo permitido, y guardá.
5. Revisá la versión, el vencimiento y la aprobación antes de usarlo como material comercial.

**Qué queda al terminar:** El documento queda asociado al lugar elegido. Vincularlo no lo envía al cliente.

**Ejemplo:**

- Vinculá el folleto aprobado a Publicación de cabañas para que el equipo sepa qué material usó.

**Tené en cuenta:**

- Solo un administrador carga y administra la biblioteca común, en «Configuración» → «Biblioteca». Una versión nueva conserva las anteriores y vuelve a borrador.

**Dónde ir:** Elegir negocio para consultar materiales (/accounts)

### Usar el Calendario y Posponer una tarea

**Cuándo usarlo:** Para revisar visitas y reuniones, y para cambiar la fecha de un compromiso.

1. En «Hoy» abrí la solapa «Calendario». Elegí el «Mes» y, si querés, alternás entre «Ver como calendario» y «Ver como lista».
2. Para agendar una visita o reunión, tocá «Agendar encuentro». Cuando ocurra, tocá «Anotar encuentro realizado». Solo los tipos de tarea configurados para el calendario aparecen ahí; las demás están en «Lista».
3. Para pasar una tarea a otro día, tocá «Posponer» en su fila y elegí «Mañana», «En 3 días», «Lunes» o «Elegir fecha…». El CRM te avisa con un cartel y podés tocar «Deshacer».
4. Para cambiar también la hora o los datos, abrí el menú de la tarea y tocá «Cambiar fecha o datos».
5. Si ya no hay que hacerla, tocá «Ya no hace falta» y escribí el motivo. Si la hiciste, usá «Anotar cómo salió» en lugar de cancelarla.

**Qué queda al terminar:** Cambiar la fecha reorganiza la tarea que ya existe. No anota nada como hecho.

**Ejemplo:**

- La visita pasó del martes al jueves a las 15:00. Posponé esa visita; no crees una segunda que deje la primera vencida.

**Tené en cuenta:**

- Las fechas y horas son de Argentina.

**Dónde ir:** Abrir Calendario (/my-day?view=calendar)

### Buscar, filtrar y usar las vistas de las listas

**Cuándo usarlo:** Cuando necesitás encontrar negocios o propuestas sin revisar toda la cartera.

1. Entrá en «Negocios» y buscá por nombre, localidad, teléfono o email. La búsqueda ignora tildes, pero distingue ñ de n. Elegí «Tabla» o «Grilla»: las dos muestran los resultados de la vista actual. Las acciones de cada fila son iconos: Abrir, Contactar y Más acciones; pasá el cursor o enfocá cada uno para ver su ayuda.
2. Tocá «Filtrar negocios» y revisá los filtros aplicados. «Guardar como vista» conserva la búsqueda, los filtros, el orden y las columnas.
3. Abrí «Columnas» para elegir y ordenar los datos que ves. También están disponibles WhatsApp, Teléfono de la persona y Email de la persona. La columna de selección queda primera y fija a la izquierda.
4. También podés elegir una columna agrupada para ver varios datos apilados. En «Configuración» → «Listado de negocios» → «Columnas agrupadas», un administrador define grupos y cuántas líneas mostrar en la tabla. Los valores se apilan en el orden definido; la tabla se ordena por el primer dato del grupo. Si hay datos ocultos, tocá el botón +N más (por ejemplo, +2 más) para verlos y editarlos. En la grilla se muestran todos. Los datos vacíos muestran — y cada dato conserva su propia edición.
5. En la tabla, algunos badges se pueden editar directamente: el responsable del negocio o un administrador cambia datos del negocio; solo un administrador cambia el Responsable. Los datos de gestión requieren permiso sobre esa gestión. El badge Revisados cambia el Estado entre Nuevo y Revisado; no está disponible con una gestión abierta o un negocio archivado.
6. Un administrador puede crear, renombrar, ordenar y quitar grupos en «Configuración» → «Listado de negocios» → «Columnas agrupadas», y elegir cuántas líneas se ven en la tabla. Después, cada persona elige qué grupos mostrar desde «Columnas».
7. Las vistas guardadas se eligen en sus etiquetas. Usá «Administrar tus vistas» (ícono de tuerca) para editar filtros, duplicar o eliminar una vista; los administradores también pueden convertir una vista personal en vista del equipo.
8. Los badges de filtros aplicados cambian solo el valor; el campo y la condición se mantienen. «Restablecer vista» quita la configuración activa y vuelve a las preferencias iniciales.
9. Usá la selección múltiple solo después de revisar la lista completa afectada. Revisá y confirmá los cambios masivos antes de aplicarlos.

**Qué queda al terminar:** Las vistas y los filtros cambian lo que ves, no los datos. Solo confirmar una edición masiva los modifica.

**Ejemplo:**

- Buscá Camino Claro y filtrá Colón: se muestran los registros que cumplen los dos criterios.

**Tené en cuenta:**

- En el celular se empieza con la grilla; podés elegir la tabla. Las columnas se desplazan hacia los costados.

**Dónde ir:** Buscar en Negocios (/accounts)

## Ejemplo de principio a fin

Un caso ficticio para aprender a registrar una relación comercial completa.

### De negocio nuevo a venta cerrada: ejemplo paso a paso

**Cuándo usarlo:** Para practicar el recorrido. Los nombres y acuerdos de este ejemplo son ficticios.

1. Buscás Cabañas Camino Claro en «Negocios». Como no existe, tocás «Nuevo negocio», completás los datos que conocés y tocás «Crear negocio». El negocio queda Nuevo.
2. Verificás que el establecimiento exista y sea el correcto. Guardás la fuente confiable y cambiás el Estado del negocio a Revisado.
3. En la solapa «Personas» tocás «Agregar persona» y cargás a Ana, su teléfono y su preferencia. La marcás como principal si corresponde.
4. Tocás «Iniciar gestión» y elegís el tipo verticales principales y un nombre concreto. También podrías iniciarla desde «Contactar»; si verificás el negocio ahí, el mismo paso lo deja Revisado.
5. Agendás una llamada con «Agendar tarea» o tocás «Contactar» desde la gestión. Revisás destinatario, canal y restricciones. El email sale desde el CRM; WhatsApp pide que confirmes si lo enviaste.
6. Después del contacto, el CRM te pregunta «¿Cómo salió?». Anotás la respuesta real. Si pidió retomar más adelante, elegís «Esperar hasta una fecha y retomar» y la fecha acordada.
7. Cuando haya novedades, cambiás la gestión a la etapa abierta que refleje el caso. No hace falta recorrer todas las etapas.
8. Cuando acepta, cerrás la gestión con «Cambiar etapa», el resultado y el motivo que correspondan. En verticales principales, el cierre ganado marca al negocio como cliente. Completás los datos del acuerdo sin inventar los que falten.
9. El CRM mantiene las otras gestiones del negocio. Al cerrarse la última gestión abierta sin fecha para retomar, el negocio queda Sin tarea agendada. Si la cerrás con fecha, el negocio pasa solo a Recontactar y se crea la tarea «Recontactar según lo acordado».
10. Después de aceptar, iniciás una gestión separada de Acompañamiento de ficha para ayudar a crear o mejorar su perfil.
11. Anotás la entrega y el acompañamiento con «Anotar cómo salió» y dejás siempre un próximo paso con fecha.
12. Si más adelante hay una oportunidad distinta, iniciás otra gestión en el mismo negocio. No creás un duplicado.

**Qué queda al terminar:** Un negocio, sus personas, dos propuestas distintas y una historia comprensible de compromisos, resultados y próximos pasos.

**Ejemplo:**

- Si no responde: anotá «No respondió» y agendá cuándo retomar.
- Si rechaza la oferta: cerrá esa gestión como perdida con un motivo real; la fecha de recontacto es opcional.
- Si pide no recibir contactos: anotá «Pidió no ser contactado» y respetá el bloqueo.

**Tené en cuenta:**

- Este ejemplo es orientativo. No cargues datos ficticios en producción para practicar sin acordarlo con el administrador.

**Dónde ir:** Ir a Negocios (/accounts)

## Resolver dudas y errores

Elegí el problema y revisá el siguiente paso antes de volver a intentar.

### Falta un canal o alguien pidió no contactar

**Cuándo usarlo:** Cuando faltan teléfono o email, o el CRM bloquea la comunicación.

1. Revisá la persona y el canal. Si el dato falta, tocá «Agregar o editar teléfono o email» y cargá el dato real; no uses el canal de otra persona. Si no hay una persona con ese canal, podés usar el canal general del negocio.
2. Si el CRM muestra una restricción, fijate cuál es. Puede ser un bloqueo del negocio entero o una restricción técnica de una persona o canal.
3. Si una persona pidió que no la contacten, anotá «Pidió no ser contactado» con «Anotar lo que pasó» desde el negocio. Lo puede hacer el responsable del negocio, el responsable de una de sus gestiones o un administrador; si no te corresponde, avisale a alguno de ellos. El bloqueo alcanza a todas las salidas del negocio y cancela sus tareas pendientes.
4. No cambies de persona, de canal ni de propósito para esquivar el bloqueo. Solo un administrador puede levantar No contactar y tiene que explicar el motivo.
5. Si al contactar a una persona aparece el aviso «Este teléfono es de un negocio que pidió no ser contactado», es que ese número también pertenece a un negocio No contactar. Podés seguir, pero no uses ese teléfono sin consultar a un administrador.
6. Una falla permanente comprobable puede restringir técnicamente un dato de destino. Las fallas temporales no deberían bloquear el canal.

**Qué queda al terminar:** Se actualiza el dato real o se respeta el bloqueo.

**Tené en cuenta:**

- Que no haya canal disponible no significa siempre que falten datos: puede haber una restricción o una verificación en curso.

### No puedo modificar un negocio

**Cuándo usarlo:** Cuando ves un negocio pero no aparecen los botones para editarlo o contactarlo.

1. Si el negocio está marcado «No contactar», para quien no es administrador queda solo para consultar: no puede editar ni contactar, aunque sea responsable. Si está «Negocio archivado», su responsable puede consultar la ficha y la gestión en modo de solo lectura; solo un administrador puede cambiarlo o desarchivarlo.
2. Si no hay cartel, aparece el aviso «Podés consultar este negocio». Significa que el negocio es de otra persona: solo su responsable o un administrador puede modificarlo. En un negocio No contactar, solo un administrador puede modificarlo.
3. Si tenés una gestión abierta en un negocio ajeno, activo y que no está marcado No contactar, podés corregir teléfono, email, WhatsApp y personas con «Corregir datos de contacto». Lo demás sigue siendo del responsable.
4. Si buscás un negocio tuyo que archivaron, apretá Ctrl+K y escribí su nombre: los archivados aparecen marcados como Archivado (el administrador ve todos).
5. Para cambiar algo que no te corresponde, pedíselo al responsable o al administrador. No dupliques el negocio ni la tarea para saltear esa regla.

**Qué queda al terminar:** Sabés quién puede cambiar cada cosa y a quién pedírselo.

**Ejemplo:**

- Leíste en la ficha que el teléfono de recepción cambió. Tenés una gestión abierta con ese negocio: corregilo con «Corregir datos de contacto» y el cambio queda registrado.

**Tené en cuenta:**

- Leer un negocio nunca da permiso de modificarlo, de mandarle mensajes ni de administrar su gestión.

### No encuentro una tarea o no puedo editar

**Cuándo usarlo:** Cuando falta una tarea en la lista o no aparecen botones de edición.

1. Abrí «Hoy» → «Filtros de trabajo». Revisá localidad, rubro y de quién es el trabajo que ves. Ver «Todo el equipo» es una opción del administrador.
2. Revisá «Vencidas», «Para hoy» y «Próximas acciones». La tarea puede tener otra fecha de la que recordabas.
3. Abrí el negocio o la gestión y mirá «Tareas pendientes». Comprobá si la tarea está pendiente, realizada o cancelada.
4. Revisá el responsable. Si no tenés permiso, consultá al responsable o al administrador; no dupliques la tarea para saltear esa asignación.
5. Si los datos parecen viejos, tocá «Actualizar».

**Qué queda al terminar:** Podés ubicar el compromiso y saber quién debe encargarse.

**Tené en cuenta:**

- Actualizar no guarda formularios ni envía mensajes. Revisá sus tareas pendientes en Hoy antes o después de archivar.

### Me equivoqué, hay cambios sin guardar o un envío incierto

**Cuándo usarlo:** Cuando necesitás corregir un dato o comprobar qué se guardó.

1. Antes de guardar un formulario, corregí el dato. Si hay cambios sin guardar, elegí volver al formulario o descartarlos.
2. Para corregir un resultado ya anotado, abrí el menú de su tarea completada y tocá «Corregir cómo salió». Para una respuesta recibida, usá «Corregir respuesta» y escribí el motivo. El historial conserva el valor anterior, quién lo cambió y cuándo.
3. Si un envío de email o WhatsApp quedó sin confirmar, confirmalo como enviado o no enviado solo cuando puedas verificarlo. No lo reenvíes automáticamente.
4. El texto de un intento sin confirmar no se sobrescribe. Si el mensaje tiene que cambiar, creá otro intento y conservá el anterior.
5. Para un acuerdo ganado, usá «Revisar acuerdo y entrega». No marques algo como hecho para sacar una tarea vencida: anotá el resultado real o tocá «Ya no hace falta» en lo que ya no corresponde.
6. Si cargaste una tarea por error, abrí su menú y tocá «Borrar (cargada por error)».

**Qué queda al terminar:** La corrección usa la acción adecuada y conserva el historial.

**Tené en cuenta:**

- Corregir una respuesta «Pidió no ser contactado» puede levantar el bloqueo después de una confirmación explícita.

### Archivar, restaurar y usar la Papelera

**Cuándo usarlo:** Cuando querés sacar algo de la vista habitual sin confundir negocio y gestión.

1. Archivar es para un negocio válido que dejás de trabajar por ahora: lo oculta de la lista activa y conserva sus personas, gestiones, tareas e historial. Se hace con «Archivar negocio válido».
2. Solo un administrador puede desarchivar. El negocio vuelve a Revisado si ya había sido verificado y, si no, a Nuevo. Los archivados se consultan en «Negocios archivados».
3. Enviar un negocio a la Papelera es para un registro inválido o cargado por error. Se oculta de las listas, conserva sus datos y su historial, y solo un administrador puede restaurarlo.
4. Enviar una gestión a la Papelera es una acción distinta del estado del negocio. Fijate bien cuál de las dos estás eliminando.
5. Antes de fusionar o retirar duplicados, compará ciudad, canales, personas, gestiones e historial y pedile al administrador que evalúe la fusión.

**Qué queda al terminar:** Elegís Archivar para conservar un negocio válido que no se trabaja ahora, o la Papelera para apartar un registro inválido. Las dos conservan el historial y tienen recuperación por un administrador.

**Tené en cuenta:**

- No contactar también impide las salidas, aunque el negocio no esté archivado ni en la Papelera.
- Archivar no significa que una gestión esté perdida ni que el cliente se haya ido.

## Administrar el CRM

Opciones del administrador para dar acceso, mantener catálogos y revisar datos.

### Qué configurar y dónde

**Cuándo usarlo:** Cuando el equipo necesita modificar accesos u opciones compartidas.

1. En el menú «Administración» entrá en «Configuración». Ahí están «Usuarios», «Redistribución», «Clasificaciones», «Proceso comercial», «Comunicación» y «Sistema».
2. En «Usuarios» agregás gente con «Agregar usuario» y revisás sus datos y su remitente.
3. «Clasificaciones» administra datos descriptivos como verticales, subtipos y ciudades.
4. El Estado del negocio, las marcas Es cliente / No contactar / Derivado a Leandro, y las etapas y motivos de las gestiones son catálogos fijos del producto.
5. «Proceso comercial» tiene «Etapas y resultados» y «Tareas y seguimiento», donde se administran los tipos de tarea, su presencia en el calendario y otras reglas de trabajo.
6. «Comunicación» configura el envío global de email. «Modelos de mensajes» administra los modelos compartidos y «Biblioteca» los materiales comunes.
7. Los cambios de configuración no corrigen la información histórica. Revisá con cuidado los datos afectados antes de hacer un cambio masivo.

**Qué queda al terminar:** Las opciones compartidas quedan en la sección que corresponde. Cambiar de sección no modifica datos.

**Tené en cuenta:**

- Las etapas de las gestiones no se configuran libremente: dependen del tipo de gestión.

**Dónde ir:** Abrir Configuración (/settings)

### Administrar modelos de comunicación y biblioteca

**Cuándo usarlo:** Cuando el equipo necesita materiales comunes para ofrecer.

1. Solo los administradores crean, editan, duplican, publican, desactivan o reactivan modelos compartidos. Los modelos pueden ser para email, WhatsApp, redes sociales u otros canales; no para llamadas.
2. Al crear o guardar un modelo queda disponible enseguida. Los cambios se aplican a los usos nuevos; los borradores que ya copiaron texto no cambian.
3. Clasificá el modelo por canal y, cuando corresponda, vertical o tipo de gestión. Se muestran todos los que aplican, primero los más específicos, y los genéricos siguen disponibles.
4. Usá solo variables confiables del CRM. Quien prepara un contacto tiene que completar o quitar cada variable que falte antes de abrir o enviar el mensaje.
5. El historial conserva las versiones anteriores y un administrador puede consultarlas o restaurarlas. Desactivar oculta un modelo para usos nuevos sin borrar su historial; también puede editarse y reactivarse.
6. En «Biblioteca» agregá documentos o recursos, revisá su contenido y aprobá la versión cuando esté lista. Vincular un recurso a un negocio o una gestión no lo envía.

**Qué queda al terminar:** El equipo dispone de modelos y recursos revisados, con sus versiones e historia.

**Tené en cuenta:**

- Los usuarios pueden editar su mensaje para ese contacto, pero no alterar el modelo compartido.

**Dónde ir:** Administrar Biblioteca (/settings?section=library)

### Importaciones, duplicados e indicadores

**Cuándo usarlo:** Cuando necesitás organizar datos o revisar la operación del equipo.

1. «Importar CSV» carga negocios; no inicia gestiones, no crea tareas ni contacta a nadie. Los negocios importados empiezan como Nuevo y hay que revisarlos.
2. Revisá que cada negocio exista y corresponda al registro. Marcá Revisado cuando la comprobación esté hecha; los inválidos van a la Papelera según los permisos disponibles.
3. Para duplicados usá «Buscar duplicados» y compará ciudad, canales, personas, gestiones e historial antes de decidir una fusión.
4. En «Historial del negocio» revisá de dónde vienen los datos y su calidad. Usá «Estadísticas» como apoyo y contrastá los indicadores con los registros reales.
5. Antes de cualquier cambio masivo, revisá todos los negocios afectados y confirmá solo si representa la decisión del equipo.

**Qué queda al terminar:** Los cambios se apoyan en registros identificados, sin reemplazar la revisión de cada caso.

**Tené en cuenta:**

- Una gestión se crea con una acción explícita, después de verificar el negocio. Los indicadores del CRM no acreditan pagos del portal turístico.

**Dónde ir:** Revisar Negocios (/accounts)
