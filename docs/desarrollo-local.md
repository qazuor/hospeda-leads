# Desarrollo local y continuidad con Codex / Claude Code

## Requisitos

Git, Node 22, npm y Docker con Compose. Usar la misma rama/código actual del repo y PostgreSQL 17 como CI/producción. Esta guía crea una base local de ejemplo; no necesita credenciales ni datos del VPS.

~~~bash
git clone https://github.com/qazuor/hospeda-leads.git
cd hospeda-leads
npm ci
cp .env.example .env
~~~

Si el repo privado requiere autenticación, configurar el acceso GitHub de tu PC. Para que el agente abra PRs por CLI, instalar GitHub CLI y autenticarlo con `gh auth login`, o configurar una integración equivalente autorizada. No colocar tokens en documentos del repo.

## PostgreSQL local

El Compose original no publica PostgreSQL al host: no alcanza con levantarlo para conectar el servidor Node que corre fuera del contenedor. El override documental agrega únicamente el puerto local 5433.

~~~bash
docker compose -p hospeda-crm-local -f docker-compose.yml -f docs/compose.local.yml up -d postgres
docker compose -p hospeda-crm-local -f docker-compose.yml -f docs/compose.local.yml ps
~~~

Editar `.env` para usar:

~~~dotenv
DATABASE_URL=postgres://hospeda:hospeda@127.0.0.1:5433/hospeda_leads
PUBLIC_APP_URL=http://localhost:3001
ADMIN_EMAIL=admin@example.com
BREVO_API_KEY=
~~~

Generar un JWT_SECRET local aleatorio (el resultado va en `.env`):

~~~bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
~~~

Son credenciales sintéticas locales. Si definís otro `POSTGRES_PASSWORD` al crear la base, actualizar también DATABASE_URL; cambiarlo luego en Compose no cambia una contraseña de un volumen ya inicializado. El puerto 5433 debe estar libre. El proyecto Compose local tiene un volumen propio; no ejecutar `down -v` salvo que se quiera borrar esa base local.

## Migrar, crear usuario de ejemplo y arrancar

Los scripts de DB y el servidor leen `process.env`: no cargan `.env` solos. En Bash (Ubuntu), exportar las variables del archivo local antes de ejecutar los scripts. La `.env` de ejemplo y los valores de esta guía son compatibles con este formato; escribir entre comillas cualquier valor que contenga espacios o caracteres especiales:

~~~bash
set -a
source .env
set +a
npm run db:migrate
npm run db:seed:test
npm run dev
~~~

`db:seed:test` es exclusivamente para esta base de ejemplo. Crea/resetea el administrador de prueba y agrega negocio/gestión sintéticos; no es un seed de producción ni es idempotente en todos los datos. No ejecutarlo contra un dump real o la DB productiva.

Login local de ejemplo: `admin@example.com` / `test-password-123`. Ambos provienen del seed y no son credenciales del CRM productivo.

- Frontend: http://localhost:5173.
- API: http://localhost:3001; Vite proxya `/_api` al backend.
- Health: http://localhost:3001/_api/health.
- Detener desarrollo: Ctrl+C. No se necesita levantar el servicio `app` de Compose para este modo.

Brevo sin clave real no permite envío productivo. Para probar recorridos, usar mocks/fixtures existentes; no probar comunicación con destinatarios reales desde una base de desarrollo.

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
