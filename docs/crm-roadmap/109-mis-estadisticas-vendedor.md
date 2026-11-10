# Spec 109 — «Mis estadísticas» para el vendedor

Estado: **propuesta para revisión** (09/11/2026). Página nueva donde cada usuario ve solo sus propios números. La página «Estadísticas» del admin (`/analytics`) no cambia en esta spec.

## Problema

Hoy los números del trabajo comercial solo los ve el admin, en `/analytics`. El vendedor no tiene dónde ver cuánto avanzó: tareas hechas, negocios revisados, contactos reales y gestiones cerradas. El propietario lo pidió el 27/10/2026: «una página de estadística del user, donde vea sus estadísticas solamente».

No alcanza con abrirle `/analytics` al vendedor:

- `analytics_GET` acepta `responsible` como filtro libre (`src/endpoints/analytics_GET.schema.ts:6`). Con solo aflojar el control de rol, un vendedor podría pedir los números de otro.
- La página muestra rankings con nombres de todo el equipo (`byResponsible`, `byResponsibleConversion`).
- Algunas métricas no siguen las reglas del CRM:
  - «Contactado» cuenta cualquier `crm_activities`, incluido «no contestó» (`analytics_GET.ts:89`). Eso contradice la regla de AGENTS.md: abrir un canal, guardar un borrador o mover una etapa no es contacto.
  - Los rangos de fecha se cortan en UTC (`:21-22`, `:73`).
  - No excluye negocios archivados ni fusionados (`:20`).

## Objetivos y no objetivos

### Objetivos

1. Página «Mis estadísticas» para todo usuario logueado, incluido el admin, que ve las suyas.
2. Endpoint propio que tome siempre al usuario de la sesión, sin parámetro de responsable.
3. Métricas calculadas con las reglas vigentes:
   - día hábil argentino;
   - evidencia de contacto de `src/helpers/contactEvidence.ts`;
   - los mismos negocios excluidos que en las demás vistas del vendedor.
4. Tests que prueben que un vendedor nunca recibe datos de otro.

### No objetivos

- Comparación con el equipo, promedios, rankings o cualquier número de otro usuario (**decisión D1 del propietario**).
- Cambiar o corregir `/analytics`. Sus errores (contacto, UTC, archivados) quedan anotados en `pendientes.md` para una spec aparte, que puede reutilizar las consultas de esta.
- Metas, objetivos de venta, comisiones o facturación.
- Exportar a CSV o PDF.

## Hallazgos

Verificado en `origin/staging` el 09/11/2026.

1. **Control de rol actual:** `analytics_GET.ts:18` responde 403 a quien no es admin. La ruta usa `<AdminRoute>` (`src/main.tsx:80`) y el menú la lista en `adminNavigation` (`src/helpers/appNavigation.ts:23`).
2. **Patrón de alcance por vendedor:**
   - `work.ts:25-26`: `responsible` vale por defecto `user.email`, y otro valor da 403 si no sos admin.
   - `pipeline.ts:32,55`: se fuerza `l.assigned_user_email=user.email AND a.archived_at IS NULL`.
3. **Quién es el dueño de cada dato:**

   | Dato | Columna |
   |---|---|
   | Negocio | `crm_accounts.assigned_user_email` |
   | Gestión | `leads.assigned_user_email` |
   | Tarea | `crm_tasks.assigned_user_email` |
   | Actividad | `crm_activities.actor_email` |
   | Evento del embudo | `crm_pipeline_events.actor_email` |
   | Mensaje | `crm_messages.owner_email` |

4. **Evidencia de contacto:** `contactEvidence.ts` exporta `CONTACT_EVIDENCE_OUTCOMES`, `CONTACT_EVIDENCE_STATUSES`, `contactEvidenceEventPredicate()` e `isContactEvidence()`.
5. **Fechas en el servidor:** `src/helpers/workDates.ts` (`CRM_TIME_ZONE`, `localDay`, `argentinaInstant`). El patrón SQL es `now() AT TIME ZONE 'America/Argentina/Buenos_Aires'` (`leads_stats_GET.ts:21-23`, `work.ts:112`).
6. **Estado de revisión:** `crm_accounts.status` toma los valores `new`, `reviewed`, `recontact`, `no_follow_up_scheduled` e `in_management` (`commercial.ts:189-214`). Las etiquetas visibles salen de los helpers existentes.
7. **No hay tests de estadísticas:** ni specs unitarios ni `scripts/test-*`. Solo `tests/browser/permissions.e2e.ts:32` verifica que el vendedor no entre a `/analytics`.
8. **Cliente:** `useQuery` con una clave registrada en `src/helpers/liveDomains.ts`. Gráficos con Recharts. Contenedor y encabezado con `CrmLayout.module.css`. Estados con `QueryLoadingNotice`, `QueryErrorNotice` y `CrmEmptyState`. Ayuda con `HelpLink`.

## Decisiones

