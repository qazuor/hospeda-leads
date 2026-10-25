# Historial de desarrollo y operaciones relevantes

Registro de hitos para trasladar el proyecto entre herramientas. No es una transcripción completa del chat ni el journal de usuarios comerciales. Fechas y estados se indican cuando se conocen; para la historia íntegra de código consultar GitHub y los PRs.

## 24 y 25/10/2026 — rediseño visual v1: ficha completa, listas y Hoy

Se mergearon a `staging` las fases 2a, 2b y 2c del rediseño de la ficha (#234, #235, #236). Fase 3a (lista de Negocios: vistas en una fila, filtros rápidos, vista previa al tocar una fila, barra de último contacto, canales con ícono, barra de selección flotante y tarjetas agrupadas en el celular) se mergeó (#237). Fase 3b (tabla de Gestiones: resumen visible, vistas en una fila, filtros rápidos, etapa con pasos y tabla primero) se mergeó (#238). Fase 5 (Hoy: indicadores, dos columnas, filtros visibles, mini calendario y Primeros pasos compacto) se mergeó (#239). Después se mergearon el filtro «Tipo de gestión», «Vencidas»/«Hoy» solo abiertas y el mini calendario con el mes completo (#240). Fase 4 (tablero de Gestiones con columnas de color, tarjetas nuevas, vista previa y acordeón en el celular) se mergeó (#241). Fase 7 (crear y editar en paneles laterales) se mergeó (#242) y con ella la v1 visual quedó completa en `staging`. Nada se desplegó ni pasó a `main`.

## 23/10/2026 — respuestas por email y WhatsApp Web en staging

Se mergearon a `staging` la respuesta a emails en el mismo hilo por SMTP de Brevo (#218), el user script de WhatsApp Web con su lado CRM (#219, #220), la Ayuda paso a paso de ambos canales (#221), los textos de WhatsApp en «Mensajes recibidos» (#222) y la corrección de la metadata del historial en ediciones en lote (#223). El servidor de prueba local quedó en `staging` para la verificación del propietario. No hubo deploy ni escrituras productivas.

## 22 y 23/10/2026 — catálogo de mensajes y emails recibidos en staging

Se mergearon a `staging` el motor de variantes de mensajes (#212), el catálogo nuevo de 33 modelos con la migración 036, que reemplaza los modelos y variables existentes (#213), y la recepción de emails de la spec 83 (#214–#216): un Email Worker de Cloudflare reenvía cada email a Gmail y lo entrega al CRM, que lo asocia al negocio y lo deja para revisar. El 22/10 se verificó con una prueba real que el relay SMTP de Brevo conserva los encabezados de hilo; el 23/10 se probó F1 de punta a punta con emails reales y un servidor local expuesto por túnel. No hubo deploy ni escrituras productivas.

## 14/10/2026 — estados, comunicación y UI integrados en staging

Se creó y aprobó el alcance del [issue #98](https://github.com/qazuor/hospeda-leads/issues/98) para separar estados de negocio y gestión, y preparar la redistribución equitativa de negocios nuevos considerando el trabajo previo. Los PRs #99–#103 se mergearon a `staging` el 14/10. La integración incluye los flujos de estados, auditoría, comunicación, los ajustes visuales del #102 y los cambios locales aprobados. No se hicieron escrituras productivas como parte de esos merges.

## Migración y evolución funcional

El CRM se llevó desde Floot a React/Vite + Hono/PostgreSQL, autohospedado en Coolify. Durante octubre se incorporaron fundación comercial, personas, gestiones independientes, tareas/actividades, Mi día/Agenda, pipeline, objeciones, reactivación, procedencia/importación, comunicación asistida, recursos y permisos. Los detalles de cada entrega permanecen en `docs/crm-roadmap/01-...` a `07-...` y los documentos de UX.

El propietario insistió en que los flujos sean sencillos para vendedores, que crear un negocio no fabrique seguimiento y que los datos técnicos se separen del historial comercial. Se incorporaron recorridos explícitos de contacto, resultados y continuidad.

## UI y prioridades acordadas

- Mantine se eligió como biblioteca común; las rondas sucesivas migraron controles y usaron wrappers/primitivas para evitar correcciones aisladas.
- Los badges de filtros tuvieron una corrección de alcance: editar solamente el valor, conservando campo y operador. Ver documento 32 del roadmap.
- Se implementaron vistas/guardado contextual, búsqueda sin acentos, miniaturas, avisos con acciones, loading y protección de formularios.
- El header móvil cambió a hamburguesa con Drawer. El propietario pidió recorridos reales de diálogos/menús y siguió observando problemas de alineación, badges, vistas, controles y foco. No se considera cerrado el pulido visual.

## 8/10/2026 — limpieza excepcional

Tras auditoría conservadora, respaldo y restauración/ensayo, el propietario autorizó eliminar todas las gestiones artificiales y relacionadas. Operador confirmó commit: 1.602 gestiones eliminadas, 3.532 negocios/asignaciones y 2 contactos conservados. Journal antiguo desvinculado de gestiones y conservado con negocio. Ver [procedimiento](management-cleanup-runbook.md).

## Revisión de modelos y acceso MCP

Se preparó revisión editorial y herramienta manual de modelos. El respaldo posterior recibido el 10/10 confirma 37 modelos totales, sin eliminar los 31 antiguos, con seis altas y uno de prueba inactivo.

Se implementó MCP de solo lectura y el operador provisionó un rol lector. El recorrido real de ChatGPT encontró errores de metadata PKCE, configuración y autorización/Origin. El propietario pospuso esa conexión y la revisión de negocios para fusiones/múltiples verticales. No hay evidencia de una conexión productiva operativa en esta sesión.

## PR #91 — Papelera, Archivo, búsqueda y presentación

[PR #91](https://github.com/qazuor/hospeda-leads/pull/91), merge `7d4fe975021778634590e7c3e91d3b66a640a110`:

- Papelera de negocio diferenciada de gestiones eliminadas y de Archivados; migración 016.
- Búsqueda de entidades desde Ctrl/Cmd+K.
- Ajustes del selector Iniciar gestión y presentación de vistas.

El propietario observó la Papelera vacía: los estados antiguos estaban en gestiones eliminadas, sin recuperar todavía la marca propia del negocio.

## 10/10/2026 — PR #92 y recuperación

[PR #92](https://github.com/qazuor/hospeda-leads/pull/92), merge `75904f4acb6958fa8ca90bee3689f73b4a796275`:

- Historial global consultaba solo el journal heredado. Se unificó la lectura de journals actuales, con IDs por fuente, contexto de negocio, filtros, permisos y búsqueda.
- Migración 017 agregó campos de negocio para conservar origen, referencia, Filtrado y suscripción histórica.
- Ejecutor manual de recuperación con vista previa, huella, control de conflictos/identidad/actividad, transacción, preservación de campos y auditoría.
- CI verde: 93 unitarias, 115 pruebas de navegador, integraciones PostgreSQL 17 y Docker. Es evidencia de ese PR, no un resultado de todos los cambios futuros.

Se recibieron el dump anterior, un export de negocios y luego dump completo actual/vista previa. La comparación comprobó conservación de negocios, responsables, contactos, evidencias, lotes y documento/versiones/vínculos, con nuevos datos en 22 negocios. Los journals conservados tenían 26 ediciones posteriores; el último evento comercial era del 9/10 a las 18:20 Argentina. El journal antiguo terminaba el 6/10, lo que explicaba la pantalla congelada.

Se ensayó la recuperación en copia aislada con motor PostgreSQL embebido, reproduciendo exactamente la huella de la vista previa y comprobando preservación e idempotencia. El operador reportó luego `committed:true`, sin conflictos: 1.600 orígenes, 1.590 referencias, 146 Filtrado, 5 suscripciones históricas y 23 marcas de Papelera con fecha/autor.

La confirmación final de la UI quedó pendiente. No restaurar de nuevo el dump anterior ni repetir la recuperación por clonar el proyecto.

## 10/10/2026 — traspaso a desarrollo local

El propietario pidió continuar desde Codex o Claude Code en su PC y versionar el contexto. Este conjunto incorpora `AGENTS.md`, importación `CLAUDE.md`, estado, decisiones, pendientes, mapa técnico y guía local. La memoria compartida se mantiene mediante Git/documentos; cada herramienta conserva sus conversaciones por separado.

## 12/10/2026 — modelo de estados de negocio y gestiones, trabajo local

En `feat/business-management-state-model` se implementan las decisiones aprobadas en el documento 53 y el plan de migración 55. Se ejecutaron 001–020 y el seed en bases PostgreSQL 17 efímeras; pasaron el test de migración con rollback, las integraciones de gestión/pipeline/estados, 97 pruebas unitarias, typecheck, build y 2 recorridos de estado en navegador. Luego de la indicación del propietario, se conectó la app a `hospeda_crm_replica`, se corrió el preflight de solo lectura y se aplicaron 018–020 únicamente a esa réplica local: se conservaron 3.532 negocios, 146 Filtrados mapeados a Revisado, el Cliente, 25 registros en Papelera y los conteos de journals. Producción sigue intacta. Las pruebas encontraron reglas que se corrigieron: No contactar manual es independiente de Archivado; crear gestión requiere Revisado; Acompañamiento usa `is_client`; y no se escribe un evento de etapa vacío para inserciones sin estado. El seed exige `CRM_TEST_DATABASE=1`, configurado en CI, donde se agregó el test de estado. Los servidores locales están activos en `http://localhost:5173` y API 3001 para revisión visual. No hay CI remoto, commit, PR o deploy confirmado.

## 20 y 21/10/2026 — revisión de UX para vendedores

Tras una auditoría de usabilidad con 16 decisiones del propietario, se implementó en `staging` (PRs #151–#193, más la base de rendimiento y seguridad #114–#149 del 20/10; #131, JWT obligatorio, se integró el 21/10) una renovación del flujo del vendedor: navegación Hoy / Negocios / Gestiones / Ayuda; vocabulario único; un solo diálogo Contactar que termina en «¿Cómo salió?» y «¿Cómo sigue?»; una lista de resultados; Hoy rehecho con primeros pasos; ficha con «Qué pasó» unificado; datos de contacto editables con gestión abierta; Recontactar con fecha que agenda «Volver a contactar»; reglas de No contactar (solo lectura, quién lo registra, avisos y cancelación de tareas); colores por rubro y pasada móvil/accesible. Migraciones 027–031. Los detalles de decisiones están en [decisiones](decisiones.md) y el estado en [estado-desarrollo](estado-desarrollo.md). Todo mergeado en `staging`, sin deploy ni promoción a `main`; falta la verificación visual del propietario.

## 21/10/2026 — seguimientos de la revisión de UX (#195–#201)

Tanda de siete PRs mergeados a `staging` el 21/10: #195 (D4, contacto de acompañamiento en No contactar), #196 (sincronización del recontacto al cerrar una gestión y al cambiar el responsable; decisión del propietario: con fecha queda solo la tarea de la gestión), #197 (marcadores JWT, estabilización de e2e), #198 (diálogos móviles como hoja inferior, teclado, área segura, 44 px), #199 (migraciones 032 y 033, historial compartido, aviso del tope de Hoy), #200 (concurrencia optimista de `task_save`) y #201 (lectura de la gestión para el responsable de un negocio archivado). Cada PR corrió typecheck, `npm test`, build e integración sobre bases descartables. Migraciones 024–033 siguen sin aplicarse en producción; 032 requiere `CREATE` sobre la base para `pg_trgm` (ver [pendientes](pendientes.md)). No hubo deploy ni promoción a `main`, ni verificación visual del propietario. El propietario informó que el healthcheck de Coolify pasó a `/_api/health/ready` (no verificado desde el repo).

## Cómo continuar este registro

Agregar hitos con problema, resultado, PR/commit, validaciones efectivas y estado productivo. No pegar outputs con datos privados, secretos, dumps ni transcripciones completas. Usar enlaces a evidencia pública y conservar evidencia privada en el almacenamiento autorizado del propietario.

## 15/10/2026 — propuesta documental de IA

Se prepararon la épica 61, la spec fundacional 62 y 19 specs hijas 63–81 a partir del inventario seleccionado por el propietario en el documento 60. En refinamiento, el propietario definió chat general y acciones contextuales, acceso para todo usuario autenticado respetando permisos CRM, ficha e historial completos con permiso, registro de prompts y fragmentos específicos en los journals involucrados, límites antes de habilitar, fecha elegida para resumir cambios, informe de cartera con período de 30 días, desglose por responsable y métricas iniciales acordadas, y dictado fuera de la primera etapa. La propuesta sigue sin implementación; falta elegir proveedor/modelo y verificar sus condiciones para datos reales antes de autorizar la conexión real.

Entrega de documentación encadenada hacia `staging`: tracker [PR #107](https://github.com/qazuor/hospeda-leads/pull/107), base [#108](https://github.com/qazuor/hospeda-leads/pull/108), Alta [#109](https://github.com/qazuor/hospeda-leads/pull/109), Media/Exploratoria [#110](https://github.com/qazuor/hospeda-leads/pull/110). Commits de slices: `6467d83`, `793ff01`, `43acb4d`, `d5bf7d6`. Los cuatro PRs se mergearon el 15/10; la implementación de IA sigue pendiente.

## 15/10/2026 — redistribución de responsables de negocios

Por instrucción del propietario, se redistribuyeron 2.460 negocios no filtrados ni eliminados por orden ascendente de ID entre cuatro usuarios con rol `user`, excluyendo a Julián. Los responsables de 356 negocios filtrados o en Papelera se conservaron; cada usuario elegible quedó con 883 negocios. Se registró un evento de auditoría por negocio y no se cambiaron responsables de gestiones. El respaldo y el manifiesto de rollback permanecen fuera de Git.

## 16/10/2026 — ajustes menores de UI

Se abreviaron los badges de Concepción del Uruguay a “C. del Uruguay”, se mantuvieron visibles todas las acciones de negocios en tabla y grilla y se quitó el resaltado de columna al pasar por un encabezado. Typecheck, tests (23 archivos, 110 pruebas), build y `git diff --check` pasaron antes de integrar estos cambios. El build mantiene la advertencia de chunks mayores a 500 kB.

## 19/10/2026 — orientación al crear una gestión (P1 10)

Se simplificó el formulario de gestión nueva: tipo, nombre corto y responsable quedan al frente; ejemplos cambian según el tipo, y tema, fecha y persona principal quedan bajo “Más datos (opcional)”. La ayuda del CRM y las guías quedaron alineadas. Pasaron exportación de la guía, typecheck y `git diff --check`. No hubo pruebas de navegador ni escrituras en base; sigue pendiente revisar visualmente con datos descartables. Cambio local en `staging`, sin commit.

## 19/10/2026 — orientación de tareas y actividades (P1 11)

El planificador de tareas ahora explica la diferencia entre pendiente, actividad realizada y etapa, y muestra hasta cinco tareas pendientes visibles para ese negocio antes de crear otra. Se conserva el aviso de coincidencia exacta para posibles duplicados y el resultado de una tarea sigue sin cambiar etapas automáticamente. Se actualizaron guía de capacitación y ayuda en pantalla. Pasaron exportación, typecheck, build, `git diff --check` y un E2E con API interceptada; no hubo escrituras en base. Cambio local en `staging`, sin commit.

## 19/10/2026 — claridad de Reactivación (P1 12)

La lista y el diálogo usan “Elegir cómo retomar”; cada cierre muestra la fecha acordada y el estado/vencimiento de su tarea o la gestión relacionada. Los cierres con una acción generada muestran el destino y no permiten duplicarla; los filtros distinguen sin acción, con acción y todos. Guía de capacitación y ayuda del CRM sincronizadas. Pasaron typecheck, build, exportación, `git diff --check` y E2E con API interceptada. No se escribió en DB; falta una prueba de consulta sobre base descartable y revisión visual. Cambio local en `staging`, sin commit.

## 19/10/2026 — seguimiento de recontacto como una sola acción (P1 13)

Cuando el negocio quedó en Recontactar por una gestión cerrada con fecha, la fila muestra ese estado y la fecha una sola vez, enlaza directamente la tarea y aclara que esa tarea es el pendiente que se completa. Si el negocio no quedó en ese estado, se muestra la fecha de la tarea; la gestión relacionada conserva su enlace propio. Se actualizaron las guías. Pasaron typecheck, build, exportación de la guía y E2E con API interceptada (Chromium se ejecutó fuera del sandbox). Falta revisar visualmente y probar la consulta sobre una base descartable. No se escribió en base. Cambio local en `staging`, sin commit.

## 19/10/2026 — diferencia entre Archivar y Papelera (P1 14)

El menú del negocio y los tooltips describen los usos distintos: Archivar conserva un negocio válido que deja de trabajarse; Enviar a Papelera aparta un registro inválido. Las confirmaciones detallan visibilidad, datos conservados y restauración administrativa, también para selección masiva. La guía en pantalla, capacitación y manual quedaron alineados. Pasaron typecheck, build, exportación y E2E de acciones con API interceptada en desktop/móvil. No se escribió en base. Falta revisión visual completa. Cambio local en `staging`, sin commit.

## 19/10/2026 — contexto para retomar el trabajo (P1 15)

La ficha muestra en un vistazo la última interacción registrada, la próxima tarea pendiente y las gestiones abiertas; cada dato lleva al contexto relacionado. En la gestión, el bloque del próximo paso incluye la última actividad y conserva junto a la tarea las acciones de Contactar y Registrar qué pasó. Los lectores sin permiso de edición pueden consultar el contexto, pero no reciben acciones de cambio o contacto. Pasaron typecheck, build y E2E con API interceptada en 1280 y 390 px; se revisaron capturas. Sin escrituras en base. Falta validar consultas con base descartable y revisar visualmente el resto de la auditoría. Cambio local en `staging`, sin commit.

## 19/10/2026 — responsables visibles por contexto (P1 16)

Contactar distingue la relación general del negocio de la persona responsable de la gestión; el pipeline muestra ambas en cada tarjeta. La asignación y el diálogo de contacto desde tareas identifican también al responsable de la tarea y explican que delegarla no cambia responsables comerciales ni permisos. No se alteraron reglas de acceso. Pasaron `pnpm run typecheck`, `pnpm run build` y `git diff --check`; no se probó con base ni navegador. Falta revisión visual manual. Cambio local en `staging`, sin commit.

## 23/10/2026 — ficha del negocio con jerarquía visual

A pedido del propietario («no hay jerarquía visual»), la ficha se rehízo en dos PRs. El primero (#230) unificó la escala tipográfica, limitó el historial a 5 eventos con «Ver N más» y compactó datos vacíos y acciones secundarias. El segundo reorganizó encabezado y solapas por tarea. En un negocio sintético con 34 eventos, la solapa por defecto pasó de 9657 px a cerca de 2200 px de alto en escritorio.

## 24/10/2026 — rediseño visual v1, Fase 0

El propietario pidió llevar todo el CRM a una interfaz profesional y fácil de usar, a partir de 28 referencias. Se aprobó un plan de ocho fases solo visual (sin funciones nuevas) y el mockup de sistema de diseño y estructura general. La Fase 0 cambió tokens, tipografía, tonos, badges y jerarquía de botones de forma global, sin tocar layouts ni etiquetas, para mantener bajo el riesgo sobre los e2e.

## 25/10/2026 — user script de WhatsApp probado contra WhatsApp real

Al probar el script con el WhatsApp Business de Hospeda apareció que los selectores se habían escrito sin el DOM real: no leía ningún chat. Se reescribieron con la estructura actual y se probó el registro de punta a punta. En la misma revisión el propietario pidió instalarlo desde el CRM, un panel más prolijo con ajustes globales, el botón en la barra de WhatsApp, tema automático y avisos de actualización. Quedaron aprobadas, con mockups, tres specs siguientes: templates desde WhatsApp, registro automático con reversión e insignias propias en la lista de chats.
