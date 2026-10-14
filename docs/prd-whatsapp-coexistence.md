# PRD — WhatsApp Business Coexistence y registro comercial en Hospeda CRM

**Estado:** Propuesto; **no implementado**  
**Fecha:** 2026-10-14  
**Repositorio:** `qazuor/hospeda-leads`  
**Prioridad:** Alta, después de validar elegibilidad y costos reales de onboarding  
**Responsable del producto:** Hospeda  
**Objetivo central:** trabajar y enviar manualmente desde WhatsApp Business (teléfono/Web) y registrar mensajes en el CRM a través de webhooks oficiales, evitando cargos por envíos de Cloud API.

## 1. Contexto y problema

El equipo comercial de Hospeda contacta establecimientos turísticos desde el CRM. El flujo actual abre WhatsApp con un texto preparado, pero abrir un enlace no demuestra que el vendedor haya enviado el mensaje ni que el prospecto haya respondido. Se necesita conservar una conversación asociada al negocio/persona/gestión, facilitar seguimiento, registrar respuestas y generar tareas sin trasladar los envíos manuales a una API con cargos.

**Alcance del CRM real:** React 19 + Vite + React Router + TanStack Query + Mantine; API Hono/Node; PostgreSQL 17/Kysely; modelos en `src/endpoints/communication.ts`, entidades negocio `crm_accounts`, contacto `crm_contacts` y gestión `leads`. Leer `AGENTS.md`, `docs/decisiones.md` y `docs/mapa-tecnico.md` antes de implementar. **No es el monorepo del portal turístico**.

## 2. Hipótesis críticas y puerta de viabilidad (GATE 0)

No desarrollar toda la integración antes de demostrar estos supuestos en una cuenta de prueba, con el número autorizado por el propietario:

1. Verificar si el número actualmente usa WhatsApp personal o **WhatsApp Business**. Coexistence corresponde a Business App; no asumir que un número personal es elegible.
2. Confirmar en documentación vigente de Meta y en el onboarding real si el número/país/cuenta admiten **WhatsApp Business App Coexistence**, sin perder acceso móvil. Conservar evidencia y pasos de reversión.
3. Confirmar si existe un flujo directo de Meta para **este caso particular** o se necesita BSP / partner; presupuestar abono, onboarding, impuestos y cargos de terceros. **No prometer costo operativo total cero** por el solo hecho de no usar envíos API.
4. Configurar suscripciones reales a `messages` y `smb_message_echoes`; comprobar en dispositivos efectivamente utilizados: WhatsApp Business Android, WhatsApp Web y, si aplica, otros. **No asumir que todo cliente vinculado emite echoes**.
5. Probar: mensaje entrante, mensaje enviado desde app móvil, enviado desde Web, mensajes de diferentes tipos, duplicados/reintentos, demoras y reconexión. Registrar matriz de evidencias con ejemplos anonimizados.
6. Confirmar política de uso, consentimiento/opt-out, privacidad, retención y viabilidad del procesamiento de mensajes. No capturar conversaciones privadas ajenas a la actividad de Hospeda.

**Condición de avance:** si no hay acceso a los webhooks, Web no genera echoes, se pierde WhatsApp Business, el BSP impone un costo inaceptable o el tratamiento de datos no es admisible, **detener el desarrollo dependiente** y presentar alternativas. No usar scraping, extensiones que leen WhatsApp Web, automatización con navegador, APIs no oficiales ni ingeniería inversa como reemplazo.

### Fuentes de referencia (revalidar al implementar)

- Meta, política oficial: https://business.whatsapp.com/policy
- Meta, precios: https://business.whatsapp.com/products/platform-pricing
- Documentación del proveedor sobre coexistencia, limitaciones de dispositivos y precios: https://docs.360dialog.com/docs/resources/phone-numbers/coexistence
- Documentación del proveedor sobre eventos `history`, `smb_app_state_sync` y `smb_message_echoes`: https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence/coexistence-webhooks
- Webhooks en plataforma: https://docs.360dialog.com/docs/messaging/webhook

Las referencias de 360dialog **no prueban** que su suscripción sea gratuita ni que el flujo directo de Meta esté habilitado. Revisar documentación primaria oficial y términos vigentes antes de conectar producción.

## 3. Objetivos medibles

