# Segunda auditoría de usabilidad de Hospeda CRM

Fecha: 2 de octubre de 2026. Alcance: revisión de la aplicación publicada y del código correspondiente a la segunda entrega de mejoras. Esta auditoría no implementa cambios ni modifica registros de producción.

## Diagnóstico

Las entregas anteriores mejoraron seguridad de operaciones, navegación, accesibilidad básica y explicación de funciones. Sin embargo, la aplicación todavía exige que el usuario organice mentalmente el trabajo: elegir una entidad, buscar la tarea, elegir una herramienta, registrar lo ocurrido y decidir dónde continuar. Agregar explicaciones no resuelve esa carga.

La siguiente entrega debe presentar el trabajo en su contexto: **qué pasó, qué corresponde hacer ahora y qué ocurrirá al confirmar**. Una acción principal por contexto; funciones completas mediante opciones secundarias. El usuario principiante no debería necesitar comprender la estructura interna del CRM.

## Evidencia y cambios propuestos

| Prioridad | Hallazgo | Consecuencia | Cambio |
| --- | --- | --- | --- |
| Alta | Mi día distribuye el espacio entre vencidas, hoy y próximas aunque dos grupos estén vacíos. | El trabajo real ocupa una fracción de la pantalla. | Una lista ordenada: atrasadas y hoy primero; próximas plegadas; vacíos compactos. |
| Alta | Una tarea ofrece Registrar qué pasó antes de Contactar. | El usuario debe deducir el orden de trabajo. | Acción principal según contexto; contacto → resultado → próximo paso en un mismo espacio. Mantener registro retrospectivo como opción secundaria. |
| Alta | Registrar una tarea de acompañamiento ofrece Mostró interés y No quiere avanzar. | Resultados comerciales se aplican a una relación posterior a la venta. | Formularios según propósito: contacto comercial, entrega, acompañamiento o reactivación. |
| Alta | El formulario de resultado empieza enfocando fecha/hora. | Lo administrativo precede a lo importante. | Primero Qué pasó; fecha Hoy predeterminada y modificación secundaria. |
| Alta | Programar el próximo paso es una casilla opcional y genérica. | Puede terminarse una tarea sin decidir cómo continúa el trabajo. | Preguntar Qué hacemos después: acción con fecha, esperar hasta una fecha o terminar por ahora. Sin crear tareas automáticamente sin confirmación. |
| Alta | El negocio muestra datos genéricos vacíos en posición destacada pese a tener una persona con email. | Parece que faltan datos útiles para contactar. | Encabezado con persona principal y canales disponibles; datos generales dentro de información adicional. |
| Alta | Qué hacemos después aparece debajo de otros bloques del negocio. | El próximo paso queda fuera del primer vistazo. | Tarjeta Ahora corresponde inmediatamente debajo del encabezado. |
| Alta | Una venta ganada conserva Cómo avanzar con esta venta y sus cuatro etapas comerciales. | La pantalla no refleja que el objetivo ya se logró. | Sustituir el contenido principal por acuerdo, entrega y acompañamiento. |
| Alta | La venta ganada dice que no hay próxima tarea, aunque existe acompañamiento general del negocio. | El seguimiento queda fragmentado. | Mostrar trabajo relevante del negocio, indicando claramente si pertenece a esta venta o al acompañamiento general. |
| Alta | La cabecera de venta muestra WhatsApp y Email por callbacks disponibles, sin resolver primero el canal real. | Ofrece acciones potencialmente imposibles. | Unificar resolución de persona, canal y restricciones con el flujo de tareas. |
| Alta | El cierre se registra dentro de una transición; el servidor rechaza transiciones a la etapa actual. | No hay una ruta equivalente para completar o corregir el acuerdo de una venta ya ganada. | Editar datos de cierre de forma independiente, con historial; sin reabrir la venta ni acreditar pagos. |
| Alta | En Negocios, Estado puede mostrar Ganada · Perdida por dos ventas diferentes. | Confunde el estado del negocio con el de sus propuestas. | Separar relación con el negocio, ventas y próximo trabajo. |
| Alta, a verificar | Una fila muestra próxima acción Hoy mientras el indicador Para hoy muestra 0. | Los números no permiten confiar en la pantalla. | Reproducir con mismo alcance, fecha y zona horaria; centralizar cálculo y definición de métricas. No se ha identificado todavía la causa exacta. |
| Media | Negocios acumula seis indicadores, ayuda, filtros, vistas, buscador y herramientas antes de las filas. | La información útil empieza demasiado abajo. | Buscador y listado primero; resumen compacto; filtros y vistas avanzadas bajo demanda. |
| Media | Editar oportunidad es la acción destacada de una venta; Cerrar significa salir de la pantalla. | La prioridad no coincide con trabajar y la palabra Cerrar es ambigua. | Acción contextual principal y enlace Volver a ventas; edición secundaria. |
| Media | Archivar se muestra junto a Editar negocio. | Una acción ocasional compite con las frecuentes. | Más acciones, con explicación y recuperación accesible. |
| Media | El contacto general abre email nativo y el contacto desde venta puede usar el editor interno. | Un mismo objetivo sigue caminos diferentes. | Presentar una entrada coherente; explicar editor interno o aplicación externa sin ocultar diferencias de capacidad. |

