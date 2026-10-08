# Badges de filtros: cambiar únicamente el valor

Corrige el alcance de la entrega 31 (PR 64): el badge es un acceso al valor del filtro, no al editor de campo y operador.

- Campo y operador permanecen fijos. Los filtros de catálogo —incluido Responsable— abren directamente una lista buscable de valores. Elegir un valor aplica el cambio y cierra la lista; Escape cancela. El responsable se muestra por nombre y se envía por email.
- Texto, búsqueda, números y fechas permiten cambiar únicamente sus valores. Los rangos conservan ambos extremos y su operador. Condiciones como “sin valor” no abren un editor de condición; mantienen la cruz para quitar el filtro.
- La edición completa sigue en el diálogo de filtros. Se conservan AND/OR, filtros de vistas anteriores, guardado contextual y permisos.
- Badges compactos, altura uniforme, campo y operador en tono secundario, valor destacado y flecha discreta. Cruz independiente para quitar. Los bloques OR se agrupan suavemente y cada AND permanece junto al bloque siguiente al envolver líneas. Las acciones se alinean en una fila separada.

Validación: TypeScript, unitarias de campo/operador fijos y extremos de rango; navegador escritorio/móvil en claro/oscuro, selección de responsable, búsqueda por acentos, teclado/Escape, exclusión conservada, eliminación, guardado/reintento y ausencia de desbordamiento. Capturas revisadas antes de abrir PR; CI completa requerida antes de merge.