- Registrar mensajes entrantes (webhook `messages`) y salientes manuales **observables** (webhook `smb_message_echoes`), sin generar envíos por API.
- Vincular conversaciones a negocio/contacto y, **solo si es inequívoco o confirmado por vendedor**, a una gestión.
- Mostrar historial comercial cronológico, con dirección, canal, hora, remitente, tipo, fuente y estado de asociación.
- Avisar al responsable sobre respuesta relevante y permitir crear/continuar un próximo paso, sin fabricar una gestión automáticamente.
- Mantener la posibilidad actual de preparar texto y abrir WhatsApp/Web para **envío manual**, con advertencia de que “abrir” no significa “enviado”.
- Tener auditoría de integración, errores y estado de sincronización con no duplicación por reintentos.

### Indicadores

- >= 99 % de eventos **efectivamente recibidos y válidos** persistidos exactamente una vez tras reintentos (no equivale a 99 % de todos los mensajes producidos en WhatsApp).
- 0 llamadas a endpoint Cloud API de envío desde el CRM durante el MVP.
- 0 asociaciones automáticas a negocios/gestiones ambiguos.
- 100 % de errores y caídas observables por administración.
- Métricas de latencia entre recepción del webhook y persistencia, y cola de eventos pendientes.

## 4. Alcance funcional del MVP

### 4.1 Configuración y estado (solo ADMIN)

- Pantalla de configuración **WhatsApp > Integración** con estado: no configurada, validando, conectada, degradada, desconectada.
- Mostrar número empresarial parcialmente oculto, proveedor, estado de webhook, hora del último evento, eventos fallidos y enlace a manual operativo.
- Configuración de credenciales exclusivamente en variables de entorno/secrets, jamás en frontend o DB visible.
- Interruptor operativo **solo recepción y registro**; el backend debe bloquear cualquier envío mediante Cloud API.
- Comprobación de salud sin revelar secretos, prueba controlada con número propio y pasos claros para reconexión.
- Registrar quién y cuándo cambia configuración administrativa.

### 4.2 Registro de conversaciones

- Ingreso mediante webhook verificado; almacenar mensaje recibido en registro durable antes de responder éxito.
- Normalizar número E.164 cuando corresponda, preservando valor original; no deducir identidad exclusivamente por similitudes.
- Persistir ID externo (`wamid` cuando exista), proveedor/origen, dirección, tipo, timestamps del emisor y recepción, estado de procesamiento y datos de correlación.
- Mostrar texto y metadatos seguros; para fotos/audio/video/documentos, **fase MVP**: tarjeta de adjunto/tipo con enlace solo si se implementa descarga segura; no registrar un enlace vencido como si fuese permanente. Decidir retención de binarios antes de habilitar descarga.
- No asumir que todo tipo de mensaje, edición, eliminación o reacción tendrá sincronización completa.
- Eventos `history` de importación inicial, si están disponibles y autorizados, son opcionales y deben procesarse con consentimiento, paginación, idempotencia y límites. No prometer un histórico total.
- Eventos `smb_app_state_sync`, si se habilitan, **no deben crear ni modificar contactos de CRM sin política y revisión definidas**.

### 4.3 Asociación con CRM

- Buscar coincidencias exactas normalizadas en teléfonos de negocio y contactos.
- Si hay un único candidato suficientemente seguro, asociar conversación al negocio, registrando fundamento y origen.
- Si hay 0 o >1 candidatos: dejar en bandeja **Sin asociar / Revisar**, con búsqueda y selección manual; no crear ni fusionar negocios automáticamente.
- Las conversaciones se vinculan a negocio/persona, y opcionalmente a gestión mediante confirmación explícita; no inferir que una respuesta es aceptación o cierre.
- Si cambian teléfonos o se fusionan negocios mediante procesos autorizados, mantener trazabilidad histórica e integridad de vínculos.
- Respetar `No contactar`, eliminados, archivados, usuarios y permisos existentes. Recibir un mensaje no habilita un envío ni crea una gestión por sí solo.

### 4.4 Pantallas y experiencia

