# AGENTS.md — Hospeda CRM

Shared instructions for every coding agent working in this repo (Claude Code reads them through `CLAUDE.md`). Owner: Leandro (qazuor). Chat with the owner in Spanish; code, comments, identifiers, docs and commit messages in English.

## What this is

Internal sales CRM for Hospeda, self-hosted on the Hospeda VPS through Coolify (https://crm.hospeda.com.ar). It is a **separate product** from the Hospeda tourism platform: no monorepo, no Drizzle, no Better Auth, no `@repo/*` packages, no Linear. Do not carry assumptions from that repo into this one.

Stack: React 19 + Vite + React Router 6 + TanStack Query, Mantine 9.7.1 + Lucide, TipTap, Sonner, Recharts on the client. Hono on Node 22 for the API. PostgreSQL 17 through Kysely (postgres.js driver), Zod, SuperJSON. Brevo for transactional email. npm with `package-lock.json` (never pnpm/yarn).

## Commands

```bash
npm run dev          # Vite on :5173 + API (tsx watch) on :3001; Vite proxies /_api to the API
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit tests (jsdom, globals)
npm run build        # Vite bundle + tsup server bundle into dist-server/
npm start            # serve the production build on :3001

npx vitest run src/helpers/filterRules.spec.ts   # a single unit test file
npx vitest run -t "name of the test"             # a single test by name
```

There is no linter or formatter step. CI is typecheck + tests + build + integration + browser + Docker smoke.

Scripts and the server read `process.env` only, they do not load `.env` themselves. Export the file first: `set -a; source .env; set +a` (bash).

### Database and integration tests

```bash
npm run db:migrate                          # apply pending migrations/*.sql
CRM_TEST_DATABASE=1 npm run db:seed:test    # DESTRUCTIVE synthetic seed (admin@example.com / test-password-123)
CRM_TEST_DATABASE=1 npm run test:commercial # one integration suite (see package.json for all test:*)
node --import tsx scripts/test-search.ts    # a single integration script
npm run test:browser                        # Playwright; needs `npm run build && npm start` on :3001 first
```

Integration suites (`scripts/test-*.ts|mjs`) mutate the database and several replay migrations on copies. They expect a disposable PostgreSQL that has been migrated and seeded, in the order `.github/workflows/ci.yml` runs them. Local Postgres: `docker compose -p hospeda-crm-local -f docker-compose.yml -f docs/compose.local.yml up -d postgres` (port 5433). Full setup: `docs/desarrollo-local.md`. The browser suite takes ~10 minutes in CI; slow is not hung.

## Architecture

- **Client** (`src/main.tsx`, `src/pages/`, `src/components/`): React SPA. Shared Mantine wrappers live in `src/components/` (`Button`, `Badge`, `Dialog`, selects, dates). Shared layout classes in `src/components/ui/CrmLayout.module.css`, tokens in `src/base.css`. Styling is CSS Modules.
- **Endpoints** come in pairs inherited from the Floot port:
  - `src/endpoints/<name>.schema.ts` holds the Zod input `schema`, the output types and the **client-side fetch function** (`fetch("/_api/...")` + SuperJSON). Pages and components call this function, usually through TanStack Query.
  - `src/endpoints/<name>.ts` exports `handle(request: Request)`, the server handler.
  - Each handler is registered by hand in `src/server/app.ts` (`app.get('/_api/x', c => xGET(c.req.raw))`, before `applyStaticFallback`). A new endpoint touches all three places.
- **Server** (`src/server/app.ts` builds the Hono app; `src/server/index.ts` starts it and the background timers): Hono app that serves `/_api/*`, the built SPA and the MCP server (`src/server/mcp/`, OAuth-protected; credentials table exists, the service is not enabled in production).
- **Domain/helpers** (`src/helpers/`): DB access (`db.tsx`, Kysely with a snake_case↔camelCase plugin plus overrides for names with digits), generated table types (`schema.tsx`), session (`getServerUserSession.tsx`), permissions (`crmPermissions.ts`), date helpers (`crmDates.tsx`), search normalization, filters, history/audit.
- **Migrations**: plain SQL in `migrations/NNN_*.sql`, applied in order by `scripts/migrate.mjs`, which records a sha256 checksum per file in `schema_migrations`.
- Code map with file-level detail: `docs/mapa-tecnico.md`.

### Domain model you must not blur

- Business (`crm_accounts`), person (`crm_contacts`) and management (`leads`) are different entities. `leads` is the legacy **physical** table name for managements; many endpoints keep the `leads_` prefix for compatibility. Creating or importing a business never creates managements, tasks or conversations.
- The Businesses list is a projection (`src/helpers/businessTable.ts`, `leads_GET`). Never route a write meant for a management onto an account (or the reverse) because IDs happen to match.
- Opening a channel, saving a draft or moving a stage is NOT evidence of contact, reply, acceptance, payment or delivery. Do not infer those states.
- Server-side permission checks and "Do not contact" restrictions are mandatory on every write path. Read access to a business grants nothing else.
- Dates: a business day in Argentina is not a UTC instant. Use the helpers in `crmDates.tsx`.
- Search is accent-insensitive but keeps ñ ≠ n. Catalog fields and options compare exactly.
- Filter badges change only the value; field and operator stay fixed, AND/OR groups and exclusions are preserved.

## Code conventions

- Match the surrounding code. The existing style is compact (minimal whitespace, terse handlers); follow it in files that use it instead of reformatting.
- TypeScript strict, no `any`, `import type` for type-only imports, Zod for every request input.
- Reuse Mantine, the shared wrappers and `CrmLayout` classes before writing new UI. Visual tasks do not change contracts, permissions or business rules.
- Every action shows loading state and blocks double submit. On error, keep what the user typed and offer a relevant retry. Never auto-retry a send whose outcome is uncertain.
- Unit tests sit next to the code as `*.spec.ts(x)`. Bug fixes get a regression test first.

## Git and PR workflow

`main` and `staging` are protected **by convention** (no GitHub branch protection on this plan). Treat these as non-negotiable:

1. NEVER `git push` to `main` or `staging` directly, in any form (`*:main`, force, `-u`). `.claude/settings.json` denies the common forms; those patterns are a guardrail, not enforcement, so do not look for a spelling that slips past them.
2. NEVER force-push and NEVER `git commit --amend` on `main` or `staging`.
3. All work: branch from `origin/staging` → change → typecheck + tests + build green locally → PR **targeting `staging`** → wait for CI → merge.
4. Merge only when the PR's latest CI run is fully green on the exact head SHA (`gh pr view <N> --json headRefOid,statusCheckRollup`). Skipped jobs are fine; failed or cancelled are not. NEVER `gh pr merge --admin`.
5. `staging` → `main` happens ONLY when the owner explicitly asks for it.
6. Hotfix exception: branch from `main`, PR to `main`, then back-merge `main` → `staging` through a PR.
7. A merged or closed PR is done. Before pushing to a branch that ever had a PR, check `gh pr list --head <branch> --state all`. If it is `MERGED`/`CLOSED`, cut a new branch from `origin/staging` for the follow-up.

Commits: Conventional Commits `type(scope): description`, atomic, stage files one by one (never `git add .` / `-A`), commit right after staging, never amend a pushed commit. Branch names: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`. PR body states the problem, the final behaviour, the validation that actually ran and known limitations.

Within that flow the owner has pre-authorized: opening PRs to `staging`, fixing CI and merging to `staging` once green. Everything else (merging to `main`, deploys, data operations) needs explicit approval in the current conversation.

Do not run two agents on the same working tree. Use separate branches/worktrees for parallel work.

## Safety: data, secrets, production

- **Production data is off limits.** No agent writes to the production database: no cleanup, merge, reassignment, recovery, import or seed. A UI or code task never authorizes data writes. Data operations need a scope the owner approved for that specific operation and a reviewed runbook (`docs/management-cleanup-runbook.md`, `docs/business-metadata-recovery.md`). There is no agent DB connection to production; do not claim or invent one.
- The October cleanup and the 2026-10-10 recovery were already applied by the operator. Never re-run them, and never use the legacy importers (`db:import`, `scripts/migrate-floot-snapshot.mjs`, `db:recover:businesses`) to recreate deleted managements.
- `CRM_TEST_DATABASE=1` is a self-declaration, not a guard: the scripts do not check where `DATABASE_URL` points. Before any seed or `test:*`, confirm the exported `DATABASE_URL` is a local disposable database.
- **Migrations are immutable once applied.** Editing an applied file breaks its checksum. Always add a new numbered migration. Applying migrations does not run cleanups or recoveries.
- **Deploy is manual.** Production runs on Coolify; `deploy-vps.yml` is `workflow_dispatch` only. Never trigger it, and never treat a merge as a deploy.
- Never commit real `.env*` files, keys, tokens, production connection strings, dumps, per-business reports, manifests with data, passwords or sessions. Private evidence stays outside Git. Do not print full snapshots in production logs.
- Never send real email/messages from a dev or test database. Brevo without a real key cannot send; use the existing mocks and fixtures.

## Reporting

Report only what you verified. "Green", "merged", "deployed" and "tested in production" are distinct claims and each needs evidence (CI run, PR state, Coolify, owner confirmation). Say which tests actually ran and which were skipped.

## Project docs

Start-of-session context: `docs/estado-desarrollo.md` (current state), `docs/decisiones.md` (stable decisions), `docs/pendientes.md` (open work). When a task closes, update `estado-desarrollo.md` and `pendientes.md` with PR, tests run and next step; record new stable decisions in `decisiones.md`. `docs/crm-roadmap/` is historical: its "pending" items may already be done, so confirm in code.
