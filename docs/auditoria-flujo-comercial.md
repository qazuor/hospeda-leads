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

5. **[CORREGIDO 19/10/2026] Hay varios puntos de entrada para el mismo trabajo.** Se definió un único recorrido recomendado para capacitación y ayuda dentro del CRM: Mi día → tarea existente; si no hay tarea, Negocios → ficha → Contactar o Iniciar gestión; luego registrar el resultado en el mismo contexto y dejar el siguiente paso como tarea. Búsqueda global, pipeline e historial se describen como atajos para llegar al mismo trabajo, no como procesos distintos. Los accesos alternativos siguen disponibles.

6. **[CORREGIDO 19/10/2026] “Contactar” no cubría visualmente todos los canales acordados en el producto.** Desde la ficha se pueden elegir Email, WhatsApp, Llamada, Red social u Otro, tanto para contacto general como para una gestión abierta. Email/WhatsApp conservan la preparación de mensaje; los otros canales abren el registro manual con su contexto fijado. La llamada registra el resultado y resumen; redes/Otros crean un intento que puede quedar pendiente hasta completarlo. La ayuda y la guía de capacitación aclaran que abrir una app, copiar texto o iniciar un intento no confirma que hubo contacto. Cubierto por `tests/browser/mantine-contact.e2e.ts` en desktop/móvil y temas claro/oscuro. Las rutas de contacto que nacen desde tareas conservan sus flujos específicos.

7. **[CORREGIDO 19/10/2026] La conversión manual a cliente competía con el cierre ganado sin explicar su excepción.** La acción ahora se llama **Registrar cliente previo**; el diálogo aclara que solo corresponde a una relación comercial anterior al seguimiento en el CRM y dirige las ventas nuevas al cierre ganado de la gestión. El usuario debe describir la relación previa. La guía de capacitación y la ayuda del CRM explican la misma regla.

8. **“Revisado” tiene distintas rutas de confirmación.** Se puede cambiar desde la columna/detalle y se puede confirmar al iniciar gestión desde un negocio Nuevo (`src/components/CommercialEditor.tsx:71,82`). La segunda es útil porque resuelve el bloqueo dentro del flujo. **Impacto:** dos acciones similares pueden dar dudas sobre cuál usar. **Recomendación:** enseñar: revisar precargados por columna Revisados; si el vendedor ya comprobó el negocio al iniciar una gestión, confirmar en ese formulario y seguir sin salir.

9. **El estado del negocio, el estado Revisados y la etapa de gestión se muestran juntos.** Es coherente para retrocompatibilidad, pero se puede leer “Revisado” como etapa de venta. En la lista, “Revisados” se deriva del estado del negocio; el estado visible de cada gestión es otra dimensión. **Impacto:** el usuario puede intentar “avanzar” el negocio con una etapa de gestión o pensar que Revisado implica contacto. **Recomendación:** mantener etiquetas explícitas (“Revisados” del negocio; “Etapa” de cada gestión) y explicar que Revisado solo indica que el registro fue verificado.

10. **[CORREGIDO 19/10/2026] El formulario para una gestión nueva ahora da una ruta simple.** Primero pide tipo y nombre, muestra quién será responsable (el responsable del negocio; admin puede cambiarlo), y deja tema, fecha y persona principal dentro de **Más datos (opcional)**. Incluye ejemplos por tipo y aclara que iniciar la gestión no registra contacto ni envío. La guía de capacitación y la ayuda en pantalla quedaron alineadas. Pasaron typecheck, exportación de la guía y `git diff --check`; no se hizo recorrido de navegador ni se escribieron datos. Falta revisión visual con una base descartable.

11. **[CORREGIDO 19/10/2026] El planificador distingue tareas, actividades y etapas, y ayuda a evitar duplicados.** El formulario muestra la diferencia entre tarea pendiente con fecha, actividad realizada y etapa de gestión; al planificar desde un negocio lista tareas pendientes visibles en ese contexto para revisar antes de crear otra. Se conserva el aviso más estricto para coincidencias de título, tipo, fecha y contexto. La guía de capacitación y la ayuda en pantalla se alinearon; completar una tarea guarda su resultado, no cambia la etapa ni completa otras tareas. Pasaron typecheck, build, `git diff --check` y un E2E con API interceptada que confirma la explicación y lista contextual. No hubo escrituras en base; falta revisión visual con datos descartables.

