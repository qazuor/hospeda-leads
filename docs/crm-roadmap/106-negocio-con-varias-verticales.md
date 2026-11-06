# Spec 106 — Un negocio con varias verticales

Estado: **aprobada por el propietario** (06/11/2026; recomendaciones aceptadas en D1 a D10). Origen: la deduplicación de producción del 05 y 06/11/2026, donde el propietario fusionó negocios que son una sola propiedad con dos ofertas públicas (hotel con restaurante abierto al público, complejo termal con cabañas, estancia con experiencias) y pidió que el negocio fusionado lleve **todas** sus verticales. Tipo: cambio de modelo de datos (clasificación del negocio de un par a una lista) con impacto en formularios, lista de Negocios, filtros, importación, fusión, mensajes, material de venta, MCP e historial. Migración: **066** (tabla nueva y backfill desde las columnas actuales). Relacionada: [spec 107](107-negocios-vinculados-mismo-vendedor.md) (negocios vinculados con el mismo vendedor), que no depende de esta.

Decisión del propietario que fija el diseño: **«Todas iguales»**. Un negocio tiene N pares (vertical, subtipo) y el modelo de datos no distingue principal de secundaria. Donde una pantalla o un texto necesitan un solo valor, la spec define una regla determinística de visualización (D1), que no se guarda como dato.

Respeta `AGENTS.md` (negocio, persona y gestión son entidades distintas; permisos de servidor y «No contactar» en todo camino de escritura; migraciones inmutables; nada escribe datos de producción) y `docs/decisiones.md` (línea 55: los catálogos usan sus valores reales y no se renombran verticales en silencio; línea 67: un pedido visual no cambia contratos; línea 158: verticales adicionales sobre negocios existentes se revisan antes de ejecutar, nunca por iniciativa de una auditoría; línea 278: en Negocios no se filtra por tipo de gestión porque un negocio tiene gestiones de varios tipos; línea 397: **siempre el camino más simple para el vendedor**; línea 447, spec 104 D6: rótulo del email «HOSPEDA · {vertical}»).

**Ningún bloque escribe datos de producción.** La migración solo copia el par que ya tiene cada negocio; las 14 verticales pendientes se cargan con el runbook de la sección 13, que ejecuta el operador con aprobación del propietario.

## 1. Problema

1. `crm_accounts.tipo` y `crm_accounts.subtipo` son un único par de texto. Un negocio como #2314 Fortunata (Alojamiento/Hotel y Gastronomía/Restaurante) solo puede mostrarse como una de las dos cosas.
2. Al fusionar, `merge_confirm` obliga a elegir el `tipo` y el `subtipo` de origen **o** de destino; la otra clasificación se pierde.
3. Los filtros, el material de venta y los modelos de mensaje razonan con esa única vertical: un filtro «Gastronomía» no encuentra a Fortunata si quedó como Alojamiento, y el selector de material la trata como «De otras verticales».
4. 14 negocios ya esperan su segunda (o tercera) vertical (archivo en el VPS, sección 13). #3393 Termas Villa Elisa necesita **la misma vertical dos veces** con subtipos distintos (Alojamiento/Camping y Alojamiento/Cabaña).

## 2. Objetivos y no objetivos

### Objetivos

1. Un negocio guarda de 0 a 8 pares (vertical, subtipo), todos iguales, validados contra los catálogos de Configuración.
2. Todo lugar que lee o escribe la clasificación del negocio pasa a la lista: ficha, alta rápida, insignia en línea, lista y tarjeta de Negocios, filtros y vistas guardadas, importación, fusión, MCP, mensajes, material de venta, respuestas del script, rótulo del email e historial.
3. Compatibilidad durante el deploy: un cliente o un script viejo que manda `tipo`/`subtipo` sigue funcionando y no borra las otras verticales.
4. Las vistas guardadas siguen funcionando sin migrar datos.
5. Se corrige el renombre de subtipos que hoy no toca a los negocios (bloque 0, si el propietario lo confirma como bug).

### No objetivos

- **La gestión sigue con una sola vertical.** `leads.tipo`/`leads.subtipo` no cambian: una gestión trata sobre una oferta concreta (vender el alojamiento o el restaurante), los modelos de mensaje y los motivos de cierre se segmentan por esa vertical (decisiones línea 121) y `analytics_GET`, `work.ts` y `pipeline.ts` agrupan por ella. No encontramos un motivo fuerte para cambiarlo. Lo único que cambia es qué vertical se precarga al crear una gestión (D6).
- Principal/secundaria en los datos (decisión del propietario).
- Renombrar verticales desde la app (línea 55; no hay endpoint de verticales en `settings_save_POST.ts`).
- Cambio masivo de verticales del negocio desde la lista (D5).
- Cargar las 14 verticales pendientes desde la migración.
- Trabajo solo de accesibilidad (diferido por el propietario).

## 3. Hallazgos

Verificado en `origin/staging` el 06/11/2026 (rama `docs/spec-106-107-verticals-linked`, `0504cbd`). Las líneas citadas son de esta rama.

### 3.1 Esquema y catálogos

