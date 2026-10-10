# Pendientes y próximo trabajo

Corte: 10/10/2026. Actualizar al cerrar una tarea. No marcar como pendiente un bloque implementado solo porque un documento histórico aún use ese término.

## Primeros pasos al retomar en una PC

1. Clonar/pull y preparar el entorno local según [desarrollo local](desarrollo-local.md).
2. Verificar HEAD remoto, estado local y PRs abiertos; no trabajar sobre un snapshot viejo.
3. Pedir/obtener observación del deploy real para comprobar los 23 negocios recuperados en Papelera, los atributos recuperados y el Historial global. El operador confirmó el commit, no la visualización final.
4. Continuar el recorrido de UI en una base local sintética. Para datos reales usar únicamente acceso explícitamente configurado; no copiar secretos del VPS al repo.

## Prioridad: pulido visual, con recorridos reales

El propietario sigue detectando detalles pese a varias rondas de mejoras. El primer recorrido debe revisar los puntos que señaló, distinguiendo lo ya corregido de regresiones o casos de contenido no cubiertos:

- Filtrar negocios: texto centrado en Agregar filtro; Quitar búsqueda/Quitar filtro consistentes en iconos, tamaño y separación.
- Tabla y cards: centrado y padding de badges de ciudad, responsable, vertical y estado; datos largos; filas vacías innecesarias; altura de tarjetas.
- Acciones de fila: iconos sin borde decorativo; header Acciones alineado; targets accesibles y menús sin iconos pegados a texto.
- Vistas de Negocios: badges compactos, poco espacio vacío, nombre/selección/acciones y guardado contextual legibles, overflow móvil.
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
