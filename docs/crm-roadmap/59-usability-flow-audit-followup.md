# Auditoría ampliada de recorridos y correcciones

**Fecha:** 14/10/2026

**Estado:** correcciones de esta pasada implementadas localmente; sin commit, push ni merge.

**Base revisada:** rama `feat/communication-crm`, con los cambios locales previos de Comunicación y estados.

**Método:** lectura de rutas, componentes, validaciones del servidor y pruebas automatizadas disponibles. No se operó la réplica de producción ni se ejecutaron recorridos que escriban datos.

## Cambios de flujo aplicados

1. **Selección de destinatario:** las pantallas de contacto desde una gestión y desde una tarea ya no preseleccionan automáticamente a la persona principal ni a la persona del último contacto cuando hay varias. Se conserva una persona elegida explícitamente antes en el mismo recorrido y se preselecciona cuando existe una sola persona disponible. Se agregó prueba unitaria de estas reglas.
2. **Registro de actividad y cierre de tarea:** planificar una continuación ya es opcional. El usuario puede guardar lo ocurrido sin tener que elegir entre programar otra acción, esperar o terminar el seguimiento. Si elige una próxima acción, siguen siendo obligatorios su título y fecha.
3. **Contacto con varias personas:** la selección del destinatario exige una elección cuando hay varias personas; los canales quedan deshabilitados hasta que se elija una persona o el canal general. También se muestra el estado de verificación de restricciones y contacto reciente mientras carga.
4. **Crear gestión desde Contactar:** la acción ahora se llama “Iniciar gestión y continuar” y explica que, después de guardarla, se vuelve a elegir el canal y preparar el mensaje; no afirma ni implica que el contacto se haya realizado.
5. **Intentos manuales sin texto:** cuando se elige una red u “Otro” y no hay texto para copiar, el botón dice “Iniciar intento manual” y el resultado confirma que el intento quedó pendiente y no se envió un mensaje.
6. **Importación con errores por fila:** luego de confirmar, el informe explica que las filas fallidas deben corregirse en el archivo y cargarse en un lote nuevo. Se puede iniciar ese lote desde el mismo diálogo; se preservan fuente, URL y fecha de obtención para facilitar la corrección.
7. **Requisitos de importación:** si falta la fuente o no se mapeó el nombre, la interfaz explica cuál requisito falta en vez de dejar únicamente deshabilitado “Revisar lote”.
8. **Correcciones auditables y fusiones:** el formulario anuncia el mínimo de tres caracteres exigido para la nota de corrección y el motivo de fusión; los formularios impiden el envío antes de cumplirlo.
9. **Revisión de fusiones:** primero se muestran los campos con valores distintos y se informa cuántos quedan iguales. Se puede desplegar la lista completa. Los campos iguales mantienen el destino por defecto y no generan decisiones repetidas.
10. **Revisión de cambios masivos:** se corrigió un error de texto en la explicación previa a aplicar cambios.

## Auditoría inicial de estados, conservada como parte del alcance

El documento [58 — Fricción en recorridos](58-usability-flow-audit.md) ya registra las prevalidaciones agregadas al iniciar una gestión desde un negocio Nuevo, impedir acompañamiento antes de Cliente, anticipar bloqueos de Archivado, y validar formato de email y motivos antes del envío. Se conservan las reglas del servidor.

## Hallazgos descartados tras verificar el código

- **“Pidió no contactar” desde registrar actividad:** no es una opción disponible para crear nuevas actividades en el catálogo `purposeOutcomes`. El servidor también rechaza cambios de ese tipo y deriva explícitamente al flujo de Comunicación, donde se puede confirmar el bloqueo y elegir gestiones para cerrar. El caso descrito en la auditoría verbal anterior no era reproducible como flujo normal; no se alteró el catálogo ni se debilitó el guard.
- **Propósito obligatorio al planificar una tarea:** ya hay un propósito seleccionado por defecto (`Conversación comercial`) en el formulario. No se requiere que el usuario resuelva una elección extra si el valor sugerido es adecuado.
- **Error al preparar un mensaje:** se muestra el error de la mutación en el diálogo. La excepción capturada alrededor del `mutateAsync` no oculta el error visual.
- **Cierres, motivos, permisos y estados archivados:** el servidor conserva las reglas y los formularios afectados ya muestran los requisitos y mensajes pertinentes. No se modificaron reglas comerciales para reducir pasos.

## Áreas recorridas sin hallar otra fricción concreta que justifique un cambio

Ayuda y navegación; listado, filtros, vistas y columnas; detalle de negocio; etapas y reactivación; registro de respuestas y restricciones; modelos y versiones; recursos y biblioteca; usuarios y configuración; Papelera, Archivados, historial global, agenda, búsqueda y analíticas. Se encontraron oportunidades visuales amplias ya registradas en `docs/pendientes.md`, pero no se mezclaron con esta tanda de fricciones transaccionales.

## Validación y límites

- `pnpm run typecheck`: aprobado.
- `pnpm test`: 23 archivos y 106 pruebas aprobadas, incluidas cinco pruebas de selección de destinatario.
- `pnpm run build`: aprobado; continúa el aviso existente de bundle principal mayor a 500 kB.
- `git diff --check`: aprobado.
- No se ejecutó Playwright contra la réplica local reciente de producción ni se hicieron escrituras en esa base. La inspección fue de código y pruebas automatizadas; la validación visual con el propietario queda pendiente.
