# Recuperación de contraseña

En el login, «Olvidé mi contraseña» solicita el email del usuario. Brevo envía un enlace a `/reset-password` para elegir y confirmar una contraseña de entre 8 y 72 caracteres. Luego se ingresa por el login habitual.

Solo se recuperan usuarios con contraseña creada y email autorizado activo. La respuesta es la misma para emails desconocidos o deshabilitados. No reemplaza las invitaciones ni cambia roles o permisos.

Tokens aleatorios de 256 bits, guardados únicamente como SHA-256 en PostgreSQL, con vencimiento de 30 minutos y consumo atómico de una sola vez. El token viaja en el fragmento del enlace (no en logs del servidor) y la página lo retira de la barra del navegador. No se invalidan enlaces anteriores al pedir otro; al cambiar la contraseña se invalidan todos los enlaces y sesiones del usuario y se limpia el bloqueo por intentos de login.

Límite de un email cada cinco minutos por dirección y 100 direcciones por hora, persistidos en DB. Las solicitudes antiguas y tokens vencidos se limpian al solicitar recuperación. El envío es asíncrono; una falla del proveedor elimina el token nuevo y deja un mensaje operativo sin email, token o contraseña. El usuario puede volver a solicitar después del límite.

Requiere migración `008_password_recovery.sql`, `BREVO_API_KEY` y `PUBLIC_APP_URL` con el origen público correcto. Usa las configuraciones existentes `brevo_sender_name`, `brevo_sender_email` y `brevo_reply_to_email`. No se despliega automáticamente. Validación: `npm run test:auth` en una DB descartable con `CRM_TEST_DATABASE=1`; mock de Brevo, sin enviar correos reales.

Un administrador también puede iniciar el restablecimiento desde Configuración > Usuarios para una cuenta activa que ya tenga contraseña. El flujo aplica los mismos límites por dirección (un email cada cinco minutos y 100 solicitudes por hora), reemplaza la clave anterior por un hash aleatorio, invalida las sesiones, revoca los tokens del userscript y las credenciales MCP, y envía el enlace habitual. Si Brevo falla, se informa el error y se eliminan el token pendiente y el registro del límite, así el admin puede reintentar enseguida. El restablecimiento público no revoca los tokens del userscript. Al reactivar un usuario que nunca creó su contraseña se le envía una invitación nueva antes de volver a habilitar su email, para que no pueda registrarse sin el enlace.
