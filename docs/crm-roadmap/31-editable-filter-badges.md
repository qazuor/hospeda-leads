# Filtros aplicados editables y guardado contextual

Base: PR 63 integrado en main `4479a539f023b4451c8cca7025e32d3c49365e65`. CI 37710687657 aprobada: 71 unitarias, 59 recorridos de navegador, integraciones Postgres y Docker. Completa la verificación pendiente del documento 30.

En Negocios y Gestiones comerciales, cada condición avanzada y la búsqueda libre se editan desde un badge. Un popover Mantine permite elegir campo, operador y valor, aplicar explícitamente, cancelar o quitar únicamente esa condición. Al quitar la última alternativa se retira el bloque vacío; el resto mantiene AND entre bloques y OR dentro de cada bloque. Cerrar por Escape cancela el borrador y devuelve foco. Las condiciones sin valor no solicitan un valor y los rangos conservan sus dos extremos. Se preservan valores históricos ausentes del catálogo actual.

Los filtros de vistas anteriores siguen visibles y se conservan durante ediciones individuales y al aplicar el editor de Negocios. El editor permite quitarlos mediante una opción explícita; Limpiar limpia también estos filtros. No se reinterpretan reglas antiguas ni se cambia la semántica del servidor.

“Aplicar y guardar como vista” en el editor de Negocios aplica el borrador revisado y abre el diálogo de nombre con la búsqueda/filtros/presentación resultantes. Usa la API personal existente: identidad por sesión, loading desde primer clic, cierre bloqueado durante escritura y errores persistentes con reintento. Cancelar el guardado conserva los filtros ya aplicados. No modifica vistas del sistema ni guarda datos comerciales.

Se comparte el editor de condiciones entre el diálogo completo y los badges, para conservar opciones y operadores consistentes. Los popovers de filtros cierran inmediatamente para permitir cambiar rápidamente de condición. Los filtros no requieren propiedad sobre negocios: siguen siendo preferencias de lectura del usuario. No hay migraciones ni cambios de API.

Verificación: TypeScript/build, pruebas de conservación de expresiones y navegador escritorio/móvil con edición, cancelación/teclado, eliminación de alternativas/bloques, condiciones sin valor, búsqueda, guardado contextual y fallo/reintento lento. La CI completa del HEAD final debe aprobar antes del merge.
