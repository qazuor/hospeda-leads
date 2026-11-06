# Spec 107 — Negocios vinculados con el mismo vendedor

Estado: **aprobada por el propietario** (06/11/2026; recomendaciones aceptadas en D1 a D6). Origen: la deduplicación de producción del 05 y 06/11/2026. Algunos negocios son del mismo dueño pero **no son el mismo negocio** (no se fusionan) y el propietario quiere que **siempre tengan el mismo vendedor**. Hoy eso vive solo en una nota de texto («Mismo dueño que #X: siempre con el mismo vendedor») que ningún proceso lee. Tipo: concepto nuevo de datos (grupo de negocios con vendedor compartido) y su cumplimiento en todos los caminos que cambian el responsable del negocio. Migración: **065** (tentativa; ver sección 18). Relacionada: [spec 106](106-negocio-con-varias-verticales.md) (varias verticales por negocio). **Esta spec no depende de la 106** y se puede implementar antes o después.

Respeta `AGENTS.md` (negocio, persona y gestión son entidades distintas; permisos en el servidor; nada escribe datos de producción; migraciones inmutables) y `docs/decisiones.md` (línea 157: compartir domicilio, teléfono o propietario **no** confirma identidad entre registros, por eso esto es un vínculo y no una fusión; línea 158: no fusionar, reclasificar ni reasignar por iniciativa de una auditoría; línea 397: siempre el camino más simple para el vendedor; línea 466: al desactivar un usuario sus negocios activos se reasignan a quien elige el administrador).

**Ningún bloque escribe datos de producción.** Los 5 pares ya identificados se cargan con el runbook de la sección 14, que ejecuta el operador con aprobación del propietario.

## 1. Problema

1. Pares creados el 06/11/2026 que deben ir siempre juntos: #73↔#184 (Tierra Linda), #1486↔#1556 (Aire de costa / Aire de campo), #2065↔#2070 (El Volcán), #2296↔#2315 (Destacados), #2875↔#2881 (Chocolate).
2. La redistribución (`src/helpers/businessReassignment.ts`) reparte **de a uno** todos los negocios en estado «Nuevo». Puede mandar cada mitad de un par a un vendedor distinto, o mover la mitad «Nueva» lejos de la que ya está en gestión.
3. Las reasignaciones manuales (ficha, insignia, cambio masivo) mueven solo el negocio elegido.
4. No existe forma de ver ni de marcar el vínculo desde la ficha; la nota de texto no se ve en la lista ni en la redistribución.

## 2. Objetivos y no objetivos

### Objetivos

1. Un administrador vincula dos o más negocios como «mismo dueño, mismo vendedor» desde la ficha, y los desvincula.
2. Todo camino que cambia el responsable de un negocio activo respeta el grupo: la redistribución, la reasignación al desactivar un usuario, la ficha, la insignia, el cambio masivo y la fusión.
3. La vista previa de la redistribución muestra los grupos y lo que se mueve junto.
4. Tests unitarios de `createBusinessReassignmentPlan` (hoy no tiene) y de integración del `POST` de la redistribución.

### No objetivos

- Fusionar los negocios vinculados (siguen siendo registros separados, con sus personas, gestiones y estados).
- Sincronizar responsables de **gestiones** o tareas entre negocios vinculados: el vínculo es sobre el responsable del negocio. Cada reasignación sigue moviendo lo que mueve hoy.
- Sugerir vínculos automáticamente desde la detección de duplicados (`business_duplicate_check.ts`, tipo `shared_person_or_related`). Se puede agregar después.
- Otros tipos de vínculo (cadena, franquicia, mismo grupo comercial).
- Trabajo solo de accesibilidad (diferido por el propietario).

## 3. Hallazgos

Verificado en `origin/staging` el 06/11/2026 (rama `docs/spec-106-107-verticals-linked`, `0504cbd`). Las líneas citadas son de esta rama.

### 3.1 No hay concepto de vínculo

- Lo único parecido es la fusión: `crm_accounts.merged_into_id`, `crm_account_merges` y `crm_account_family()` (`migrations/009_data_quality.sql:35-37`), que siguen la cadena de fusiones. La guardia `crm_active_account_guard` impide actualizar un negocio fusionado (`009:38-48`).
- La detección de duplicados calcula relaciones al vuelo y no guarda nada.

### 3.2 Quién cambia el responsable del negocio

| Camino | Dónde | Quién | Alcance hoy |
| --- | --- | --- | --- |
| Ficha (`account_save`) | `src/endpoints/commercial.ts:94-96,122-142` | Solo admin (`checkResponsible`) | Un negocio; mueve la tarea «Volver a contactar» (decisión 7A) |
| Insignia en línea | `src/endpoints/leads_quick_POST.ts:20-22,49-52` → `updateBusinessFields` | Solo admin | Un negocio |
| Cambio masivo | `src/endpoints/leads_bulk_POST.ts:24-26,44-47` → `updateBusinessFields` | Solo admin | Los seleccionados, con vista previa y huella (`:39-41`) |
| Escritor común | `src/helpers/updateBusinessFields.ts:8-22` | — | Bloquea en orden de id, valida responsable activo, journal `account_updated`, `reassignRecontactTask` |
| Redistribución | `src/endpoints/business_reassignment.ts:13-59` | Solo admin | Todos los «Nuevos» activos |
| Desactivar usuario | `src/endpoints/settings_save_POST.ts:307-338` | Solo admin | **Todos** los negocios activos no archivados del usuario van al mismo receptor (`:326-328`) |
| Derivar a Leandro | `src/endpoints/pipeline.ts:162-165` y vuelta `:238-240` | Según la gestión | El negocio pasa a Leandro y guarda `referred_original_owner_email` |
| Fusión | `src/helpers/dataQualityService.ts:154-178` | Solo admin | El destino **conserva** su responsable (`assignedUserEmail` no está en `businessFields`, `dataNormalization.ts:3-5`) |
| Importación | `dataQualityService.ts:129,139` | Admin o clave | Solo al crear (no hay vínculos todavía); la actualización no cambia responsable |

### 3.3 La redistribución

- `createBusinessReassignmentPlan(users,accounts)` (`businessReassignment.ts:9-37`) es pura. Elegibles: `status='new'`, sin borrar, sin archivar, sin fusionar (`:11`), ordenados por id. Los demás cuentan como «fijos» del vendedor que los tiene (`:15-20`). Greedy: cada elegible va al receptor con menos total (fijos + nuevos asignados), desempate por nombre y email (`:24-30`). Todo elegible se reparte, aunque ya esté con alguien.
- Huella: sha256 de receptores y de `[id,status,assignedUserEmail,deletedAt,archivedAt,mergedIntoId]` por negocio (`:35`).
- `loadPlan` lee esas seis columnas de todos los negocios no fusionados (`business_reassignment.ts:13-19`); receptores: usuarios `role='user'` activos.
- `POST` recalcula con `FOR UPDATE`, compara la huella, actualiza en tandas de 250 solo si siguen «Nuevos» (`:43-51`) y deja `business_assignment_rebalanced` (`:53-56`).
- UI: `src/components/BusinessReassignment.tsx` (40 líneas), sección «reassignment» de Configuración.
- **Tests:** ningún spec unitario; `scripts/test-user-admin.ts:44,48` solo llama al `GET`.

### 3.4 Desactivar un usuario

Mueve todos los negocios activos no archivados del usuario al mismo receptor (`settings_save_POST.ts:326-328`). Un grupo consistente (todos con ese vendedor) **queda junto sin cambios**. Lo que no cubre: miembros archivados (no se mueven, `:326`) y grupos que ya estaban inconsistentes.

## 4. Resumen de bloques

| Bloque | Qué | Necesita decisión | Migración |
| --- | --- | --- | --- |
| 1 | Tablas de grupo, helper de vendedor, lecturas en la ficha y MCP | D1 | **065** |
| 2 | Vincular y desvincular desde la ficha | D2, D3 | No |
| 3 | Reasignación manual, masiva y en línea respeta el grupo | D4 | No |
| 4 | Redistribución por grupos + tests unitarios e integración | — | No |
| 5 | Desactivar usuario, derivación, fusión, Papelera y archivo | D5, D6 | No |
| 6 | Documentación, script de carga y runbook | — | No |

Orden: 1 → 2 → (3, 4, 5 en paralelo) → 6. Los tests unitarios de la redistribución **actual** (4.4) pueden ir antes que todo, como red de seguridad.

## 5. Modelo de datos (bloque 1)

### 5.1 Migración 065

```sql
CREATE TABLE crm_account_seller_groups (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  note text CHECK (note IS NULL OR length(note) <= 500)
);
CREATE TABLE crm_account_seller_group_members (
  group_id bigint NOT NULL REFERENCES crm_account_seller_groups(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text NOT NULL,
  PRIMARY KEY (group_id, account_id),
  CONSTRAINT crm_account_seller_group_members_one_group UNIQUE (account_id)
);
CREATE TRIGGER crm_account_seller_groups_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_account_seller_groups
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
CREATE TRIGGER crm_account_seller_group_members_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_account_seller_group_members
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
```

- Un negocio está en **un solo** grupo (`UNIQUE(account_id)`), así que el vínculo es transitivo por construcción: si A va con B y B con C, los tres son un grupo.
- Tablas aparte y no una columna en `crm_accounts`: vincular no toca `crm_accounts.updated_at`, que usan como revisión la importación (`dataQualityService.ts:138`) y los bloqueos optimistas; tampoco dispara los triggers de `crm_accounts`.
- Sin datos: la migración no crea grupos. El mínimo de 2 miembros lo cuida la aplicación (un grupo que queda con 1 se borra).
- Alternativas en D1.

### 5.2 Regla de vendedor del grupo

- **Miembros activos:** sin borrar, sin fusionar y sin archivar. Los demás siguen en el grupo pero no cuentan (D5).
- **Vendedor efectivo** de un negocio: `referred_original_owner_email` si está derivado a Leandro (`referred_to_leandro`), si no `assigned_user_email` (D6).
- **Invariante:** todos los miembros activos tienen el mismo vendedor efectivo. Un grupo que no lo cumple es **inconsistente**: se muestra en la ficha y en la redistribución, y solo lo corrige un admin (nada se mueve solo).

### 5.3 Helper (`src/helpers/accountSellerGroups.ts`, nuevo)

RO-RO, todas con la transacción:

- `loadSellerGroups({trx,accountIds})`: grupo y miembros (id, nombre, estado, responsable, activo).
- `expandToSellerGroups({trx,accountIds})`: los ids más los miembros activos de sus grupos, sin repetidos, ordenados (para bloquear en orden de id como `updateBusinessFields`).
- `groupSellerState({members})` (pura): `consistent` con su vendedor, `inconsistent` con la lista de vendedores, o `empty`.
- `linkAccounts({trx,accountIds,sellerEmail,actor,note})` y `unlinkAccount({trx,accountId,actor})` (bloque 2).

## 6. Vincular y desvincular (bloque 2)

### 6.1 En la ficha

- Sección **«Negocios vinculados (mismo dueño)»** en el panel del negocio (`CommercialPanel.tsx`), solo si el negocio tiene grupo o si quien mira puede vincular. Lista cada miembro con `H123 · Nombre · Localidad · Responsable` y enlace a su ficha. Un miembro archivado, en Papelera o fusionado se muestra atenuado con su estado.
- Grupo inconsistente: aviso «Estos negocios tienen que tener el mismo vendedor y hoy no lo tienen.» con el botón «Igualar vendedor» (solo admin, abre el diálogo de 6.2 con el vendedor a elegir).
- **«Vincular negocio»** (según D2, recomendado solo admin): abre la búsqueda de negocios que ya usa la Bandeja (`InboundBusinessPicker.tsx`), excluye fusionados y el propio negocio. Si el elegido ya está en otro grupo, se ofrece unir los dos grupos.
- **«Desvincular»** en cada miembro (solo admin), con motivo opcional. Si el grupo queda con un miembro, se borra.

### 6.2 Vendedores distintos al vincular (D3)

Recomendado: si los miembros activos tienen vendedores distintos, el diálogo muestra «Estos negocios tienen distinto vendedor. ¿Con quién quedan?» con cada vendedor actual (y cuántos negocios tiene en el grupo), preseleccionado el del negocio desde el que se abrió. Al confirmar, en una transacción: crea o une el grupo y reasigna con el mismo camino de 7.1 (journal, tarea «Volver a contactar»). Sin elegir, no se vincula.

### 6.3 Contrato

`commercial.ts`, acciones nuevas (Zod estricto):

- `account_link`: `{accountIds: id[2..10], sellerEmail?: email, note?: string}`. 409 «Elegí con qué vendedor quedan.» si hay vendedores distintos y falta `sellerEmail`; 409 si un negocio está fusionado; 400 si el grupo resultante pasa de 10.
- `account_unlink`: `{accountId: id, reason?: string}`.
- Ambas: solo admin (servidor), bloqueo de los negocios en orden de id, `assertActiveAssignee` para `sellerEmail`.
- Journal en **cada** negocio afectado: `account_seller_group_linked` / `account_seller_group_unlinked` con `{groupId, members, sellerEmail}`; etiquetas en `auditChanges.ts` y en el historial global.
- `GET` de la ficha (`commercial.ts:65`) suma `sellerGroup: {id, state, members[]} | null`.

## 7. Reasignación manual, en línea y masiva (bloque 3, D4)

### 7.1 Regla recomendada: se mueve el grupo

Cambiar el responsable de un miembro activo cambia el de **todos los miembros activos** del grupo, en la misma transacción, con un journal por negocio y `reassignRecontactTask` para cada uno.

- **Servidor:** `updateBusinessFields` llama a `expandToSellerGroups` cuando `changes.assignedUserEmail` está definido, antes de bloquear. La ficha (`account_save`) usa el mismo helper para el cambio de responsable.
- **Ficha e insignia:** antes de guardar, el diálogo muestra «También cambia el responsable de: H184 · Tierra Linda.» (dato del `GET` de la ficha o de la fila). Un solo clic, sin paso extra.
- **Cambio masivo:** la vista previa (`leads_bulk_POST.ts:41`) lista los negocios agregados por vínculo, marcados «vinculado a H73». La huella incluye la lista expandida, así que si alguien vincula o desvincula durante la revisión la aplicación pide revisar de nuevo (mensaje de hoy).
- **Grupo inconsistente:** cambiar el responsable de un miembro lo **iguala** (todos quedan con el nuevo); el aviso lo dice.

### 7.2 Gestiones y tareas

No cambia nada: las gestiones y tareas de los negocios vinculados siguen las reglas de hoy (la reasignación del negocio no mueve gestiones, salvo al desactivar un usuario).

## 8. Redistribución por grupos (bloque 4)

### 8.1 Unidades

`createBusinessReassignmentPlan` recibe además `groupId: string|null` y `effectiveSellerEmail` por negocio. Arma **unidades** antes del greedy:

1. Negocio sin grupo: una unidad de peso 1, como hoy.
2. Grupo con algún miembro activo **no elegible** (en gestión, revisado, etc.): grupo **anclado**. Si los no elegibles tienen todos el mismo vendedor efectivo, los miembros elegibles van con ese vendedor (aunque no sea receptor, por ejemplo un admin) y suman a su `newAfter`; no compiten en el greedy. Si los anclas tienen vendedores distintos: grupo **en conflicto**, sus elegibles **no se mueven** y se listan.
3. Grupo con todos sus miembros activos elegibles: una unidad de peso N.
4. Las unidades se recorren por el menor id de cada una (determinístico). El greedy elige el receptor con menor total y suma el peso completo; el desempate es el de hoy.

Los totales de cada vendedor cuentan igual que hoy; un ancla ya cuenta como «fijo».

### 8.2 Plan y huella

- `ReassignmentPlan` suma `groups: {groupId, accountIds, toEmail|null, kind:'anchored'|'together'|'conflict'}[]` y cada `ReassignmentMove` lleva `groupId|null`.
- La huella suma, por negocio, `groupId` y `effectiveSellerEmail`: vincular, desvincular o derivar durante la revisión invalida la vista previa.
- `loadPlan` hace `LEFT JOIN crm_account_seller_group_members` y lee `referred_to_leandro`/`referred_original_owner_email`; con `lock=true` también bloquea las filas de miembros (`FOR SHARE`) para que nadie vincule a mitad de la ejecución.
- `POST`: igual que hoy; el journal agrega `groupId` y `reason:'business_state_new_rebalance_linked'` en los movimientos de grupo.

### 8.3 Vista previa (`BusinessReassignment.tsx`)

Debajo del resumen por vendedor, un bloque **«Negocios vinculados»**: «N grupos se mueven juntos» con la lista (`H73 + H184 → Ana`) y, si hay, **«Grupos en conflicto (no se mueven)»** con el enlace a cada ficha para igualar el vendedor. Sin grupos no se muestra nada.

### 8.4 Tests unitarios del planificador actual

Antes de tocar el greedy: `src/helpers/businessReassignment.spec.ts` (nuevo) fija el comportamiento de hoy (ver 12).

## 9. Desactivar usuario, derivación, fusión, Papelera y archivo (bloque 5)

- **Desactivar usuario** (`settings_save_POST.ts:307-338`): sin cambio de lógica; un grupo consistente queda junto. El diálogo avisa si el usuario tiene miembros de un grupo inconsistente o miembros archivados de un grupo («H184 está archivado y queda con {usuario}»). Test de integración nuevo en `test:user-admin`.
- **Derivar a Leandro** (D6): no se propaga al grupo; el vendedor efectivo del negocio derivado sigue siendo `referred_original_owner_email`, así que el grupo no queda inconsistente. Al volver (`pipeline.ts:238-240`) se restaura al responsable original como hoy.
- **Fusión** (`merge_confirm`):
  - Origen en un grupo y destino sin grupo: el destino **ocupa el lugar** del origen en el grupo.
  - Ambos en el mismo grupo: el origen sale del grupo; si queda uno solo, el grupo se borra.
  - En grupos distintos, o el destino tiene otro vendedor que el grupo del origen: la fusión se bloquea con «Estos negocios están vinculados con otros. Igualá el vendedor o desvinculalos antes de fusionar.».
  - El preview muestra el grupo resultante; `snapshot` incluye las filas de miembros (el token cambia si alguien vincula durante la revisión).
- **Papelera y archivo** (D5): el miembro sigue en el grupo pero deja de contar. Al restaurar o desarchivar, si su vendedor no coincide con el del grupo, la ficha muestra el aviso de grupo inconsistente (no se reasigna solo).

## 10. Permisos y contratos

- Vincular, desvincular e igualar vendedor: solo admin (D2), verificado en el servidor; mismo criterio que cambiar el responsable hoy (`commercial.ts:94-96`, `leads_quick_POST.ts:20`, `leads_bulk_POST.ts:24`).
- Ver el grupo: quien puede leer el negocio; los miembros que el vendedor no puede leer se muestran como «H184 · negocio de otro vendedor» sin datos (la lectura de un negocio no da nada más, `AGENTS.md`). Con la regla de grupo eso solo pasa en grupos inconsistentes.
- Contratos **aditivos**: `account_link`, `account_unlink`, `sellerGroup` en la ficha, `groups` y `groupId` en el plan, `linked` en la vista previa masiva.
- MCP: `GRANT SELECT` sobre las dos tablas en `scripts/provision-mcp-reader.mjs:19` y `scripts/test-mcp.ts:26`; `crm_get_business` suma `negocios_vinculados: [{id,nombre}]` (`src/server/mcp/data.ts`). El MCP no está habilitado en producción.

## 11. Componentes y funciones

| Archivo | Cambio |
| --- | --- |
| `migrations/065_account_seller_groups.sql` | Tablas y triggers de versión |
| `src/helpers/schema.tsx` | Tipos de las dos tablas |
| `src/helpers/accountSellerGroups.ts` (nuevo) | 5.3 |
| `src/endpoints/commercial.ts` / `.schema.ts` | `account_link`, `account_unlink`, `sellerGroup`, cambio de responsable por grupo |
| `src/helpers/updateBusinessFields.ts` | Expande al grupo cuando cambia el responsable |
| `src/endpoints/leads_bulk_POST.ts` / `.schema.ts` | Vista previa con vinculados |
| `src/helpers/businessReassignment.ts`, `src/endpoints/business_reassignment.ts` | Unidades, grupos, huella |
| `src/components/BusinessReassignment.tsx` | Bloque «Negocios vinculados» |
| `src/components/BusinessSellerGroupSection.tsx` (nuevo), `CommercialPanel.tsx`, `InlineBusinessBadge.tsx`, `CommercialEditor.tsx`, `BulkChangeReview.tsx` | UI de 6 y 7 |
| `src/helpers/dataQualityService.ts` | Fusión (9) |
| `src/endpoints/settings_save_POST.ts` y su diálogo | Avisos al desactivar |
| `src/helpers/auditChanges.ts`, `src/helpers/globalHistoryServer.ts` | Etiquetas |
| `src/server/mcp/data.ts`, `scripts/provision-mcp-reader.mjs` | Lectura y permisos |
| `scripts/load-seller-groups.mjs` (nuevo) | Carga del runbook 14, en seco por defecto |

## 12. Plan de tests

No se corren suites completas en local: cada PR corre los archivos de abajo y CI corre el resto.

- **Unitarios (Vitest)**, `src/helpers/businessReassignment.spec.ts` (nuevo):
  - Comportamiento actual (antes de cambiar nada): solo `new` activos son elegibles; borrados, archivados y fusionados cuentan como fijos; el greedy reparte por menor total con desempate por nombre y email; un negocio que ya está con el elegido no genera movimiento; sin receptores no hay movimientos; `unassignedLocked` cuenta fijos sin responsable; la huella es estable con el mismo input y cambia si cambia cualquier campo.
  - Grupos: dos nuevos vinculados van al mismo receptor; grupo de 3 cuenta como 3 en los totales; nuevo vinculado a uno en gestión va con ese vendedor aunque no sea receptor; anclas con vendedores distintos → `conflict` y ningún movimiento; ancla derivada a Leandro usa el vendedor original; miembro archivado no ancla; la huella cambia al vincular o desvincular; orden determinístico por menor id.
  - `src/helpers/accountSellerGroups.spec.ts` (nuevo): `groupSellerState` y la expansión.
  - Componentes: `BusinessSellerGroupSection.spec.tsx` (nuevo; admin ve vincular/desvincular, vendedor solo lectura, aviso de inconsistente) y el bloque nuevo de `BusinessReassignment`.
- **Integración** (base local descartable, `CRM_TEST_DATABASE=1`, confirmando antes `DATABASE_URL`):
  - `scripts/test-business-reassignment.ts` (nuevo, `npm run test:business-reassignment`, sumado a `.github/workflows/ci.yml`): `GET` devuelve grupos; `POST` con huella vieja → error y nada cambia; `POST` mueve el par junto, solo si siguen «Nuevos», con un journal por negocio; vincular entre el `GET` y el `POST` invalida la huella; no admin → 403.
  - `test:commercial`: `account_link`/`account_unlink` (solo admin, vendedores distintos sin `sellerEmail` → 409, fusionado → 409, tope 10, grupo de 1 se borra); cambio de responsable en ficha, insignia y masivo mueve el grupo y su tarea «Volver a contactar».
  - `test:quality`: las tres reglas de fusión de 9.
  - `test:user-admin`: desactivar mantiene el grupo junto.
  - `test:permissions`: vendedor no vincula; ve el grupo sin datos de negocios ajenos.
  - `test:mcp`: permisos de las tablas nuevas.
- **Navegador**: un caso en `tests/browser/*.e2e.ts` que vincula dos negocios desde la ficha y cambia el responsable de uno. Corre en CI.

## 13. Riesgos

- **Ventana de deploy:** un contenedor viejo puede reasignar un miembro solo. Se detecta con el aviso de grupo inconsistente y la consulta de 14.1 paso 6.
- **Movimientos más grandes de lo esperado:** reasignar un negocio mueve también sus vinculados. Mitigado con el aviso previo en ficha, insignia y vista previa masiva.
- **Redistribución menos pareja:** las unidades de peso N pueden dejar a un vendedor con N−1 negocios más que otro. Aceptable con grupos chicos (hoy, pares).
- **Conflictos de bloqueo:** expandir al grupo bloquea más filas; se bloquea siempre en orden de id para no invertir el orden negocio→gestión.
- **Grupos inconsistentes** viejos o creados por un camino no cubierto: nunca se corrigen solos, para no reasignar sin que un admin lo decida (línea 158).

## 14. Runbook: los 5 pares existentes

Solo lo ejecuta **el operador con aprobación explícita del propietario** para esta operación. Ningún agente lo ejecuta ni tiene conexión a producción.

### 14.1 Pasos

1. Confirmar que la 065 está aplicada y que la versión desplegada incluye los bloques 1 a 5.
2. Respaldo: `pg_dump` completo a `~/backups/hospeda-crm/` con fecha.
3. Archivo de entrada fuera de Git (p. ej. `~/backups/hospeda-crm/seller-groups-20261106.json`): `[[73,184],[1486,1556],[2065,2070],[2296,2315],[2875,2881]]`.
4. Ensayo sobre una copia restaurada: `node scripts/load-seller-groups.mjs --file <json>` (en seco por defecto). Por par muestra nombres, estados, responsables y si ya tienen grupo; marca los que tienen vendedores distintos, están fusionados o en Papelera. No escribe nada.
5. El propietario revisa. Para un par con vendedores distintos, indica el vendedor en el archivo (`{"accounts":[73,184],"sellerEmail":"…"}`); sin eso el script lo saltea.
6. Aplicar en producción con `--apply`: una transacción por par con `linkAccounts` (actor = el operador, nota «Mismo dueño, cargado desde la deduplicación del 06/11/2026»). Verificación de solo lectura: 5 grupos, 10 miembros, todos consistentes.
7. **Opcional, aparte y con su propia aprobación:** quitar de las notas del negocio la línea «Mismo dueño que #X: siempre con el mismo vendedor». Recomendado: dejarlas hasta que el propietario vea el vínculo funcionando en producción; después, editarlas desde la ficha (queda en el historial) o con un `UPDATE` revisado que solo quite esa línea exacta.
8. Vuelta atrás: «Desvincular» desde la ficha. No se restaura el dump encima de producción (decisiones línea 161).

## 15. Orden de implementación (PRs a `staging`)

1. Tests unitarios del planificador actual (sin cambios de código).
2. Bloque 1 (065 + helper + lectura en ficha y MCP).
3. Bloque 2.
4. Bloques 3, 4 y 5 (PRs separados).
5. Bloque 6: `docs/mapa-tecnico.md`, `docs/decisiones.md`, `src/content/user-guide.json` y `docs/guia-de-uso.md`, `docs/estado-desarrollo.md`, `docs/pendientes.md`; script de carga.
6. Promoción a `main` y deploy solo cuando el propietario lo pida; después, runbook 14.

## 16. Aceptación

- **Dado** #73 y #184 vinculados con Ana, **cuando** el admin cambia el responsable de #73 a Bruno desde la ficha, **entonces** el diálogo avisa que también cambia #184, y al guardar los dos quedan con Bruno, cada uno con su journal y su tarea «Volver a contactar» movida.
- **Dado** los dos «Nuevos», **cuando** se redistribuye, **entonces** van al mismo vendedor y la vista previa los muestra juntos.
- **Dado** #73 en gestión con Ana y #184 «Nuevo», **entonces** la redistribución deja #184 con Ana.
- **Dado** un grupo con vendedores distintos, **entonces** la redistribución no mueve sus «Nuevos», los lista como conflicto y la ficha ofrece «Igualar vendedor» solo al admin.
- **Dado** un vendedor, **entonces** ve la sección de vinculados pero no puede vincular ni desvincular; el servidor responde 403 si lo intenta.
- **Dado** la fusión de un miembro con un negocio sin grupo, **entonces** el destino queda en el grupo.
- `npm run typecheck`, `npm test`, `npm run build` e integraciones listadas en verde en CI sobre el SHA de cada PR.

## 17. Decisiones abiertas

1. **D1 — Modelo de datos.**
   - **Opción A:** tabla de grupos + tabla de miembros con `UNIQUE(account_id)` (5.1).
     - Pro: transitivo por construcción; no toca `crm_accounts` ni sus revisiones; un grupo puede tener nota y autor.
     - Contra: dos tablas.
   - **Opción B:** columna `seller_group_id` en `crm_accounts`.
     - Pro: una sola columna, lecturas simples.
     - Contra: vincular cambia `crm_accounts` (triggers, `updated_at` usado como revisión por la importación y bloqueos optimistas).
   - **Opción C:** tabla de pares `(account_a, account_b)`.
     - Contra: grupos de 3 o más necesitan cierre transitivo en cada lectura; se pueden armar pares contradictorios.
   - **Recomendación: A.**
2. **D2 — Quién vincula y desvincula.**
   - **Opción A:** solo admin.
     - Pro: el vínculo decide reasignaciones, y cambiar el responsable ya es solo de admin.
     - Contra: el vendedor que descubre el vínculo tiene que pedirlo.
   - **Opción B:** también el vendedor, si es responsable de todos los negocios del grupo.
     - Pro: el vendedor lo resuelve solo.
     - Contra: un vínculo mal puesto arrastra negocios en la próxima reasignación; más casos de permisos.
   - **Recomendación: A.** El vendedor ve la sección y, si hace falta, lo anota en la ficha para el admin.
3. **D3 — Vincular negocios con vendedores distintos.**
   - **Opción A:** el admin elige con quién quedan y se reasigna en el mismo paso (6.2).
     - Pro: un solo diálogo; nunca queda un grupo inconsistente nuevo.
     - Contra: vincular puede mover negocios.
   - **Opción B:** bloquear hasta que tengan el mismo vendedor.
     - Contra: dos pasos en pantallas distintas.
   - **Recomendación: A.**
4. **D4 — Reasignar a mano un miembro.**
   - **Opción A:** se mueve todo el grupo, con aviso previo (7.1).
     - Pro: el vínculo se cumple sin pasos extra; el admin ve qué más cambia.
     - Contra: un admin distraído puede mover más de lo que quería (lo ve en el aviso).
   - **Opción B:** se bloquea con «H73 está vinculado con H184: reasignalos juntos.» y un botón que abre el cambio para los dos.
     - Pro: explícito.
     - Contra: un paso más cada vez.
   - **Recomendación: A.**
5. **D5 — Miembros archivados o en Papelera.**
   - **Opción A:** siguen en el grupo, no cuentan para la regla; al volver, aviso si el vendedor no coincide.
     - Pro: no se pierde el vínculo; no se reasigna nada solo.
     - Contra: un grupo puede mostrarse inconsistente después de restaurar.
   - **Opción B:** se desvinculan solos al archivar o borrar.
     - Contra: al volver hay que vincular de nuevo; se pierde el dato.
   - **Opción C:** archivar o borrar un miembro mueve o bloquea al resto.
     - Contra: mezcla el ciclo de vida del negocio con el vínculo.
   - **Recomendación: A.**
6. **D6 — Derivar a Leandro un miembro.**
   - **Opción A:** no se propaga; para el grupo cuenta el responsable original.
     - Pro: la derivación es por una gestión y es temporal; al volver todo queda como estaba.
     - Contra: mientras dure, los dos negocios muestran responsables distintos.
   - **Opción B:** se deriva todo el grupo.
     - Contra: deriva negocios que no tienen nada que ver con esa gestión; la vuelta tiene que restaurar a todos.
   - **Recomendación: A.**

Defaults que la spec ya eligió (no son bifurcaciones): un negocio en un solo grupo; tope de 10 miembros; los grupos inconsistentes nunca se corrigen solos; gestiones y tareas no se sincronizan; la fusión bloquea si mezcla grupos o vendedores.

### Decisión del propietario (06/11/2026)

El propietario aceptó todas las recomendaciones (D1 a D6, opción A salvo donde la recomendación indica otra). La sección queda como registro de las alternativas.

## 18. Migraciones y datos

- **065** (tentativa) crea las dos tablas sin datos. Si esta spec llega a `staging` antes que la [106](106-negocio-con-varias-verticales.md), toma la **064** y la 106 pasa a la 065: el número final lo fija el PR que se mergea segundo. No se edita ninguna migración aplicada.
- Datos de producción: solo el runbook 14, con aprobación del propietario. La migración no crea grupos ni toca notas.
