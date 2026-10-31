# Runbook: limpieza de catálogos (valores fuera de catálogo y ciudades duplicadas)

Estado: **borrador para revisión del propietario** (31/10/2026). Origen: spec 104, decisiones D4 y D5 (hallazgos 25 y 37 del smoke del 30/10/2026). Modelo de formato: `docs/management-cleanup-runbook.md`.

Este documento **no es una autorización**. Es el procedimiento que el propietario revisa y un operador ejecuta, con un mapeo que el propietario aprueba para esa operación puntual.

## Reglas (leer antes de tocar nada)

1. **Ningún agente ejecuta este runbook**, ni siquiera las consultas de solo lectura contra producción. No existe conexión de agente a producción (`AGENTS.md`). Lo corre un operador humano.
2. **Sin mapeo aprobado no hay `UPDATE`.** El propietario aprueba por escrito el mapeo exacto (tablas de las secciones 1.3 y 2.3) para esta operación. Un mapeo viejo, uno inferido o «la forma que se ve más correcta» no sirven.
3. **Primero contra una copia restaurada**, nunca directo en producción. El ensayo usa el SQL exacto que después se ejecuta.
4. **Respaldo completo antes de cada ejecución**, con restauración comprobada en una base aislada (pasos 3 y 5 de `docs/management-cleanup-runbook.md`).
5. **Registrar la corrida** en `docs/estado-desarrollo.md` al terminar: fecha, operador, respaldo (SHA-256), conteos antes y después, qué mapeo se aprobó. Sin datos personales.
6. **No imprimir datos personales en logs ni en informes**: los listados de este runbook muestran valores de catálogo y ciudades (no nombres de negocios ni de personas). Los IDs de negocio se guardan solo en el informe privado del operador, fuera de Git. Los informes y dumps viven en un directorio privado (`umask 077`), no en el repo ni en artefactos de CI.
7. **Los catálogos comparan exacto** (`AGENTS.md`): «Whatsapp» no es «WhatsApp». Eso es justamente lo que esta limpieza corrige, y solo vía mapeo explícito.
8. **Una sola corrida a la vez y en ventana de poco tráfico.** Las sesiones del CRM escriben `crm_accounts`/`crm_contacts`; ver el bloqueo en cada transacción.
9. Cualquier `ROLLBACK`, error de conteo o fila fuera del mapeo detiene la operación. No se «ajusta sobre la marcha».

## Cómo registra cambios la app (y qué cubren los triggers)

Verificado leyendo `migrations/*.sql` y `src/endpoints/commercial.ts`:

| Tabla | Triggers de auditoría | Qué hay que hacer a mano |
| --- | --- | --- |
| `crm_contacts` (`position`, `preferred_channel`) | **Ninguno de auditoría.** Solo `crm_contacts_live_version` (sube la versión en vivo del dominio `business`) y `crm_contacts_active_guard` (bloquea contactos de negocios fusionados). | La app escribe `crm_commercial_journal` con `action='contact_updated'`, `actor_email`, `actor_name` y `metadata={before,after}` con la fila completa en camelCase (`commercial.ts:214`). El runbook inserta esa fila a mano, con solo el campo cambiado y la clave en camelCase (`preferredChannel`, no `preferred_channel`); ver la nota de formato abajo. |
| `crm_accounts` (`ciudad`) | **Ninguno de auditoría.** `crm_account_projection_sync` copia `ciudad` a `leads` (la proyección de gestiones) y `crm_accounts_live_version` sube la versión. `crm_accounts_active_guard` rechaza actualizar un negocio fusionado (`merged_into_id`). | La app escribe `crm_commercial_journal` con `action='account_updated'` (`commercial.ts:139`). El runbook inserta esa fila a mano. |
| `crm_cities` | **Ninguno de auditoría.** Solo `crm_cities_live_version` (dominio `catalog`). Sin FKs hacia ella: los negocios guardan el nombre como texto. | Las altas/desactivaciones de catálogo desde Configuración tampoco se journalizan; el runbook deja constancia en el informe del operador y en `estado-desarrollo.md`. |
| `app_settings` (`crm_contact_positions`, `crm_contact_channels`) | Ninguno. | Esta limpieza **no modifica** los catálogos de cargos ni de canales, solo los valores guardados en contactos. |

Formato del journal, verificado con el lector (`CommercialPanel.tsx` `auditDetail`, `helpers/auditChanges.ts` en `/historial`, `businessHistoryServer.ts`): la UI compara `before[clave]` con `after[clave]` solo para las claves de `after`/`before`, así que `{before:{ciudad:…},after:{ciudad:…}}` alcanza para mostrar «Ciudad: X → Y»; no hace falta la fila completa. Lo que sí importa es la **clave en camelCase** (la etiqueta se busca por esa clave: `preferred_channel` se vería crudo en la ficha del negocio) y que `before`/`after` sean objetos. Las claves extra (`source`) se ignoran. La pestaña Historial del negocio (`businessHistoryServer.ts`) lista estas filas por `action` y no muestra el detalle; el detalle se ve en la ficha comercial y en `/historial`.

El resumen: **los triggers no cubren estas tablas**; el journal comercial se escribe a mano dentro de la misma transacción, con el mismo formato que la app. Los triggers que sí disparan (proyección a `leads`, versión en vivo) son esperados y no hay que desactivarlos.

Quién figura como actor: se usa un actor explícito del operador (`:actor_email`, `:actor_name`) y además `set_config('crm.actor_email', …, true)` para los journals por trigger que pudieran dispararse (`crm_work_journal`, `crm_resource_journal`), igual que `setWorkActor` en `src/helpers/workAudit.ts`.

## 0. Preparación común

Lo mismo que las secciones 1 a 3 de `docs/management-cleanup-runbook.md`: servicios libpq `hospeda_crm_source` (origen) y `hospeda_crm_rehearsal` (copia aislada nueva), directorio privado por corrida y respaldo:

~~~sh
set -euo pipefail
umask 077
run_dir="$(mktemp -d /ruta/privada/catalogos-crm.XXXXXXXX)"
PGSERVICE=hospeda_crm_source pg_dump --format=custom --file="$run_dir/full.dump"
sha256sum "$run_dir/full.dump" > "$run_dir/full.dump.sha256"
pg_restore --dbname=service=hospeda_crm_rehearsal --no-owner --no-acl --single-transaction --exit-on-error "$run_dir/full.dump"
~~~