12. **[CORREGIDO 19/10/2026] Reactivación anticipa las opciones y muestra qué quedó planificado.** La acción ahora se llama **Elegir cómo retomar** tanto en la lista como en el diálogo. Cada fila destaca la fecha acordada, el estado y vencimiento de la tarea, y la gestión vinculada; un cierre que ya generó una acción no permite duplicarla y explica por qué. Los filtros se llaman **Estado de retoma** y separan casos sin acción, con acción y todos. La guía de capacitación y la ayuda en pantalla quedaron alineadas. Pasaron typecheck, build, `git diff --check` y un E2E con API interceptada; no se escribió en la base. Falta verificar la consulta SQL con una base descartable y hacer revisión visual.

### P2 — Aclarar reglas y mejorar presentación

13. **[CORREGIDO 19/10/2026] El seguimiento de recontacto se presenta como una sola acción.** Si el cierre generó una tarea y el negocio quedó en Recontactar, la lista muestra el estado y la fecha una sola vez, explica que esa fecha resume la tarea y ofrece un enlace directo. La tarea queda como el paso accionable para consultar o registrar el resultado; una gestión relacionada se muestra aparte. Las guías de vendedores y la ayuda en pantalla quedaron alineadas. Pasaron typecheck, build, exportación de la guía y un E2E con API interceptada. Falta revisar visualmente.

14. **[CORREGIDO 19/10/2026] Archivar y Enviar a Papelera explican usos y consecuencias distintas.** Los accesos del detalle, los tooltips de la tabla y las confirmaciones individuales/masivas usan verbos claros. Archivar se presenta para un negocio válido que se deja de trabajar; conserva contactos, gestiones, tareas e historial. Enviar a Papelera se presenta para registros inválidos o mal cargados; también conserva los datos, pero bloquea el uso hasta la restauración administrativa. Guía de uso, capacitación y ayuda en pantalla alineadas. Pasó el E2E de acciones con API interceptada en desktop y móvil; falta revisión visual completa.

15. **[CORREGIDO 19/10/2026] La ficha y cada gestión muestran cómo retomar el trabajo.** En la ficha, un resumen reúne la última interacción registrada, la próxima tarea pendiente y las gestiones abiertas, con accesos directos a Seguimiento y a cada gestión. Dentro de cada gestión, “Tu próximo paso” muestra la última actividad registrada junto a la tarea pendiente y sus acciones para contactar o registrar qué pasó. Los lectores sin permiso de edición también ven este contexto, pero no las acciones de edición o contacto. Pasaron typecheck, build y E2E con API interceptada en desktop y móvil; revisión visual de capturas y sin escrituras en la base.

16. **[CORREGIDO 19/10/2026] Responsable del negocio y responsable de la gestión son permisos distintos.** Contactar general y por gestión, las tarjetas del pipeline, el detalle de Contactar desde una tarea y la asignación de tareas ahora identifican por separado “Relación del negocio”, “Responsable de esta gestión” y “Responsable de la tarea”. Las reglas de permisos y asignación no cambiaron. Pasaron typecheck, build y `git diff --check`; queda revisión visual manual.

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

- Los hallazgos P0 1–4 se corrigieron en código. P1 5 y 6 se atendieron en `045ab36`; P1 7 se corrigió en esta rama con prueba unitaria para que el motivo quede visible en el historial. Hay pruebas unitarias para la selección de etapas y rol; para P0 3 y 4 pasaron typecheck, pruebas de permisos/Reactivación y build. Para P1 6 pasó el test de navegador aislado con API interceptada. No se ejecutaron mutaciones contra una base; la prueba comercial de navegador requiere una base local descartable y queda pendiente.
- No se realizó un recorrido visual real con Chrome, viewport móvil/desktop, temas claros/oscuros ni usuarios principiantes. Los puntos P2 visuales son revisión de estructura y copy, no resultados de test de usabilidad.
- El corte corresponde a `staging`; no confirma que `main` o producción tengan el mismo código.
- La guía en Markdown y el contenido del CRM se actualizaron para describir las opciones corregidas. Sigue pendiente reproducir el recorrido completo con datos de prueba.
