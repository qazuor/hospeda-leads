# Email entrante de Hospeda CRM

El Worker reenvía cada mensaje a Gmail y después entrega al CRM los correos dirigidos a una casilla de vendedor o a la dirección general de respuesta. El CRM los deduplica y asocia cuando hay evidencia suficiente.

Configurar `CRM_BASE_URL` en `wrangler.toml` y los secretos `INBOUND_EMAIL_TOKEN` (el mismo valor configurado en Coolify, mínimo 32 caracteres) y `FORWARD_TO` (casilla de Gmail del propietario):

```sh
npx wrangler secret put INBOUND_EMAIL_TOKEN
npx wrangler secret put FORWARD_TO
npx wrangler deploy
```

En Cloudflare Email Routing, apuntar el catch-all y las reglas específicas de vendedores a este Worker. El Worker conserva el reenvío a Gmail. Para verificarlo, enviar un mensaje de prueba a una dirección cubierta por las reglas y confirmar que aparece en Gmail aunque la entrega al CRM falle; revisar también los logs del Worker por el Message-ID, nunca por el contenido.