Todas las consultas de esta guía se corren con `psql "service=…" -X -v ON_ERROR_STOP=1`. Verificar la identidad de la conexión (`select current_database(), inet_server_addr()`) antes de cada etapa. El ensayo no recibe tráfico del CRM ni corre workers, webhooks ni envíos.

---

# Parte 1. Valores fuera de catálogo

## 1.1 Qué campos cubre

Verificado en `migrations/004_commercial_foundation.sql`, `005_contact_select_options.sql` y `src/helpers/schema.tsx`:

| Campo | Tabla.columna | Catálogo (en `app_settings`, JSON array de texto) |
| --- | --- | --- |
| Cargo | `crm_contacts.position` | `crm_contact_positions` |
| Canal preferido | `crm_contacts.preferred_channel` | `crm_contact_channels` |

Son los únicos campos que la spec 104 (hallazgo 25, D4) pide corregir. Otros campos con catálogo (tipo, subtipo, origen, prioridad, etapas, ciudades) quedan **fuera de esta parte**: las ciudades están en la parte 2 y el resto no se relevó. Si el propietario quiere sumar alguno, se agrega a la consulta 1.2 con su catálogo.

Valores semilla de los catálogos (migración 005; los reales pueden haber cambiado desde Configuración, por eso la consulta lee la tabla y no esta lista): cargos `Propietario/a, Socio/a, Gerente, Administrador/a, Encargado/a, Recepción, Ventas / comercial, Marketing, Otro`; canales `WhatsApp, Email, Teléfono, Instagram, Facebook, Presencial, Otro`.

## 1.2 Relevamiento (solo lectura)

Correr contra el origen **y** contra la copia. Sin nombres ni datos de contacto: solo valor y cantidad.

~~~sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH catalog AS (
  -- Subconsulta con el filtro por clave adentro: así el cast a jsonb solo se evalúa sobre la fila del catálogo
  -- (un join directo contra todo app_settings puede castear otras claves que no son JSON y fallar).
  SELECT 'position'::text AS field, e AS value
    FROM jsonb_array_elements_text((SELECT s.value::jsonb FROM app_settings s WHERE s.key = 'crm_contact_positions')) e
  UNION ALL
  SELECT 'preferred_channel', e
    FROM jsonb_array_elements_text((SELECT s.value::jsonb FROM app_settings s WHERE s.key = 'crm_contact_channels')) e
), stored AS (
  SELECT 'position'::text AS field, c.position AS value, c.deleted_at IS NOT NULL AS deleted, a.merged_into_id IS NOT NULL AS merged
    FROM crm_contacts c JOIN crm_accounts a ON a.id = c.account_id WHERE c.position IS NOT NULL
  UNION ALL
  SELECT 'preferred_channel', c.preferred_channel, c.deleted_at IS NOT NULL, a.merged_into_id IS NOT NULL
    FROM crm_contacts c JOIN crm_accounts a ON a.id = c.account_id WHERE c.preferred_channel IS NOT NULL
)
SELECT s.field,
       quote_literal(s.value)                 AS value_exact,   -- entre comillas simples: se ven espacios y '' (vacío) y sirve para el VALUES
       count(*)                               AS contacts,
       count(*) FILTER (WHERE s.deleted)      AS of_which_deleted,
       count(*) FILTER (WHERE s.merged)       AS of_which_merged_business   -- estos hacen abortar el UPDATE (ver 1.4)
  FROM stored s
 WHERE NOT EXISTS (SELECT 1 FROM catalog c WHERE c.field = s.field AND c.value = s.value)
 GROUP BY s.field, s.value
 ORDER BY s.field, contacts DESC, s.value;

-- Contexto: tamaño de cada catálogo y total de contactos con valor por campo.
SELECT 'position' AS field,
       jsonb_array_length((SELECT s.value::jsonb FROM app_settings s WHERE s.key = 'crm_contact_positions')) AS catalog_size,
       count(*) FILTER (WHERE position IS NOT NULL)          AS contacts_with_value
  FROM crm_contacts
UNION ALL
SELECT 'preferred_channel',
       jsonb_array_length((SELECT s.value::jsonb FROM app_settings s WHERE s.key = 'crm_contact_channels')),
       count(*) FILTER (WHERE preferred_channel IS NOT NULL)
  FROM crm_contacts;

ROLLBACK;
~~~

Notas:
- La comparación es **exacta** (`=`), igual que la app. Un valor con un espacio de más o distinta capitalización aparece como fuera de catálogo. `value_exact` viene entre comillas simples (`quote_literal`) para que se vean los espacios en los bordes y el vacío; se pega tal cual en el `VALUES` de 1.4.
- `of_which_merged_business`: contactos de negocios fusionados. No se pueden editar (ver 1.4): el conteo aprobado para 1.4 es `contacts` menos esta columna, y esos contactos siguen apareciendo en 1.2 después de la limpieza.
- `''` (cadena vacía) se ve como valor; la app guarda `NULL` vía `nullable()`, así que si aparece conviene avisarlo al propietario, pero no se mapea sola.
- Guardar el resultado en `$run_dir/fuera-de-catalogo.txt` (permiso 0600) para armar el mapeo.

## 1.3 Plantilla de mapeo aprobado

El propietario completa la tabla, una fila por valor listado en 1.2. «Destino» debe ser **exactamente** un valor del catálogo vigente (se verifica en 1.4) o `NULL` explícito para vaciar el campo (decisión del propietario, no por defecto). Un valor sin fila **no se toca**.

| Campo (`position` / `preferred_channel`) | Valor actual (exacto, tal cual lo devuelve 1.2) | Contactos (de 1.2, menos los de negocios fusionados) | Valor del catálogo (o `NULL`) | Aprobado por / fecha |
| --- | --- | --- | --- | --- |
| `position` | _ejemplo: `Duenio`_ | _n_ | _ejemplo: `Propietario/a`_ | _propietario, dd/mm/aaaa_ |
| `preferred_channel` | _ejemplo: `Whatsapp`_ | _n_ | _ejemplo: `WhatsApp`_ | _propietario, dd/mm/aaaa_ |
| | | | | |

Los ejemplos vienen de la spec 104 y **no están aprobados**. Los valores reales se leen de 1.2.

## 1.4 Ejecución (ensayo primero, luego producción)

El operador reemplaza el bloque `VALUES` por el mapeo aprobado, fila por fila, con comillas simples escapadas (`'` → `''`). Se ejecuta con `psql -v actor_email="'operador@…'" -v actor_name="'Nombre del operador'"`. La transacción se corta con `\q` ante el primer error (`ON_ERROR_STOP`).

