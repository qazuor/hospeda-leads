# Auditoría del flujo comercial del CRM

Fecha: 19/10/2026. Alcance: código local de `staging` en `6cc6bb2`, documentación de producto y recorridos de alta, revisión, gestión, comunicación, tareas, cierres y reactivación. Revisión estática de cliente, API y migraciones; no se ejecutaron escrituras en base ni pruebas visuales interactivas.

## Resumen ejecutivo

El modelo tiene una base coherente: negocio, persona y gestión son entidades distintas; crear un negocio no inicia una venta; puede haber varias gestiones; los cierres y contactos dejan historial; los estados del negocio se derivan en parte de las gestiones; Papelera y Archivado son diferentes.

La principal dificultad de uso es que el trabajo comercial está distribuido entre ficha, panel de gestiones, pipeline, Contactar, Mensajes/Historial, tareas, Mi día, Agenda y Reactivación. Hay rutas que permiten empezar bien y explican la decisión, pero otras muestran acciones que fallan en servidor o presentan opciones incompatibles. Los cuatro hallazgos P0 ya están corregidos en esta rama; falta un recorrido integrado en navegador.

## Hallazgos priorizados

### P0 — Corregir antes de usar como proceso estándar

1. **[CORREGIDO 19/10/2026] Reactivación no respetaba los tipos de gestión.** El formulario ahora ofrece solo etapas abiertas y activas del tipo de la gestión original, y selecciona la primera opción válida. La API vuelve a validar el tipo antes de reabrir/crear y conserva `management_type` al crear una nueva gestión vinculada. También se excluye “Derivada a Leandro” de este selector porque requiere el flujo especial de asignación. Cubierto por `src/helpers/reactivation.spec.ts` (4 pruebas); falta ejecutar un recorrido integrado con datos de prueba.

2. **[CORREGIDO 19/10/2026] Reactivación ofrecía “Reabrir” a usuarios no administradores.** La opción aparece deshabilitada y aclara que requiere admin; el diálogo explica que aún se puede crear seguimiento o iniciar otra gestión del mismo tipo. La API también rechaza explícitamente la reapertura para cualquier rol que no sea admin, antes de actualizar la etapa.

3. **[CORREGIDO 19/10/2026] Cierre “Pidió no ser contactado” permitía elegir “Definir fecha para retomar”.** Al seleccionar ese motivo, el formulario ahora oculta la fecha, limpia una fecha marcada previamente y explica que el negocio quedará Archivado y No contactar. El envío también omite la fecha como segunda barrera; la validación existente de la API se conserva.

4. **[CORREGIDO 19/10/2026] Controles de etapa aparecían habilitados a usuarios sin permiso para editar.** El tablero y el detalle ahora basan el botón en `canModify`, calculado por el servidor con `canModifyManagement`; los usuarios sin permiso ven el botón deshabilitado con una explicación. El detalle muestra quién es el responsable de la gestión. La API conserva su control de autorización al guardar.

### P1 — Simplificar y hacer consistente el trabajo diario

5. **Hay varios puntos de entrada para el mismo trabajo.** Un negocio se abre desde lista, búsqueda/Command Palette, tarea, pipeline o historial; iniciar gestión está en detalle y en el flujo Contactar; Email/WhatsApp se preparan desde Contactar y también desde tareas; la llamada y otros canales se registran en Comunicación. No hay una sola bandeja que guíe de inicio a cierre. **Impacto:** novatos no saben dónde empezar ni si ya registraron la acción. **Recomendación:** capacitar con un camino principal: Mi día → tarea; si aún no existe, Negocios → ficha → Contactar o Iniciar gestión; luego registrar resultado en la misma ficha/gestión. Tratar búsqueda y pipeline como accesos alternativos, no como procesos distintos.

6. **“Contactar” no cubre visualmente todos los canales acordados en el producto.** El diálogo de contacto desde ficha ofrece Email y WhatsApp. Llamadas, redes sociales y Otros se registran desde Comunicación (`src/components/CommunicationPanel.tsx` y formulario manual), o desde tareas. **Impacto:** el usuario puede interpretar que no existe una opción para llamar o que registrar una llamada es lo mismo que iniciar una. **Recomendación:** llevar todos los canales a un selector de Contactar que derive a preparación de mensaje o registro manual, manteniendo clara la diferencia entre preparar y confirmar.

