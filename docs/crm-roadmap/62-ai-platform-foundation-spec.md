# Spec hija: soporte común para IA en CRM

**Épica:** [61 — IA dentro de Hospeda CRM](61-ai-in-crm-epic.md)
**Estado:** propuesta funcional definida; no implementada. La integración con un proveedor real queda bloqueada hasta elegir proveedor/modelo y verificar sus condiciones.
**Prioridad:** fundacional; requisito previo para las specs 63–81

## Objetivo

Dejar una integración interna y segura para que el chat general y las acciones contextuales del CRM soliciten tareas acotadas a un modelo de lenguaje. Cada funcionalidad consume la misma capa del servidor con un identificador y un contrato tipado propios; no implementa conexiones, claves ni llamadas directas al modelo desde el navegador. La interfaz no fija proveedor ni modelo: esa elección se hará antes de implementar la integración real.

## Historias de usuario

- Como persona usuaria, quiero pedir una ayuda o borrador desde el lugar donde trabajo sin configurar un proveedor.
- Como persona usuaria, quiero consultar cómo usar el CRM y, desde la ficha abierta, preguntar por ese negocio sin tener que buscarlo de nuevo.
- Como responsable del producto, quiero cambiar o desactivar la conexión de IA desde configuración de servidor sin reescribir cada función.
- Como desarrollador, quiero simular respuestas, errores y límites para probar cada integración sin usar datos ni créditos reales.

## Flujo común

1. La UI invoca una operación de IA concreta, por ejemplo `general_chat` o `business_summary`, con la entrada de la persona y, si aplica, el identificador del negocio que está viendo. El chat general responde sobre el uso del CRM; cuando hay una ficha abierta, puede responder además sobre ese negocio. No busca otros negocios.
2. El endpoint autentica la sesión, verifica permisos sobre cada recurso referenciado y valida el tamaño/forma de la entrada.
3. Un preparador propio de esa operación obtiene la ficha e historial completos del negocio contextual cuando la persona tiene permiso de lectura. No carga otros negocios ni datos que el usuario no pueda consultar. Para operaciones sin contexto de negocio, obtiene únicamente las fuentes documentales necesarias.
4. Un servicio común aplica límites, instrucciones base y un contrato de salida validable, y llama al adaptador configurado en servidor.
5. La respuesta se valida contra su esquema; se eliminan campos extra o se rechaza una forma inválida. La UI muestra resultado, fuentes, incertidumbre y acciones permitidas.
6. Si la interacción está vinculada a un único negocio, el CRM guarda el prompt y la respuesta como entrada de IA en el journal del negocio. Si una función analiza un conjunto definido, cada journal recibe una versión del prompt que no identifica a los otros negocios y solo el fragmento correspondiente a ese negocio; el prompt original y el informe completo quedan en pantalla para quien lo generó. Las consultas generales sobre uso del CRM, sin negocio asociado, no se guardan en un journal de negocio. Guardar/aplicar/enviar otra acción sugerida queda a cargo del flujo de producto y exige confirmación explícita.

## Contrato técnico propuesto

- `AiFeatureKey`: catálogo cerrado de operaciones; no aceptar nombres arbitrarios enviados por el cliente.
- `AiRequest`: clave de función, entrada validada, referencias de contexto y opciones de salida permitidas para esa función.
- `AiResult<T>`: contenido tipado, fuentes usadas, avisos de información faltante, identificador de solicitud y metadatos no sensibles de ejecución.
- Un adaptador `AiProvider` encapsula autenticación, formato del proveedor, timeout, errores y salida. La aplicación depende de la interfaz, no del SDK del proveedor.
- Cada función declara esquema Zod de entrada/salida, presupuesto de contexto/salida, reglas de fuentes y una versión de instrucciones mantenible.
- La salida estructurada no sustituye validación de dominio ni permisos. Las operaciones de IA no reciben una herramienta de escritura genérica.

## Seguridad, datos y privacidad

- La clave del proveedor existe únicamente en variables/configuración privada del servidor; nunca se serializa al cliente ni se imprime en logs.
- No registrar prompts, transcripciones, textos de mensajes, respuestas del modelo ni datos de negocios en logs de aplicación o telemetría por defecto.
- En logs y telemetría técnica registrar como máximo identificador de solicitud, función, usuario, proveedor/modelo, tiempos, estado y conteos de tokens/costo reportados; no registrar contenido allí.
- Enviar la ficha e historial completos del negocio contextual cuando la persona tenga permiso de lectura, como aprobó el propietario. No buscar ni incluir otros negocios. Para funciones sin negocio contextual, enviar solo las fuentes pertinentes a esa función.
- Guardar el prompt y respuesta de cada interacción vinculada a un negocio en su journal. Si la operación analiza varios negocios, escribir una entrada por negocio con un prompt sin referencias a los demás y solo su respuesta/fragmento. El prompt original y el informe completo permanecen en pantalla para quien los generó y no se copian en los journals. Identificar cada entrada como interacción de IA e indicar usuario y fecha/hora. No guardar en journals consultas genéricas de uso del CRM sin negocio asociado.
- Tratar notas, mensajes, documentos y contenido recuperado como datos no confiables; sus instrucciones no pueden reemplazar las reglas de sistema ni autorizar acciones.
- Mantener No contactar, Papelera, archivado y permisos vigentes; IA no los modifica ni los omite. Los negocios en Papelera no pueden enviarse a IA hasta ser restaurados por el flujo autorizado, aunque un administrador pueda verlos allí.
- Mantener agnósticos proveedor y modelo en esta spec. Elegirlos antes de implementar la conexión real y verificar contrato, retención, entrenamiento, región y controles aplicables antes de producción con datos reales.