## Pantallas propuestas

### Mi día

Encabezado: Mi día, fecha y alcance visible (Mi trabajo / Equipo, según permisos). Después, la lista de trabajo. Cada elemento contiene negocio, propósito, persona, fecha y una sola acción destacada. Por ejemplo: “Revisar si recibió el material — hoy — Contactar a la persona”.

Responsable, localidad y rubro quedan en Filtros. Nueva tarea pasa a Agregar próximo paso, secundaria cuando existen tareas. Sin trabajo pendiente: explicar el alcance y ofrecer revisar negocios sin próximo paso; no afirmar que toda la cartera está atendida si sólo se consultó un subconjunto.

### Negocios

Encabezado breve, Agregar negocio, buscador y filas. Cada fila responde: quién es, con quién hablamos, cómo está la relación y qué sigue. Columnas iniciales: Negocio, Persona, Relación, Próximo paso. Ventas y datos adicionales disponibles mediante vista avanzada.

No usar Pendientes como término que mezcle negocios sin ventas, ventas abiertas y tareas. Mostrar métricas nombradas por entidad. Suscriptos históricos pertenece a información histórica o informes, no al espacio prioritario de trabajo diario.

### Ficha del negocio

Orden: identidad y persona → Ahora corresponde → ventas activas/acompañamiento → información adicional e historial. El encabezado no debe llenarse de campos vacíos. Si no hay contacto permitido, la acción principal es Agregar persona de contacto. Si hay una tarea vigente, continuar esa tarea. Si hay varias ventas, indicar cuál se está trabajando; no elegir silenciosamente.

### Espacio de trabajo

Una misma superficie conserva negocio, venta, persona y propósito durante tres momentos: contactar, registrar resultado y decidir continuación. No repetir búsqueda o selección ya resuelta. Permitir volver y corregir. Abrir WhatsApp o email no demuestra envío ni contacto efectivo; el registro requiere una confirmación del usuario.

El botón final describe lo que guarda: “Guardar y recordar el jueves”, “Guardar resultado” o “Registrar venta y planificar acompañamiento”. Antes de confirmar, mostrar consecuencias concretas. Si falla, conservar la información introducida.

### Venta

El contenido cambia según estado. Abierta: objetivo actual, evidencia y próximo paso. Ganada: acuerdo, entrega, responsable y acompañamiento. Cerrada sin venta: motivo y posible fecha para retomar. La ayuda sobre el proceso queda disponible, pero no ocupa el centro cuando el usuario ya pasó esa etapa.

Una venta nueva a un cliente existente conserva el historial y el acompañamiento. No obliga a volver al negocio a un estado previo ni altera otras ventas abiertas.

## Estados y caminos

Separar tres dimensiones en datos y textos:

| Dimensión | Ejemplos | No debe confundirse con |
| --- | --- | --- |
| Relación con el negocio | Potencial cliente, cliente, archivado | Ganada o perdida de una propuesta |
| Venta concreta | Abierta, ganada, cerrada sin venta; etapa comercial configurable | Entrega realizada o pago acreditado |
| Trabajo | Falta contacto, acción programada, esperando respuesta, entrega pendiente, acompañamiento | Estado global de toda la relación |

Las etiquetas operativas propuestas deben guardar evidencia o tareas reales. No introducir una segunda clasificación comercial que contradiga las etapas configuradas. El administrador podrá vincular etapas a momentos del recorrido mediante revisión explícita; no migrar históricos por inferencia del nombre.

| Situación | Señal visible | Acción principal | Continuación |
| --- | --- | --- | --- |
| Nuevo negocio, sólo nombre | Falta una persona para contactar | Agregar contacto | Elegir primer contacto o fecha |
| Contacto permitido, sin trabajo planificado | Elegí cuándo hablar | Planificar contacto | Aparece en Mi día |
| Contacto a realizar | Hablar con persona por canal disponible | Contactar | Registrar qué pasó |
| No respondió | Falta respuesta | Elegir cuándo volver a intentar | Recordatorio confirmado |
| Necesidad identificada | Preparar una propuesta | Preparar propuesta | Registrar envío real y fecha para conversar |
| Propuesta enviada | Esperando decisión | Registrar respuesta | Acuerdo, ajuste o cierre sin venta |
| Venta ganada | Venta concretada; entrega pendiente si corresponde | Revisar entrega | Acompañar al cliente |
| Acompañamiento | Consultar cómo le fue | Registrar revisión | Resolver problema, próxima revisión o nueva venta |
| Nueva necesidad del cliente | Nueva venta independiente | Crear venta con contexto heredado | Mantener seguimiento anterior |
| No contactar | Contacto restringido | Revisar información permitida | No sugerir canales bloqueados |

