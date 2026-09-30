# Deploy en Coolify

Hospeda Leads está preparado para ejecutarse como una única aplicación Node + una base PostgreSQL.

## Infraestructura recomendada

En el Coolify existente del VPS de Hospeda:

- Aplicación: `hospeda-leads-prod`
- Fuente: GitHub `qazuor/hospeda-leads`
- Rama inicial de validación: `migration/floot-port`
- Rama definitiva: `main`
- Build: Dockerfile
- Puerto interno: `3001`
- Health check: `/_api/health`
- Reinicio: `unless-stopped`
- PostgreSQL: versión 17, recurso separado gestionado por Coolify

No hace falta desplegar el `docker-compose.yml` en Coolify. Ese compose queda para desarrollo local / despliegue autónomo.

## Dominio

Dominio sugerido:

```
https://leads.hospeda.com.ar
```

Puede cambiarse por otro subdominio. `PUBLIC_APP_URL` debe coincidir exactamente con el dominio definitivo porque se usa, entre otras cosas, para imágenes absolutas en emails.

## Variables de entorno

Configurar en la aplicación:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=<internal PostgreSQL URL from Coolify>
JWT_SECRET=<random secret, minimum 32 bytes>
ADMIN_EMAIL=<email administrador>
BREVO_API_KEY=<Hospeda Brevo API key>
PUBLIC_APP_URL=https://leads.hospeda.com.ar
```

No versionar valores reales.

## Migraciones

El contenedor incluye `scripts/` y `migrations/`.

Ejecutar antes de poner tráfico real:

```bash
npm run db:migrate
```

La migración es idempotente mediante la tabla `schema_migrations`.

## Snapshot de Floot

Existe un snapshot cifrado AES-256-GCM creado el 30/09/2026.

Los valores del URL y la clave **no están versionados**. Se cargan como secretos para el workflow manual `Migrate Floot Data to VPS`.

Conteos esperados del snapshot:

| Tabla | Filas |
|---|---:|
| authorized_emails | 3 |
| crm_cities | 22 |
| crm_subtypes | 73 |
| crm_verticals | 6 |
| users | 3 |
| leads | 1600 |
| lead_notes | 3 |
| lead_journal | 1698 |
| message_templates | 31 |
| email_outbox | 0 |
| app_settings | 5 |

No se exportaron:

- `user_passwords`
- `sessions`
- `login_attempts`

Esto es intencional.

## Contraseñas después de migrar

Los registros de `users` sí se conservan para mantener:

- IDs
- roles
- asignaciones de leads

Al no existir una fila en `user_passwords`, el endpoint de registro permite que ese usuario autorizado defina una contraseña nueva. El ID y rol existentes se conservan.

Después de definir contraseña, el comportamiento vuelve a ser normal y un segundo intento de registro devuelve "email already in use".

## Validación posterior

Después del import:

```bash
npm run db:validate -- /tmp/migration-data.json
```

El proceso falla si cualquier tabla no coincide con el conteo del snapshot.

Después validar manualmente:

1. login / recuperación de los 3 usuarios;
2. listado de 1600 leads;
3. asignaciones Morena/Santiago;
4. filtros AND/OR;
5. notas y journal;
6. templates;
7. WhatsApp;
8. envío de un email de prueba por Brevo;
9. papelera/restauración;
10. Live Mode entre dos sesiones.

## Corte de Floot

No desactivar Floot hasta completar toda la validación.

Secuencia recomendada:

1. Coolify con rama `migration/floot-port`.
2. DB vacía + migraciones.
3. Import cifrado.
4. Validación.
5. Smoke tests manuales.
6. Merge a `main`.
7. Cambiar Coolify a `main`.
8. Confirmar producción estable.
9. Recién entonces retirar Floot.