~~~sql
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SELECT set_config('crm.actor_email', :actor_email, true);

-- Frena escrituras concurrentes sobre contactos mientras dura la transacción.
LOCK TABLE crm_contacts IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE value_map (
  field text NOT NULL CHECK (field IN ('position', 'preferred_channel')),
  old_value text NOT NULL,
  new_value text,                       -- NULL = vaciar (solo si el propietario lo aprobó)
  expected_count integer NOT NULL,      -- «Contactos» de 1.2 menos «of_which_merged_business» (esos no se tocan)
  PRIMARY KEY (field, old_value)
) ON COMMIT DROP;

INSERT INTO value_map (field, old_value, new_value, expected_count) VALUES
  -- ('position', 'Duenio', 'Propietario/a', 0),     -- EJEMPLO, no aprobado: reemplazar
  -- ('preferred_channel', 'Whatsapp', 'WhatsApp', 0)
  ('__completar__', '__completar__', NULL, 0);        -- falla el CHECK a propósito si no se reemplaza

-- Catálogo vigente, leído con el filtro por clave dentro de la subconsulta (ver la nota de 1.2 sobre el cast a jsonb).
CREATE TEMP TABLE catalog ON COMMIT DROP AS
SELECT 'position'::text AS field, e AS value
  FROM jsonb_array_elements_text((SELECT s.value::jsonb FROM app_settings s WHERE s.key = 'crm_contact_positions')) e
UNION ALL
SELECT 'preferred_channel', e
  FROM jsonb_array_elements_text((SELECT s.value::jsonb FROM app_settings s WHERE s.key = 'crm_contact_channels')) e;

-- Guardas: cada destino está en el catálogo vigente y cada origen NO lo está.
DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad FROM value_map m
   WHERE m.new_value IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM catalog c WHERE c.field = m.field AND c.value = m.new_value);
  IF bad > 0 THEN RAISE EXCEPTION 'Mapeo: % destino(s) no están en el catálogo', bad; END IF;

  SELECT count(*) INTO bad FROM value_map m
   WHERE EXISTS (SELECT 1 FROM catalog c WHERE c.field = m.field AND c.value = m.old_value);
  IF bad > 0 THEN RAISE EXCEPTION 'Mapeo: % origen(es) SÍ están en el catálogo (no se tocan)', bad; END IF;
END $$;

-- Filas afectadas, congeladas antes de cambiar (para conteos, journal y rollback).
-- Los contactos de negocios fusionados NO se tocan: crm_contacts_active_guard abortaría el UPDATE.
-- Se cuentan aparte (columna of_which_merged_business de 1.2) y el conteo aprobado no los incluye.
CREATE TEMP TABLE affected ON COMMIT DROP AS
SELECT c.id AS contact_id, c.account_id, m.field, c.position AS old_position, c.preferred_channel AS old_channel, m.new_value
  FROM crm_contacts c
  JOIN crm_accounts acc ON acc.id = c.account_id AND acc.merged_into_id IS NULL
  JOIN value_map m
    ON (m.field = 'position' AND c.position = m.old_value)
    OR (m.field = 'preferred_channel' AND c.preferred_channel = m.old_value);

-- Cuántos quedan afuera por ser de un negocio fusionado (informativo; debe coincidir con lo que vio el operador en 1.2).
SELECT m.field, quote_literal(m.old_value) AS old_value, count(*) AS left_out_merged_business
  FROM crm_contacts c
  JOIN crm_accounts acc ON acc.id = c.account_id AND acc.merged_into_id IS NOT NULL
  JOIN value_map m
    ON (m.field = 'position' AND c.position = m.old_value)
    OR (m.field = 'preferred_channel' AND c.preferred_channel = m.old_value)
 GROUP BY 1, 2 ORDER BY 1, 2;

-- Conteo por mapeo contra lo aprobado: aborta ante cualquier diferencia.
DO $$
DECLARE diff integer;
BEGIN
  SELECT count(*) INTO diff FROM value_map m
   WHERE m.expected_count <> (
     SELECT count(*) FROM affected a
      WHERE a.field = m.field
        AND (CASE m.field WHEN 'position' THEN a.old_position ELSE a.old_channel END) = m.old_value);
  IF diff > 0 THEN RAISE EXCEPTION 'Los conteos difieren del mapeo aprobado en % fila(s) de mapeo', diff; END IF;
END $$;

-- Respaldo lógico de los valores previos DENTRO de la base (rollback fino posterior a COMMIT).
-- Tabla de trabajo del operador; se elimina cuando el propietario cierra la operación.
CREATE TABLE IF NOT EXISTS catalog_cleanup_backup_20261031 (
  run_at timestamptz NOT NULL DEFAULT now(),
  table_name text NOT NULL, row_id bigint NOT NULL, column_name text NOT NULL, old_value text, new_value text
);
INSERT INTO catalog_cleanup_backup_20261031 (table_name, row_id, column_name, old_value, new_value)
SELECT 'crm_contacts', contact_id, field,
       CASE field WHEN 'position' THEN old_position ELSE old_channel END, new_value
  FROM affected;

-- Cambio. Una sola pasada por columna, solo filas del mapeo.
UPDATE crm_contacts c
   SET position = a.new_value, updated_at = now()
  FROM affected a
 WHERE c.id = a.contact_id AND a.field = 'position';

UPDATE crm_contacts c
   SET preferred_channel = a.new_value, updated_at = now()
  FROM affected a
 WHERE c.id = a.contact_id AND a.field = 'preferred_channel';

-- Journal comercial, mismo formato que la app (action 'contact_updated', metadata {before,after}, claves en camelCase:
-- la app guarda la fila completa con las claves de Kysely, p. ej. «preferredChannel»; la UI del historial resuelve la etiqueta por esa clave).
-- Una fila por contacto y campo; el cambio quedó marcado como operación de runbook (clave extra «source», que la UI ignora).
INSERT INTO crm_commercial_journal (account_id, contact_id, action, actor_email, actor_name, metadata)
SELECT a.account_id, a.contact_id, 'contact_updated', :actor_email, :actor_name,
       jsonb_build_object(
         'before', jsonb_build_object(f.key, CASE a.field WHEN 'position' THEN a.old_position ELSE a.old_channel END),
         'after',  jsonb_build_object(f.key, a.new_value),
         'source', 'runbook-limpieza-catalogos')
  FROM affected a
  CROSS JOIN LATERAL (SELECT CASE a.field WHEN 'preferred_channel' THEN 'preferredChannel' ELSE a.field END AS key) f;