- Sección **WhatsApp** dentro de comunicaciones del negocio y vista consolidada en la gestión, sin duplicar entidades/historial existente.
- Bandeja de mensajes sin asociar, accesible por permisos comerciales definidos.
- Conversación tipo timeline con entrantes/salientes, adjuntos, estado de origen (`WhatsApp Business`, `Cloud API` si eventualmente existiera), hora y errores de sincronización.
- Indicador visible de **sincronización parcial/no garantizada**: nunca mostrar “historial completo” por omisión.
- En flujo **Contactar**, preparar mensaje con plantillas/variables actuales, abrir `wa.me` o Web para envío manual; no marcar “enviado” al abrir enlace. Registrar intención/borrador como tal y reconciliar únicamente si llega echo inequívoco.
- Acción contextual **Registrar gestión / resultado / próximo paso** que siga las reglas existentes de tarea, gestión y responsable.
- Actualizar vista con TanStack Query, loading claro, toasts accionables y layouts usables en móvil usando Mantine existente.

### 4.5 Notificaciones y automatizaciones internas

- Respuesta nueva sobre una conversación asociada: notificar al responsable comercial; evitar ruido de ecos y eventos históricos.
- Si no hay responsable o hay ambigüedad, dejar pendiente en bandeja de revisión; no asignar arbitrariamente.
- Eventuales sugerencias de próximo paso siempre requieren revisión humana para acciones comerciales.
- No enviar auto-respuestas por WhatsApp, no secuencias de marketing, no mensajes masivos, no mensajes automáticos desde Cloud API en este MVP.
- Las notificaciones dentro del CRM no generan facturación de mensajes de WhatsApp.

## 5. Fuera de alcance

- Enviar mensajes mediante Cloud API, campañas masivas, bots de respuesta, IA generando/respondiendo directamente, compra de números, scraping de WhatsApp Web.
- Integración con cuentas personales de vendedores sin consentimiento y política de acceso.
- Atribuir automáticamente ventas, consentimiento, aceptación, pagos, envío efectivo o respuesta a partir de un clic.
- Importación indiscriminada de agenda/historial personal y captación de contactos comerciales sin consentimiento.
- Reemplazo de CRM de tareas, gestiones, materiales, plantillas o permisos actuales.

## 6. Arquitectura propuesta

```text
WhatsApp Business móvil / WhatsApp Web (ENVÍO MANUAL)
                      |
              Coexistence habilitada
                      |
Meta / proveedor ---> Webhooks: messages + smb_message_echoes
                      |
            Hono /webhooks/whatsapp
                      |
         validación + evento durable/idempotente
                      |
         procesador / PostgreSQL (Kysely)
                      |
        correlación a negocio/contacto/gestión
                      |
         UI CRM + notificaciones + tareas
```

**No implementar cliente de envío Graph API** en MVP: prohibición técnica (no exportar servicio `sendMessage` ni credenciales con privilegios adicionales cuando puedan limitarse); prueba automatizada de ausencia de rutas/envíos salientes.

### Endpoints orientativos (adaptar al router real)

- `GET /_api/webhooks/whatsapp`: validación del desafío de suscripción si aplica.
- `POST /_api/webhooks/whatsapp`: recibir eventos, validar firma sobre **raw body** según integración real, limitar tamaño, deduplicar y persistir/encolar; devolver 2xx solo tras recepción durable.
- `GET /_api/whatsapp/status`: admin, estado seguro.
- `GET /_api/whatsapp/conversations` y `GET /_api/whatsapp/conversations/:id/messages`: lectura autenticada/autorizada.
- `POST /_api/whatsapp/conversations/:id/association`: asociar/reasociar con auditoría y permisos.
- `POST /_api/whatsapp/events/:id/retry`: reintento admin solamente de procesamiento local, jamás envío por WhatsApp.

**Seguridad:** HMAC/firma oficial de proveedor aplicable, validación Zod, secreto de verificación distinto de secreto de firma, rotación de tokens, TLS, bloqueo de SSRF para descargas, límites de tamaño, sanitización, autorización servidor por entidad y rol, protección de PII en logs. Cualquier cola/retry debe ser idempotente y usar backoff; eventos inválidos se aíslan sin detener el resto del lote. Política clara de retención, acceso y borrado de mensajes acorde normativa aplicable.

### Modelo lógico orientativo (ajustar al esquema existente)

