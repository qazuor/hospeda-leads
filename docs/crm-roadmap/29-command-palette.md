# Accesos rápidos y navegación con iconos

Continúa los PR 60/61 con la primera cobertura aprobada de la sección 36 del documento de mejoras: paleta global de opciones con `@mantine/spotlight` 9.7.1, compatible con core/hooks.

## Implementación

- Ctrl+K y Cmd+K, más botón visible de búsqueda en el header para mouse/toque. El atajo se muestra según plataforma y el botón tiene nombre accesible.
- Diálogo con título nativo, búsqueda con foco inicial, flechas/Enter/Escape, cierre visible, foco contenido y restauración al control anterior. Si el cambio de tema reemplaza el botón de apertura, se restaura al botón equivalente.
- Filtro por nombre/descripción, ignorando mayúsculas y acentos mediante el normalizador compartido; conserva ñ. Estado sin resultados y anuncio de opción seleccionada para lector de pantalla.
- Grupos separados «Ir a» y «Acciones». Todos los usuarios acceden a Mi día, Negocios, Gestiones comerciales, Agenda, Reactivación, Guía y cambios de tema. Solo admin ve administración, mensajes modelo, biblioteca, importación y duplicados.
- Las acciones de importación/duplicados abren la revisión existente. No ejecutan escrituras ni envíos al seleccionarlas.
- Una sola instancia fuera del Suspense de rutas, un listener con limpieza y repetición del atajo ignorada. No se abre encima de diálogos/menús, durante edición de inputs/TipTap/contenteditable ni con cambios sin guardar; en este último caso informa cómo continuar.
- La altura de resultados se adapta al viewport visual. Mobile permite scroll propio y conserva cierre/búsqueda accesibles.
- Iconos Lucide en navegación principal y opciones restantes. Metadatos de destinos principales compartidos con la paleta; ajuste del header para evitar overflow.

No se modifican endpoints, permisos de servidor, reglas comerciales ni datos. La búsqueda de entidades y las acciones contextuales por negocio/gestión son ampliaciones posteriores, no cobertura de esta entrega. La adopción global de Mantine sigue pendiente: los menús/perfil existentes conservan su implementación.

Referencia oficial consultada: https://mantine.dev/x/spotlight/ (v9.7.1). Se comprobó la API instalada para filtro, store, navegación de acciones y cierre/foco; estilos de Spotlight importados después de core dentro de su capa.

## Validación

TypeScript, build y 66 unitarias aprobados. La suite nueva cubre usuario/admin a 1280/390 px: atajos, foco/restauración, flechas/Enter, cambio de tema, búsqueda sin acentos, permisos, ausencia de resultados, trap de foco, navegación a Negocios y reapertura sin duplicados. También comprueba prioridades de inputs/contenteditable, diálogo activo y cambios sin guardar; no hay escrituras. Incluye viewport mobile reducido a 500 px como simulación de espacio disponible, sin afirmar prueba de un teclado físico/virtual real.

Validación local final: los 8 recorridos (4 de paleta + 4 de Contactar) aprobaron; capturas claro/oscuro y navegación mobile revisadas, incluida selección activa visible con altura reducida. Chromium alternativo local por descarga oficial corrupta. CI completa sobre HEAD final requerida antes de merge; las pruebas locales usan respuestas simuladas.

## Continuidad

PR 61 integrado en `5fb1f4530add7bd52a59e595e2079414464361bd`, HEAD validado `70da643cdddc647cd0f7eaed7de09e32337e6716`. CI 37696631520 aprobada, incluida integración, navegador y Docker/persistencia. El estado pendiente de CI del documento 28 es histórico.

Siguiente bloque: badges de filtros editables sin cambiar semántica AND/OR ni permisos; después guardado contextual de vistas y su fila de badges/overflow. Conservar decisiones comerciales/multiverticales pendientes y tratar limpieza productiva por separado.
