# Hospeda Leads

CRM interno de Hospeda para carga, seguimiento, filtrado y gestión de leads.

## Estado

Migración en curso desde Floot a una aplicación portable y autohosteable.

La rama activa de migración es `migration/floot-port`.

## Stack destino

- React 19 + Vite
- React Router
- TanStack Query
- Hono sobre Node.js
- PostgreSQL + Kysely
- TipTap
- Brevo Transactional Email
- Docker / Docker Compose

## Desarrollo local

```bash
cp .env.example .env
npm ci
docker compose up -d postgres
npm run dev
```

Frontend: http://localhost:5173  
API: http://localhost:3001  
Health: http://localhost:3001/_api/health

## Producción

```bash
npm ci
npm run build
npm start
```

La primera versión conserva Kysely y el sistema de autenticación actual para reducir riesgo durante la migración.

## Deploy

Producción recomendada: Coolify sobre el VPS de Hospeda. Ver [docs/COOLIFY_DEPLOY.md](docs/COOLIFY_DEPLOY.md).

## Uso y validación de la experiencia

- [Guía de uso para principiantes](docs/guia-de-uso.md) (también en `/guide`).
- [Cambios, cobertura de la auditoría y validación](docs/usability-validation.md).
- Prueba del recorrido completo: `CRM_TEST_DATABASE=1 npm run test:usability` sobre una base descartable con todas las migraciones aplicadas.