-- Verificación dentro de la transacción: nada del mapeo queda y los conteos coinciden.
SELECT m.field, quote_literal(m.old_value) AS old_value, m.expected_count,
       (SELECT count(*) FROM crm_contacts c JOIN crm_accounts acc ON acc.id = c.account_id AND acc.merged_into_id IS NULL
         WHERE (m.field = 'position' AND c.position = m.old_value)
            OR (m.field = 'preferred_channel' AND c.preferred_channel = m.old_value)) AS still_there   -- debe ser 0 en todas
  FROM value_map m ORDER BY 1, 2;
-- now() es la hora de inicio de la transacción: las filas de journal de esta corrida tienen exactamente ese created_at.
SELECT (SELECT count(*) FROM affected) AS changed,
       (SELECT count(*) FROM crm_commercial_journal j
         WHERE j.metadata->>'source' = 'runbook-limpieza-catalogos' AND j.created_at = now()) AS journaled;   -- deben ser iguales

-- Ensayo: terminar con ROLLBACK, revisar, repetir con COMMIT. Producción: COMMIT solo si todo cuadra.
ROLLBACK;   -- cambiar por COMMIT en la corrida aprobada
~~~

Qué dispara solo (esperado, no desactivar): `crm_contacts_live_version` (sube versión `business`), `crm_contacts_active_guard` (si algún contacto es de un negocio fusionado, el `UPDATE` **aborta**). Por eso `affected` deja afuera los contactos de negocios fusionados y la transacción los lista aparte; el propietario decide si se corrigen en el negocio destino por la app.

## 1.5 Verificación posterior

Tras el `COMMIT`, en una sesión nueva, correr de nuevo la consulta 1.2: solo deben quedar los valores que el propietario decidió no mapear. Comparar los conteos contra la columna «Contactos» aprobada. Además:

~~~sql
-- Actividad registrada (sin datos personales).
SELECT count(*) AS journal_rows, min(created_at) AS first, max(created_at) AS last
  FROM crm_commercial_journal WHERE metadata->>'source' = 'runbook-limpieza-catalogos';
~~~

Abrir en el CRM, con un usuario de prueba, un contacto corregido: el selector ya no muestra «· no está en la lista» (spec 104 §3.4) y el historial del negocio muestra el cambio.

## 1.6 Plan de rollback

- **Antes del `COMMIT`:** `ROLLBACK;` y no queda nada.
- **Después del `COMMIT`, fino (preferido):** la tabla `catalog_cleanup_backup_20261031` guarda el valor previo por contacto. Se revierte solo lo de esta corrida, sin pisar ediciones posteriores de otros usuarios sobre el mismo campo:

~~~sql
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT set_config('crm.actor_email', :actor_email, true);

CREATE TEMP TABLE reverted (contact_id bigint, account_id bigint, field text, current_value text, restored_value text) ON COMMIT DROP;

WITH u AS (
  UPDATE crm_contacts c SET position = b.old_value, updated_at = now()
    FROM catalog_cleanup_backup_20261031 b
   WHERE b.table_name = 'crm_contacts' AND b.column_name = 'position' AND c.id = b.row_id
     AND c.position IS NOT DISTINCT FROM b.new_value      -- no pisa cambios posteriores
  RETURNING c.id, c.account_id, 'position'::text AS field, b.new_value AS current_value, b.old_value AS restored_value)
INSERT INTO reverted SELECT * FROM u;

WITH u AS (
  UPDATE crm_contacts c SET preferred_channel = b.old_value, updated_at = now()
    FROM catalog_cleanup_backup_20261031 b
   WHERE b.table_name = 'crm_contacts' AND b.column_name = 'preferred_channel' AND c.id = b.row_id
     AND c.preferred_channel IS NOT DISTINCT FROM b.new_value
  RETURNING c.id, c.account_id, 'preferred_channel'::text AS field, b.new_value AS current_value, b.old_value AS restored_value)
INSERT INTO reverted SELECT * FROM u;

-- Journal de la reversión: mismo formato que 1.4, before/after invertidos y source distinto.
INSERT INTO crm_commercial_journal (account_id, contact_id, action, actor_email, actor_name, metadata)
SELECT r.account_id, r.contact_id, 'contact_updated', :actor_email, :actor_name,
       jsonb_build_object(
         'before', jsonb_build_object(f.key, r.current_value),
         'after',  jsonb_build_object(f.key, r.restored_value),
         'source', 'runbook-limpieza-catalogos-rollback')
  FROM reverted r
  CROSS JOIN LATERAL (SELECT CASE r.field WHEN 'preferred_channel' THEN 'preferredChannel' ELSE r.field END AS key) f;

-- Contactos del respaldo que NO se revirtieron (alguien los editó después): los decide el propietario.
SELECT (SELECT count(*) FROM catalog_cleanup_backup_20261031) AS in_backup, (SELECT count(*) FROM reverted) AS reverted;
COMMIT;
~~~

  Si hubo varias corridas, filtrar por `run_at`.
- **Después del `COMMIT`, grueso:** restaurar el respaldo completo **solo** si lo anterior no alcanza, y revisando las escrituras posteriores: restaurar un dump completo pierde los datos nuevos (`docs/management-cleanup-runbook.md`, sección 6).
- Cuando el propietario cierra la operación: `DROP TABLE catalog_cleanup_backup_20261031;` (decisión suya, después de la ventana de revisión).

---

# Parte 2. Ciudades duplicadas

## 2.1 Dónde vive la ciudad

Verificado en `migrations/001_initial.sql`, `004_commercial_foundation.sql`, `src/endpoints/settings_save_POST.ts` y `src/helpers/catalogCity.ts`:

- **Negocios:** `crm_accounts.ciudad` (texto libre). La tabla de gestiones `leads.ciudad` es una **proyección** que `crm_account_projection_sync` actualiza sola cuando cambia `crm_accounts.ciudad`. **Nunca se actualiza `leads.ciudad` directo** (se pierde el modelo de dominio y el trigger inverso reescribiría el negocio).
- **Catálogo:** `crm_cities (id, name UNIQUE, active, created_at)`. **Ninguna FK apunta a `crm_cities`**; el vínculo es solo por nombre. Por eso «fusionar» no borra: se desactiva la fila sobrante y se asegura que la canónica exista y esté activa. No se borran filas de `crm_cities`.
- La app compara con `cityKey` = `normalizeSearchText` + colapso de espacios (`src/helpers/catalogCity.ts`): minúsculas (locale `es`), `trim`, NFD sacando toda marca combinante **excepto la tilde U+0303**, NFC. Consecuencia: **ñ ≠ n** y, por la misma regla, **ã y õ también se conservan** (no se mapean).

