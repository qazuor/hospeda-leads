# Orden de trabajo confirmado — 8 de octubre de 2026

Base: PR 73 integrado en main `04fe2ab2e0e60a2cff4ff0bdfcf0258580a32470`. Los números entre paréntesis corresponden al listado discutido con el propietario, no a la secuencia de ejecución.

1. Limpieza de gestiones históricas vacías (12): auditoría, respaldo, restauración comprobada, manifiesto y ensayo; revisión antes de ejecución productiva.
2. Revisar modelos de mensajes (11): textos y restricciones heredadas por perfil/vertical.
3. Múltiples verticales por negocio (10): acordar clasificación, gestiones conjuntas, filtros, responsables y migración antes de implementar.
4. Completar búsqueda sin acentos (1): materiales, modelos y filtros de texto restantes.
5. Historial comercial más claro (2): conversaciones, resultados y próximo compromiso separados de cambios técnicos.
6. Unificar Contactar desde tareas (5): reutilizar el recorrido nuevo y sus permisos/estados.
7. Registro guiado de respuestas (6): preguntas, revisión de cambios y próximo paso.
8. Continuidad de pendientes (7): fechas claras, cancelación con motivo, advertencia de duplicados y siguiente pendiente.
9. Reglas comerciales (9): etapas, aceptación/cierre, pago/entrega, respuestas espontáneas y tareas delegadas.
10. Miniaturas: primera página de PDF y revisión del alcance restante.
11. Toasts con acciones (4): accesos al resultado, reintentos y deshacer cuando sea reversible.
12. Auditoría global de loading (3): respuesta visible, bloqueo inmediato y preservación del formulario ante error.
13. Revisión transversal de UI (8): móvil, temas, teclado, foco, iconos, ayudas y estados vacíos.

## Dependencias sin alterar el orden

En registro de respuestas y continuidad se puede trabajar en interfaz y operaciones ya aprobadas. Los automatismos de etapa, aceptación, cancelación/reemplazo de otras tareas y permisos de delegación quedan pendientes hasta resolver las reglas comerciales del punto 9. No suplir esas decisiones con el comportamiento heredado.

Multivertical empieza por acordar el diseño; no implica autorización para fusionar registros o reasignar responsables productivos. La limpieza histórica tiene un manifiesto y procedimiento propios, independientes de esa consolidación.

## Estado del primer punto

La auditoría de solo lectura existe y tiene pruebas de integración. No existe un relevamiento productivo ni respaldo/restauración comprobados en esta sesión. El entorno actual no tiene DATABASE_URL ni clientes PostgreSQL configurados. El procedimiento de continuación está en `docs/management-cleanup-runbook.md`; no se habilita borrado por deploy ni por este cambio documental.
