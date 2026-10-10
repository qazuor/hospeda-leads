# Instrucciones compartidas — Hospeda CRM

Este archivo es el punto de entrada para Codex y Claude Code. El propietario es Leandro (Leo). Trabajar y comunicar en español claro, directo y sin inventar resultados.

## Al iniciar una sesión

1. Leer `docs/estado-desarrollo.md`, `docs/decisiones.md` y `docs/pendientes.md`.
2. Leer `docs/desarrollo-local.md` para preparar el entorno; consultar `docs/mapa-tecnico.md` para ubicar código y pruebas.
3. Revisar `git status`, rama actual y HEAD remoto de `main`. No asumir que el commit documentado sigue siendo el último.
4. Confirmar en código lo que describen documentos antiguos. `docs/crm-roadmap/` conserva entregas históricas: sus frases “pendiente” pueden haber quedado resueltas posteriormente.
5. Mantener los cambios locales del usuario. Antes de cambiar de rama o actualizar el checkout, revisar archivos sin commit. Usar una rama o worktree separado cuando sea necesario.

## Proyecto y herramientas

- Repositorio: `qazuor/hospeda-leads`; rama estable `main`.
- CRM interno independiente del portal turístico Hospeda: no aplicar supuestos del monorepo Astro/Drizzle/Neon al CRM.
- React 19, Vite, React Router, TanStack Query, Mantine 9.7.1, Lucide, TipTap, Sonner y Recharts.
- API Hono/Node; PostgreSQL 17, Kysely con mapeo snake_case/camelCase, Zod y SuperJSON.
- Usar Node 22 y npm con `package-lock.json`. Comandos reales en `package.json`; CI completa en `.github/workflows/ci.yml`.
- Tests básicos: `npm run typecheck`, `npm test`, `npm run build`. Integraciones y seed solo sobre bases locales descartables; ver guía local.

## Flujo autorizado de desarrollo

El propietario pidió avanzar con cambios, abrir PRs, corregir CI y mergear cuando esté verde. No pedir otra confirmación para tareas rutinarias ya comprendidas en el encargo.

- Rama de trabajo → cambio acotado → validación pertinente → PR → todos los checks requeridos verdes → merge a `main`.
- Verificar el HEAD exacto del PR y el resultado de CI antes del merge. No afirmar “verde”, “mergeado”, “desplegado” ni “probado en producción” sin evidencia.
- El merge y el deploy son estados distintos. Coolify ejecuta producción; no inferir el deploy por un merge.
- Describir problema y comportamiento final en el PR, con validación y limitaciones relevantes.
- No delegar a otros agentes salvo que el usuario lo pida.

## Reglas de implementación

- Negocio (`crm_accounts`), persona (`crm_contacts`) y gestión (`leads`) son entidades distintas. Crear/importar un negocio no crea gestiones, tareas ni conversaciones.
- Respetar los controles de permisos del servidor y las restricciones No contactar. Leer un negocio no concede permiso de modificarlo, enviar mensajes o administrar su gestión.
- No inferir contacto, respuesta, aceptación, pago ni entrega a partir de abrir un canal, guardar un borrador o cambiar una etapa.
- Mantener búsqueda sin acentos, Unicode y distinción entre ñ y n. Campos/opciones de catálogo conservan comparaciones exactas cuando corresponde.
- En badges de filtros se cambia solamente el valor: campo y operador permanecen fijos; conservar grupos AND/OR y exclusiones.
- Reutilizar Mantine, wrappers y clases compartidas. En tareas visuales, no cambiar contratos, permisos ni reglas comerciales de paso.
- Toda acción debe mostrar loading y evitar doble submit; errores conservan lo escrito y ofrecen reintento pertinente. No repetir automáticamente envíos inciertos.
- Preservar calendario de Argentina: día comercial no equivale a un instante UTC. Reutilizar los helpers de fecha existentes.
- Las migraciones aplicadas tienen checksum: no editarlas; agregar una nueva migración cuando haga falta.
- No usar importadores heredados para recrear gestiones eliminadas ni repetir la limpieza/recuperación de octubre como parte de un deploy.

## Datos y credenciales

No versionar `.env` reales, claves, conexiones productivas, dumps, manifiestos con datos, informes por negocio, passwords, tokens ni sesiones. Guardar evidencia privada fuera de Git. Las métricas agregadas de la documentación describen un snapshot, no un contador en vivo.

La limpieza, fusión, reasignación o recuperación de datos productivos requiere un alcance específicamente autorizado y un procedimiento revisado. Una tarea de UI no autoriza esas escrituras. No inventar acceso a la DB: la integración MCP quedó pospuesta y no se confirmó su conexión productiva.

La recuperación del 10/10/2026 ya fue aplicada por el operador. No volver a ejecutarla automáticamente. Confirmar únicamente su visualización si sigue pendiente.

## Al cerrar una tarea

Actualizar `docs/estado-desarrollo.md` y `docs/pendientes.md` con lo realizado, PR/commit, pruebas efectivas y siguiente paso. Registrar nuevas decisiones estables en `docs/decisiones.md` y hitos relevantes en `docs/historial-desarrollo.md`. Distinguir implementado, mergeado, ejecución productiva reportada y verificación visual pendiente. No convertir hipótesis ni recuerdos en hechos.
