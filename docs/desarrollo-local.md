# Desarrollo local y continuidad con Codex / Claude Code

## Requisitos

Git, Node 22, npm y Docker. PostgreSQL 17 corre en un contenedor propio; no hace falta Compose, credenciales ni datos del VPS. Si la imagen `postgres:17-alpine` no está en la PC, el script la descarga una sola vez.

~~~bash
git clone https://github.com/qazuor/hospeda-leads.git
cd hospeda-leads
npm ci
~~~

Si el repo privado requiere autenticación, configurar el acceso GitHub de tu PC. Para que el agente abra PRs por CLI, instalar GitHub CLI y autenticarlo con `gh auth login`, o configurar una integración equivalente autorizada. No colocar tokens en documentos del repo.

## Arranque con un solo comando

~~~bash
npm run local
~~~

Es idempotente: se puede ejecutar las veces que haga falta. Hace, en orden:

1. Crea o reutiliza el contenedor `hospeda-crm-dev-pg` (volumen `hospeda-crm-dev-pgdata`, etiqueta `hospeda-crm.dev=1`), lo inicia si está detenido y espera a que acepte conexiones.
2. Se conecta por la IP del contenedor (el reenvío de puertos al host puede colgar clientes Postgres en algunas máquinas) y, si no responde, por el puerto publicado en `127.0.0.1`.
3. Ejecuta las migraciones.
4. Si la base está vacía (`crm_accounts = 0`) carga el usuario de prueba y el set sintético de rendimiento (~3,5 mil negocios, 50 mil actividades). La primera vez tarda unos minutos; los arranques siguientes no vuelven a sembrar.
5. Genera `JWT_SECRET` aleatorio y elige puertos libres (API 3001, web 5173; si están ocupados, los siguientes). Todo queda en `.local/dev.json` (ignorado por Git).
6. Arranca `npm run dev` (Vite + API con recarga) con las variables armadas en memoria. No se lee ningún `.env`, y `DATABASE_URL` del entorno de tu shell se ignora a propósito. `BREVO_API_KEY` queda vacía.
7. Espera `/_api/health` e imprime un resumen: URLs, login, conexión a la base, modo de datos y conteos.

Login de ejemplo: `admin@example.com` / `test-password-123`. Son credenciales sintéticas locales, no del CRM productivo.

Ctrl+C detiene Vite y la API; el contenedor sigue corriendo.

| Comando | Qué hace |
| --- | --- |
| `npm run local` | Levanta todo (modo desarrollo). |
| `npm run local -- --built` | `npm run build` + `npm start` en el puerto de la API: mismo tipo de ejecución que producción, útil para medir rendimiento real. La app se abre en la URL de la API. |
| `npm run local:status` | Estado del contenedor, URL de la base, conteos y si responden los puertos. |
| `npm run local:stop` | Detiene los procesos de la app iniciados por el script y el contenedor (los datos se conservan). |
| `npm run local:reset -- --yes` | Borra el contenedor y el volumen (solo los de nombre/etiqueta propios) y vuelve a levantar todo con datos nuevos. |

Los scripts solo operan sobre `hospeda-crm-dev-pg` si tiene la etiqueta `hospeda-crm.dev=1`; nunca tocan otros contenedores.

**Un solo contenedor y una sola base para todos los worktrees/ramas.** Es intencional, pero implica que `local:stop` y `local:reset` afectan a todos los worktrees, y que las migraciones de una rama de feature se aplican en la base compartida (otra rama sin esa migración puede fallar o ver tablas extra). Para volver a un estado limpio, usar `npm run local:reset -- --yes`. Los puertos de la app sí se eligen libres por ejecución, así que dos worktrees pueden correr a la vez. El estado local (secreto JWT, puertos, proceso) vive en `.local/dev.json` de cada worktree.

El sembrado deja una marca en la base al terminar; si se interrumpe, el siguiente `npm run local` completa solo lo que falta (`local:status` muestra si está completo). Solo funciona en Linux con Docker accesible.

El contenedor corre con `fsync=off` para que la carga sea rápida: es una base descartable, y ante un corte brusco del equipo conviene `local:reset`.

### Datos reales (opcional)

Con un dump entregado por el propietario:

~~~bash
npm run local -- --data=dump:/ruta/absoluta/al/archivo
~~~

Solo se acepta formato custom; el propietario debe generarlo con `pg_dump -Fc --no-owner --no-acl <base> > archivo.dump`. Un SQL plano se rechaza a propósito (puede traer `\connect` y escribir en otra base). Se restaura con `pg_restore --exit-on-error` primero en `hospeda_dump_tmp` y recién al terminar bien se renombra a `hospeda_dump`: una restauración interrumpida nunca queda como válida y se reintenta sola. La base de desarrollo no se toca, se migra la restaurada y la app arranca contra ella. Nunca se siembra. La base recuerda el archivo de origen (ruta y fecha de modificación): si pasás otro archivo sin `--fresh`, avisa y conserva lo ya restaurado. Para restaurar otra vez, agregar `--fresh`. Se rechaza un dump dentro del repositorio (también vía enlace simbólico).

Esa base contiene datos personales reales y el login es con usuarios reales: no enviar comunicaciones, no copiar el dump ni su contenido al repo ni a chats. Para volver a los datos sintéticos, ejecutar `npm run local` sin `--data`.

- Frontend: http://localhost:5173 (modo `--built`: http://localhost:3001).
- Health: http://localhost:3001/_api/health.