- `crm_accounts.tipo`/`subtipo` son `text` nulos sin FK (`migrations/013_business_import.sql:3-4`); el backfill de la 013 solo heredó una clasificación sin ambigüedad desde las gestiones (`013:14-21`).
- `leads.tipo`/`subtipo` son independientes (`001_initial.sql:77-78`) y no se sincronizan: `crm_account_projection` (`004_commercial_foundation.sql:98-103`) copia nombre, ciudad y contactos, **no** la clasificación.
- Catálogos: `crm_verticals(name UNIQUE, sort_order, active)` (`001:34-40`) y `crm_subtypes(type_name, name, active, UNIQUE(type_name,name))` (`001:25-32`); el subtipo se ata a la vertical por texto. Ambos tienen trigger de versión en vivo (`026_live_version_domains.sql:31-32`). `settings_GET.ts:29` ordena las verticales por `sortOrder` y luego `name`; los subtipos por `name` (`:20`).
- Validación: `classificationErrors(db,tipo,subtipo,previous?)` (`src/helpers/accountClassification.ts:4-10`): si el par no cambió respecto de `previous`, no valida (conserva valores históricos inactivos).
- Al redactar el hallazgo, la última migración era `063_user_presence.sql`; para este PR, la última existente es la **065** y la nueva es la **066**.

### 3.2 Escrituras del negocio

- Ficha: `account_save` (`src/endpoints/commercial.ts:126-131`): sin `tipo` en el input conserva el actual; si cambia la vertical sin subtipo, borra el subtipo.
- Insignia en línea: `leads_quick_POST.ts:53-61`, alcance negocio, con bloqueo optimista `expectedClassification` (`leads_quick_POST.schema.ts:7`) e `InlineConflict`; escribe con `updateBusinessFields` (`src/helpers/updateBusinessFields.ts:8-22`), que valida, compara y deja `account_updated` con las filas completas antes/después.
- **Cambio masivo:** en la lista de Negocios, «Vertical» **no** toca al negocio: `leads_bulk_POST.ts:44-49` solo pasa `ciudad` y `assignedUserEmail` a `updateBusinessFields`; `tipo`/`subtipo` se aplican a las gestiones (`:67-71`), y la UI lo aclara («Modifica todas las gestiones activas…», `src/components/BusinessListTools.tsx:59`). Hoy no existe cambio masivo de la vertical del negocio.
- Importación: `reviewRows` valida un par por fila (`src/helpers/dataQualityService.ts:34`); la actualización revalida contra el negocio (`:143`). Campos en `src/helpers/dataNormalization.ts:3-6` (`accountExtraFields` incluye `tipo`, `subtipo`). Formato documentado con un par por fila (`docs/BUSINESS_IMPORT.md:7`, `docs/BUSINESS_IMPORT_API.md:15,20`); el cliente CLI es `scripts/business-import.mjs` y el endpoint `src/endpoints/businessImport.ts:52`.
- Fusión: `merge_confirm` toma cada campo de `businessFields` (que incluye `tipo` y `subtipo`) del lado elegido (`dataQualityService.ts:160-162`).

### 3.3 Lecturas

- Proyección de Negocios: `BUSINESS_OVERRIDES` mapea `tipo:"a.tipo"`, `subtipo:"a.subtipo"` (`src/helpers/businessTable.ts:16`); `scripts/test-commercial.ts` falla si las columnas de la proyección no coinciden con la lista.
- Filtros: `tipos`/`excludeTipos`/`subtipos`/`excludeSubtipos` (`src/endpoints/leads_GET.schema.ts:59-60`), `applySetFilter` con `IN`/`NOT IN` y `__EMPTY__` (`leads_GET.ts:91-110`), reglas de categoría `eq`/`neq`/`empty`/`not_empty` (`:46-48`, `:228-238`), opciones distintas (`:326-328`). Instantáneas SQL en `src/endpoints/__sql_snapshots__/leads_GET/` (p. ej. `classification-and-commercial-status.json`).
- `leads_GET.ts:323` **ya expone** la vertical del negocio como lista (`opportunityValues.tipo=[account.tipo]`), y la lista y la tarjeta muestran esa lista cuando el negocio no tiene exactamente una gestión (`src/pages/business-list.tsx:212`, `src/components/BusinessCard.tsx:29`).
- Vistas guardadas: JSON en `app_settings` (`lead_saved_views:<userId>`) con las claves `tipos`/`excludeTipos`/`subtipos`/`excludeSubtipos` (`src/helpers/businessListPreferences.ts:101-112`). Si el contrato sigue siendo «nombres de vertical», no hace falta migrarlas.
- UI: `BusinessQuickCreate.tsx:26,67,73`; `CommercialEditor.tsx:61` (precarga `tipo` de la gestión nueva con `detail.account.tipo`), `:95`, `:104`, `:122`; `CommercialPanel.tsx:48`; `InlineBusinessBadge.tsx:24-72` (opciones de subtipo filtradas por `account.tipo`); `inlineBadgeFields.ts:5-6`; `BusinessPreviewDrawer.tsx:75` («Rubro»); `BusinessCard.tsx:16-18`; color fijo por vertical en `src/helpers/verticalColors.ts` (decisiones línea 93).
- Mensajes: `buildMessageTemplateContext` recibe `type`/`subtype` escalares (`src/helpers/messageTemplateContext.ts:4-8`); `templateCompatibility` compara una vertical contra otra (`messageTemplatePolicy.ts:4-16`); condiciones de variables por `verticals` y `businessType` (`messageVariables.ts:103-106,154-155`); `communicationService.ts:163,202,345` usan `lead.tipo ?? account.tipo`; el script usa `account.tipo` en las opciones sin gestión (`userscriptWhatsappTemplates.ts:72`, `userscriptInstagramTemplates.ts:37`).
- Email: `overlineLabel(vertical)` (`src/helpers/hospedaEmailLayout.tsx:13-16,52`) recibe `lead?.tipo ?? account.tipo` (`emailReply.ts:46`).
- Material: `salesMaterialVerticalMatch` con una vertical de contexto (`salesMaterialRelevance.ts:6-11`); `contextVertical` = gestión, si no negocio (`salesMaterialService.ts:37-40,60-70`); el script recibe `contextVertical` y `otherVertical` (`src/endpoints/userscript.ts:199-202`, ya en `staging`).
- MCP: `businessColumns` y el conteo `GROUP BY tipo` leen `crm_accounts.tipo` (`src/server/mcp/data.ts:4,46`); permisos del lector en `scripts/provision-mcp-reader.mjs:19` y `scripts/test-mcp.ts:26` (una tabla nueva necesita `GRANT SELECT`). El MCP no está habilitado en producción.
- Historial: etiquetas `tipo:'Vertical'`, `subtipo:'Subtipo'` (`src/helpers/auditChanges.ts:1`); `globalHistoryServer.ts:40` usa `coalesce(e.lead_type,a.tipo)`.

