# Historial de desarrollo y operaciones relevantes

Registro de hitos para trasladar el proyecto entre herramientas. No es una transcripción completa del chat ni el journal de usuarios comerciales. Fechas y estados se indican cuando se conocen; para la historia íntegra de código consultar GitHub y los PRs.

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

## Cómo continuar este registro

Agregar hitos con problema, resultado, PR/commit, validaciones efectivas y estado productivo. No pegar outputs con datos privados, secretos, dumps ni transcripciones completas. Usar enlaces a evidencia pública y conservar evidencia privada en el almacenamiento autorizado del propietario.