## 2.2 Relevamiento (solo lectura)

La normalización en SQL replica `cityKey` con `translate()` y un mapa explícito de acentos que **excluye ñ, ã y õ**. No se usa `unaccent`: no hay ninguna migración que instale esa extensión.

Mapa de origen (minúsculas): `áàâäå éèêë íìîï óòôö úùûü ç ýÿ` → `aaaaa eeee iiii oooo uuuu c yy`. Se aplica tras `normalize(…, NFC)`, así que formas descompuestas (letra + tilde combinante) quedan unificadas antes. Las mayúsculas acentuadas y `Ñ Ã Õ` se pasan a minúscula con un `translate` propio **antes** de `lower()`, para no depender del `lc_ctype` de la base (con `C` puro `lower('Á')` no cambia nada). El colapso de espacios usa el mismo conjunto que el `\s` de JavaScript (incluye espacio no separable, `\u00a0`) y va **antes** del `btrim`: un tab o un espacio no separable al borde queda como un espacio y recién entonces se recorta, igual que `trim()` seguido de `replace(/\s+/gu,' ')` en la app. Si apareciera alguna otra marca (p. ej. diéresis en mayúscula rara, `ș`, etc.), el grupo no se unifica y el operador lo decide a mano: la consulta 2.2.c lista los caracteres no ASCII que quedan para detectarlo.

Se define una función temporal de la sesión (no se crea en la base, vive en `pg_temp`):

~~~sql
CREATE OR REPLACE FUNCTION pg_temp.city_key(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(
           translate(
             lower(translate(normalize(t, NFC),
               'ÁÀÂÄÅÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÇÝŸÑÃÕ',
               'aaaaaeeeeiiiioooouuuucyyñãõ')),
             'áàâäåéèêëíìîïóòôöúùûüçýÿ',
             'aaaaaeeeeiiiioooouuuucyy'),
           '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'))
$$;
~~~

Diferencias conocidas con la app: la app descarta **todas** las marcas combinantes salvo la tilde `\u0303`; esta función solo las de las letras del mapa. Una letra con otra marca (`ć`, `ő`, `ș`…) queda sin unificar y la consulta de 2.2.c la lista. `lower()` de PostgreSQL de letras fuera del mapa depende del `lc_ctype` de la base. Por eso **el ensayo debe verificar** la equivalencia (2.2.d).

### 2.2.a Grupos con más de una grafía, en negocios

`pg_temp.city_key` se crea **antes** del `BEGIN`: PostgreSQL no permite `CREATE FUNCTION` dentro de una transacción `READ ONLY`, ni siquiera en `pg_temp`. Las consultas 2.2.a a 2.2.c se corren en la misma sesión.

~~~sql
-- (crear pg_temp.city_key como arriba, en esta misma sesión y ANTES del BEGIN)
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT pg_temp.city_key(ciudad)                     AS city_key,
       count(DISTINCT ciudad)                       AS spellings,
       jsonb_object_agg(ciudad, n ORDER BY n DESC)  AS spelling_counts,   -- {"San José": 40, "San Jose": 12}
       sum(n)                                       AS accounts,
       sum(n_merged)                                AS of_which_merged,   -- fusionados: abortan la transacción de 2.4
       sum(n_trash)                                 AS of_which_trash     -- en Papelera: sí se actualizan
  FROM (SELECT ciudad, count(*) AS n,
               count(*) FILTER (WHERE merged_into_id IS NOT NULL) AS n_merged,
               count(*) FILTER (WHERE deleted_at IS NOT NULL)     AS n_trash
          FROM crm_accounts
         WHERE ciudad IS NOT NULL AND btrim(ciudad) <> ''
         GROUP BY ciudad) t
 GROUP BY 1
HAVING count(DISTINCT ciudad) > 1
 ORDER BY accounts DESC, 1;
-- La transacción de solo lectura sigue abierta para 2.2.b y 2.2.c; se cierra con ROLLBACK al final de 2.2.c.
~~~

### 2.2.b Grupos con más de una grafía, en el catálogo

~~~sql
SELECT pg_temp.city_key(name)                                         AS city_key,
       jsonb_agg(jsonb_build_object('id', id, 'name', name, 'active', active) ORDER BY active DESC, id) AS rows
  FROM crm_cities
 GROUP BY 1
HAVING count(*) > 1
 ORDER BY 1;
~~~

### 2.2.c Casos sueltos y caracteres no cubiertos

Ciudades de negocios que no están (exactas) en el catálogo, para casos como «Federacion» sin su forma correcta en la lista, y valores con caracteres fuera del mapa:

~~~sql
SELECT a.ciudad, count(*) AS accounts,
       (SELECT string_agg(c.name, ' | ') FROM crm_cities c WHERE pg_temp.city_key(c.name) = pg_temp.city_key(a.ciudad)) AS catalog_match
  FROM crm_accounts a
 WHERE a.ciudad IS NOT NULL AND btrim(a.ciudad) <> ''
   AND NOT EXISTS (SELECT 1 FROM crm_cities c WHERE c.name = a.ciudad)
 GROUP BY a.ciudad
 ORDER BY accounts DESC, a.ciudad;

-- Valores con caracteres no ASCII que el mapa no resuelve (salvo ñ/ã/õ, que son intencionales).
SELECT ciudad, count(*) FROM crm_accounts
 WHERE regexp_replace(pg_temp.city_key(ciudad), '[ñãõ]', '', 'g') ~ '[^\x01-\x7f]'
 GROUP BY ciudad ORDER BY 2 DESC;

ROLLBACK;
~~~

### 2.2.d Equivalencia con la app (ensayo)

Con la lista de grupos de 2.2.a/2.2.b, comprobar en Node (`cityKey` de `src/helpers/catalogCity.ts`, sin tocar la base) que cada par de grafías de un grupo da la misma clave, y que ningún par de grupos distintos coincide. Una discrepancia se resuelve a mano en el mapeo, no se «arregla» la consulta con `unaccent`.

