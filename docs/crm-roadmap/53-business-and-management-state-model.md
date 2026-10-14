# Spec de producto: estados de negocios y gestiones

**Estado:** definición de producto aprobada y comparada con el código en el [reporte 54](54-current-state-gap-analysis.md). Implementación iniciada con esquema aditivo y preflight; los flujos de negocio/gestión aún no están implementados.
**Fecha:** 11/10/2026
**Alcance de esta spec:** comportamiento funcional, estados, reglas de transición, permisos y requisitos para migrar los datos existentes. No define arquitectura ni una migración SQL concreta.

## Objetivo

Separar por completo el ciclo de vida de un negocio del avance de cada gestión comercial. Un negocio puede tener varias gestiones abiertas a la vez. Cambiar o cerrar una gestión solo modifica el estado del negocio cuando se cumplen las reglas descritas aquí.

Esta definición busca que el equipo pueda distinguir si un negocio fue validado, si tiene trabajo abierto, si quedó para seguimiento futuro, si debe archivarse o si está en papelera; y que cada gestión use un recorrido apropiado para su tipo.

## Modelo conceptual

El negocio, cada gestión y sus indicadores independientes son conceptos separados:

- **Estado del negocio (`status`)**: posición general del negocio en el ciclo de trabajo.
- **Estado de una gestión**: etapa y resultado de esa gestión concreta. Puede haber varias gestiones activas por negocio.
- **Es cliente (`is client`)**: indicador independiente del estado. Una gestión comercial ganada activa el indicador; solo un administrador puede desactivarlo.
- **No contactar**: restricción independiente que bloquea el contacto comercial.
- **Derivado a Leandro**: indicador independiente del estado del negocio. En la gestión derivada se usa además el estado `Derivado a Leandro`.
- **Eliminado (`deleted`)**: condición de papelera lógica, independiente de archivado y de los estados anteriores.

Los estados terminales de una gestión no son estados del negocio. Ganar una gestión puede activar `Es cliente`, pero no representa pago, prestación del servicio ni entrega.

## Estados del negocio

| Estado | Significado y regla principal |
|---|---|
| **Nuevo** | Estado inicial de un negocio creado o importado. Todavía no se verificó. No permite iniciar gestiones. |
| **Revisado** | Se confirmó que el negocio existe y es válido para conservarlo. Habilita el inicio de gestiones. |
| **En gestión** | Tiene una o más gestiones abiertas. |
| **Sin seguimiento programado** | No hay gestiones abiertas ni una decisión concreta de volver a contactarlo. Incluye casos como “por ahora no le interesa” o “no respondió”. |
| **Recontactar** | Se decidió volver a contactarlo para retomar la propuesta o presentar otra. Puede llevar una fecha opcional. |
| **Archivado** | Se decidió dejar de trabajar el negocio. Conserva su historial y no equivale a eliminarlo. |

“Esperando hasta una fecha” no es un estado del negocio. La fecha acordada con el cliente pertenece a la gestión.

## Indicadores y papelera

### Es cliente

- Es independiente del estado del negocio.
- Una gestión cerrada como ganada por un trato comercial activa el indicador automáticamente.
- Solo un administrador puede desactivarlo manualmente, por ejemplo si el trato se revierte o se marcó por error.
- Participar como proveedor, colaborar como editor o aceptar una colaboración no activa por sí mismo este indicador. Una gestión comercial ganada con un trato sí lo activa.

### No contactar

- Es independiente del estado del negocio.
- Al cerrar una gestión con el motivo **Pidió que no lo contacten**, el sistema activa la restricción y archiva el negocio.
- En ese momento se pregunta si también se deben cerrar las demás gestiones abiertas.
- Si el usuario decide conservarlas abiertas, no deben permitir acciones de contacto mientras la restricción esté activa.

### Derivado a Leandro

- Cualquier usuario puede activar la derivación desde un botón disponible durante una gestión.
- Al derivar, esa gestión pasa al estado **Derivado a Leandro**.
- El negocio conserva su estado general, activa el indicador **Derivado a Leandro** y se asigna a Leandro.
- Solo un administrador puede desactivar la derivación. Al hacerlo, puede devolver el negocio al responsable original o asignarlo a otra persona.
- La derivación puede significar que Leandro se haga cargo o que revise el caso y decida cómo continuar.

### Eliminado

