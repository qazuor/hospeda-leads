# Spec hija: dictar notas sin grabar la llamada

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Exploratoria · **Depende de:** [62](62-ai-platform-foundation-spec.md), decisión específica de voz y privacidad.

## Objetivo

Permitir dictar texto para completar una nota o respuesta mientras se usa el CRM móvil, sin convertir la llamada en una grabación almacenada.

## Flujo propuesto

- Acción explícita **Dictar nota** junto al campo de texto, con indicador visible de micrófono activo, duración y botón para detener/cancelar.
- El usuario concede permiso al dispositivo; la transcripción aparece como borrador editable y nunca se guarda automáticamente.
- Al detener, se informa si la voz se transcribió localmente o se envió a un proveedor aprobado. El usuario revisa y guarda con el flujo existente.
- No comenzar dictado automáticamente al abrir un formulario ni mantener micrófono activo en segundo plano.

## Privacidad y aceptación

1. No grabar ni conservar audio después de producir el texto; no registrar audio/transcripción en logs técnicos.
2. No activar hasta aprobar tecnología, proveedor, región, retención, accesibilidad y aviso al usuario.
3. Si falta permiso o conexión, el campo de escritura manual permanece disponible.
4. Poder detener/cancelar y borrar el borrador dictado antes de guardarlo.
5. No inferir quién habló ni separar automáticamente interlocutores.

## Decisiones e impacto estimado

Definir si se usará reconocimiento del dispositivo o proveedor del servidor; no asumir que el reconocimiento del navegador es local o privado sin verificarlo. Revisar `ManualCommunicationForm`, registro de llamada y soporte móvil. La spec no incluye transcripción de llamadas grabadas ni almacenamiento de audio.
