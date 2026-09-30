# Migración de datos desde Floot

Los datos reales **no se guardan en Git**.

## Formato

El archivo `migration-data.json` tiene esta forma:

```json
{
  "exportedAt": "2026-09-30T00:00:00.000Z",
  "source": "Floot",
  "tables": {
    "leads": [],
    "lead_notes": []
  }
}
```

Se migran:

- authorized_emails
- crm_cities
- crm_subtypes
- crm_verticals
- users
- user_passwords
- leads
- lead_notes
- lead_journal
- message_templates
- email_outbox
- app_settings

No se migran `sessions` ni `login_attempts`. Todos los usuarios deberán volver a iniciar sesión en el nuevo entorno.

## Importar

Primero:

```bash
npm run db:migrate
```

Después:

```bash
npx tsx scripts/import-data.ts /ruta/segura/migration-data.json
```

Los IDs se conservan y al finalizar se sincronizan las secuencias PostgreSQL.