- Un negocio eliminado no aparece en las vistas normales ni en resultados o acciones comunes.
- Solo los administradores pueden verlo en Papelera.
- Mientras permanezca en Papelera no se puede editar, contactar, gestionar, asignar ni cambiar sus otros estados. Debe restaurarse antes de volver a operar sobre él.
- Papelera y Archivado son situaciones diferentes: archivar conserva un negocio válido fuera del trabajo activo; eliminar lo oculta en la Papelera.

## Catálogos de estados de gestión

Los catálogos siguientes son fijos en la aplicación por ahora. No es obligatorio recorrer todas las etapas: se puede pasar de cualquier etapa abierta a cualquier otra etapa abierta, incluso retroceder. Los estados de cierre exigen motivo según las reglas de la sección Cierre y motivos. Solo un administrador puede reabrir una gestión cerrada y debe elegir una etapa abierta; el cierre anterior permanece en el historial.

### Verticales principales: alojamientos, gastronomía y experiencias

Gestión comercial de suscripciones preestablecidas, difusión del sitio e invitación a participar. No requiere una propuesta personalizada.

- **Por contactar**
- **Contactado**
- **Interesado**
- **Evaluando un plan**
- **Cerrada ganada**
- **Cerrada perdida**
- **Derivado a Leandro**

`Contactado` puede avanzar directamente a `Cerrada perdida`, por ejemplo si el comercio no tiene interés. No se debe exigir pasar por `Interesado` o `Evaluando un plan`.

### Partners

Instituciones, empresas, ONG, comercios o profesionales que acompañan el portal. Puede haber planes preestablecidos o propuestas personalizadas.

- **Por contactar**
- **Contactado**
- **En conversación**
- **Interés confirmado**
- **Propuesta en preparación**
- **Propuesta enviada**
- **En negociación**
- **Cerrada ganada**
- **Cerrada perdida**
- **Derivado a Leandro**

### Proveedores

Profesionales o empresas que brindan servicios a comercios suscriptos. La gestión es informativa y de invitación; no es un lead de venta.

- **Por contactar**
- **Contactado**
- **Información enviada**
- **Interesado en participar**
- **Participación coordinándose**
- **Participa**
- **No participa**
- **Derivado a Leandro**

`Participa` y `No participa` cierran la gestión y requieren motivo. `Participa` no activa por sí solo `Es cliente`.

### Editores

Personas o instituciones que cargan información de eventos o publican notas. La gestión normal informa e invita a colaborar; en algunos casos puede incluir una propuesta comercial a cambio del servicio.

- **Por contactar**
- **Contactado**
- **Información enviada**
- **Interesado en colaborar**
- **Colaboración coordinándose**
- **Colabora**
- **No colabora**
- **Propuesta comercial en preparación**
- **Propuesta comercial enviada**
- **En negociación**
- **Cerrada ganada**
- **Cerrada perdida**
- **Derivado a Leandro**

`Colabora` y `No colabora` cierran la gestión de colaboración y requieren motivo. Las etapas de propuesta son opcionales. Al cerrar una propuesta como `Cerrada ganada`, se pregunta si corresponde marcar el negocio como Cliente. La colaboración editorial por sí sola no lo activa.

### Acompañamiento para crear o mejorar una ficha

La gestión comercial de un comercio cierra como ganada cuando acepta ser cliente. La ayuda para crear o mejorar su ficha ocurre después, en una gestión posterior de acompañamiento; no es una etapa previa a la aceptación ni debe impedir cerrar la gestión comercial como ganada.

El catálogo de esa gestión independiente es:

- **Pendiente de iniciar**
- **Contactado** (se puede omitir)
- **Trabajando en la ficha**
- **Cerrada completada**
- **Cerrada no completada**
- **Derivada a Leandro**

`Cerrada completada` no requiere motivo. `Cerrada no completada` sí requiere motivo: `El comercio no respondió`, `No envió la información`, `Decidió no continuar`, `Pidió no ser contactado` u `Otro` con nota obligatoria.

## Reglas entre gestión y negocio

