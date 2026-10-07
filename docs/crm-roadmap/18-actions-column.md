# Acciones configurable

Base de trabajo: 192deead3ef4b526d7c1d01780792339d01cdcf7, último commit del PR #50 (aún pendiente de CI y revisión visual). Rama separada para no mezclar subtareas. PR #50 se reabrió al detectar que su snapshot no se había actualizado al HEAD remoto; CI 37595615405 valida ahora ese commit.

## Cambio

Acciones es una columna configurable del listado: visible por defecto, ancho inicial 110 px, fija a derecha en desktop. Menú permite ocultar/mostrar, ordenar y fijar/desfijar; el borde admite drag y teclado para el ancho. Comparte el límite de espacio fijo con las demás columnas; mobile no fija columnas.

Las preferencias antiguas incorporan Acciones una sola vez con columnLayoutVersion=2, manteniendo filtros, orden, anchos, asignaciones y contexto. Las versiones nuevas conservan decisiones personales de ocultar o cambiar fijación. Se aplica también al recuperar vistas y configuraciones por defecto.

No se ofrece ordenar ni filtrar por Acciones: no es un dato comercial. En cards no aparece como dato; Abrir sigue disponible. Si se oculta en tabla, el nombre abre la ficha y recibe el foco al volver cuando no existe Abrir. Skeletons, ancho total, hover y offsets usan la misma lista de columnas.

## Validación

TypeScript, siete pruebas de preferencias y diff check locales aprobados. Browser amplía desktop/mobile para actualización de preferencias antiguas, presencia en menú, ocultar y conservar después de reload, fijar a ambos lados, quitar fijación y disponibilidad de resize. Se mantiene cobertura de hover, selección, retorno y ordenamiento. CI completa y revisión visual pendientes.

## Próximo bloque

Vistas del sistema configurables por admin, junto con vistas personales. Siguen badges editables, búsquedas indiferentes a mayúsculas/acentos y resto del alcance general. No se modifica ninguna regla comercial pendiente. Sin limpieza, comunicaciones reales ni despliegue.