7. **Convertir a cliente tiene un camino manual que compite con el cierre ganado.** Además de la conversión automática al cerrar una gestión de Verticales principales/Partners, la ficha tiene “Convertir a cliente” (`src/components/CommercialPanel.tsx:82`; envío en `src/components/CommercialEditor.tsx:74`). Esa acción no exige que exista una gestión ganada. Puede ser correcta para relaciones preexistentes, pero su uso no está guiado junto al proceso comercial. **Impacto:** riesgo de marcar un prospecto cliente sin dejar el cierre correspondiente. **Recomendación:** explicar la excepción con claridad y dejar el cierre ganado como camino normal; considerar mover la conversión manual a una acción administrativa o etiquetarla como corrección de datos/cliente previo.

8. **“Revisado” tiene distintas rutas de confirmación.** Se puede cambiar desde la columna/detalle y se puede confirmar al iniciar gestión desde un negocio Nuevo (`src/components/CommercialEditor.tsx:71,82`). La segunda es útil porque resuelve el bloqueo dentro del flujo. **Impacto:** dos acciones similares pueden dar dudas sobre cuál usar. **Recomendación:** enseñar: revisar precargados por columna Revisados; si el vendedor ya comprobó el negocio al iniciar una gestión, confirmar en ese formulario y seguir sin salir.

9. **El estado del negocio, el estado Revisados y la etapa de gestión se muestran juntos.** Es coherente para retrocompatibilidad, pero se puede leer “Revisado” como etapa de venta. En la lista, “Revisados” se deriva del estado del negocio; el estado visible de cada gestión es otra dimensión. **Impacto:** el usuario puede intentar “avanzar” el negocio con una etapa de gestión o pensar que Revisado implica contacto. **Recomendación:** mantener etiquetas explícitas (“Revisados” del negocio; “Etapa” de cada gestión) y explicar que Revisado solo indica que el registro fue verificado.

10. **El formulario para una gestión nueva tiene conceptos comerciales sin una ruta formativa integrada.** El editor pide tipo, nombre, contacto principal, interés y fecha estimada; explica que empieza en Por contactar y ofrece el caso de negocio Nuevo en el mismo diálogo (`src/components/CommercialEditor.tsx:80–94`). **Impacto:** alguien sin experiencia puede confundir negocio/gestión, o pensar que guardar ya contactó al comercio. **Recomendación:** pedir primero un nombre simple de gestión (“Plan de alojamiento 2027”) y responsable; diferir datos opcionales y dar ejemplos por tipo. El texto “Guardar inicia la gestión; no registra contacto ni envío” es valioso y debe conservarse.

11. **Seguimientos se pueden crear en varias áreas y completar no necesariamente cambia la etapa.** Se planifican desde Mi día, detalle del negocio/gestión, siguiente paso y otros editores. Registrar resultado es una acción diferente de mover la etapa; completar una tarea guarda actividad y no cierra por sí solo otras tareas. **Impacto:** el vendedor puede creer que terminar una tarea cerró la gestión o duplicar el próximo paso. **Recomendación:** cada capacitación debe enfatizar “tarea = algo pendiente con fecha; actividad = algo que ya ocurrió; etapa = situación de la gestión”, y revisar tareas abiertas antes de crear otra.

12. **Vistas de Reactivación mezclan “planificar” y “retomar” en la misma acción.** El botón “Planificar” abre opciones para hacer solo seguimiento, reabrir o crear otra gestión. El subtítulo habla de gestiones perdidas con fecha aunque también se listan casos sin seguimiento según el filtro. **Impacto:** “Planificar” no anticipa la decisión que pide el siguiente diálogo. **Recomendación:** renombrar a “Elegir cómo retomar” o separar acciones; mostrar en la fila la fecha acordada y el estado de la tarea de forma más evidente.

### P2 — Aclarar reglas y mejorar presentación

13. **El seguimiento de recontacto puede aparecer en dos lugares.** Cerrar una gestión con fecha crea una tarea y, si no quedan otras gestiones abiertas, actualiza el estado del negocio a Recontactar con fecha. La tarea es accionable y la fecha del negocio sirve como referencia. **Impacto:** posible duplicación mental (dos registros de la misma fecha) aunque no sean dos tareas. **Recomendación:** presentar el estado/fecha como resumen de la tarea generada, con enlace directo, y explicar que la tarea es lo que hay que completar.