- **D1 (propietario, 09/11/2026):** sin comparación con el equipo. El usuario ve solo lo suyo.
- **D2 (propietario, 09/11/2026) — qué es «mío»:** cada dato se atribuye por la columna de dueño de su tabla (Hallazgo 3).
  - Lo que es un estado actual (negocios, gestiones abiertas, tareas pendientes) se cuenta por el responsable de hoy.
  - Lo que es un hecho (tarea completada, contacto, cierre) se cuenta por quien lo hizo: `actor_email` u `owner_email`.
  - Así, si un negocio se reasigna, el contacto que hizo el vendedor anterior sigue siendo suyo.
- **D3 (propietario, 09/11/2026) — negocios que no cuentan:**
  - En las fotos de hoy (negocios, gestiones abiertas, tareas pendientes, sin movimiento) no cuentan los negocios borrados (`deleted_at`), fusionados (`merged_into_id`) ni archivados, igual que en «Hoy» y en el embudo del vendedor.
  - Los hechos del período (tarea completada, contacto, cierre) siguen contando aunque el negocio se haya archivado o fusionado después, por D2. Solo se descartan si el propio registro (tarea, actividad, mensaje, evento) está borrado o si el negocio está en la papelera (`deleted_at`).
  - Los negocios marcados «No contactar» cuentan, con su propio indicador.
- **D4 (propuesta) — ruta y menú:** `/my-stats`, con la etiqueta «Mis estadísticas», en la sección de trabajo después de «Bandeja», visible para todos. Se suma a la paleta de comandos. El admin conserva «Estadísticas» en su menú.

## 1. Período

- Opciones: **Hoy**, **Esta semana** (de lunes a hoy), **Este mes** (por defecto) y **Rango** (desde/hasta, máximo 366 días).
- Fechas `YYYY-MM-DD` como días argentinos. El servidor convierte cada día con `argentinaInstant` y compara instantes en `[desde 00:00, hasta+1 00:00)` hora argentina.
- El período elegido queda en la URL (`?period=month` o `?from=…&to=…`), así un enlace compartido o recargado muestra lo mismo.
- Las métricas de foto actual (marcadas «ahora») ignoran el período y lo dicen en pantalla.

## 2. Métricas

Todas se filtran por el usuario de la sesión según D2 y aplican las exclusiones de D3: completas en las fotos de hoy y solo papelera o registro borrado en los hechos del período.

### 2.1 Mi trabajo

| Métrica | Definición |
|---|---|
| Tareas completadas | `crm_tasks` con `assigned_user_email=yo`, `status='completed'` y `completed_at` dentro del período; tarea sin borrar y negocio fuera de la papelera (D3) |
| Vencidas (ahora) | Pendientes cuyo `due_date` es anterior a hoy (día argentino), con la misma regla que «Hoy» (`taskBucket`) |
| Para hoy (ahora) | Pendientes con vencimiento hoy |

### 2.2 Mis negocios (ahora)

- Negocios con `assigned_user_email=yo`, agrupados por `status` con las etiquetas existentes.
- Total y cantidad marcados «No contactar».
- Cada grupo enlaza al listado de Negocios filtrado por responsable y estado, si ese filtro ya existe. Si falta alguno, ese grupo va sin enlace: esta spec no agrega filtros nuevos al listado.

### 2.3 Mis gestiones

| Métrica | Definición |
|---|---|
| Abiertas (ahora) | `leads` con `assigned_user_email=yo` y etapa con clasificación `open` |
| Ganadas / perdidas | `crm_pipeline_events` con `actor_email=yo`, `classification` `won` o `lost` y `created_at` en el período. Si una misma gestión pasa varias veces a ganada o perdida en el período, cuenta una sola vez, con su último evento |
| Tasa de cierre | ganadas / (ganadas + perdidas) del período, con un decimal. Si el denominador es 0 se muestra «—», nunca 0 % |
| Motivos de pérdida | Agrupación de las pérdidas del período por motivo, solo de las del usuario |
| Sin movimiento (ahora) | Gestiones abiertas sin actividad, evento ni tarea completada en más de 30 días argentinos |

«Suscripto» y otros estados heredados no cuentan como ganada: la clasificación sale de `crm_stages`.

### 2.4 Mis contactos

| Métrica | Definición |
|---|---|
| Contactos reales | Eventos de evidencia de contacto (`contactEvidenceEventPredicate`) con autor = yo en el período. Se muestran dos números: eventos y negocios distintos contactados |
| Días hasta el primer contacto | Para gestiones con `assigned_user_email=yo` creadas en el período: promedio de días argentinos entre la creación y su primer evento de evidencia. Se muestra junto con la cantidad de casos; con menos de 3 casos se muestra «pocos datos» |

No cuentan: canal abierto, borrador, mensaje en estado incierto, intento fallido ni «no contestó».

### 2.5 Evolución

- Barras de contactos reales y gestiones ganadas por día si el período tiene 62 días o menos; por semana (de lunes a domingo) si es más largo.
- Los días y semanas sin datos aparecen en 0, sin huecos.

## 3. API