### 3.4 Renombre de subtipos (posible bug)

`editSubtype` (`src/endpoints/settings_save_POST.ts:188-204`) renombra `crm_subtypes.name` y `leads.subtipo`, pero **no** `crm_accounts.subtipo`. Después de un renombre, los negocios conservan el nombre viejo, que ya no está en el catálogo: la insignia no lo encuentra entre las opciones, el filtro muestra dos valores para lo mismo y el material/modelos por `businessType` dejan de coincidir. Lo cubre `scripts/test-communication-locks.ts:127` solo para el orden de bloqueos.

## 4. Resumen de bloques

| Bloque | Qué | Necesita decisión | Migración |
| --- | --- | --- | --- |
| 0 | Arreglo de `editSubtype` en negocios | D8 | No |
| 1 | Tabla `crm_account_classifications`, backfill, helper único de escritura | D1, D2 | **066** |
| 2 | Escrituras: ficha, insignia, importación, fusión | D3, D4 | No |
| 3 | Lecturas: proyección, filtros, opciones, vistas, MCP | D7 | No |
| 4 | UI: campo de clasificaciones, ficha, alta rápida, insignia, lista, gestión nueva | D5, D6 | No |
| 5 | Mensajes, material de venta, script, email, historial | D9, D10 | No |
| 6 | Documentación, script de carga y runbook de las 14 | — | No |
| 7 | (Posterior) borrar `crm_accounts.tipo/subtipo` | — | Una nueva, número a asignar |

Orden: 0 es independiente. 1 antes que todo lo demás. 2 y 3 dependen de 1 y pueden ir en paralelo. 4 depende de 2 y 3. 5 depende de 1. 6 al final. 7 una versión después, cuando nada lea las columnas viejas.

## 5. Modelo de datos (bloque 1)

### 5.1 Migración 066

```sql
CREATE TABLE crm_account_classifications (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (btrim(tipo) <> ''),
  subtipo text CHECK (subtipo IS NULL OR btrim(subtipo) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT crm_account_classifications_unique UNIQUE NULLS NOT DISTINCT (account_id, tipo, subtipo)
);
CREATE INDEX crm_account_classifications_tipo ON crm_account_classifications (tipo, account_id);
CREATE INDEX crm_account_classifications_subtipo ON crm_account_classifications (subtipo, account_id) WHERE subtipo IS NOT NULL;
CREATE TRIGGER crm_account_classifications_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_account_classifications
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
INSERT INTO crm_account_classifications (account_id, tipo, subtipo, created_by)
SELECT id, btrim(tipo), nullif(btrim(subtipo), ''), 'migration_066'
FROM crm_accounts WHERE nullif(btrim(tipo), '') IS NOT NULL;
COMMENT ON COLUMN crm_accounts.tipo IS 'Display copy of crm_account_classifications (migration 066); drop in a later migration.';
COMMENT ON COLUMN crm_accounts.subtipo IS 'Display copy of crm_account_classifications (migration 066); drop in a later migration.';
```

- Un par por fila. `UNIQUE NULLS NOT DISTINCT` (PostgreSQL 15+, producción usa 17) impide repetir (Alojamiento, sin subtipo) y permite (Alojamiento, Camping) + (Alojamiento, Cabaña), que pide #3393.
- El backfill copia **todos** los negocios, incluidos fusionados y en Papelera, para que la historia no pierda su clasificación. Un subtipo sin vertical (`tipo` nulo) no se copia: hoy la validación ya lo prohíbe (`accountClassification.ts:8`) y la consulta previa del runbook (13.1) cuenta cuántos hay.
- **Sin FK a los catálogos**: hay valores fuera de catálogo en producción (spec 104 D4, se corrigen por runbook) y una FK haría fallar el backfill. La validación queda en la aplicación, como hoy.
- Sin columna de orden ni de «principal»: el orden de visualización sale de D1.
- `ON DELETE CASCADE` solo cubre el borrado físico de un negocio (no existe en la app; Papelera es `deleted_at`).

### 5.2 Reglas de validación (`src/helpers/accountClassification.ts`)

Funciones puras más una de base, todas RO-RO:

- `normalizeClassifications({pairs})`: recorta espacios, quita duplicados exactos y, si una vertical tiene un par con subtipo, descarta el par de esa vertical sin subtipo (Alojamiento + Alojamiento/Hotel = Alojamiento/Hotel). Máximo 8 pares (Zod).
- `classificationListErrors({db,pairs,previous})`: cada par **nuevo** (que no estaba en `previous`) se valida con las mismas reglas de `classificationErrors` (vertical activa; subtipo activo de esa vertical). Un par que ya estaba pasa aunque su valor esté inactivo, como hoy.
- `displayClassification({pairs,verticalOrder})`: el par de visualización según D1.
- `setAccountClassifications({trx,accountId,pairs,actor,reason})`: **único escritor**. Bloquea el negocio (`FOR UPDATE`, mismo orden negocio→gestión que `lockAccounts`), valida, reemplaza las filas (borra las que sobran, inserta las nuevas), actualiza `crm_accounts.tipo/subtipo` con el par de visualización y `updated_at`, y deja en el journal `account_classifications_changed` con `{before:[…],after:[…],reason}`. No hace nada si la lista normalizada es igual a la actual.