1. Crear o importar un negocio lo deja en **Nuevo**.
2. No se puede iniciar una gestión mientras el negocio está **Nuevo**. Primero debe pasar por **Revisado**.
3. No se puede iniciar una gestión mientras el negocio está en Papelera. Si está **Archivado**, primero se debe desarchivar.
4. Al iniciar una gestión en un negocio habilitado, el negocio pasa a **En gestión**.
5. Se admiten varias gestiones abiertas por negocio. Cerrar una no cambia el estado general a seguimiento si aún queda otra abierta.
6. Si se cierra la última gestión abierta, el negocio pasa a **Recontactar** si se decidió volver a contactarlo; en otro caso pasa a **Sin seguimiento programado**. La fecha acordada para retomar pertenece a la gestión, es opcional y genera una tarea/recordatorio visible para el responsable. El estado de negocio `Recontactar` también puede tener fecha opcional como referencia.
7. Cerrar una gestión como ganada por un trato comercial activa `Es cliente`.
8. Cerrar una gestión con el motivo **Pidió que no lo contacten** activa `No contactar` y pasa el negocio a **Archivado**. Se pregunta si cerrar las otras gestiones abiertas. Si quedan abiertas, la restricción de contacto sigue bloqueando cualquier contacto.
9. Derivar a Leandro no cambia el estado general del negocio. Sí cambia el estado de la gestión derivada, activa el indicador del negocio y asigna el negocio a Leandro. La gestión conserva la etapa previa en el historial; si un administrador desactiva la derivación, vuelve a esa etapa. Mientras está derivada, Leandro puede avanzar la gestión.
10. Entre etapas abiertas, cualquier cambio está permitido, incluso retroceder. Una gestión cerrada solo la puede reabrir un administrador, que elige la etapa abierta de retorno; el cierre previo queda en el historial.
11. Solo un administrador puede desarchivar un negocio. El estado restaurado es `Revisado` si hay evidencia histórica de que ya fue revisado; de lo contrario, `Nuevo`.
12. Las etapas y los motivos son catálogos fijos de producto por ahora, no configurables desde la aplicación.

## Cierre y motivos

- Todo cierre de una gestión comercial/de participación/de colaboración obliga a registrar un motivo. Los catálogos son fijos y separados por vertical y resultado. En acompañamiento, solo `Cerrada no completada` exige motivo; `Cerrada completada` no.
- En todos los catálogos de cierre, `Otro` exige una nota breve.
- Catálogo de verticales principales (alojamientos, gastronomía y experiencias): ganada: `Aceptó sumarse`, `Ya tenía ficha y aceptó el plan`, `Otro`; perdida: `No le interesa`, `No respondió`, `Eligió otra alternativa`, `No puede participar ahora`, `Pidió no ser contactado`, `Otro`.
- Catálogo de Partners: ganada: `Aceptó la propuesta`, `Aceptó un plan preestablecido`, `Otro`; perdida: `No le interesa`, `No respondió`, `Presupuesto insuficiente`, `Condiciones no acordadas`, `Pidió no ser contactado`, `Otro`.
- Catálogo de Proveedores: participa: `Aceptó participar`, `Otro`; no participa: `No le interesa`, `No respondió`, `No ofrece el servicio requerido`, `No puede participar ahora`, `Pidió no ser contactado`, `Otro`.
- Catálogo de Editores, colaboración: colabora: `Aceptó colaborar`, `Otro`; no colabora: `No le interesa`, `No respondió`, `No puede colaborar ahora`, `Pidió no ser contactado`, `Otro`. Propuesta comercial: ganada: `Aceptó la propuesta`, `Otro`; perdida: `No le interesa`, `No respondió`, `Condiciones no acordadas`, `Pidió no ser contactado`, `Otro`.
- **Pidió que no lo contacten** es un motivo de cierre que, además, activa la restricción del negocio y lo archiva.
- Para los demás cierres, la selección entre **Sin seguimiento programado** y **Recontactar** debe reflejar si existe una intención explícita de retomar el contacto.
- Las fechas acordadas para retomar en un momento concreto se registran en la gestión y generan una tarea/recordatorio visible para su responsable, no un estado adicional del negocio.

## Historias de usuario

- Como persona que revisa datos importados, quiero marcar un negocio válido como Revisado para que el equipo pueda iniciar una gestión.
- Como vendedor, quiero tener más de una gestión abierta para un negocio sin que una gestión modifique indebidamente el estado de las demás.
- Como vendedor, quiero cerrar una gestión con un motivo y dejar el negocio sin seguimiento programado o marcado para recontactar.
- Como vendedor, quiero indicar en una gestión cuándo retomar el contacto si el cliente pidió hablar más adelante.
- Como vendedor, quiero derivar una gestión a Leandro desde cualquier etapa, conservando el estado general del negocio y asignándolo a Leandro.
- Como administrador, quiero quitar una derivación y elegir si el negocio vuelve a su responsable original o se asigna a otra persona.
- Como administrador, quiero corregir el indicador de cliente cuando el trato se revierte o se registró por error.
- Como administrador, quiero poder revisar Papelera sin que los negocios eliminados aparezcan en el trabajo ordinario ni puedan modificarse antes de restaurarlos.
- Como vendedor, quiero tratar de forma distinta la venta de una suscripción, una alianza, la invitación a proveedores y la colaboración de editores.