- `whatsapp_integrations`: identificadores de cuenta/número, proveedor, modo read-only, estado y timestamps **sin secretos en claro**.
- `whatsapp_webhook_events`: ID de evento, hash/idempotency key, tipo, recibido, estado, intentos, error sanitizado, payload mínimo con TTL.
- `whatsapp_conversations`: integración, identificador remoto, número normalizado, cuenta/contacto asociados opcionalmente, estado de revisión, sincronización, última actividad.
- `whatsapp_messages`: conversación, ID externo único por integración cuando exista, direction, origin, type, content redacted/sanitized, timestamps, raw reference y event ID.
- `whatsapp_association_audit`: anterior/nuevo vínculo, usuario, fecha, motivo.

**Antes de crear tablas:** revisar `crm_messages`, `communication.ts` y las migraciones reales; reutilizar modelos existentes si es coherente. No romper historial de email ni recrear gestiones borradas. Agregar migración nueva; no editar migraciones con checksum.

## 7. Reglas de matching, duplicados y consistencia

1. Prioridad a ID remoto e integración; unicidad `(integration_id, remote_message_id)` si existe, más llave de fallback documentada.
2. Entrega at-least-once: mismo mensaje reintentado no agrega otra entrada ni dispara notificación extra.
3. Eventos fuera de orden ordenan por timestamp origen y desempate estable; conservar timestamp recepción.
4. Mensaje recibido antes del echo correspondiente es válido; el sistema no supone relación inexistente.
5. Borradores del CRM se mantienen separados de mensajes realmente observados. Vincular borrador con echo únicamente mediante regla inequívoca; si ambiguo, mostrar “sin confirmar”.
6. No editar ni borrar mensajes históricos cuando se cambie una asociación; registrar el cambio y mantener trazabilidad.
7. Error de webhook o desconexión => mostrar **posibles huecos**; no insertar mensajes inventados.

## 8. Roles y restricciones

- **ADMIN**: activar/configurar integración, diagnosticar, reintentar eventos fallidos, acceder a auditoría con necesidad operativa.
- **Vendedor responsable**: ver conversación de sus gestiones y acciones comerciales autorizadas; asociar donde tenga permisos explícitos.
- **Otros usuarios**: acceso solo si el modelo de permisos existente lo permite; no ampliar el alcance por agregar pantalla.
- Respetar reglas existentes: todos pueden leer ciertos negocios, pero eso **no** concede preparar/enviar comunicaciones ni acceder a contenido sensible sin un control explícito. Definir una matriz de permisos antes del UI final.

## 9. Riesgos y decisiones de producto

| Riesgo | Tratamiento |
|---|---|
| WhatsApp Web u otro dispositivo no emite echo | Matriz de compatibilidad real, advertencia de cobertura, fallback a anotación manual **sin fingir envío confirmado** |
| Número no apto para coexistencia | Gate 0; no migrarlo por procedimiento tradicional |
| BSP cobra mensualidad | Cotizar y aprobación antes de alta; registrar costo total |
| Uso de número privado | Recomendar número exclusivo, minimizar retención y separar conversaciones |
| Campañas sin consentimiento / reportes | Cumplir políticas WhatsApp y registros de opt-in/opt-out; no automatizar prospección |
| Webhook duplicado, incompleto o ausente | Idempotencia, retry, monitoreo y estado degradado |
| Pérdida de historial o revocación de cuenta | Backup permitido, runbook, retención y desconexión controlada |
| Escalada de acceso a mensajes personales | RBAC backend, auditoría, retención y restricción por ámbito |

**Costos:** objetivo **USD 0 en cargos por mensajes enviados desde Business App**, siempre que no se emitan envíos por API. **No equivale a garantía de USD 0 total**: puede haber cargo por proveedor, infraestructura o futuras políticas. Mantener envío API inhabilitado incluso si llega un mensaje gratuito. Verificar tarifario vigente antes de cualquier segunda fase.

## 10. Plan de implementación por entregables

### Fase 0 — Investigación y PoC controlada (bloqueante)
- Documento de elegibilidad, modalidad de alta directa/BSP, cotización, dispositivos usados.
- Prueba de webhook con números de prueba autorizados: inbound + echo móvil + echo Web.
- Matriz eventos soportados, precios y decisión **GO / NO-GO** con evidencias sin PII.

