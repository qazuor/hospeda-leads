# Migración segura de estados de negocios

**Estado:** migraciones 018–020 y flujos de aplicación preparados localmente; no ejecutados en producción.
**Fecha:** 12/10/2026

## Objetivo y alcance

Introducir el estado general del negocio y los catálogos tipados de gestión sin borrar ni recrear negocios, gestiones, tareas o historiales. La migración preserva `review_status`, `commercial_status`, No contactar, Archivo, Papelera, responsables, motivos, fechas y journals. No se consultó ni modificó producción.

La migración 018 agrega las columnas generales de estado; 019 agrega los indicadores independientes, catálogos fijos, motivos y reglas SQL; 020 reconcilia el estado inicial. Ningún archivo de migración aplicado debe editarse: si se ejecuta una versión, cualquier corrección posterior requiere una nueva migración.

## Mapeo de estado inicial (020)

Se aplica solo a negocios con `status IS NULL`, con esta prioridad:

1. `archived_at` presente → `archived`.
2. Una o más gestiones no eliminadas en una etapa clasificada abierta → `in_management`.
3. Sin gestión abierta y con fecha de recontacto en el evento de cierre vigente → `recontact`, copiando la fecha sin modificar el evento.
4. `review_status='filtered'` o `commercial_status='client'` → `reviewed`.
5. Sin gestión abierta y con al menos una gestión no eliminada cerrada → `no_follow_up_scheduled`.
6. Sin evidencia anterior → `new`.

El único Cliente del snapshot local se conserva como `commercial_status='client'` y se convierte en `is_client=true`; su estado general queda `reviewed`, conforme a la decisión del propietario. La migración no usa journals desvinculados para reconstruir gestiones. No contactar queda como indicador independiente y por sí solo no se transforma en Archivado.

Papelera permanece independiente: `deleted_at`, autor y motivo no se alteran. El estado subyacente calculado no permite operar sobre un registro en Papelera.

## Protección ante casos no interpretables

Antes del backfill, 020 aborta si encuentra una gestión vigente sin etapa, con etapa ausente, inactiva, histórica o sin clasificación. Así no asigna `new` o `no_follow_up_scheduled` ignorando trabajo que podría seguir abierto. Se deben revisar esos casos en una copia y agregar un mapeo explícito antes de reintentar.

Las gestiones existentes conservan sus etapas, eventos y asignaciones. No se convierten automáticamente a los catálogos tipados: una etapa antigua no prueba por sí sola que la gestión sea de una vertical o tipo nuevo. El preflight debe señalar gestiones vigentes heredadas y cualquier relación ambigua para decidir una correspondencia antes del corte.

## Ensayo de migración

`scripts/test-business-state-migration.mjs` crea un esquema aislado dentro de una base marcada explícitamente como descartable, aplica las migraciones previas y 018–020, verifica los campos y journals históricos, rechaza estados inválidos y revierte toda la transacción. Se ejecuta con `pnpm test:business-state-migration` solo si están configurados `CRM_TEST_DATABASE=1` y un `DATABASE_URL` de base descartable. Pasó en PostgreSQL 17 descartable el 12/10/2026, con rollback.

La fase 020 es idempotente respecto a filas que ya tengan estado, y termina imponiendo `NOT NULL`. No toca filas de gestiones ni journals. El ensayo debe comprobar conteos antes/después, rollback y repetición antes de usar la migración en una copia actualizada.

## Snapshot local de referencia

El preflight local del 12/10/2026 describió 3.532 negocios, 146 filtrados, 1 cliente, 25 en Papelera, ninguna gestión no eliminada, ningún negocio archivado/No contactar y journals históricos conservados. El único Cliente se clasificó como Cliente y Revisado siguiendo la decisión posterior del propietario. Estos conteos describen esa réplica, no producción en vivo.

## Secuencia de corte

1. Ejecutar el preflight de solo lectura contra una copia aislada y revisar gestiones heredadas vigentes, etapas no clasificables, Archivo/No contactar, Papelera y cruces de estados.
2. Aplicar 018–020 a una copia desechable y correr el test de migración. Revisar que Filtrado siga representado por Revisado, que Cliente siga siendo Cliente, que No contactar y Papelera permanezcan independientes y que journals/conteos no cambien.
3. Desplegar el código compatible con el nuevo esquema solo con migraciones aplicadas y verificadas. Revisar alta/importación, filtros, edición inline, cierres, tareas, reapertura, derivación y desarchivo.
4. Repetir preflight y ensayo sobre una copia reciente antes de preparar una ejecución productiva.
5. La aplicación de migraciones en producción requiere una acción operativa posterior explícitamente acordada. Este trabajo no autoriza ejecutarlas.