### 5.3 Columnas viejas durante el deploy (D2)

Recomendación: las columnas `crm_accounts.tipo/subtipo` quedan como **copia del par de visualización**, mantenida solo por `setAccountClassifications`, igual que hizo la 061 con `users.whatsapp_phone` (`061_user_whatsapp_lines.sql:12-13`). Durante el deploy rotativo el contenedor viejo sigue leyéndolas bien. Si el contenedor viejo **escribe** una clasificación en esa ventana, la tabla no se entera; la consulta de 13.1 (paso 6) detecta diferencias después del deploy. El bloque 7 las borra cuando ningún código las lea.

## 6. Escrituras (bloque 2)

### 6.1 Ficha (`account_save`)

- Input nuevo opcional `classifications: {tipo:string; subtipo:string|null}[]` (`commercial.schema.ts:19`). Con `classifications`, reemplaza la lista.
- Compatibilidad: sin `classifications` y con `tipo`/`subtipo` (cliente viejo, script de importación viejo), **solo se reemplaza el par de visualización** y el resto queda igual. Si `tipo`/`subtipo` coinciden con el par de visualización actual, no hay cambio. Mandar los dos es un error 400 («Mandá las verticales como lista.»).
- `contactOnly` sigue sin tocar la clasificación (`commercial.ts:128`).

### 6.2 Insignia en línea (`leads_quick_POST`)

- Campo nuevo de alcance negocio `classifications` en `inlineBadgeFields.ts` con `expectedClassifications` (lista) como bloqueo optimista: si la lista actual no es igual a la esperada ni a la nueva, `InlineConflict` con el mismo texto de hoy.
- Los campos `tipo`/`subtipo` de alcance negocio quedan para clientes viejos con la regla de 6.1 (editan el par de visualización).
- Permisos: los mismos de hoy (`assertBusinessAccess(…,true)`, «No contactar» de solo lectura para no admins).

### 6.3 Importación (D3)

- CSV: las columnas `tipo` y `subtipo` siguen aceptadas (un par). Columna nueva `verticales` con pares `Vertical/Subtipo` separados por `;` (`Alojamiento/Hotel; Gastronomía/Restaurante; Experiencias`). Se separa en la **primera** `/`; sin `/` es una vertical sin subtipo. `tipo` y `verticales` en la misma fila es un error de la fila. Por este formato, los nombres de vertical no pueden incluir `/` y ningún nombre puede incluir `;`.
- API (`BUSINESS_IMPORT_API.md`): campo `clasificaciones: [{tipo, subtipo}]`, mismo tope de 8, mismas reglas. `config` sigue devolviendo verticales y subtipos activos.
- Alta: crea las filas con `setAccountClassifications` (`reason:'import'`).
- Actualización de un negocio existente: según D3 (recomendado: **agrega** los pares que falten, nunca borra).
- `dataFieldLabels` suma `verticales: 'Verticales'` (`dataNormalization.ts:12`).

### 6.4 Fusión

- `tipo` y `subtipo` salen de los campos a elegir (`businessFields` para la fusión, sin tocar la lista de importación). El destino queda con la **unión** normalizada de los pares de ambos (5.2); el preview muestra «Verticales después de fusionar: …».
- La unión pasa el tope de 8 → la fusión se bloquea con «El negocio fusionado tendría más de 8 verticales. Quitá alguna antes de fusionar.» (no se elige en silencio).
- El origen fusionado conserva sus filas (historia). `snapshot` incluye las clasificaciones de ambos para que el token cambie si alguien las edita durante la revisión.

### 6.5 Renombre de subtipos (bloque 0, D8)

`editSubtype` también actualiza `crm_accounts.subtipo` (y, después de la 066, `crm_account_classifications.subtipo`) con el mismo filtro por `type_name`, bloqueando antes los negocios afectados de las tres fuentes. Sin journal por negocio (igual que en gestiones). Test de regresión primero (sección 11).

## 7. Lecturas, filtros y vistas (bloque 3)

### 7.1 Proyección

`businessTable.ts` suma dos columnas extra: `account_tipos text[]` y `account_subtipos text[]` (subconsulta `array_agg` ordenada por D1 sobre `crm_account_classifications`). `tipo`/`subtipo` de la proyección siguen siendo el par de visualización (ordenar por «Vertical» ordena por ese par). `leads_GET.ts:323` llena `opportunityValues.tipo/subtipo` con las listas completas y la lista/tarjeta las muestran **siempre** como listas para el negocio, no solo cuando tiene 0 o varias gestiones (`business-list.tsx:212`, `BusinessCard.tsx:29`).

### 7.2 Semántica de filtros en Negocios (D7)

| Filtro | Hoy (un par) | Con la lista (recomendado) |
| --- | --- | --- |
| Incluir verticales A, B | `tipo IN (A,B)` | tiene **algún** par con vertical A o B (`account_tipos && ARRAY[A,B]`) |
| Excluir vertical A | `tipo IS NULL OR tipo NOT IN (A)` | **ningún** par con vertical A (`NOT (account_tipos && ARRAY[A])`) |
| Incluir `__EMPTY__` | `tipo IS NULL OR tipo=''` | sin pares (`cardinality(account_tipos)=0`) |
| Excluir `__EMPTY__` | `tipo IS NOT NULL AND tipo<>''` | al menos un par |
| Regla `eq` / `neq` | igual / distinto | algún par igual / ningún par igual |
| Regla `empty` / `not_empty` | nulo o vacío / con valor | sin pares / con pares |
| Subtipos | ídem sobre `subtipo` | ídem sobre `account_subtipos` |

