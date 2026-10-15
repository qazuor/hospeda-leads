# Spec hija: resumen personalizado del día

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Media · **Depende de:** [62](62-ai-platform-foundation-spec.md), Mi día y asignaciones.

## Resultado esperado

Al comenzar la jornada, una persona puede leer un resumen breve de sus tareas, fechas y gestiones que requieren atención, con motivos y accesos directos.

## Flujo y contenido

- Bloque opcional en **Mi día**, generado a pedido o al entrar; no sustituye la lista ordenable de tareas.
- Considera solo el usuario actual y el día comercial de Argentina; incluye pendientes vencidos/de hoy/próximos definidos por Mi día.
- Agrupa por urgencia explicable y enlaza cada punto a la tarea/gestión. Puede señalar falta de próximo paso cuando una regla del CRM lo permita.
- La persona puede actualizar el resumen; no reordena ni cambia tareas.

## Aceptación

1. Excluye tareas privadas de otros usuarios y usa permisos del servidor.
2. Muestra fechas como fecha comercial local sin corrimiento UTC.
3. Los conteos y fechas concuerdan con los elementos fuente; si no concuerdan, se muestra la lista real como autoridad.
4. No crea recordatorios, cambia prioridad ni modifica asignaciones.
5. La lista de Mi día funciona aunque la IA esté desactivada.

## Impacto estimado

`src/pages/my-day.tsx`, consultas actuales de trabajo y un resumen breve; preservar filtros, acciones y jerarquía de la página.