Ensayo hecho en la base descartable (31/10/2026, PostgreSQL 17, `en_US.utf8`): se compararon 48 grafías (acentos compuestos y descompuestos, mayúsculas, espacios dobles, tab, espacio no separable, `\u2003`, BOM, ñ/ã/õ, ü, ç, ÿ) con `cityKey` y con `pg_temp.city_key`, byte a byte: coinciden todas salvo letras con otra marca que el mapa no cubre (`Łódź`, `Ćuprija`, `Ĩ`, `İstanbul`, `Ǻ`), que la app unifica y SQL no. Esas son justamente las que lista la segunda consulta de 2.2.c. Para repetirlo con las grafías reales: un `.mts` que imprima `cityKey(t)` en hexadecimal por cada grafía de 2.2.a/2.2.b y la misma salida desde `encode(convert_to(pg_temp.city_key(t),'UTF8'),'hex')`; deben ser idénticas.

## 2.3 Plantilla de mapeo aprobado

El propietario completa una fila por **grafía a corregir**. La «grafía canónica» es la forma correcta elegida por el propietario; **puede no existir todavía en el catálogo** (caso «Federacion»→«Federación» o «Chajari»→«Chajarí»): en ese caso el runbook la crea en `crm_cities`.

| Grafía actual (exacta, de 2.2) | Negocios (de 2.2.a o 2.2.c, menos los fusionados) | Grafía canónica (elegida por el propietario) | ¿Existe en `crm_cities`? | Aprobado por / fecha |
| --- | --- | --- | --- | --- |
| _ejemplo: `San Jose`_ | _12_ | _ejemplo: `San José`_ | _sí_ | _propietario, dd/mm/aaaa_ |
| _ejemplo: `Federacion`_ | _n_ | _ejemplo: `Federación`_ | _no, se crea_ | _propietario, dd/mm/aaaa_ |
| | | | | |

Los ejemplos vienen de la spec 104 y **no están aprobados**. Reglas del mapeo:
- Toda grafía actual y su canónica deben tener la misma `city_key`, **salvo que el propietario apruebe expresamente un cambio de ciudad** (p. ej. un error de tipeo real): esos casos se marcan «no normalizable» y se listan aparte; la transacción lo avisa pero no lo impide si están marcados.
- La grafía canónica de cada grupo es una sola (dos canónicas con la misma `city_key` es un error del mapeo).
- ñ ≠ n: «Cañada» y «Canada» **no** son el mismo grupo ni se unifican por esta vía.

## 2.4 Ejecución (ensayo primero, luego producción)

Mismos parámetros de psql que en 1.4. El operador completa los `VALUES`.

~~~sql
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SELECT set_config('crm.actor_email', :actor_email, true);

-- Frena escrituras concurrentes mientras dura la transacción.
LOCK TABLE crm_accounts, crm_cities IN SHARE ROW EXCLUSIVE MODE;

-- (crear pg_temp.city_key como en 2.2, en esta sesión)

CREATE TEMP TABLE city_map (
  old_name text PRIMARY KEY,
  canonical text NOT NULL,
  expected_accounts integer NOT NULL,                  -- «Negocios» de 2.2.a menos los fusionados
  allow_different_key boolean NOT NULL DEFAULT false   -- true solo con aprobación expresa del propietario
) ON COMMIT DROP;

INSERT INTO city_map (old_name, canonical, expected_accounts, allow_different_key) VALUES
  -- ('San Jose', 'San José', 0, false),             -- EJEMPLO, no aprobado: reemplazar
  -- ('Federacion', 'Federación', 0, false)
  ('__completar__', '__completar__', 0, false);

DO $$
DECLARE bad integer;
BEGIN
  -- La canónica es la misma ciudad (misma clave) salvo aprobación expresa.
  SELECT count(*) INTO bad FROM city_map WHERE NOT allow_different_key AND pg_temp.city_key(old_name) <> pg_temp.city_key(canonical);
  IF bad > 0 THEN RAISE EXCEPTION 'Mapeo: % fila(s) cambian la clave de ciudad sin aprobación expresa', bad; END IF;
  -- Dos canónicas distintas para la misma ciudad.
  SELECT count(*) INTO bad FROM (
    SELECT pg_temp.city_key(canonical) k FROM city_map WHERE NOT allow_different_key
     GROUP BY 1 HAVING count(DISTINCT canonical) > 1) x;
  IF bad > 0 THEN RAISE EXCEPTION 'Mapeo: % ciudad(es) con más de una grafía canónica', bad; END IF;
  -- Una canónica no puede ser, a su vez, grafía a corregir.
  SELECT count(*) INTO bad FROM city_map m JOIN city_map o ON o.old_name = m.canonical AND o.canonical <> m.canonical;
  IF bad > 0 THEN RAISE EXCEPTION 'Mapeo: una canónica figura como grafía a corregir'; END IF;
END $$;

-- Negocios afectados (congelados antes de cambiar). Los fusionados (merged_into_id) no se pueden editar:
-- crm_accounts_active_guard aborta el UPDATE. Como el mapeo es por valor y no por negocio, no se pueden «excluir» en el
-- mapeo: se dejan fuera de `affected`, se listan abajo y quedan con su grafía vieja. El conteo aprobado NO los incluye
-- (expected_accounts = «Negocios» de 2.2.a menos «of_which_merged»). Los de Papelera (deleted_at) sí se actualizan.
CREATE TEMP TABLE affected ON COMMIT DROP AS
SELECT a.id AS account_id, a.ciudad AS old_city, m.canonical AS new_city
  FROM crm_accounts a JOIN city_map m ON a.ciudad = m.old_name
 WHERE a.merged_into_id IS NULL;

-- Informativo: fusionados que quedan afuera, por grafía.
SELECT m.old_name, count(*) AS left_out_merged_accounts
  FROM crm_accounts a JOIN city_map m ON a.ciudad = m.old_name
 WHERE a.merged_into_id IS NOT NULL GROUP BY 1 ORDER BY 1;

DO $$
DECLARE diff integer;
BEGIN
  SELECT count(*) INTO diff FROM city_map m
   WHERE m.expected_accounts <> (SELECT count(*) FROM affected a WHERE a.old_city = m.old_name);
  IF diff > 0 THEN RAISE EXCEPTION 'Los conteos difieren del mapeo aprobado en % fila(s)', diff; END IF;
END $$;

