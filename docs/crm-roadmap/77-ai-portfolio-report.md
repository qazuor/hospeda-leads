# Spec hija: informe de cartera para responsable

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Media · **Depende de:** [62](62-ai-platform-foundation-spec.md), definición de métricas y permisos.

## Resultado esperado

Un responsable puede pedir un informe de su cartera para un período y entender avances, pendientes y obstáculos con referencias verificables.

## Flujo

- Elegir período, cartera/responsable, vertical y filtros admitidos. El rango inicial es obligatorio y visible.
- Mostrar antes de generar qué registros y métricas entrarán. El servidor aplica permisos y ámbito de cartera.
- Presentar conteos calculados por código, resumen narrativo, pendientes, gestiones sin próximo paso y cambios del período; cada sección permite abrir la lista fuente.
- Permitir copiar o imprimir el informe revisado. No enviar automáticamente ni programar distribución en esta spec.

## Reglas y aceptación

1. Las métricas son calculadas por consultas deterministas y muestran definición/rango; el modelo solo redacta su lectura.
2. No comparar personas ni evaluar desempeño individual con inferencias. Desgloses por vendedor requieren decisión explícita y permisos.
3. Afirmaciones tienen enlaces o conteos verificables; incertidumbre o datos incompletos se señalan.
4. No incluir negocios ajenos al ámbito permitido aunque el usuario manipule filtros.
5. Sin datos suficientes, mostrar “no hay base para concluir”, no una explicación inventada.

## Decisiones pendientes e impacto

Antes de implementar, aprobar catálogo de métricas, rango predeterminado y si los informes pueden incluir desglose individual. Integración estimada con `src/pages/analytics.tsx`, filtros y consultas agregadas actuales; no usar al modelo para calcular conteos.
