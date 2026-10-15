# Spec hija: soporte común para IA en CRM

**Épica:** [61 — IA dentro de Hospeda CRM](61-ai-in-crm-epic.md)
**Estado:** propuesta para revisión; no implementada
**Prioridad:** fundacional; requisito previo para las specs 63–81

## Objetivo

Dejar una integración interna y segura para que distintas pantallas del CRM soliciten tareas acotadas a un modelo de lenguaje. Cada funcionalidad hija consume la misma capa del servidor con un identificador y un contrato tipado propios; no implementa conexiones, claves ni prompts libres en el navegador.

## Historias de usuario

- Como persona usuaria, quiero pedir una ayuda o borrador desde el lugar donde trabajo sin configurar un proveedor.
- Como responsable del producto, quiero cambiar o desactivar la conexión de IA desde configuración de servidor sin reescribir cada función.
- Como desarrollador, quiero simular respuestas, errores y límites para probar cada integración sin usar datos ni créditos reales.

## Flujo común

1. La UI invoca una operación de IA concreta, por ejemplo `business_summary`, con los identificadores/contexto mínimo y la entrada editada por la persona.
2. El endpoint autentica la sesión, verifica permisos sobre cada recurso referenciado y valida el tamaño/forma de la entrada.
3. Un preparador propio de esa operación obtiene solo los datos permitidos. El cliente nunca decide por sí solo qué registros completos incluir.
4. Un servicio común aplica límites, instrucciones base y un contrato de salida validable, y llama al adaptador configurado en servidor.
5. La respuesta se valida contra su esquema; se eliminan campos extra o se rechaza una forma inválida. La UI muestra resultado, fuentes, incertidumbre y acciones permitidas.
6. Guardar/aplicar/enviar queda a cargo del flujo de producto correspondiente y exige confirmación explícita.

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
- Registrar como máximo identificador de solicitud, función, usuario, proveedor/modelo, tiempos, estado y conteos de tokens/costo reportados, sin contenido.
- Enviar al proveedor solamente los campos que el spec hija enumera. No mandar una ficha/historial completo como atajo de contexto.
- Tratar notas, mensajes, documentos y contenido recuperado como datos no confiables; sus instrucciones no pueden reemplazar las reglas de sistema ni autorizar acciones.
- Mantener No contactar, Papelera, archivado y permisos vigentes; IA no los modifica ni los omite.
- No asumir que el proveedor no retiene datos o los excluye de entrenamiento: debe verificarse contrato y configuración antes de producción.

## Resiliencia y experiencia

- Mostrar carga, evitar doble solicitud, permitir cancelar cuando el transporte lo admita y conservar el texto ante error.
- Reintentar solo fallos transitorios de generación, con límite y sin duplicar efectos de CRM; no reintentar automáticamente después de un resultado incierto si una feature llegara a tener efectos externos.
- Errores presentados en lenguaje claro: servicio no configurado, límite alcanzado, timeout, respuesta no válida y fallo temporal.
- Si no hay proveedor configurado o la IA falla, la función deja disponible su alternativa manual.
- No persistir chats ni resultados globales en la base en esta capa. La persistencia de un resultado confirmado pertenece a la feature que lo usa.

## Configuración y administración

La configuración se realiza en servidor por ambiente: proveedor, modelo, credencial, endpoint compatible si aplica, timeout y topes. La UI no permite que un usuario cambie proveedor/modelo ni administre credenciales. Los límites por usuario/rol y alertas de gasto se definen antes de habilitar producción.

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

## Decisiones que bloquean implementación productiva

| Decisión | Recomendación a evaluar | Estado |
|---|---|---|
| Proveedor y modelo inicial | Elegir uno con salida estructurada, límites por cuenta, controles documentados de retención y política de no entrenamiento aplicable a datos enviados. | Pendiente del propietario |
| Datos que pueden salir del CRM | Aprobar clases de dato por función y excluir credenciales, información de acceso y datos innecesarios. | Pendiente del propietario |
| Retención/uso del proveedor | Verificar condiciones vigentes y contratar/configurar antes de enviar datos reales. | Pendiente de verificación |
| Quién puede usar IA | Recomendación: los mismos permisos de lectura/acción de la función, más un control administrativo para habilitar/deshabilitar IA por ambiente. | Pendiente del propietario |
| Límites y gasto | Definir presupuesto/alertas y respuesta al agotamiento antes de habilitar a todo el equipo. | Pendiente del propietario |
| Dictado | Decidir motor, tratamiento de audio y confirmación de no conservación en la spec 81; no habilitar por defecto. | Pendiente del propietario |

## Áreas técnicas estimadas

Sin fijar aún nombres definitivos de archivos: endpoint/contrato en `src/endpoints/`, servicio y adaptador en `src/helpers/` o módulo de servidor, registro de rutas en el servidor Hono, configuración de entorno/documentación local y tests de contrato. Las funciones hijas añaden sus esquemas, preparadores de contexto, componentes y pruebas propios. No se requiere migración de base para la capa inicial si no se aprueba persistencia de solicitudes.

## Dependencias

Requiere una decisión de proveedor, datos y habilitación antes de enviar datos reales. Es prerequisito de las specs 63–81. No requiere cambiar estados, permisos existentes ni el modelo de Comunicación.
