# Carga continua visible y paginación conservada

Base remota verificada: d729179ef855ceac097fbff3a9c789c262734185 (PR #47 mergeado con CI completa aprobada).

## Alcance de este bloque

La última indicación conserva paginación para poder reactivarla. `BUSINESS_PAGINATION_CONTROLS_ENABLED` centraliza la disponibilidad: desactivada, oculta el selector del listado, el selector administrativo y Anterior/Siguiente. El listado y la administración aplican carga continua a configuraciones antiguas sin perder campos, filtros, orden, tamaño de lote ni contexto. El valor inicial ahora es continuo.

Se conservan el esquema de ambos modos, consultas por página, alineación de ancla, corrección de página cuando se reduce el total, navegación y estilos. Para reexponer paginación, activar la opción y los controles existentes vuelven a renderizarse. El modo guardado mientras está desactivada será continuo; el usuario podrá elegir paginación al reactivarla. Sin migración destructiva de preferencias ni cambios del contrato del servidor.

La cantidad de resultados define el lote. El observador carga automáticamente y Cargar más sigue disponible. Los lotes nuevos muestran skeletons sin retirar registros cargados. Regresar por Atrás o el menú conserva el ancla y carga los lotes necesarios.

## Validación

TypeScript, pruebas de preferencias y diff check locales. Recorridos de navegador adaptados para desktop/mobile, preferencias antiguas en modo páginas, ausencia de controles, retorno a un negocio movido, filtros, usuarios separados, reducción de resultados y fin de carga. CI completa y evidencia visual pendientes al abrir PR.

## Pendientes

Búsqueda indiferente a mayúsculas/acentos en toda la app, badges editables, Acciones configurable, hover de columna y resto del alcance general. Reglas comerciales pendientes siguen sin implementarse. Sin limpieza, comunicaciones reales ni despliegue.