## Criterios de aceptación

1. Alta manual e importación inicializan el negocio como **Nuevo**.
2. Un negocio **Nuevo** no permite iniciar gestión; uno **Revisado** sí.
3. Crear una gestión cambia el negocio a **En gestión**. Varias gestiones abiertas son compatibles.
4. Cerrar una gestión abierta no mueve el negocio fuera de **En gestión** mientras exista otra abierta.
5. Al cerrar la última gestión, el usuario puede registrar si se debe recontactar; el negocio queda en **Recontactar** o **Sin seguimiento programado** según corresponda.
6. El cierre comercial/de participación/de colaboración requiere motivo; `Cerrada completada` en acompañamiento no, y `Cerrada no completada` sí. `Otro` exige nota. La fecha de recontacto de una gestión genera una tarea/recordatorio visible para su responsable.
7. Una gestión comercial ganada activa `Es cliente`; desactivarlo requiere rol administrador.
8. El motivo **Pidió que no lo contacten** activa No contactar, archiva el negocio y pregunta si cerrar otras gestiones abiertas.
9. No se puede ejecutar contacto desde las gestiones abiertas que se conserven mientras No contactar esté activo.
10. La derivación desde una gestión asigna el negocio a Leandro, cambia la gestión a Derivado a Leandro y activa el indicador del negocio, sin cambiar el `status` general.
11. Solo un administrador puede desactivar la derivación y seleccionar responsable original u otro.
12. Un negocio eliminado no se muestra fuera de Papelera, visible solo para administradores, y no admite operaciones hasta ser restaurado.
13. Cada vertical usa su propio catálogo fijo. Cualquier etapa abierta puede cambiarse a otra etapa abierta, incluso retroceder. Reabrir un cierre requiere administrador, etapa abierta elegida e historial del cierre anterior.
14. El recorrido comercial de suscripción puede cerrarse como ganado antes de iniciar la gestión posterior de acompañamiento de ficha.
15. Desarchivar requiere administrador y restaura `Revisado` cuando hay evidencia histórica de revisión; en caso contrario, `Nuevo`.
16. Una propuesta comercial de Editor cerrada ganada pregunta si debe marcarse el negocio como Cliente.

## Migración y preservación de datos

La futura implementación debe incluir una migración explícita y reversible, ensayada con una copia representativa antes de aplicarse a producción. La migración debe conservar los datos ya trabajados y mantener separado el historial de cada gestión.

Requisitos acordados:

- Los negocios que ya fueron marcados **Filtrado** deben conservar esa validación como **Revisado**; no deben regresar a **Nuevo**.
- No perder ni reinterpretar el valor histórico de Filtrado antes de producir y validar el mapeo al nuevo `status`.
- Resolver explícitamente los casos en que un negocio filtrado tiene una o más gestiones abiertas: el estado final debe respetar la regla **En gestión** y la validación previa debe seguir preservada.
- Preservar estados independientes existentes de Papelera, Archivo y No contactar, responsables, fechas, motivos e historial disponible.
- Auditar conteos antes y después, casos sin correspondencia, conflictos, negocios con varias gestiones y registros eliminados/archivados.
- Ensayar idempotencia, rollback y preservación de datos no relacionados. No recrear gestiones ni reconstruir datos borrados a partir de referencias históricas.
- La spec no autoriza ejecutar la migración ni escribir en producción. La ejecución necesitará alcance y procedimiento operativo propios.

## Decisiones aún necesarias antes de implementar

Estas definiciones no se completan por inferencia:

## Próxima fase

La comparación está en el [reporte 54](54-current-state-gap-analysis.md) y el plan de preservación de datos está preparado en el [documento 55](55-business-state-data-migration.md). Se decidió conservar el negocio con marca Cliente como Cliente y asignarle Revisado durante la migración, sin inferir una gestión a partir de los journals. La implementación y las migraciones 018–020 están en preparación local; no autorizan escrituras en producción.

## Evaluación de ajuste

**Ajuste al modelo objetivo: mixto.** La base de entidades y algunos indicadores se pueden reutilizar, pero faltan el estado principal del negocio, los catálogos de etapas por tipo, matriz de transiciones, derivación y automatismos de cierre. Ver fundamento y alcance en el [reporte 54](54-current-state-gap-analysis.md).