-- Respaldo lógico en la base (rollback fino posterior a COMMIT).
CREATE TABLE IF NOT EXISTS city_cleanup_backup_20261031 (
  run_at timestamptz NOT NULL DEFAULT now(),
  table_name text NOT NULL, row_id bigint NOT NULL, old_value text, new_value text, old_active boolean
);
INSERT INTO city_cleanup_backup_20261031 (table_name, row_id, old_value, new_value)
SELECT 'crm_accounts', account_id, old_city, new_city FROM affected;

-- 1) Catálogo: asegurar la canónica activa. Primero se reactivan las que estaban inactivas (con respaldo)...
INSERT INTO city_cleanup_backup_20261031 (table_name, row_id, old_value, new_value, old_active)
SELECT 'crm_cities', c.id, c.name, c.name, c.active
  FROM crm_cities c WHERE c.active = false AND c.name IN (SELECT canonical FROM city_map);

UPDATE crm_cities SET active = true WHERE active = false AND name IN (SELECT canonical FROM city_map);

--    ...y después se crean las que faltan. Las creadas se anotan en el respaldo con old_active NULL
--    (en el rollback se desactivan, no se borran).
WITH created AS (
  INSERT INTO crm_cities (name)
  SELECT DISTINCT canonical FROM city_map
  ON CONFLICT (name) DO NOTHING
  RETURNING id, name)
INSERT INTO city_cleanup_backup_20261031 (table_name, row_id, old_value, new_value, old_active)
SELECT 'crm_cities', id, NULL, name, NULL FROM created;

-- 2) Negocios: actualizar la ciudad. La proyección a `leads` la hace el trigger.
UPDATE crm_accounts a
   SET ciudad = f.new_city, updated_at = now()
  FROM affected f
 WHERE a.id = f.account_id AND a.ciudad = f.old_city;

-- 3) Journal comercial (mismo formato que la app: 'account_updated', metadata {before,after}).
INSERT INTO crm_commercial_journal (account_id, contact_id, action, actor_email, actor_name, metadata)
SELECT account_id, NULL, 'account_updated', :actor_email, :actor_name,
       jsonb_build_object('before', jsonb_build_object('ciudad', old_city),
                          'after',  jsonb_build_object('ciudad', new_city),
                          'source', 'runbook-limpieza-catalogos')
  FROM affected;

-- 4) Catálogo: desactivar (nunca borrar) las grafías sobrantes que ya no usa ningún negocio.
--    Si todavía hay negocios (no fusionados) con esa grafía y no estaba en el mapeo, NO se desactiva y queda en el informe.
INSERT INTO city_cleanup_backup_20261031 (table_name, row_id, old_value, new_value, old_active)
SELECT 'crm_cities', c.id, c.name, c.name, c.active
  FROM crm_cities c
 WHERE c.active AND c.name IN (SELECT old_name FROM city_map)
   AND NOT EXISTS (SELECT 1 FROM crm_accounts a WHERE a.ciudad = c.name AND a.merged_into_id IS NULL);

UPDATE crm_cities c SET active = false
 WHERE c.active AND c.name IN (SELECT old_name FROM city_map)
   AND NOT EXISTS (SELECT 1 FROM crm_accounts a WHERE a.ciudad = c.name AND a.merged_into_id IS NULL);

-- Verificación dentro de la transacción.
SELECT m.old_name, m.canonical, m.expected_accounts,
       (SELECT count(*) FROM crm_accounts a WHERE a.ciudad = m.old_name AND a.merged_into_id IS NULL) AS accounts_still_old,   -- debe ser 0
       (SELECT count(*) FROM affected f WHERE f.old_city = m.old_name)    AS accounts_changed,         -- debe ser = expected_accounts
       (SELECT active FROM crm_cities c WHERE c.name = m.canonical)       AS canonical_active,         -- debe ser true
       (SELECT active FROM crm_cities c WHERE c.name = m.old_name)        AS old_catalog_active        -- false o NULL
  FROM city_map m ORDER BY 1;
-- Proyección a gestiones y journal de esta corrida (now() = inicio de la transacción = created_at de las filas).
SELECT (SELECT count(*) FROM leads l JOIN affected f ON f.account_id = l.account_id
         WHERE l.ciudad IS DISTINCT FROM f.new_city)                         AS leads_out_of_sync,      -- debe ser 0
       (SELECT count(*) FROM affected)                                       AS changed,
       (SELECT count(*) FROM crm_commercial_journal j
         WHERE j.metadata->>'source' = 'runbook-limpieza-catalogos' AND j.action = 'account_updated'
           AND j.created_at = now())                                         AS journaled;              -- debe ser = changed

ROLLBACK;   -- ensayo. Producción: COMMIT solo si todo cuadra.
~~~

Qué dispara solo (esperado): `crm_account_projection_sync` (actualiza `leads.ciudad` y `leads.updated_at`), `crm_accounts_live_version` / `crm_cities_live_version` (versión en vivo), `crm_accounts_active_guard` (aborta si hay un negocio fusionado; por eso `affected` los deja afuera). `crm_cities` no tiene triggers de auditoría ni de proyección.

## 2.5 Verificación posterior

Tras el `COMMIT`, en una sesión nueva: repetir 2.2.a y 2.2.b. Los grupos mapeados no deben aparecer; los que el propietario decidió no tocar sí. Además:

- Las opciones del filtro «Ciudad» (salen de los valores distintos de los negocios, `leads_GET.ts`, `work.ts`) muestran una sola grafía por ciudad.
- En Configuración, la ciudad canónica está activa y la sobrante inactiva. La fila inactiva de la grafía vieja **sigue apareciendo** como grupo en 2.2.b (se desactiva, nunca se borra): es lo esperado.
- Los negocios fusionados que quedaron afuera (2.4) mantienen su grafía vieja y siguen apareciendo en 2.2.a.
- Un negocio corregido muestra la ciudad nueva en su ficha y en la vista de gestión (proyección).

## 2.6 Plan de rollback

- **Antes del `COMMIT`:** `ROLLBACK;`.
- **Después del `COMMIT`, fino (preferido):** con `city_cleanup_backup_20261031`:

~~~sql
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT set_config('crm.actor_email', :actor_email, true);

CREATE TEMP TABLE reverted (account_id bigint, current_city text, restored_city text) ON COMMIT DROP;

