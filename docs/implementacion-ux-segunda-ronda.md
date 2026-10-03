# Implementación de la segunda auditoría de UX

Fecha: 2 de octubre de 2026. Referencia: [auditoría](auditoria-ux-segunda-ronda.md).

## Cambios realizados

| Área | Comportamiento implementado |
| --- | --- |
| Mi día | Lista ordenada: atrasado, hoy y próximo; grupos vacíos ocultos; filtros y revisión de ventas secundarios; alcance personal/equipo visible. |
| Negocios | Vista simple con negocio, contacto, relación y próximo paso; acciones Abrir visibles; vista avanzada conserva herramientas, selección y columnas configurables. |
| Ficha | Próximo paso prioritario; falta de contacto, restricción, tarea pendiente y finalización explícita tienen mensajes propios; contactos, documentos e historial siguen disponibles. |
| Trabajo | Contactar, registrar y continuar conservan negocio, venta, persona y propósito; sólo canales disponibles; preparación de plantillas dentro del contexto. Abrir un canal no acredita envío. |
| Resultados | Propósitos comercial, entrega, acompañamiento y reactivación con resultados pertinentes; los registros históricos sin propósito requieren elección al editarse. |
| Continuación | Programar, esperar con fecha o terminar por ahora; resultado y próxima tarea se guardan en una transacción. Terminar no crea trabajo pendiente. |
| Ventas | Recorrido según clasificación; etapas pueden vincularse explícitamente a contacto/necesidad/propuesta/decisión. No se infieren fases históricas. |
| Venta ganada | Acuerdo visible y editable sin reabrir; acompañamiento general accesible; nueva venta conserva historial y otras ventas. No acredita pagos ni activa servicios. |
| Restricciones | No contactar bloquea canales; compromisos internos pueden revisarse. Acciones siguen los permisos del negocio, venta y tarea. |
| Métricas | Negocio sin venta no aumenta ventas abiertas; compromisos de clientes y ventas cerradas cuentan en hoy/atrasados. Indicadores identifican la entidad contada. |
| Identidad | Paleta Hospeda, jerarquía y tamaños más legibles; estados con texto y color; menor protagonismo de metadatos y controles secundarios. |
| Guía | Guía incluida en la app y documentación de uso actualizadas con las decisiones reales del recorrido. |

## Compatibilidad y datos

La migración 012 agrega propósito, continuación, resultados de entrega/acompañamiento y fase de recorrido opcional. Los históricos conservan valores nulos: no se atribuyen resultados, fases o acuerdos desconocidos. Las automatizaciones mantienen los resultados comerciales canónicos existentes.

La edición del acuerdo agrega un evento auditable y exige la última versión conocida; una edición concurrente devuelve conflicto. El acuerdo anterior permanece en el historial.

## Validación

TypeScript, compilación y 43 pruebas unitarias pasaron localmente. Las pruebas de integración ampliadas y del navegador verifican permisos, continuidad, acuerdo editable, resultados de acompañamiento, métricas y ventas independientes. La CI del PR ejecuta además todas las suites con PostgreSQL 17, Chromium y la imagen Docker de producción.

La verificación visual incluye escritorio, móvil, modo oscuro y zoom. Las pruebas operan sobre datos sintéticos en una base aislada; no envían mensajes a personas reales.

## Validación humana pendiente

Los cambios de implementación de esta ronda quedan cubiertos por el código y las pruebas; no se ha medido todavía la facilidad de uso con participantes principiantes o personas mayores. Falta esa validación, además de una sesión específica con lector de pantalla. No se afirma una UI perfecta ni se presentan mejoras medidas sin estas sesiones.

Usar seis tareas sin orientar al participante: crear negocio, agregar contacto, conversar y registrar, preparar propuesta, cerrar y acompañar, ofrecer otra venta. Registrar tiempo, errores, dudas y puntos donde necesita ayuda. Conservar las pruebas automatizadas como regresión, no como sustituto de esa evaluación.
