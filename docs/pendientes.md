# Pendientes y próximo trabajo

Corte: 14/10/2026. Actualizar al cerrar una tarea. No marcar como pendiente un bloque implementado solo porque un documento histórico aún use ese término.

## Integración visual + estados + Comunicación

La rama `feat/integrate-crm-state-communication-visual` parte de `origin/main` y reúne el PR visual #102, la cadena de estados, sus cambios locales complementarios y el worktree de Comunicación. Está en `/tmp/hospeda-integration`; [PR #103](https://github.com/qazuor/hospeda-leads/pull/103) abierto contra `main`. Los servidores siguen detenidos.

- Typecheck, 110 pruebas unitarias y build pasan. No se ejecutaron E2E ni pruebas de PostgreSQL.
- Próximo: revisar el diff integrado y recorrer desktop/móvil; correr migraciones y pruebas de integración solo sobre una base local descartable.
- La migración 022 elimina únicamente datos atribuibles a secuencias de prueba y aborta ante referencias independientes. Ejecutar primero `pnpm run db:preflight:communication-sequences` con `CRM_TEST_DATABASE=1` y una URL local; revisar su salida antes de aplicar cualquier migración. No se tocaron bases en esta tarea.
- CI del PR en curso; revisar checks, probar navegador y validar migraciones en una base local descartable. No mergear a `main` sin el pedido explícito del propietario.

## En curso: estados y redistribución de negocios

