# Hospeda Leads

CRM interno de Hospeda para carga, seguimiento, filtrado y gestión de leads.

## Estado

CRM en producción en https://crm.hospeda.com.ar, portable y autohospedado en Coolify. La documentación histórica conserva entregas de la migración desde Floot.

La rama estable es `main`. Los cambios se preparan en ramas feature y se integran mediante PR con CI aprobada.

## Stack actual

- React 19 + Vite
- React Router
- TanStack Query
- Mantine 9.7.1 + Lucide
- Hono sobre Node.js
- PostgreSQL + Kysely
- TipTap
- Brevo Transactional Email
- Docker / Docker Compose

## Continuar el desarrollo

Leer [AGENTS.md](AGENTS.md): instrucciones compartidas para Codex y Claude Code. [CLAUDE.md](CLAUDE.md) importa ese mismo archivo.

- [Estado actual y operaciones ya realizadas](docs/estado-desarrollo.md).
- [Decisiones funcionales y visuales](docs/decisiones.md).
- [Pendientes y próximo trabajo](docs/pendientes.md).
- [Mapa del código y las pruebas](docs/mapa-tecnico.md).
- [Historial de desarrollo](docs/historial-desarrollo.md).
- [Preparar PC, base local y sesiones del agente](docs/desarrollo-local.md).

## Desarrollo local

Seguir [la guía local](docs/desarrollo-local.md), incluyendo el override de puerto PostgreSQL, carga explícita de `.env`, migraciones y seed solo de ejemplo. Usar Node 22 y PostgreSQL 17 como CI/producción.

Frontend: http://localhost:5173  
API: http://localhost:3001  
Health: http://localhost:3001/_api/health

## Producción

~~~bash
npm ci
npm run build
npm start
~~~

La API utiliza Kysely y autenticación/sesiones propias. Las operaciones históricas de limpieza y recuperación son manuales: no se vuelven a ejecutar al clonar o desplegar.

## Deploy

Producción recomendada: Coolify sobre el VPS de Hospeda. Ver [docs/COOLIFY_DEPLOY.md](docs/COOLIFY_DEPLOY.md).

## Uso y validación de la experiencia

- [Guía de uso para principiantes](docs/guia-de-uso.md) (también en `/guide`).
- [Cambios, cobertura de la auditoría y validación](docs/usability-validation.md).
- Prueba del recorrido completo: `CRM_TEST_DATABASE=1 npm run test:usability` sobre una base descartable con todas las migraciones aplicadas.
