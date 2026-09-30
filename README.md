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
npm install
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
