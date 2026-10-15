# Spec hija: informe de cartera para responsable

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Media · **Depende de:** [62](62-ai-platform-foundation-spec.md), definición de métricas y permisos.

## Resultado esperado

Un responsable puede pedir un informe de su cartera para un período y entender avances, pendientes y obstáculos con referencias verificables.

## Flujo

- Elegir período, cartera/responsable, vertical y filtros admitidos. El período inicial será los últimos 30 días, visible y editable. Incluir siempre un desglose por responsable dentro de la cartera que el usuario tiene permiso para consultar.
- Mostrar antes de generar qué registros y métricas entrarán, cuántos negocios abarca y que cada journal recibirá un prompt sin referencias a otros negocios y solo su fragmento individual. El prompt original y el informe agregado completo quedan visibles en pantalla para quien lo generó. El servidor aplica permisos y ámbito de cartera.
- Presentar métricas calculadas por código, resumen narrativo, pendientes, gestiones sin próximo paso y cambios del período; cada sección permite abrir la lista fuente.
- Métricas iniciales: negocios por estado actual; gestiones abiertas por etapa actual y gestiones cerradas por resultado durante el período; contactos salientes por canal/resultado y respuestas recibidas dentro del período; tareas abiertas y vencidas al generar, más las completadas durante el período.
- El período predeterminado cubre 30 días calendario, incluida la fecha local de generación y los 29 días anteriores, según el calendario comercial de Argentina. Las métricas descritas como “actuales” son una fotografía al generarlo; las de actividad/completadas cuentan eventos dentro del período elegido.
- Permitir copiar o imprimir el informe revisado. No enviar automáticamente ni programar distribución en esta spec.
- Guardar en cada journal un prompt sin identificadores ni datos de los otros negocios y solo el fragmento correspondiente a esa ficha. No copiar allí el prompt original ni el informe agregado completo; quedan en la pantalla de quien lo generó.

## Reglas y aceptación

1. Las métricas son calculadas por consultas deterministas y muestran definición/rango; el modelo solo redacta su lectura.
2. Incluir el desglose por responsable solicitado, siempre dentro de los permisos de cartera del usuario. Presentar conteos y estados de forma descriptiva; no crear ranking ni inferir desempeño, calidad o causas individuales.
3. Afirmaciones tienen enlaces o conteos verificables; incertidumbre o datos incompletos se señalan.
4. No incluir negocios ajenos al ámbito permitido aunque el usuario manipule filtros. Ningún journal individual revela datos de otros negocios: contiene únicamente su fragmento específico.
5. Sin datos suficientes, mostrar “no hay base para concluir”, no una explicación inventada.

## Impacto estimado

El catálogo inicial incluye negocios por estado, gestiones por etapa/resultado, contactos y respuestas por período, y tareas abiertas/vencidas/completadas. El período predeterminado de 30 días, el desglose por responsable y el registro de prompt/fragmento por negocio están aprobados, limitados por permisos existentes. Integración estimada con `src/pages/analytics.tsx`, filtros y consultas agregadas actuales; no usar al modelo para calcular conteos.