- Vertical y subtipo se filtran **por campo**, no por par: «Alojamiento» + «Restaurante» encuentra a Fortunata (Alojamiento/Hotel, Gastronomía/Restaurante). Es lo que muestra la tarjeta (insignias sueltas) y lo más simple; el riesgo está en 14.
- Con `canonicalVertical` no se equiparan valores en el filtro: igualdad exacta (línea 55).
- La lista de **Gestiones** no cambia: filtra por `leads.tipo`.
- Opciones del filtro (`distinct("tipo")`, `:326`): en Negocios salen de `crm_account_classifications` de negocios visibles.
- Insignias de filtro: hacer clic en una insignia de vertical sigue cambiando solo el valor (línea 54).
- Vistas guardadas: mismas claves, sin migración; el resultado cambia solo para los negocios que tengan más de una vertical, y en el sentido esperado.
- Instantáneas SQL de `leads_GET` se regeneran en el mismo PR y se revisan a mano.

### 7.3 MCP

- `crm_get_business` y `crm_list_businesses` suman `clasificaciones` (JSON `[{tipo,subtipo}]`); `tipo`/`subtipo` quedan como par de visualización hasta el bloque 7.
- El conteo por vertical (`data.ts:46`) pasa a contar sobre la tabla: un negocio con dos verticales cuenta en las dos (la descripción del tool lo aclara).
- `GRANT SELECT ON public.crm_account_classifications` en `provision-mcp-reader.mjs:19` y `test-mcp.ts:26`.

## 8. UI (bloque 4)

- **Componente `BusinessClassificationsField`** (nuevo, `src/components/`): lista de filas «Vertical» + «Subtipo» (selects compartidos, subtipos filtrados por la vertical de su fila), botón «Agregar otra vertical» y «Quitar» por fila. Valores históricos fuera de catálogo se muestran como «(histórico)» como en la spec 104. Lo usan la ficha y la insignia.
- **Ficha** (`CommercialEditor.tsx`, `CommercialPanel.tsx:48`): «Verticales» reemplaza a «Vertical» y «Subtipo»; en el panel cada par es una insignia `Vertical · Subtipo` con su color.
- **Alta rápida** (`BusinessQuickCreate.tsx`): sigue con **un** par (casi todos los negocios tienen uno; línea 397). Debajo, el enlace «Agregar otra vertical» suma una fila del mismo componente; no se muestra nada más si no se usa.
- **Insignia en línea** (`InlineBusinessBadge.tsx`): las insignias de vertical y subtipo del negocio abren un mismo panel con `BusinessClassificationsField` y «Guardar»; loading y bloqueo de doble envío como hoy.
- **Lista, tarjeta y vista rápida**: una insignia por vertical (color fijo por vertical, decisiones línea 93) y una por subtipo; «Rubro» en `BusinessPreviewDrawer.tsx:75` muestra la lista. Donde haya un solo lugar (una celda angosta), se muestra el par de visualización y «+N» con la lista en el tooltip.
- **Cambio masivo**: sin cambio de alcance (D5). Solo se renombra la opción «Vertical» a «Vertical de las gestiones» para que no se confunda con las verticales del negocio (cambio de texto, no de contrato).
- **Gestión nueva** (`CommercialEditor.tsx:61`): según D6. Recomendado: con una sola vertical distinta en el negocio, se precarga sin preguntar (como hoy); con dos o más, aparece «¿Sobre qué vertical es esta gestión?» con las verticales del negocio y la de visualización preseleccionada.

## 9. Mensajes, material, script, email e historial (bloque 5)

- **Compatibilidad de modelos**: `templateCompatibility` acepta `verticals: string[]` en el contexto; un modelo con vertical es compatible si coincide (con `canonicalVertical`) con **alguna**. Con gestión, el contexto sigue siendo su vertical única (`lead.tipo`); sin gestión, la lista del negocio. Afecta `communicationService.ts:202,345`, `userscriptWhatsappTemplates.ts:72`, `userscriptInstagramTemplates.ts:37`. La línea 39 de decisiones se respeta: sin vertical conocida no se excluye nada.
- **Condiciones de variables** (`messageVariables.ts:154-155`): `verticals` coincide si intersecta; `businessType` si algún subtipo coincide.
- **Variables `{type}` y `{subtype}`**: según D9.
- **Material de venta**: `salesMaterialVerticalMatch` recibe `verticals: string[]` de contexto; es `specific` si intersecta (spec 102 D5: cuenta la de la gestión; sin gestión, las del negocio). `contextVertical` se mantiene (par de visualización) para el script 1.8.0 y se suma `contextVerticals: string[]`; `otherVertical` se calcula con la lista. **No hace falta script nuevo.**
- **Rótulo del email**: según D10.
- **Historial**: etiqueta «Verticales» para `account_classifications_changed`, mostrada como «Alojamiento/Hotel → Alojamiento/Hotel, Gastronomía/Restaurante»; `globalHistoryServer.ts:40` sigue con el par de visualización.

## 10. Permisos y contratos

- Quién puede editar las verticales no cambia: quien hoy puede editar el negocio (servidor, `assertBusinessAccess`/`assertAccountWritable`); «No contactar» deja el negocio de solo lectura para no admins.
- Contratos **aditivos**: `classifications` en `account_save` y `leads_quick`, `clasificaciones` en importación, `account_tipos`/`account_subtipos` en la fila de Negocios, `contextVerticals` en material y script, `clasificaciones` en MCP. Los campos escalares siguen y significan «par de visualización».
- Filtros: mismas claves y valores; cambia la semántica para negocios con varias verticales (7.2).
- Journal nuevo: `account_classifications_changed`.