### Fase 1 — Backend seguro de recepción
- Endpoint GET/POST de webhook, firma, validación, durabilidad, idempotencia, colas/retry, estado y observabilidad.
- Contratos Zod, migraciones y pruebas unitarias/integración; no rutas de envío.

### Fase 2 — Asociación comercial e historial
- Modelo de conversación/mensaje compatible con CRM, matching conservador y bandeja sin asociar.
- Historial en negocio/contacto/gestión, permisos estrictos y auditoría.

### Fase 3 — Flujos de vendedores
- Preparar/abrir WhatsApp desde Contactar sin marcar envío; conciliación de eco observable.
- Notificaciones, próximos pasos explícitos y estados vacíos/carga/error.
- Revisión desktop/móvil, accesibilidad y navegación por teclado.

### Fase 4 — Operación y endurecimiento
- Alertas de desconexión/fallos, runbook, controles de retención/privacidad, auditoría.
- Validación end-to-end con responsables y dispositivos reales; despliegue por feature flag.

## 11. Criterios de aceptación (obligatorios)

- [ ] GO de Fase 0 con pruebas y costos; **no se toca el número productivo antes**.
- [ ] WhatsApp Business móvil sigue operativo tras alta y Web probado explícitamente.
- [ ] Un inbound real aparece una sola vez con referencia al negocio correcto o queda sin asociar.
- [ ] Un saliente manual de móvil se refleja como eco; Web se marca compatible **solo tras prueba real**.
- [ ] Webhooks repetidos y fuera de orden no duplican mensajes ni alertas.
- [ ] Teléfono ambiguo nunca asocia automáticamente a negocio/contacto/gestión equivocados.
- [ ] Abrir WhatsApp desde CRM no cambia estado a “enviado” hasta evidencia de echo o confirmación manual explícita, diferenciada.
- [ ] Restricciones No contactar, permisos y estados de negocio respetados en API y UI.
- [ ] Ningún flujo MVP ejecuta petición de envío de mensajes a Cloud API.
- [ ] Secretos no aparecen en UI/logs/repositorio; webhook rechaza firmas inválidas.
- [ ] Fallas muestran conexión degradada, cola de eventos y diagnóstico seguro.
- [ ] UI responsive y pruebas de carga/error/teclado según componentes actuales.
- [ ] Tests `npm run typecheck`, `npm test`, `npm run build` y suites nuevas pasan en CI.
- [ ] Runbook de alta/desconexión, permisos, rollback y limitaciones publicado.

## 12. Instrucciones para Codex / Claude Code

1. Leer `AGENTS.md`, `docs/estado-desarrollo.md`, `docs/decisiones.md`, `docs/pendientes.md` y este PRD. Verificar `git status`, HEAD remoto y código actual.
2. **Empezar por Fase 0**, no por implementar pantallas. Documentar resultados comprobados y límites de Meta/proveedor al día de la ejecución.
3. Con GO verificado, implementar por PRs pequeños, con tests; mantener feature flag deshabilitada por defecto.
4. Nunca desplegar una conexión real, migrar número, activar facturación o contratar BSP sin autorización del propietario específica para esa acción.
5. No alterar datos comerciales existentes ni abrir permisos; no reejecutar scripts de limpieza/recuperación histórica.
6. Al completar cada fase, actualizar `docs/estado-desarrollo.md`, `docs/pendientes.md` e historial como pide `AGENTS.md`.

## 13. Preguntas por resolver durante Fase 0

- ¿El número será exclusivo de Hospeda y utiliza ya WhatsApp Business?
- ¿Qué dispositivos y sistemas operativos usa cada vendedor? ¿Todos operarán el mismo número?
- ¿Meta permite onboarding directo de coexistencia para nuestra cuenta o se requiere BSP? ¿Cuál es el costo total?
- ¿Qué eventos de salientes llegan realmente desde WhatsApp Web, incluyendo adjuntos?
- ¿Qué retención de conversaciones es necesaria, quién puede leerlas y cuál es el proceso de eliminación?
- ¿Qué políticas de consentimiento y fuente de datos se aplicarán a prospectos existentes?

**Decisión de diseño vigente:** captura/registro primero; envíos exclusivamente manuales; nunca suponer cobertura total de las conversaciones ni costo total nulo.