-- Negocios: vuelven a su grafía anterior solo si no se tocaron desde la corrida.
WITH u AS (
  UPDATE crm_accounts a SET ciudad = b.old_value, updated_at = now()
    FROM city_cleanup_backup_20261031 b
   WHERE b.table_name = 'crm_accounts' AND a.id = b.row_id AND a.ciudad IS NOT DISTINCT FROM b.new_value
  RETURNING a.id, b.new_value, b.old_value)
INSERT INTO reverted SELECT * FROM u;

-- Journal de la reversión: mismo formato que 2.4, before/after invertidos y source distinto.
INSERT INTO crm_commercial_journal (account_id, contact_id, action, actor_email, actor_name, metadata)
SELECT account_id, NULL, 'account_updated', :actor_email, :actor_name,
       jsonb_build_object('before', jsonb_build_object('ciudad', current_city),
                          'after',  jsonb_build_object('ciudad', restored_city),
                          'source', 'runbook-limpieza-catalogos-rollback')
  FROM reverted;

-- Catálogo: vuelve al estado activo previo de las filas registradas...
UPDATE crm_cities c SET active = b.old_active
  FROM city_cleanup_backup_20261031 b
 WHERE b.table_name = 'crm_cities' AND c.id = b.row_id AND b.old_active IS NOT NULL;
-- ...y las ciudades que el runbook CREÓ (old_active NULL en el respaldo) se desactivan, no se borran.
UPDATE crm_cities c SET active = false
  FROM city_cleanup_backup_20261031 b
 WHERE b.table_name = 'crm_cities' AND c.id = b.row_id AND b.old_active IS NULL;

-- Negocios del respaldo que NO se revirtieron (alguien los editó después): los decide el propietario.
SELECT (SELECT count(*) FROM city_cleanup_backup_20261031 WHERE table_name = 'crm_accounts') AS accounts_in_backup,
       (SELECT count(*) FROM reverted)                                                       AS accounts_reverted;
COMMIT;
~~~

  Si hubo varias corridas, filtrar por `run_at`.
- **Grueso:** restaurar el respaldo completo solo si lo anterior no alcanza y revisando las escrituras posteriores (`docs/management-cleanup-runbook.md`, sección 6).
- Cuando el propietario cierra la operación: `DROP TABLE city_cleanup_backup_20261031;`.

---

## Después de la corrida (ambas partes)

1. Registrar en `docs/estado-desarrollo.md`: fecha, operador, qué mapeo aprobó el propietario (cantidades, no datos personales), SHA-256 del respaldo, conteos antes y después, resultado del ensayo y de la verificación posterior.
2. Quitar la entrada correspondiente de `docs/pendientes.md` (D4 y/o D5 de la spec 104) con el PR/commit del runbook y la fecha de ejecución.
3. Mergear este documento **no** habilita ejecutarlo. No se incluye en migraciones, deploy, seeds ni arranque (`AGENTS.md`).
4. La prevención de duplicados nuevos (409 en `addCity`, Autocomplete y ajuste al catálogo) ya está en la spec 104 bloque 2; este runbook solo corrige lo existente. Si los formularios no están desplegados cuando se corre, los duplicados pueden reaparecer.

## Qué no se verificó (supuestos a revisar)

- **Ensayado el 31/10/2026** (PostgreSQL 17.10) en una base local descartable, migrada y sembrada con datos sintéticos (variantes de acento, mayúsculas y espacios, ñ/n, un negocio fusionado, uno en Papelera, contactos fuera de catálogo): todas las consultas de solo lectura, las dos transacciones con `ROLLBACK` (la base volvió idéntica, comprobado con hashes por tabla), con `COMMIT`, la verificación posterior y el rollback fino de 1.6 y 2.6. Los errores encontrados se corrigieron en este documento. **No se ensayó contra una copia de producción:** el volumen real, el `lc_ctype` y los datos reales siguen sin probarse. Hay que correrlo en la copia restaurada antes de pedir aprobación.
- Pendiente de comprobar en la copia real: que `app_settings.value` de los dos catálogos sea JSON válido (lo es en la semilla, migración 005); el cast se hace solo sobre esas dos claves.
- `metadata` del journal: se guarda solo el campo cambiado (más `source`), con clave camelCase. La UI lo muestra bien (ver «Cómo registra cambios la app»). Si se prefiere la fila completa como hace la app, habría que completar `before`/`after` con `to_jsonb(...)` convirtiendo las claves a camelCase; no es necesario para que el historial funcione.
- **Otros lugares que guardan la ciudad como texto** (revisado en el código el 31/10/2026; esta limpieza solo toca `crm_accounts.ciudad`, `leads.ciudad` por proyección y `crm_cities`):
  - `app_settings` clave `business_list_team_defaults_v1` (vistas y presets compartidos del listado de negocios, `business_list_defaults.ts`, `business_system_view_convert.ts`): los filtros `filters.ciudades` / `excludeCiudades` guardan nombres de ciudad exactos. Si un preset filtra por una grafía vieja (p. ej. `Federacion`) dejará de devolver negocios. Revisar con `SELECT value FROM app_settings WHERE key = 'business_list_team_defaults_v1'` buscando las grafías del mapeo; corregirlas es una edición de Configuración, no de este SQL.
  - Preferencias personales del listado: viven en el `localStorage` de cada usuario (`readPersonalPreferences`), fuera de la base. Un filtro guardado con la grafía vieja queda huérfano; no se puede corregir desde SQL. Avisar al equipo.
  - `lead_journal.lead_city` (historial de gestiones, filtro «Ciudad» de `/historial`): copia inmutable de la ciudad al momento del evento. **No se toca**: el historial viejo conserva la grafía vieja y el filtro de ciudad del historial puede listar las dos.
  - Sin ciudad guardada como texto: `crm_priority_rules` (`pipeline.ts`), `crm_work_followup`, `crm_data_quality` y las plantillas de mensajes (usan la variable `{{city}}` del negocio). Los lotes de importación (`businessImport.ts`) solo leen la ciudad al importar; los ya importados viven en `crm_accounts`.
  - Los filtros por ciudad de la lista (`leads_GET.ts`), Mi día (`work.ts`) y analítica (`analytics_GET.ts`) comparan por igualdad exacta contra `crm_accounts.ciudad` / `leads.ciudad`: se benefician de la limpieza sin cambios.
- Equivalencia de `pg_temp.city_key` con `cityKey`: comprobada con 48 grafías (ver 2.2.d); en producción repetirla con las grafías reales.
- Negocios fusionados (`merged_into_id`): quedan fuera de las dos transacciones y se informan; los de Papelera (`deleted_at`) sí se actualizan.