## 11. Componentes y funciones

| Archivo | Cambio |
| --- | --- |
| `migrations/066_account_classifications.sql` | Tabla, índices, trigger de versión, backfill, comentarios |
| `src/helpers/schema.tsx` | Tipo `CrmAccountClassifications` |
| `src/helpers/accountClassification.ts` | `normalizeClassifications`, `classificationListErrors`, `displayClassification`, `setAccountClassifications` |
| `src/endpoints/commercial.ts` / `.schema.ts` | `classifications` en `account_save`; compatibilidad 6.1 |
| `src/endpoints/leads_quick_POST.ts` / `.schema.ts`, `src/helpers/inlineBadgeFields.ts` | Campo `classifications` y `expectedClassifications` |
| `src/helpers/updateBusinessFields.ts` | Delega la clasificación en `setAccountClassifications` |
| `src/helpers/dataQualityService.ts`, `dataNormalization.ts`, `src/endpoints/businessImport.ts`, `scripts/business-import.mjs` | `verticales`/`clasificaciones`, unión en fusión |
| `src/endpoints/settings_save_POST.ts` | Bloque 0 |
| `src/helpers/businessTable.ts`, `src/endpoints/leads_GET.ts` / `.schema.ts` | Columnas de lista, filtros, reglas y opciones |
| `src/server/mcp/data.ts`, `scripts/provision-mcp-reader.mjs` | `clasificaciones`, conteo, permisos |
| `src/components/BusinessClassificationsField.tsx` (nuevo), `CommercialEditor.tsx`, `CommercialPanel.tsx`, `BusinessQuickCreate.tsx`, `InlineBusinessBadge.tsx`, `BusinessCard.tsx`, `BusinessPreviewDrawer.tsx`, `BusinessListTools.tsx`, `src/pages/business-list.tsx` | UI de la sección 8 |
| `src/helpers/messageTemplatePolicy.ts`, `messageVariables.ts`, `messageTemplateContext.ts`, `communicationService.ts`, `userscriptWhatsappTemplates.ts`, `userscriptInstagramTemplates.ts` | Contexto con lista |
| `src/helpers/salesMaterialRelevance.ts`, `salesMaterialService.ts`, `src/endpoints/userscript.ts` | `verticals` de contexto, `contextVerticals` |
| `src/helpers/hospedaEmailLayout.tsx`, `emailReply.ts` | D10 |
| `src/helpers/auditChanges.ts` | Etiqueta «Verticales» |
| `scripts/load-account-classifications.mjs` (nuevo) | Carga del runbook 13, en seco por defecto |

## 12. Plan de tests

No se corren suites completas en local (memoria del propietario): cada PR corre los archivos de abajo y CI corre el resto.

- **Unitarios (Vitest)**: `src/helpers/accountClassification.spec.ts` (nuevo: normalización, duplicados, par sin subtipo absorbido, tope 8, regla D1, pares históricos), `filterRules.spec.ts`, `businessColumnGroups.spec.ts`, `messageTemplatePolicy.spec.ts` (lista intersecta, sin vertical no excluye), `messageVariables.spec.ts`, `messageTemplateContext.spec.ts` (D9), `salesMaterialRelevance.spec.ts` (alguna coincide), `hospedaEmailLayout.spec.ts` (D10), `auditChanges.spec.ts`, `verticalColors.spec.ts`, `src/endpoints/leads_GET.sql.spec.ts` con instantáneas nuevas, `src/pages/business-list.spec.tsx` y `business-list-page.spec.tsx`, `CommercialEditor.forms.spec.tsx` (D6), `ContactTemplateDialog.*.spec.tsx`, `src/components/BusinessClassificationsField.spec.tsx` (nuevo).
- **Integración** (base local descartable, `CRM_TEST_DATABASE=1`, confirmando antes `DATABASE_URL`): `scripts/test-account-classifications-migration.mjs` (nuevo: aplica la 066 sobre una copia con negocios con y sin par, fusionados y en Papelera, y verifica el backfill y la unicidad); `test:commercial` (columnas de la proyección, `account_save` con lista y con el par viejo sin borrar las otras); `test:quality` (importación con `verticales`, actualización que agrega, fusión con unión y tope); `test:permissions` (vendedor ajeno y «No contactar» no editan verticales); `test:sales-material-verticals`; `test:mcp` (permiso de la tabla); `scripts/test-communication-locks.ts` (bloque 0: renombre de subtipo cambia también el negocio, test de regresión escrito antes del arreglo).
- **Navegador**: un caso en `tests/browser/*.e2e.ts` que agrega una segunda vertical desde la ficha, la ve en la lista y la encuentra con el filtro. Corre en CI.

## 13. Runbook posterior al deploy: las 14 verticales pendientes

Solo lo ejecuta **el operador con aprobación explícita del propietario** para esta operación. Ningún agente lo ejecuta ni tiene conexión a producción. La migración no carga estos datos.

Fuente: `~/backups/hospeda-crm/dedup2-secondary-verticals-20261106.json` en el VPS (id de negocio → lista de «Vertical/Subtipo»). El archivo queda fuera de Git.

### 13.1 Pasos

> Si el rol `crm_mcp_reader` ya existe en el entorno, `provision-mcp-reader.mjs` no le otorga permisos sobre tablas nuevas: antes de habilitar el MCP, otorgar `SELECT` sobre `crm_account_classifications` (y `crm_account_seller_groups*` de la spec 107).