## Resiliencia y experiencia

- Mostrar carga, evitar doble solicitud, permitir cancelar cuando el transporte lo admita y conservar el texto ante error.
- Reintentar solo fallos transitorios de generación, con límite y sin duplicar efectos de CRM; no reintentar automáticamente después de un resultado incierto si una feature llegara a tener efectos externos.
- Errores presentados en lenguaje claro: servicio no configurado, límite alcanzado, timeout, respuesta no válida y fallo temporal.
- Antes de enviar contexto de negocio, la UI identifica el negocio y avisa que el prompt y la respuesta se conservarán en su journal, visible para lectores autorizados.
- Si no hay proveedor configurado o la IA falla, la función deja disponible su alternativa manual.
- La conversación genérica sobre uso del CRM no se persiste por defecto. Las interacciones vinculadas a un negocio se persisten en el journal según la regla anterior; las acciones propuestas siguen su flujo de confirmación propio.

## Configuración y administración

La configuración se realiza en servidor por ambiente: proveedor, modelo, credencial, endpoint compatible si aplica, timeout y topes. La UI no permite que una persona usuaria cambie proveedor/modelo ni administre credenciales. Antes de habilitar IA se deben configurar límites, informar uso y errores, y bloquear nuevas solicitudes al alcanzarlos. Todo usuario autenticado puede usar las funciones de IA, sujeto a los permisos que la función del CRM ya exige; no hay habilitación individual o piloto administrado.

## Pruebas y observabilidad

- Adaptador simulado inyectable para pruebas unitarias, de contrato y de navegador.
- Casos para sesión ausente, falta de permiso, referencia a Papelera, entrada demasiado grande, timeout, rate limit, salida inválida y proveedor desconfigurado.
- Asegurar que los errores y logs no contienen cuerpos de entrada/salida ni secretos.
- Pruebas de integración reales son opt-in, con base y credenciales descartables, nunca en CI por defecto.

## Criterios de aceptación

1. El navegador no puede llamar al proveedor ni leer credenciales.
2. Toda solicitud pasa por autenticación, permisos, validación de entrada y una función tipada.
3. El contexto se prepara en servidor desde una lista permitida por feature.
4. El modelo no tiene herramientas de escritura en CRM y su respuesta no cambia datos.
5. Esquemas invalidan respuestas mal formadas; un error deja intacto el borrador del usuario.
6. En configuración ausente o error de proveedor, la UI muestra una alternativa manual operativa.
7. Pruebas pueden correr con proveedor simulado sin red ni datos reales.
8. Las interacciones de un negocio aparecen en su journal; las interacciones multinegocio crean en cada journal un prompt sin referencias a otras fichas y solo su fragmento, sin revelar el informe agregado completo.

## Decisiones que bloquean implementación productiva

| Decisión | Recomendación a evaluar | Estado |
|---|---|---|
| Proveedor y modelo inicial | Mantener esta spec agnóstica; elegir proveedor/modelo antes de implementar la conexión real. | Acordado |
| Datos que pueden salir del CRM | En contexto de negocio, se permite ficha e historial completos cuando el usuario tiene permiso; el chat general no consulta negocios distintos del que está abierto. | Acordado |
| Retención/uso del proveedor | Verificar condiciones vigentes de retención, entrenamiento, región y contrato antes de usar datos reales. | Pendiente de verificación antes de producción |
| Quién puede usar IA | Todo usuario autenticado, sujeto a los permisos existentes de la función/negocio; sin habilitación administrativa por usuario. | Acordado |
| Límites y gasto | Configurarlos antes de habilitar el servicio, informar uso/errores y bloquear nuevas solicitudes al alcanzar el límite. | Acordado; valores concretos antes de habilitar |
| Persistencia | Guardar prompt y respuesta de interacciones vinculadas a negocio. En multinegocio, guardar en cada journal un prompt sin referencias a los demás y solo el fragmento de esa ficha; no registrar consultas genéricas sin negocio. | Acordado |
| Auditoría multinegocio | Guardar el prompt y solo el fragmento de ese negocio en cada journal; el informe completo queda en pantalla para quien lo generó. | Acordado |
| Dictado | Fuera de la primera etapa. | Acordado |

## Áreas técnicas estimadas

Sin fijar aún nombres definitivos de archivos: endpoint/contrato en `src/endpoints/`, servicio y adaptador en `src/helpers/` o módulo de servidor, registro de rutas en el servidor Hono, configuración de entorno/documentación local y tests de contrato. Las funciones hijas añaden sus esquemas, preparadores de contexto, componentes y pruebas propios. Debe revisarse el modelo actual del journal para guardar prompt/respuesta exactos; si no lo soporta, agregar una migración nueva sin editar migraciones ya aplicadas.

## Dependencias

Es prerequisito de las specs 63–80. La elección de proveedor/modelo y la verificación de sus condiciones son previas a implementar una integración real o enviar datos reales. La spec 81 queda fuera de la primera etapa. No cambia los permisos existentes ni el modelo de Comunicación.
