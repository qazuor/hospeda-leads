# Floot migration snapshot manifest

Snapshot generated: **2026-09-30T13:39:42Z**

The encrypted snapshot URL and AES key are intentionally **not** stored in Git.

## Integrity

Plaintext JSON SHA-256:

```
ec7547f8f315f51e044fd39d6f46be1e9d501fbff9833422533855e8e2694f85
```

Sizes:

- Plain JSON: 2,620,976 bytes
- Gzip: 127,770 bytes
- Encrypted envelope: 170,772 bytes
- Encryption: AES-256-GCM
- Compression: gzip

## Source row counts

| Table | Rows |
|---|---:|
| app_settings | 5 |
| authorized_emails | 3 |
| crm_cities | 22 |
| crm_subtypes | 73 |
| crm_verticals | 6 |
| email_outbox | 0 |
| lead_journal | 1698 |
| lead_notes | 3 |
| leads | 1600 |
| message_templates | 31 |
| users | 3 |

Deliberately excluded:

- user_passwords
- sessions
- login_attempts

The import validation script must match these counts before the migration is considered complete.