14. **Archivar y enviar a Papelera tienen nombres que un novato puede confundir.** Eliminar envía a Papelera y requiere restauración administrativa; Archivar conserva datos y oculta el negocio, también con reglas administrativas para desarchivar. La ficha sí distingue ambos en sus descripciones (`src/components/CommercialEditor.tsx:80`). **Recomendación visual:** usar verbos y confirmaciones con consecuencias (“Archivar: conservar y dejar de trabajar”; “Enviar a Papelera: registro inválido, solo admin restaura”), sin ponerlos como acciones equivalentes.

15. **La estructura de pantallas exige recordar dónde ocurre cada acción.** Historial, Comunicación, Tareas, Gestiones y Datos del negocio están en secciones distintas. Los flujos de Email/WhatsApp terminan en estados de envío/confirmación; los canales manuales tienen intento pendiente que después se completa. **Recomendación visual:** mostrar en la cabecera del negocio un resumen “último contacto / próxima tarea / gestión abierta”, y en cada gestión un siguiente paso prominente, con acciones de completar o registrar siempre al lado de la actividad.

16. **Responsable del negocio y responsable de la gestión son permisos distintos.** El editor lo explica (`src/components/CommercialEditor.tsx:94`), pero esta diferencia no es visible en todos los puntos de entrada. **Recomendación:** mostrar responsables con etiquetas “Relación del negocio” y “Responsable de esta gestión”, especialmente en Contactar, pipeline y asignación de tareas.

## Camino recomendado para enseñar hoy

1. Buscar el negocio antes de crearlo. Revisar nombre, ciudad y canales para evitar duplicados.
2. Si es precargado, comprobar existencia y correspondencia. Marcar **Revisados** solo cuando sea válido; si es inválido, enviarlo a Papelera con motivo; si falta verificar, dejarlo Nuevo.
3. Abrir ficha y elegir **Contactar** para verificación/general o **Iniciar gestión** cuando ya se va a trabajar una propuesta. Si sigue Nuevo, se puede confirmar Revisado dentro del formulario de gestión si ya fue verificado.
4. Elegir tipo correcto de gestión. Un negocio puede tener varias gestiones distintas. Guardar una gestión no significa que se haya contactado.
5. Registrar cada compromiso como tarea con fecha y cada acción ya ocurrida como actividad. Usar Mi día para pendientes.
6. Contactar desde una gestión abierta cuando el contacto corresponde a esa propuesta; usar General con propósito cuando no pertenece a una gestión. Antes de enviar, revisar destinatario/canal/mensaje.
7. Actualizar etapa cuando cambie la situación real. Se pueden saltar etapas abiertas. Cerrar con motivo obligatorio y nota si se elige Otro.
8. Ganada: cerrar como ganada. En verticales principales y Partners eso marca Cliente; el acompañamiento de ficha se abre luego como gestión separada. Registrar entrega cuando ocurra; una fecha acordada no demuestra entrega ni pago.
9. Perdida: registrar motivo. Si se acuerda volver más adelante, fijar fecha para crear seguimiento. Si pidió no ser contactado, registrar el bloqueo y no programar recontacto.
10. Para retomar, usar la tarea generada o Reactivación. Las etapas disponibles corresponden al tipo original; reapertura de la misma gestión solo para administradores.

## Límites de esta auditoría

- Los hallazgos P0 1–4 se corrigieron en código. Hay pruebas unitarias para la selección de etapas y rol; para 3 y 4 pasaron typecheck, pruebas de permisos/Reactivación y build. No se ejecutaron mutaciones contra una base; la verificación integrada de los recorridos sigue pendiente.
- No se realizó un recorrido visual real con Chrome, viewport móvil/desktop, temas claros/oscuros ni usuarios principiantes. Los puntos P2 visuales son revisión de estructura y copy, no resultados de test de usabilidad.
- El corte corresponde a `staging`; no confirma que `main` o producción tengan el mismo código.
- La guía en Markdown y el contenido del CRM se actualizaron para describir las opciones corregidas. Sigue pendiente reproducir el recorrido completo con datos de prueba.
