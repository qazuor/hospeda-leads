# Negocios — loading por acción y refresco en segundo plano

Base main remota verificada: d2211d6583f1ae54fb156498a560e38de47c6af1 (PR #45). Rama feature/crm-background-loading.

Hallazgo: Live comprueba versión cada 2500 ms y al recuperar foco/visibilidad; cuando cambia invalida consultas, incluidas leads. El listado usaba isFetching para reemplazar resultados por skeletons, sin distinguir esos refetch de las acciones del usuario. Esto explica cómo puede producirse el síntoma; no se inspeccionó tráfico de producción para atribuir cada caso concreto.

El listado distingue una consulta nueva por sus parámetros, carga inicial, búsqueda en debounce, reintento y actualización manual. Estas cargas mantienen skeletons. Un refetch automático de la misma consulta conserva filas/cards o estado vacío. Live sigue activo: no se deshabilita polling ni lectura compartida. La actualización manual comparte estado visible y bloqueo desde el primer clic. Nuevos lotes mantienen sus skeletons sin retirar resultados anteriores y no arrancan mientras se refresca la consulta.

Una falla de refresco mantiene datos/estado vacío junto al error y ofrece reintento explícito. No cambia filtros, orden, preferencias ni scroll por el mero inicio del refetch.

Validación: recorridos nuevos desktop/mobile con versión Live simulada, respuestas retenidas, datos visibles y cero resultados, búsqueda explícita y actualización manual. Los recorridos existentes verifican reintento y carga continua. TypeScript/unitarias/build y CI se informan en el PR; no mergear antes de validación completa.

Subtarea limitada a Negocios y señal de actualización manual de Live. El resto de loading por módulo, carga siempre continua, Configuraciones por defecto, búsqueda sin acentos, edición de badges, Acciones configurable y hover de columna siguen pendientes. Sin migraciones, cambios de datos, comunicaciones reales ni despliegue.