1. Confirmar que la 066 está aplicada en producción (`schema_migrations`) y que la versión desplegada incluye los bloques 1 a 4.
2. Respaldo: `pg_dump` completo a `~/backups/hospeda-crm/` con fecha.
3. Ensayo sobre una copia restaurada del respaldo: `npm run load:account-classifications -- --file <json>` (en seco por defecto). Para cada negocio muestra los pares actuales, los que se agregarían, los rechazados (vertical o subtipo inactivo o inexistente, negocio fusionado/en Papelera/inexistente, tope de 8) y no escribe nada.
4. El propietario revisa la salida del ensayo (en especial #1172, #2314 y #3393) y aprueba.
5. Aplicar en producción con `--apply`: una transacción por negocio con `setAccountClassifications` (`reason:'dedup2_secondary_verticals'`, actor = el operador), solo **agrega** pares (nunca quita) y deja el journal del negocio. Un rechazo no frena a los demás y queda en el informe.
6. Verificación (solo lectura): los 14 negocios tienen los pares esperados; y la consulta de diferencias `crm_accounts.tipo/subtipo` contra el par de visualización de la tabla devuelve 0 filas (detecta escrituras del contenedor viejo durante el deploy).
7. Vuelta atrás: quitar los pares desde la ficha (queda en el historial). No se restaura el dump encima de producción (decisiones línea 161).

## 14. Riesgos

- **Filtros por campo y no por par**: «Alojamiento» + «Restaurante» encuentra negocios donde el restaurante es de Gastronomía. Es esperable con «todas iguales»; si molesta, un filtro por par se agrega después sin migrar datos.
- **Exclusión más estricta**: «Excluir Gastronomía» saca a Fortunata aunque también sea Alojamiento. Lo decide D7.
- **Ventana de deploy**: un contenedor viejo que escribe la clasificación desincroniza la tabla; lo detecta 13.1 paso 6 y se corrige desde la ficha.
- **Instantáneas SQL** de `leads_GET`: el cambio de filtros las regenera; revisar el diff a mano.
- **Volumen**: la subconsulta de la proyección agrega un `array_agg` por negocio; con el índice `(tipo, account_id)` y la lista paginada no debería notarse; se mide con `EXPLAIN` en la base local con el seed.
- **Textos de mensajes** con `{type}`: si la regla de D9 junta varias verticales, algún modelo viejo puede leerse raro; se revisan los modelos que usan `{type}` antes de publicar.

## 15. Orden de implementación (PRs a `staging`)

1. Bloque 0 (regresión primero).
2. Bloque 1 (066 + helper + tests de migración).
3. Bloques 2 y 3 (en paralelo, PRs separados).
4. Bloque 4.
5. Bloque 5.
6. Bloque 6 (docs: `docs/BUSINESS_IMPORT.md`, `docs/BUSINESS_IMPORT_API.md`, `docs/mapa-tecnico.md`, `docs/decisiones.md`, `src/content/user-guide.json` y `docs/guia-de-uso.md`, `docs/estado-desarrollo.md`, `docs/pendientes.md`; script de carga).
7. Promoción a `main` y deploy solo cuando el propietario lo pida; después, runbook 13.
8. Bloque 7 en una versión posterior.

## 16. Aceptación

- **Dado** Fortunata con Alojamiento/Hotel, **cuando** el vendedor agrega Gastronomía/Restaurante desde la ficha, **entonces** la ficha, la lista y la tarjeta muestran las dos, el historial dice «Verticales: Alojamiento/Hotel → Alojamiento/Hotel, Gastronomía/Restaurante» y el filtro «Gastronomía» la encuentra.
- **Dado** #3393, **entonces** puede tener Alojamiento/Camping y Alojamiento/Cabaña a la vez, y no puede tener dos veces Alojamiento/Camping.
- **Dado** un cliente viejo que guarda la ficha con `tipo`/`subtipo`, **entonces** solo cambia el par de visualización y las demás verticales quedan.
- **Dado** una fusión de un hotel y un restaurante, **entonces** el destino queda con las dos verticales sin que el admin elija.
- **Dado** un negocio sin gestión con Alojamiento y Gastronomía, **entonces** los modelos de las dos verticales y los «para todas» están disponibles, y el material de las dos aparece arriba en el selector.
- **Dado** una vista guardada con `tipos:["Gastronomía"]`, **entonces** sigue funcionando sin migrar.
- `npm run typecheck`, `npm test`, `npm run build` e integraciones listadas en verde en CI sobre el SHA de cada PR.

## 17. Decisiones abiertas

1. **D1 — Par de visualización (una sola pantalla, orden, columnas viejas).**
   - **Opción A:** orden del catálogo: `crm_verticals.sort_order`, luego nombre de la vertical, luego subtipo (sin subtipo primero), luego `id` de la fila. Una vertical que ya no está en el catálogo va al final.
     - Pro: determinística, igual en todos los negocios, no depende de quién cargó primero; Configuración ya ordena así (`settings_GET.ts:29`).
     - Contra: cambiar el orden del catálogo cambia el par mostrado en muchos negocios (sin tocar datos).
   - **Opción B:** el primero que se cargó (`id` de la fila).
     - Pro: respeta la vertical «de siempre» de cada negocio.
     - Contra: es una principal encubierta, contra «todas iguales»; depende de la historia.
   - **Recomendación: A.**
2. **D2 — Columnas `crm_accounts.tipo/subtipo`.**
   - **Opción A:** copia del par de visualización mantenida por el helper; se borran en una migración posterior (patrón 061).
     - Pro: deploy rotativo sin errores; lecturas viejas siguen.
     - Contra: dos fuentes durante una versión.
   - **Opción B:** triggers en la base que sincronizan en los dos sentidos.
     - Pro: cubre también escrituras del contenedor viejo.
     - Contra: más complejo, dispara los triggers de `crm_accounts` (guardia de fusionados, versión en vivo) desde otra tabla; difícil de razonar.
   - **Opción C:** borrarlas en la 066.
     - Contra: rompe al contenedor viejo durante el deploy.
   - **Recomendación: A**, con la verificación de 13.1 paso 6.
3. **D3 — Importación que actualiza un negocio existente.**
   - **Opción A:** agrega los pares que falten, nunca quita.
     - Pro: una importación nunca borra datos (mismo criterio que la spec 103 D4: no pisa).
     - Contra: para quitar una vertical hay que ir a la ficha.
   - **Opción B:** reemplaza la lista.
     - Contra: una fila con una sola vertical borraría las otras sin aviso.
   - **Recomendación: A.**
4. **D4 — Tope de verticales por negocio.** **Opción A:** 8. **Opción B:** sin tope. Pro de A: evita errores de carga y filas enormes; el caso real máximo es 3. **Recomendación: A.**
5. **D5 — Cambio masivo de verticales del negocio.**
   - **Opción A:** fuera de alcance; solo se aclara el texto de la opción actual.
     - Pro: YAGNI; las 14 van por runbook.
     - Contra: cargar una vertical a muchos negocios se hace de a uno.
   - **Opción B:** acciones «Agregar vertical» y «Quitar vertical» sobre los negocios seleccionados, con revisión como hoy.
     - Contra: un bloque más, con su vista previa y tests.
   - **Recomendación: A.**
6. **D6 — Vertical de una gestión nueva cuando el negocio tiene varias.**
   - **Opción A:** se precarga el par de visualización, sin preguntar.
     - Pro: cero clics.
     - Contra: una gestión del restaurante puede quedar como Alojamiento y filtrar mal sus modelos.
   - **Opción B:** con una sola vertical, como hoy; con varias, «¿Sobre qué vertical es esta gestión?» con la de visualización preseleccionada.
     - Pro: un clic solo cuando hace falta; los modelos y motivos quedan bien segmentados.
     - Contra: un campo más en ese caso.
   - **Opción C:** sin vertical en la gestión.
     - Contra: rompe la segmentación de modelos y motivos de cierre.
   - **Recomendación: B.**
7. **D7 — Excluir una vertical.**
   - **Opción A:** el negocio no tiene **ninguna** de las excluidas.
     - Pro: «Excluir Gastronomía» saca todo lo que tenga algo de gastronomía; es lo que se espera al limpiar una lista.
     - Contra: saca negocios mixtos que también tienen otra vertical.
   - **Opción B:** el negocio tiene **alguna** vertical fuera de las excluidas.
     - Contra: un negocio mixto aparece en «Excluir Gastronomía»; confuso.
   - **Recomendación: A.**
8. **D8 — Renombre de subtipos en negocios (bloque 0).** **Opción A:** arreglarlo (el renombre también cambia los negocios). **Opción B:** dejarlo como está y documentarlo. Pro de A: catálogo y negocios no se separan; mismo comportamiento que en gestiones. Contra de A: bloquea más filas en el renombre. **Recomendación: A.** Los negocios que hoy ya quedaron con un nombre viejo **no** se corrigen solos: van al runbook de valores fuera de catálogo de la spec 104 D4.
9. **D9 — Variables `{type}` / `{subtype}` sin gestión y con varias verticales.**
   - **Opción A:** todas, unidas en el orden de D1 («Alojamiento y Gastronomía»).
     - Pro: «todas iguales»; nada se oculta.
     - Contra: puede leerse raro en frases pensadas para una sola («tu {type}»).
   - **Opción B:** el par de visualización.
     - Contra: una principal encubierta.
   - **Opción C:** vacío y el modelo usa su alternativa (las variables ya tienen alternativas, `messageVariables.ts:20`).
     - Pro: el texto nunca afirma algo parcial.
     - Contra: el vendedor ve un texto más genérico.
   - **Recomendación: A**, revisando antes los modelos que usan `{type}`. Con gestión, siempre su vertical.
10. **D10 — Rótulo «HOSPEDA · {VERTICAL}» sin gestión y con varias verticales.**
    - **Opción A:** solo «HOSPEDA».
      - Pro: no elige una vertical; ya es el rótulo sin vertical (spec 104 D6).
      - Contra: pierde el contexto.
    - **Opción B:** el par de visualización.
    - **Opción C:** todas («HOSPEDA · ALOJAMIENTO · GASTRONOMÍA»).
      - Contra: largo en celulares.
    - **Recomendación: A.** Con gestión o con una sola vertical, como hoy.

Defaults que la spec ya eligió (no son bifurcaciones): la gestión sigue con una vertical; filtros por campo y no por par; alta rápida con un par y «Agregar otra vertical»; fusión por unión; columna CSV `verticales` con `Vertical/Subtipo` separados por `;`; sin FK a catálogos.

### Decisión del propietario (06/11/2026)

El propietario aceptó todas las recomendaciones (D1 a D10, opción A salvo donde la recomendación indica otra). La sección queda como registro de las alternativas.

## 18. Migraciones y datos

- **066** crea la tabla y copia el par actual de cada negocio. No inventa clasificaciones ni carga las 14 pendientes. No edita migraciones aplicadas.
- Una migración posterior (número a asignar cuando se haga el bloque 7) borra `crm_accounts.tipo/subtipo`.
- La spec 107 usa 064 y su bloque final agrega la 065; esta spec usa la 066. Si cambia el orden de integración, el PR que se mergee segundo fija el número final sin reutilizar migraciones ya aplicadas.
- Datos de producción: solo el runbook 13, con aprobación del propietario.
