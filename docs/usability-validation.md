# Cambios de usabilidad y validación

Esta entrega implementa la reorganización de navegación, ficha de negocio y venta, acciones guiadas, contacto por canal, cierre y acompañamiento, protección de formularios y guía para principiantes. Se conserva la administración avanzada, los filtros, importación, historial, restricciones, documentos, mensajes y reactivaciones.

## Cobertura de la auditoría

| Problema | Cambio verificable |
| --- | --- |
| Navegación y jerga | Inicio en Mi día; Negocios, Ventas y Agenda como entradas principales; administración y herramientas adicionales en Más opciones. |
| Ficha de negocio dispersa | Resumen con persona principal, última actividad, pendientes del negocio y sus ventas, y tres acciones principales. |
| Ventana de venta sobre otras ventanas | Página `/sales/:leadId`, cinco secciones, datos adicionales desplegables. Los enlaces anteriores siguen funcionando. |
| Crear negocio exige comprender muchos campos | Solo nombre obligatorio, información adicional opcional, resumen con pasos para agregar persona, preparar venta y planificar. |
| Personas y responsables repetidos | Nueva venta propone el contacto principal y el responsable del negocio. Nuevo negocio queda a cargo de quien lo crea. No se reasignan históricos sin decisión explícita. |
| Completar una tarea y olvidar el próximo paso | Resultado tipificado y notas separadas; resultado + próxima tarea se guardan en una transacción. Se conserva la persona y canal efectivamente elegidos. |
| Contactar siempre abre WhatsApp | Selector de persona y canales disponibles para tareas de negocio o venta; bloqueos comprobados antes de mostrar acciones. |
| Etapas cerradas contadas como pendientes | Métricas y filtros rápidos usan Abierta/Ganada/Perdida. Suscripto se identifica como dato histórico distinto. |
| Canales de personas no cuentan | Cobertura incluye teléfonos y emails de contactos. |
| Editar datos simula actividad | Inactividad usa fechas de acciones reales; conversión usa ventas ganadas / propuestas del corte. Los enlaces de estadísticas conservan sus filtros y apuntan a ventas. |
| General del negocio invisible | Resumen y próxima acción en la tabla incluyen tareas generales y actividades del negocio. |
| Negocio desaparece al retirar ventas | Proyección conserva el negocio; archivar tiene acción propia, reversible y auditada. Retirar todas las ventas tiene texto explícito. |
| Pipeline y calendario incompletos | Pipeline consulta todo el conjunto filtrado; sus detalles se consultan en lotes de 100. Calendario consulta el mes completo con rango acotado. |
| Selectores descargan toda la base | Búsqueda de negocio con resultados acotados y datos del contexto elegido; filtros de localidad/tipo usan metadatos completos. |
| Secuencias dependen del texto libre | Resultado estructurado detiene los pasos correspondientes. Las notas no determinan el comportamiento. |
| Convertir cliente detiene otras ventas | Conversión no detiene secuencias de otras ventas abiertas. |
| Reanudar acumula tareas vencidas | Fecha explícita para retomar, desplazamiento de fechas conservando intervalos. |
| Configuración global en cada venta | Editor de secuencias en Configuración → Comunicación; enlace desde la venta. |
| Cambios y borradores perdidos | Guardas en formularios, cierre del mensaje, cambio de sección y recarga. Reutilización de borradores guardados equivalentes y cancelación explícita de borradores manuales. |
| Cierre fragmentado | Venta ganada + cliente opcional + tarea general de acompañamiento en una transacción; otras ventas conservadas. |
| Estados históricos ambiguos | Vista previa de cantidades y clasificación en Configuración. Revisión por caso, sin migración silenciosa ni pagos/cierres inventados. |
| Tablas excesivas | Alta como acción principal; importación y duplicados en Herramientas adicionales. Cinco columnas por defecto, preferencias y búsquedas separadas por negocio/venta, filtros avanzados disponibles. |
| Lectura y manejo difíciles | Controles principales de 44 px, tipografía ampliada, contraste de acciones, foco visible, ajuste para móvil, movimiento reducido. |
| Documentación inexistente para principiantes | `/guide` y `docs/guia-de-uso.md`, ejemplo completo hasta acompañamiento y segunda venta. |
| Carga inicial pesada | Pantallas cargadas bajo demanda; mensaje visible al abrir una pantalla. |
| Actualizar cambia un modo sin avisar | Actualizar carga los datos ahora; actualización automática configurable en un menú separado. |
| Instalación poco reproducible | Lockfile y `npm ci` en README, Docker y CI. |

## Pruebas

- `npm run typecheck`, `npm test` y `npm run build`.
- Migraciones e integración: commercial, work, pipeline, communication, quality y auth.
- `npm run test:usability`: responsable heredado, participantes/canal, rollback de resultado + próxima tarea, 120 eventos mensuales, tablero completo, cierre + cliente + acompañamiento, archivo reversible.
- `tests/browser/usability.e2e.ts`: recorrido por interfaz desde negocio mínimo a segunda venta, contacto con email únicamente, resultados, cierre, móvil, ampliación del 200 %, ausencia de errores de JavaScript y guarda al salir.
- Pruebas existentes de navegador adaptadas a los rótulos y páginas nuevos. Los flujos avanzados siguen siendo parte de CI.

La ejecución local usa datos sintéticos y una base PostgreSQL aislada con PGlite. Las pruebas de CI usan PostgreSQL 17. No se envían mensajes a clientes reales.

## Publicación

La migración 011 agrega resultados estructurados y archivo de negocios; reemplaza las funciones de detención de secuencias. No reescribe estados históricos, ventas, propietarios ni fechas. Aplicar migraciones antes de iniciar el servidor nuevo. Hacer backup con el procedimiento habitual del proyecto antes de cualquier publicación.

## Evaluación con personas

Las verificaciones técnicas no prueban que toda persona mayor pueda usar la app sin ayuda. Antes de declarar la experiencia terminada, probar con personas sin experiencia estos objetivos: crear un negocio, agregar contacto, programar y atender una tarea, cerrar una venta, acompañar y preparar otra propuesta. Registrar dónde piden ayuda, errores, abandonos y tiempo por objetivo. Cada bloqueo observado debe corregirse y repetirse con otra persona. No confundir el recorrido automatizado con esa evaluación humana.

## Segunda entrega: pendientes concretos de la auditoría

- Acción destructiva de venta en menú secundario, con confirmación existente conservada.
- Vista previa completa de cambios masivos, confirmación explícita y detección de datos cambiados entre revisión y aplicación.
- Guía Contacto/Necesidad/Propuesta/Decisión con evidencia y próxima tarea de la venta; tablero opcional por clasificación.
- Acuerdo, persona, material, responsable y fecha de entrega guardados en el historial del cierre; campos desconocidos por confirmar, sin acreditar pago.
- Lectura completa del email con asunto, diseño opcional, logo menor; encabezado de materiales y datos técnicos en detalles.
- Configuración/persistencia de tabla y encabezados extraídos a módulos; componentes de revisión masiva y guía independientes. La refactorización es gradual, no una reescritura completa.
- Estados históricos: decisiones propuestas por caso en Configuración. Reclasificar datos reales exige evaluar su evidencia con el equipo; no se automatiza por el nombre.
- Protocolo reproducible en `docs/prueba-con-principiantes.md`. Sesiones humanas, mediciones reales y revisión completa con lector de pantalla pendientes.

No hay migración nueva: la evidencia del cierre utiliza el historial existente. La vista de email no modifica los borradores guardados; el logo reducido se aplica al generar emails nuevos.