Brevo sin clave real no permite envío productivo. Para probar recorridos, usar mocks/fixtures existentes; no probar comunicación con destinatarios reales desde una base de desarrollo.

## Apéndice: arranque manual

La integración de email entrante requiere `INBOUND_EMAIL_TOKEN` (secreto aleatorio de al menos 32 caracteres, compartido con el Worker Cloudflare). En local puede omitirse si no se prueba ese endpoint.

Solo si hace falta algo distinto de `npm run local`. Los scripts de DB y el servidor leen `process.env`: no cargan `.env` solos.

~~~bash
docker compose -p hospeda-crm-local -f docker-compose.yml -f docs/compose.local.yml up -d postgres
~~~

Variables mínimas: `DATABASE_URL=postgres://hospeda:hospeda@127.0.0.1:5433/hospeda_leads`, `PUBLIC_APP_URL=http://localhost:5173` (el origen que usa el navegador; si no coincide, los POST se rechazan), `ADMIN_EMAIL=admin@example.com`, `BREVO_API_KEY=` vacío y un `JWT_SECRET` aleatorio de al menos 32 caracteres (el servidor no arranca sin él, más corto, ni con valores de ejemplo como los de .env.example o docker-compose; generarlo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). Exportar esas variables en la shell (o guardarlas en un archivo local no versionado y cargarlo) y luego:

~~~bash
set -a
source .env
set +a
npm run db:migrate
CRM_TEST_DATABASE=1 npm run db:seed:test
npm run dev
~~~

`db:seed:test` es exclusivamente para bases de ejemplo: crea/resetea el administrador de prueba y agrega un negocio/gestión sintéticos. No ejecutarlo contra un dump real o la DB productiva.

## Herramientas de código

Instalar Codex o Claude Code según sus instrucciones oficiales. La instalación/login de la herramienta se hace en la PC, no en el repo. Desde la raíz:

~~~bash
codex
~~~

O:

~~~bash
claude
~~~

`AGENTS.md` contiene las instrucciones compartidas y orden de lectura. `CLAUDE.md` importa ese archivo para Claude. El documento debe mantenerse breve: las decisiones/estado detallados permanecen enlazados en `docs/`.

Para retomar conversaciones locales de cada herramienta:

~~~bash
codex resume
~~~

~~~bash
claude --resume
# Última conversación del directorio:
claude --continue
~~~

Las conversaciones de cada herramienta son independientes. Este traspaso documenta lo trabajado en ChatGPT; no asegura que un CLI pueda abrir directamente ese chat. No commitear los directorios privados de sesiones ni transcripciones con datos.

Prompt inicial sugerido:

~~~text
Leé AGENTS.md y los documentos de estado, decisiones y pendientes que enlaza.
Verificá HEAD remoto de main, estado local y PRs abiertos. Resumí qué está
implementado y qué queda abierto. Retomá el pulido visual del CRM usando
componentes/clases compartidos y recorridos reales de formularios y diálogos.
Conservá funcionalidades, datos y permisos. Trabajá en una rama, abrí PR,
corregí CI y mergeá cuando todos los checks estén verdes. Al cerrar, actualizá
los documentos de continuidad. No repitas la limpieza ni la recuperación
productiva ya confirmadas; la revisión de datos multiverticales/MCP sigue pospuesta.
~~~

## Validación

Para cambios de código, ejecutar los checks pertinentes antes del PR:

~~~bash
npm run typecheck
npm test
npm run build
~~~

Las integraciones modifican datos sintéticos y algunas prueban migraciones destructivas sobre copias. Usar una base de pruebas separada y descartable, con `.env.test` privada, y `CRM_TEST_DATABASE=1`; nunca la base productiva. Los comandos completos están en `package.json` y `.github/workflows/ci.yml`.

Ejemplo en esa base de pruebas ya migrada/sembrada:

~~~bash
set -a
source .env.test
set +a
CRM_TEST_DATABASE=1 npm run test:commercial
~~~

Navegador espera un servidor en http://127.0.0.1:3001. En una terminal, cargar `.env.test` como arriba, ejecutar `npm run build` y `npm start`. Chromium y tests en otra:

~~~bash
npx playwright install chromium
npm run test:browser
~~~

El flujo completo de CI agrega integraciones, build, browser y smoke de la imagen Docker. Esperar que termine: navegador del PR #92 tardó aproximadamente 9,5 minutos; no asumir que una demora es un cuelgue.

## Actualizar y cerrar una sesión

Al comenzar, revisar `git status` antes de cambiar de rama/pull. Cuando el checkout esté limpio, actualizar main y crear rama del siguiente cambio. No lanzar dos agentes con cambios simultáneos sobre el mismo árbol de trabajo: usar ramas/worktrees separados si se trabaja en paralelo.

Al terminar, registrar PR, pruebas, estado y próximo paso. El próximo agente debe poder continuar leyendo el repo sin necesitar la conversación original.

## Fuentes oficiales

- Codex CLI: https://learn.chatgpt.com/docs/codex/cli.
- Instrucciones AGENTS: https://learn.chatgpt.com/docs/agent-configuration/agents-md.
- Claude, memoria/importaciones: https://code.claude.com/docs/en/memory.
- Claude, sesiones: https://code.claude.com/docs/en/sessions.
- Node CLI: https://nodejs.org/docs/latest-v22.x/api/cli.html.