- `GET /_api/my_stats`, con el par `src/endpoints/my_stats_GET.schema.ts` (schema Zod, tipos y `getMyStats`) y `my_stats_GET.ts` (`handle`), registrado en `src/server/app.ts`.
- **Entrada:** `z.object({from:day,to:day}).strict()`. Cualquier parámetro extra, incluido `responsible`, da 400. Si `from > to` o el rango supera los 366 días, también 400.
- **Salida:** `{period:{from,to}, asOf, work, businesses, managements, contacts, series:{granularity,points}}`. Nunca incluye emails ni nombres de otros usuarios.
- Sin sesión: 401. Cualquier rol: 200 con sus propios datos.
- Agregación en SQL, sin cargar filas en memoria. Una consulta por bloque dentro de una transacción `READ ONLY`.
- Clave de TanStack Query: `["myStats", from, to]`, registrada en `liveDomains.ts` junto a las claves que ya invalidan `analytics` (tareas, comercial, embudo).

## 4. Página

- `src/pages/my-stats.tsx`, cargada en diferido, en `<UserRoute>`.
- Encabezado compartido: título «Mis estadísticas», subtítulo «Tus números del período elegido» y `HelpLink`.
- Una tarjeta por bloque de §2, con indicadores grandes y gráficos Recharts.
- Cada métrica tiene una ayuda corta que explica qué cuenta, por ejemplo «Contacto real: respuesta, envío confirmado o resultado registrado. No cuenta abrir WhatsApp».
- Muestra estado de carga, error con «Reintentar» y estado vacío del período («Todavía no hay movimientos en este período»).
- En 390 px las tarjetas se apilan y no hay scroll horizontal.

## 5. Tests

- **Unitarios:** parseo y validación del período (presets, máximo 366 días, `from > to`) y armado de la serie (cambio de día a semana, relleno con ceros, cortes en hora argentina).
- **Integración** (`scripts/test-my-stats.ts`, nuevo, agregado a CI): dos vendedores con datos cruzados.
  - Cada uno recibe solo lo suyo, y los números coinciden con datos armados a mano para el test (no con una copia del mismo SQL).
  - `?responsible=otro@…` da 400.
  - Sin sesión da 401.
  - Un negocio archivado, uno fusionado y uno borrado no cuentan en las fotos de hoy. Un contacto hecho antes de archivar o fusionar el negocio sigue contando; uno en un negocio en la papelera no.
  - «No contestó», borrador y canal abierto no cuentan como contacto.
  - Una tarea completada a las 23:30 hora argentina cuenta para ese día y no para el siguiente.
  - Un contacto del vendedor A en un negocio reasignado a B sigue siendo de A.
  - La salida no contiene emails de otros usuarios.
- **Navegador:**
  - El vendedor ve «Mis estadísticas» en el menú y abre la página.
  - Cambiar el período actualiza la URL.
  - En 390 px no hay overflow.
  - El admin sigue sin cambios en `/analytics`, y el vendedor sigue bloqueado ahí.

## 6. Documentación

- Guía de uso (`src/content/user-guide.json`): sección «Mis estadísticas», con qué cuenta cada número; ajustar la línea 228, que hoy dice que Estadísticas es solo admin.
- Tema de ayuda nuevo en `HelpLink`/`helpHints`.
- `docs/estado-desarrollo.md` y `docs/pendientes.md`. En pendientes, anotar los errores de `/analytics` (Problema).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Filtración entre vendedores | Endpoint sin parámetro de responsable, entrada estricta, test de integración cruzado |
| Números distintos a los de «Hoy» o el embudo | Reusar `taskBucket`, `contactEvidence` y la clasificación de etapas; tests con los mismos casos de borde |
| Lentitud con rangos largos | Agregación en SQL, máximo 366 días, índices existentes; medir con `EXPLAIN` sobre datos de prueba en el PR del endpoint |
| El vendedor lee mal la tasa de cierre | Mostrar «—» sin cierres y la ayuda por métrica |

## Orden de implementación (PRs a `staging`)

1. **Endpoint:** schema, handler, registro, unitarios del período y la serie, `scripts/test-my-stats.ts` en CI.
2. **Página:** ruta, menú, paleta de comandos, `liveDomains`, tests de navegador.
3. **Docs:** guía de uso, ayuda, `estado-desarrollo.md` y `pendientes.md`.

## Aceptación

- Un vendedor abre «Mis estadísticas» y ve solo sus datos del período elegido. No hay forma de pedir los de otro usuario: 400 por parámetro y ningún email ajeno en la salida.
- Los contactos cuentan solo evidencia real, y las fechas siguen el día argentino.
- Lo archivado, fusionado y borrado no cuenta en las fotos de hoy; los hechos ya realizados se conservan (D2/D3).
- `/analytics` queda igual.
- Typecheck, unitarios, `test-my-stats` y tests de navegador en verde en CI.

## Migraciones y datos

Sin migraciones ni operaciones de datos. Solo lectura sobre tablas existentes.