No imponer tareas perpetuas: Terminar por ahora debe ser una decisión explícita y comprensible. Esperar requiere una fecha si se espera que la aplicación recuerde retomarlo. El usuario puede cambiar el responsable con un resumen claro de quién recibirá el trabajo.

## Identidad visual

Mantener la paleta de Hospeda existente, con un papel consistente para cada color. Definir un color principal para acciones, fondos neutros y colores de estado separados. Verde para logros confirmados, ámbar para asuntos que requieren atención, rojo para errores o acciones destructivas. Nunca depender sólo del color: incluir texto e icono.

Jerarquía visual: título de contexto, próximo paso y acción; metadatos después. Menos tarjetas equivalentes y menos bordes anidados. Espaciado y tipografía uniformes, lectura cómoda, controles con etiquetas visibles y zonas de interacción amplias. No convertir cada dato en una insignia ni cada opción en un botón visible.

Reutilizar patrones de lista, ficha, formulario y confirmación en toda la aplicación. Los estados vacíos, de carga, error, falta de permisos y falta de información deben tener mensajes diferentes y una salida posible. El foco de teclado debe entrar en la decisión principal y regresar al origen al cerrar un diálogo.

## Cambios de código necesarios

- Centralizar la resolución del próximo paso: motivo, evidencia, contexto, responsable, canales permitidos y tarea concreta. Reutilizarla en Mi día, Negocios, ficha y venta.
- Revisar las métricas de `src/endpoints/leads_stats_GET.ts` y la proyección de `src/helpers/businessTable.ts` con las mismas reglas de entidad, fechas y alcance.
- Reorganizar `src/components/BusinessSummary.tsx` alrededor del trabajo prioritario.
- Adaptar `src/components/WorkEditor.tsx` al propósito de la actividad; conservar resultados canónicos usados por automatizaciones y distinguirlos de resultados específicos de entrega o acompañamiento.
- Reutilizar la resolución de canales de `src/components/TaskContactDialog.tsx` en `src/components/LeadDetailDialog.tsx` y el flujo de venta.
- Hacer `src/components/SalesJourney.tsx` dependiente del estado comercial y del trabajo relevante del negocio.
- Añadir edición independiente y auditable del cierre en `src/endpoints/pipeline.ts`; precargar el último acuerdo registrado.
- Extraer componentes comunes y eliminar reglas duplicadas gradualmente. No reescribir todo el CRM para cambiar su presentación.

## Orden de implementación

1. Corregir semántica de estados, métricas, canales y cierre editable. Definir una única resolución de próximo paso.
2. Rediseñar Mi día, ficha del negocio y espacio de trabajo completo. Son el núcleo de uso diario.
3. Adaptar ventas abiertas, ganadas y cerradas; conectar entrega, acompañamiento y nueva venta.
4. Simplificar listado, aplicar identidad visual y mantener herramientas completas mediante vistas avanzadas.
5. Actualizar guía con el recorrido real y validar con principiantes, incluyendo personas mayores.

## Criterios de aceptación

- Con un negocio creado sólo con nombre, el usuario encuentra una acción clara para continuar sin conocer el término oportunidad.
- Un contacto que sólo tiene email no ofrece WhatsApp como acción realizable.
- Contactar, registrar resultado y programar continuación mantienen el mismo contexto sin repetir búsquedas.
- Una tarea de acompañamiento presenta resultados de acompañamiento y no cambia por accidente el estado comercial.
- Una venta ganada conduce a entrega/seguimiento y permite corregir el acuerdo sin reabrirla.
- Las tareas generales relevantes se ven desde el cliente y desde la venta, identificadas por su pertenencia.
- Una segunda venta no borra ni reemplaza seguimiento e historial anteriores.
- Listado, ficha y Mi día coinciden en fechas, alcance y cantidades comparables.
- Con teclado, zoom y pantalla pequeña se puede completar el recorrido; errores conservan los datos.
- Los participantes principiantes completan alta, contacto, propuesta, cierre, acompañamiento y nueva venta sin indicaciones del facilitador. Registrar dónde se detienen, errores y ayudas; no afirmar mejoras medidas sin esas sesiones.

## Alcance y límites de la evidencia

La revisión visual y funcional de esta ronda se realizó en producción con sesión administrativa, principalmente en escritorio: Mi día, Negocios, ficha de negocio, venta ganada y diálogos de contacto/resultado. Los diálogos se cerraron sin guardar. El código complementó la revisión del cierre y los cálculos. No se enviaron mensajes ni se cambiaron registros.

No se realizó en esta ronda una nueva prueba completa con rol operativo, lectores de pantalla ni participantes humanos. Las pruebas automatizadas anteriores no sustituyen esa validación. La discrepancia del indicador Para hoy es una observación que exige reproducción antes de atribuirla a un defecto específico. Esta auditoría no afirma cobertura exhaustiva de todos los módulos administrativos.