El alcance está aprobado en el [issue #98](https://github.com/qazuor/hospeda-leads/issues/98). PRs [#99](https://github.com/qazuor/hospeda-leads/pull/99)–[#101](https://github.com/qazuor/hospeda-leads/pull/101) están abiertos y con CI verde; ninguno está mergeado. Siguen pendientes los cortes encadenados de API, UI y previsualización/ejecución de la redistribución. La operación productiva no se ha realizado como parte de este cambio.

## Primeros pasos al retomar en una PC

1. Clonar/pull y preparar el entorno local según [desarrollo local](desarrollo-local.md).
2. Verificar HEAD remoto, estado local y PRs abiertos; no trabajar sobre un snapshot viejo.
3. Pedir/obtener observación del deploy real para comprobar los 23 negocios recuperados en Papelera, los atributos recuperados y el Historial global. El operador confirmó el commit, no la visualización final.
4. Continuar el recorrido de UI en una base local sintética. Para datos reales usar únicamente acceso explícitamente configurado; no copiar secretos del VPS al repo.

## Cambio mergeado: revisión de negocios y ayuda

- La UI de `crm_accounts.review_status` está implementada para editar Filtrado/No filtrado, ofrecerlo como columna seleccionable y editable inline en tabla y cards, mostrarlo en detalle y filtrar por el valor. Los badges simples abren una lista compacta de opciones y guardan al seleccionar; Vertical/Subtipo mantiene su editor detallado y varias gestiones requieren elegir el registro antes de modificarlo. Los filtros de usuario incluyen “Usuario autenticado”. La guía anida sus artículos, los expone en la paleta de comandos con búsqueda aproximada e incluye el recorrido de venta y la revisión de negocios precargados. Validación local: `pnpm run typecheck`, `pnpm test` (95 pruebas), `pnpm run build` y los 15 recorridos de navegador afectados aprobados. El CI terminó verde y el PR #95 se mergeó el 11/10/2026. El deploy no queda confirmado por ese merge.

## Reporte estético y próximos ajustes

Se corrigieron tres detalles visuales de alcance acotado:

- **Navegación desktop intermedia (1024–1440 px):** el header podía partir el grupo y dejar “Más opciones” separado; ahora conserva una fila hasta 1100 px y mantiene el menú unido a Agenda cuando necesita dos filas.
- **Accesos horizontales en móvil:** la Guía y las vistas guardadas ahora explican que hay más elementos fuera del área visible y cómo encontrarlos.
- **Mi día y Agenda:** la acción de planificar queda como principal; registrar lo ya realizado queda secundaria, con textos que describen mejor cada acción.

Segunda pasada visual implementada y publicada en el [PR #102](https://github.com/qazuor/hospeda-leads/pull/102); queda pendiente la revisión del PR y la previsualización local:

- **Cards de Negocios:** el responsable largo ahora tiene el ancho de la card y se limita a una sola línea con el valor completo disponible por tooltip.
- **Controles móviles del listado:** se ajustó la jerarquía entre búsqueda, vistas guardadas y filtros aplicados con separadores sutiles; el carril horizontal ya no ocupa espacio con el estado vacío de vistas personales y conserva el cue de desplazamiento.
- **Columnas fijadas:** reciben un tinte de color de acento en desktop, más visible y compatible con las franjas de filas y el tema oscuro.
- **Selección de filas:** la columna de checkbox permanece como primera columna y fija a la izquierda durante el desplazamiento horizontal; el resto de fijaciones izquierdas comienza después de ella.
- **Detalle de negocio:** el próximo paso conserva el tratamiento principal; conversación reciente y otros datos secundarios se leen como bloques separados por divisores, sin una caja adicional.
- **Formularios y jerarquía:** contexto del negocio se presenta aparte en “Preparar gestión”; aumentaron legibilidad y espaciado de campos/ayudas en gestión, modelos y configuración.

Los cambios viven solo en el árbol de trabajo de `feat/visual-polish-ux`; no se hicieron commit ni push. `pnpm run typecheck`, `pnpm run build`, tres pruebas dirigidas con fixtures y `git diff --check` pasaron. Una ejecución de `business-cards.e2e.ts` alcanzó un fallo preexistente de restauración del foco al regresar del detalle; no se modificó ese comportamiento. No se ejecutaron pruebas de navegador que escriben en la base local.

Sigue pendiente tu revisión visual de esta previsualización, en especial decidir si la densidad del panel móvil de vistas se siente mejor y si el detalle queda demasiado abierto en desktop. La prueba con personas principiantes y revisión en tema oscuro completo continúan pendientes.

Evidencia de la primera iteración: screenshots sintéticos de Guía, navegación y vistas en móvil, además de Mi día; pruebas dirigidas en 320, 390, 1024 y 1280 px. Para esta segunda pasada se agregaron screenshots de cards, detalle y preparación de gestión, en móvil y desktop. No equivalen a una revisión completa de todas las rutas, ambos temas ni una prueba con usuarios principiantes.

## Prioridad: pulido visual, con recorridos reales

El propietario sigue detectando detalles pese a varias rondas de mejoras. El primer recorrido debe revisar los puntos que señaló, distinguiendo lo ya corregido de regresiones o casos de contenido no cubiertos:

- Filtrar negocios: texto centrado en Agregar filtro; Quitar búsqueda/Quitar filtro consistentes en iconos, tamaño y separación.
- Tabla y cards: centrado y padding de badges de ciudad, responsable, vertical y estado; datos largos; filas vacías innecesarias; altura de tarjetas.
- Acciones de fila: iconos sin borde decorativo; header Acciones alineado; targets accesibles y menús sin iconos pegados a texto.
- Vistas de Negocios: badges compactos, poco espacio vacío, nombre/selección/acciones y guardado contextual legibles, overflow móvil.
- Filtros aplicados de Negocios: segunda iteración implementada localmente; chips compactos, vista activa adelante y resumen diferencial que omite filtros heredados. Los filtros manuales siguen editables; el nombre completo de la vista se conserva y puede envolver si es largo.
- Edición de vistas personales: ahora se pueden editar los filtros guardados desde Administrar, además del nombre. Queda para revisar visualmente en la previsualización local.
- Administración de vistas: duplicar una vista personal está disponible para todos; convertirla en vista de sistema está disponible solo para admin. La conversión comparte configuración con el equipo y retira el original personal en una transacción; las vistas personalizadas se administran desde Configuración. Implementado y validado localmente; el PR está abierto y falta revisión visual en la previsualización.
- Formulario Iniciar gestión: jerarquía, espacios, contexto del negocio, campos opcionales y footer; conservar creación explícita/idempotencia.
- Foco y controles: borde discreto con contraste suficiente, tamaño compacto sin perder teclado ni targets táctiles.
- Hamburguesa/Drawer móvil, diálogos anidados, dropdowns, tooltips, scroll y restauración de foco.
- Papelera y Archivados: estados vacíos, datos recuperados, detalle/restauración y explicación de la entidad; sin confundir archivo con eliminación.
- Ctrl/Cmd+K: resultados y destinos por entidad, textos largos, sin resultados, loading/error y teclado. No prometer búsqueda en el contenido binario de PDFs.

Recorrer desktop y 320/390px, claro/oscuro, teclado y contenidos largos. Operar los recorridos, no limitarse a screenshots de páginas. Usar componentes/primitivas compartidos. Guardar evidencia de qué se probó; fixtures no prueban todas las combinaciones productivas. Ver [sistema visual](ui-visual-system.md) y `tests/browser/`.

## Reglas comerciales: decisiones pendientes

Implementación/revisión existente: [documento 48](crm-roadmap/48-commercial-rules-review.md). Faltan definiciones del propietario sobre:

1. Evidencia necesaria para aceptación/cierre y campos obligatorios del acuerdo.
2. Si registrar una respuesta espontánea debe proponer completar una tarea seleccionada.
3. Si un delegado puede preparar/enviar mensajes solo para su tarea y con qué restricciones/auditoría.
4. Si habrá registro estructurado de pagos, fuente y responsable de confirmación.

No deducir esas decisiones de etapas históricas. No agregar automatismos de pago/entrega/cierre ni permisos nuevos mientras sigan abiertas.

## Estados de negocio y gestiones

La definición funcional quedó aprobada y está en la [spec 53](crm-roadmap/53-business-and-management-state-model.md). El código y las migraciones 018–021 se integraron al branch local de integración; aún faltan pruebas de migración en PostgreSQL descartable y revisión del PR final. La migración conserva `review_status='filtered'` como Revisado, mantiene Papelera separada y no reconstruye gestiones eliminadas.

## Pospuesto por el propietario: datos y multivertical

- Resolver el acceso MCP de solo lectura. El último bloqueo reportado fue `Origin not allowed` en el recorrido OAuth; antes hubo PKCE/configuración y `invalid_request`. Se corrigieron partes del servidor, pero no se confirmó conexión de ChatGPT a producción.
- Existe el rol lector provisionado y código MCP; no repetir el provisionado ni rotar secretos por iniciativa propia. Validar configuración/redirect/resource/origin sobre evidencia actual; consultar [MCP](crm-mcp.md).
- Revisar negocios existentes para posibles fusiones o verticales adicionales. Una coincidencia es señal de revisión, no prueba de duplicado.
- Acordar clasificación, gestiones conjuntas, filtros, responsables y migración de multivertical. No ejecutar fusiones ni reasignaciones a partir del plan documental.

El usuario pidió avanzar con otros puntos mientras esto quedaba para después. No bloquear el pulido de UI por esta dependencia.

## Validación humana pendiente

- Prueba de facilidad de uso con principiantes/personas mayores, según [procedimiento](prueba-con-principiantes.md).
- Sesión específica con lector de pantalla. Las comprobaciones de foco/teclado existentes no sustituyen esa sesión.
- Revisión editorial sobre todos los modelos y contenidos reales restantes: las pruebas no cubren todos los textos/productos.

## Completado: conservar como regresión

Ya están implementados los bloques 43–52 del roadmap: búsqueda restante, historial comercial, Contactar desde tareas, registro guiado, continuidad, revisión de reglas/permisos (no las decisiones aún abiertas), miniaturas, avisos, loading y UI transversal. También las rondas posteriores de diseño, Papelera/Archivo, búsqueda de entidades y unificación del historial global.

No reescribir esos bloques desde cero. Revisar la implementación y ampliar la cobertura del caso que falle. Limpieza y recuperación productiva están ejecutadas; no volver a tratarlas como pendientes.

## IA en el CRM — revisar antes de implementar

- Revisar la [épica 61](crm-roadmap/61-ai-in-crm-epic.md), [spec base 62](crm-roadmap/62-ai-platform-foundation-spec.md) y las specs hijas 63–81.
- Elegir proveedor/modelo y verificar retención, entrenamiento, región y contrato antes de enviar datos reales. La spec permanece agnóstica hasta esa elección.
- Configurar límites concretos antes de habilitar el servicio. El CRM informará uso/errores y bloqueará solicitudes al alcanzar el límite.
- Revisar cada spec hija y autorizar por separado el primer alcance de implementación. Dictado queda fuera de la primera etapa.
- No interpretar la documentación como aprobación para conectar un proveedor, enviar datos reales o desplegar IA.
- Revisar la cadena de documentación: [tracker #107](https://github.com/qazuor/hospeda-leads/pull/107), [base #108](https://github.com/qazuor/hospeda-leads/pull/108), [Alta #109](https://github.com/qazuor/hospeda-leads/pull/109) y [Media/Exploratoria #110](https://github.com/qazuor/hospeda-leads/pull/110). No mergear hasta su revisión y CI verde.
