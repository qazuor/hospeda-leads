# Rendimiento y arquitectura: plan de octubre 2026

Fecha: 20/10/2026. Registro del plan de rendimiento, errores y arquitectura ejecutado sobre `staging` (PRs #114 a #148), con lo medido antes y después, notas de deploy, decisiones y pendientes. Los números salen de mediciones locales sobre una base sintética descartable y de EXPLAIN de solo lectura en una réplica; no son métricas de producción ni de navegador. Este documento no reemplaza `docs/estado-desarrollo.md`, `docs/pendientes.md` ni `docs/decisiones.md`: el propietario tiene ediciones sin pushear en esos archivos y se reconcilian aparte.

## Objetivo y alcance

Prioridad pedida por el propietario: velocidad percibida, luego manejo de errores, luego el resto. El disparador fue que el listado de negocios (`GET /_api/leads?entity=business`) tardaba minutos con datos reales de actividades.

Alcance: API (consultas, sesiones, pool, errores), cliente (bundle, polling, re-renders), seguridad básica de arranque y cabeceras, Docker/CI. No se cambiaron contratos de permisos, reglas comerciales ni "No contactar". Las migraciones nuevas son 024, 025 y 026; ninguna migración aplicada se editó.

Fuente del plan completo y de los reportes crudos: fuera del repo (carpeta de sesión de trabajo). Lo esencial está resumido acá.

## Qué se hizo

Estado al 20/10/2026: todo mergeado a `staging` salvo dos PRs abiertos (S-04 y P-12). Mergeado a `staging` no significa desplegado: el deploy lo hace Coolify y no se verificó.

| Tarea | PR | Qué cambió | Estado |
|---|---|---|---|
| M-01 | #114 | App Hono separada del arranque (`src/server/app.ts` registra rutas, `index.ts` solo sirve) | mergeado |
| P-00 | #115 | Harness de medición: `perf:api`, `perf:explain`, `perf:bundle` | mergeado |
| P-00S | #116 | Seed sintético determinista (`db:seed:perf`) | mergeado |
| CI | #117 | Baseline de CI verde; imagen node desde `mirror.gcr.io` por 429 en `public.ecr.aws` | mergeado |
| P-03 | #118 | Migración 024: índices para la proyección de negocios | mergeado |
| P-05 | #119 | Pool dimensionado, `statement_timeout` y esperas de lock acotadas | mergeado |
| P-06 | #120 | Editor TipTap y guía de uso en carga diferida; chunks de vendor | mergeado |
| P-08 | #121 | Caché privada de versiones inmutables de recursos | mergeado |
| P-01 | #122 | Live mode cada 10 s, pausa si la pestaña está oculta, contextos separados | mergeado |
| P-02 | #123 | Opciones de filtro solo si se piden (`filterOptions=include`); tablero acotado | mergeado |
| P-04 | #124 | Migración 025: vencimiento de sesión y `last_accessed` con throttle | mergeado |
| P-07 | #125 | Assets con hash cacheados, compresión, 404 para assets inexistentes | mergeado |
| P-00 (extra) | #126 | SQL real de las rutas calientes y host permitido para explain | mergeado |
| P-09 | #127 | Proyección de negocios explícita, evaluada una vez por fila | mergeado |
| T-01 | #128 | Test de matriz de rutas: auth exigida en toda `/_api` | mergeado |
| E-05 | #129 | La sesión se mantiene viva en pestañas abiertas | mergeado |
| E-04 | #130 | Nunca se filtran errores crudos de Postgres al usuario | mergeado |
| S-04 | #131 | Falla al arrancar si `JWT_SECRET` falta o tiene menos de 32 caracteres | abierto (espera confirmación del propietario) |
| S-03 | #132 | Login sin enumeración de cuentas y con rate limit primero | mergeado |
| C-02 | #133 | CI más rápida (cachés, concurrencia, salto en PRs solo de docs) | mergeado |
| E-02b | #134 | 500 para errores inesperados en work, pipeline y commercial | mergeado |
| P-10 | #135 | Migración 026: versiones live por dominio y refresco manual del listado paginado | mergeado |
| C-01 | #136 | Docker: usuario no root, PID 1 `node`, apagado ordenado | mergeado |
| E-01 | #137 | Error boundary y recuperación ante chunk viejo | mergeado |
| M-04 | #138 | Actualizaciones de seguridad no major | mergeado |
| E-03 | #139 | Request id, log de requests lentas, handler global, `/_api/health/ready` | mergeado |
| E-02c | #140 | 401 y errores saneados en endpoints heredados | mergeado |
| CI smoke | #141 | Se detiene el servidor fuente antes del smoke de Docker | mergeado |
| E-06 | #142 | Límite global de body en `/_api` | mergeado |
| S-01 | #143 | CSP en modo report-only, cabeceras de seguridad, chequeo de Origin | mergeado |
| E-02a | #144 | Estados HTTP correctos en `leads`, `leads_stats` y `live_version` | mergeado |
| P-12 | #145 | Locks por fila de negocio en lugar de tablas enteras (comunicación) | abierto |
| M-03 | #146 | Constructor de filtros de `leads` tipado | mergeado |
| P-11 | #147 | Filas memoizadas en el listado y contexto de diálogos estable | mergeado |
| M-02 | #148 | Se eliminan endpoints, helpers y restos de Floot sin uso | mergeado |

Los PRs #111 a #113 (instrucciones de agentes, tests y mensajes) son anteriores al plan y no forman parte de él.

## Resultados antes y después

Condiciones: base sintética descartable (PG17) con 3.501 cuentas, 4.001 gestiones y 50.000 actividades; misma máquina; `perf:api` con 30 corridas, 3 de calentamiento y ráfaga de 5 en paralelo; usuarios `admin` y `seller1`. Antes = `staging` `add4661` (W0); después = `staging` `b174083` (merge de #147). Una sola pasada: diferencias de pocos ms están dentro del ruido (15 a 25 ms en el listado). No hay mediciones de navegador (Lighthouse, polling ocioso, profiler de React).

### API, p50 / p95 en ms (admin)

| Escenario | Antes | Después |
|---|---|---|
| Listado de negocios (default) | no medible (timeout de 30 s; el count solo tarda 67 s) | 74,8 / 84,5 |
| Listado filtrado | no medible | 41,6 / 47,6 (devuelve 0 filas con este dataset) |
| `leads_stats?entity=business` | sin respuesta en 15 s | 82,3 / 122,6 |
| `search?q=hot` | 339,2 / 389,4 | 287,0 / 338,7 |
| `work?mode=day` | 54,4 / 61,4 | 53,2 / 80,4 |
| Oportunidades | 48,7 / 63,8 | 33,2 / 37,8 |
| Detalle comercial | 8,1 / 9,9 | 10,2 / 12,3 |
| `live_version` | 4,0 / 4,7 | 9,2 / 12,5 |
| `auth/session` | 3,8 / 4,8 | 9,5 / 13,0 |
| Settings | 5,8 / 7,0 | 5,2 / 6,0 |

Seller (`seller1`): listado 76,5 / 122,9 (antes no medible); `work?mode=day` 92,9 / 140,5 a 74,7 / 80,6; `search` 338,7 a 289,7 p50.

Lo que no mejoró o empeoró: `live_version` y `auth/session` casi duplicaron su p50 en términos absolutos (siguen siendo de un dígito de ms; no se aisló la causa); la búsqueda `q=` apenas bajó; `work?mode=day` de admin tiene p95/máximo peores. El payload de `live_version` pasó de 40 B a 232 B por las versiones por dominio.

Ráfaga de 5 en paralelo sobre `search`: de 910-983 ms a 510 ms. En el escenario original, 8 de 9 escenarios fallaban en cascada porque el listado agotaba el pool; en la medición final no hubo timeouts. Las escrituras `update sessions` / `delete from sessions` desaparecieron de los logs de `work` y `search`, y `app_settings` no tuvo updates durante la corrida.

### EXPLAIN ANALYZE de la proyección de negocios

SQL nueva capturada de un request real (`leads?entity=business&page=1&pageSize=50&sortBy=nombre&sortDir=asc`), en la base sintética y en la réplica de solo lectura (la réplica tiene casi vacías las tablas hijas: 0 gestiones, 0 actividades, 0 tareas; y todavía no tiene los índices de 024).

| Consulta | Antes, sintética | Después, sintética | Antes, réplica | Después, réplica |
|---|---|---|---|---|
| COUNT | 67.280 ms (10,2 M buffers) | 5,3 ms (541 buffers) | 248,7 ms | 2,6 ms |
| PAGE (50 filas) | más de 200.000 ms (timeout) | 64,3 ms (2.750 buffers) | 10.479,6 ms | 12,9 ms |

Los números de la réplica validan la forma del plan, no el costo a escala de producción. Aislando solo el efecto de la migración 024 sobre la consulta vieja (`perf:explain` con el SQL anterior): count 67 s a 1,2 s y page más de 200 s a 38 s.

### Bundle (`perf:bundle`)

| Ítem | Antes | Después |
|---|---|---|
| JS de entrada | 738.597 B (227.042 gzip) | 173.611 B (51.079 gzip), -76% / -78% |
| JS inicial (entrada + react + mantine + query precargados) | 738.597 B (227.042 gzip) | 807.767 B (244.943 gzip), +9% / +8% |
| CSS de entrada | 311.351 B (47.295 gzip) | 311.352 B (47.363 gzip), repartido en dos archivos |
| Chunk TipTap | dentro de `messageTemplatePolicy` | `tiptap-*.js` propio (388.964 B) |
| Guía de uso | no estaba en la entrada | chunk propio `user-guide-*.js` (53.409 B) |

Lectura honesta: la entrada se achicó mucho, pero la primera carga baja casi lo mismo porque el código se movió a chunks de vendor precargados. La ganancia real es estabilidad de caché entre deploys y chunks diferidos más chicos; no se midió tiempo de carga en navegador. Meta G7 (entrada menor a 200 KB gzip): cumplida solo para el chunk de entrada.

## Causa raíz principal

El listado de negocios construía cada fila con `(jsonb_populate_record(null::leads, to_jsonb(l) || jsonb_build_object(... subconsultas ...))).*`. En PostgreSQL, expandir `(función(...)).*` evalúa la llamada una vez por cada columna de salida. La tabla `leads` tiene unas 56 columnas, así que el plan contenía 56 copias de las subconsultas correlacionadas (contacto principal, próxima tarea, último contacto) que se ejecutaban por cada cuenta. Además el filtro y el orden volvían a evaluar la misma expresión, y como el planner no puede ver adentro de la función estimaba 18 filas contra 3.915 reales, eligiendo planes malos. A eso se sumaba que `crm_activities.account_id` no tenía índice, y cada subconsulta de "último contacto" hacía un seq scan de las 50.000 actividades.

Solución: P-03 (#118) agregó los índices; P-09 (#127) reemplazó la proyección por una lista explícita de columnas y calculó contactos, próxima tarea y último contacto una vez con tablas derivadas unidas. La consecuencia para quien toque `leads`: una columna nueva de `leads` debe agregarse a `BUSINESS_PROJECTION_LEAD_COLUMNS` (el test de CI `test-commercial` lo vigila).

Mala práctica agravante: un request abandonado por el cliente seguía corriendo en Postgres durante minutos y saturaba el pool. `statement_timeout` de 30 s (P-05) lo acota, pero no cancela la consulta al cortar el cliente.

## Notas de deploy

- Migración 024 (P-03): crea índices sin `CONCURRENTLY`, con un bloqueo breve de escritura sobre las tablas indexadas.
- Migración 025 (P-04): rellena `sessions.expires_at`; reescribe las sesiones existentes.
- Migración 026 (P-10): reenlaza 37 triggers en una sola transacción, con `SHARE ROW EXCLUSIVE` por tabla. Sin `lock_timeout` a propósito: el contenedor corre `migrate && start`, y una migración abortada por timeout dejaría la app caída. Desplegar en un momento de poco tráfico.
- `JWT_SECRET` (S-04, #131, todavía abierto): al mergear, la app no arranca si el valor falta, tiene menos de 32 caracteres o contiene `change-me`, `changeme`, `not-for-production` o `example` (sin distinguir mayúsculas). Antes de mergear hay que confirmar que el de producción tiene 32 o más caracteres (solo el largo, sin pegar el valor). El valor de `.env.example` se rechaza a propósito: generar uno propio en desarrollo.
- `PUBLIC_APP_URL=https://crm.hospeda.com.ar` debe estar como variable de runtime en Coolify. Con el chequeo de Origin (S-01), un POST desde cualquier otro dominio (sslip.io, alias, www) devuelve 403, salvo que sea el mismo origen. Los 403 quedan en el log como `warn`.
- Salud: `/_api/health` quedó sin cambios (es el que usa Coolify hoy). Se agregó `/_api/health/ready`, que verifica la base con caché de 2 s. El propietario informó el 21/10 que ya lo pasó a `/_api/health/ready` (no verificado desde el repo).
- Docker (C-01): el contenedor corre como `USER node`. Los scripts de operación con `docker exec` deben escribir en `/tmp`; escribir bajo `/app` falla con EACCES. Si Coolify tiene un volumen que no esté documentado en `docs/`, revisar su propietario.
- Endpoints eliminados (M-02): `/_api/leads_import`, `/_api/leads_ingest` y `/_api/send_template_email` ahora dan 404 (antes solo devolvían 409/403/401). Si algún sistema externo los llamaba, hay que avisar. El alias `npm run db:migrate:floot` se quitó: usar `node scripts/migrate-floot-snapshot.mjs`. La fila `app_settings.ingest_token` quedó sin uso.
- Versiones de TipTap: todas las `@tiptap/*` están fijadas en 3.31.3 con `overrides` para bubble-menu y floating-menu. Las 3.31.4 y 3.32.0 rompen el diálogo de links del editor de mensajes (el texto escrito después de insertar un link extiende el link; lo detecta `tests/browser/mantine-prompts.e2e.ts`).
- Migraciones posteriores (027–033) y sus notas de deploy: ver [pendientes](pendientes.md).
- Las migraciones 024 a 026 se aplicaron solo a la base sintética descartable. La réplica sigue en la 023.

## Decisiones tomadas por el coordinador

Tomadas durante la ejecución y fáciles de revertir; el propietario puede cambiarlas.

- Textos de `crmErrors` (E-02b): los errores 23503 y 23514 muestran mensajes amigables en español con estado 400. El texto está en `src/helpers/crmErrors.ts`.
- `/_api/health` no se tocó; el nuevo chequeo vive aparte en `/_api/health/ready` (E-03).
- Sin `lock_timeout` en la migración 026 (razón arriba).
- La clave heredada de versión live se sigue incrementando en cada escritura (compatibilidad con pestañas viejas durante el deploy).
- Auditoría de dependencias (M-04): de 10 avisos se pasó a 6. Los restantes requieren majors y el propietario los difirió: react-router 6 a 7 (2 moderados, runtime), vitest 3 a 5 (solo dev, 1 crítico), esbuild (solo servidor de desarrollo en Windows).
- CI (C-02): también corre en push a `staging`; los PRs solo de docs saltean pasos. La mejora de tiempo es chica (unos 30 s de unos 14 min): la suite de navegador es cerca del 80% de la CI.
- Los agentes de ejecución trabajaron en worktrees; los stashes y refs son compartidos, así que se prohibió tocarlos.

## Pendientes y seguimientos

Requieren acción o decisión del propietario:

- S-04 (#131): confirmar el largo de `JWT_SECRET` en producción y luego mergear.
- P-12 (#145): revisar y mergear; reemplaza locks de tabla por locks de fila. Mientras tanto, la clave live heredada que se incrementa en cada escritura sigue serializando a los escritores desde la primera escritura hasta el commit. Dejar de incrementarla (migración posterior) cuando ya no queden pestañas viejas.
- Decidir si el healthcheck de Coolify pasa a `/_api/health/ready`.
- Avisar si algún sistema externo usaba los endpoints eliminados en M-02.
- Opcional: reportar el problema de links de TipTap 3.31.4+ y volver a probar antes de subir la versión.

Seguridad (fuera del plan):

- S-03: los emails desconocidos ahora recorren el camino completo de login (transacción, lock, bcrypt, insert) para evitar enumeración; falta un rate limit por IP en el borde o en la app.
- `register_with_password_POST` todavía devuelve 403 "no está autorizado": permite enumerar cuentas.
- `scripts/test-mcp.ts` prueba `mcpRoutes()` aislado, así que no detecta regresiones de middleware global sobre `/mcp` (S-01 agregó un test de app completa).

Errores:

- E-04: `crmError` se usa solo en pipeline, work, communication, commercial y `leads_GET`. Más de 30 `catch` heredados siguen devolviendo `error.message` crudo (E-02 lo cubrió en parte; revisar lo que quede).

Rendimiento, cuellos de botella restantes (con evidencia de la medición final):

1. Búsqueda `search?q=`: 287-290 ms p50 y 510 ms en ráfaga. 10 consultas por request con `normalize(regexp_replace(normalize(lower(col),NFD),...),NFC) LIKE '%hot%'`, no sargables sin un índice sobre la misma expresión. No estaba en el plan. Corrección del 21/10: sí había índice posible; la migración 032 (#199) crea índices GIN `pg_trgm` sobre la expresión exacta de `normalizeSearchSql()` para `crm_accounts`, `crm_contacts`, `crm_activities` y `lead_notes`. Ctrl+K «Gestiones» y el `q=` del listado de negocios siguen calculando la expresión fila por fila; ver [pendientes](pendientes.md).
2. La página del listado calcula agregados de todas las cuentas antes del `LIMIT`: 64 ms de DB, 37 ms en un `HashAggregate` sobre un seq scan de 50.000 actividades. Crece linealmente con las actividades; producción tendrá más que la réplica (que tiene 0). Con `q` y sin grupos el listado tarda 264-268 ms p50.
3. Peso inicial del bundle: unos 808 KB de JS (245 KB gzip) más 311 KB de CSS (47 KB gzip) antes del primer render; el CSS de Mantine (281 KB) bloquea el render. Chunks diferidos grandes: analytics (401 KB) y los pdf workers (1,26 MB y 436 KB).
4. Abanico de `work?mode=day`: 19 sentencias SQL por request; la respuesta de seller pesa 104 KB contra 27 KB de admin; el feed de actividades hace seq scan de `crm_activities` (46,5 ms).
5. Payload del listado: 120 KB crudos por página de 50 filas (unos 2,4 KB por fila); `leads_stats` recalcula la proyección completa aparte (82-87 ms), así que abrir la página paga el agregado dos veces.
6. Vista de tablero: aún alrededor de 1 s y 8,5 MB.
7. Render del cliente (P-11): el contexto de estado de live mode cambia en cada chequeo y React recorre el árbol completo (`src/helpers/liveMode.tsx`); los 200 a 450 ms restantes por interacción de lista son pintura de 300 filas con celdas sticky y un Tooltip/Popover de Mantine por celda. Virtualizar la lista o hacer tooltips lazy es decisión del propietario.
8. Las peticiones pesadas abandonadas siguen corriendo en Postgres hasta el `statement_timeout`.

Limitaciones de las mediciones: el harness tiene un timeout de 30 s fijo en `api-baseline.mjs`; el escenario "filtrado" devuelve 0 filas con este dataset, así que solo mide filtro y conteo; en `scripts/perf/hot-queries.sql` las dos primeras consultas se actualizaron en este PR con el SQL real actual.

## Incidentes de la noche

- Stash del propietario: el agente de E-06 ejecutó `git stash drop` en el repo compartido (los stashes se comparten entre worktrees) y eliminó el stash "preserve local checkout before switching to staging" del 16/10/2026 (ediciones en `docs/decisiones.md`, `estado-desarrollo.md`, `historial-desarrollo.md` y `pendientes.md`). Se restauró con el mismo SHA `39487792` como `stash@{0}`, verificado. Aparte, existe un stash anterior ("preserve local state docs and lockfile during visual branch rebase", 14/10/2026) que solo quedó como commit colgante `af920cda5839e5c5aa7f91691c1321ee67c9c193`; no estaba en la lista de stashes antes y el agente no lo tocó. Si se lo quiere conservar: `git stash store -m "<mensaje>" af920cda5839e5c5aa7f91691c1321ee67c9c193` antes de que `git gc` lo borre. Se actualizó el brief de los agentes para prohibir stash y operaciones sobre refs.
- Flake del smoke de Docker en CI: el servidor fuente seguía levantado durante el smoke de la imagen. Se corrigió con #141 (detenerlo antes).
- `public.ecr.aws` respondió 429 al bajar la imagen de node; CI usa `mirror.gcr.io` (#117).
- Un ejecutor (OpenCode) se colgó 75 minutos sin salida en M-01; se pasó a otros ejecutores.
