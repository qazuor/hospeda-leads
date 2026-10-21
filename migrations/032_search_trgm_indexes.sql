-- F6: trigram indexes for the accent-insensitive search (Ctrl+K and list searches).
-- Each expression is exactly normalizeSearchSql() in src/helpers/searchSql.ts (strip Latin combining accents
-- except U+0303, so ñ stays distinct from n). normalize, lower, regexp_replace and coalesce are IMMUTABLE, so the
-- expressions are indexable; `col LIKE '%term%'` on the same expression can then use a bitmap index scan.
-- If searchSql.ts changes its expression, these indexes stop matching: add a new migration (scripts/test-search.ts guards it).
-- pg_trgm is a trusted extension (PostgreSQL 13+): the migration role needs CREATE on the database.
-- Plain CREATE INDEX (the migration runner wraps each file in a transaction, so CONCURRENTLY is not possible):
-- writes to each table wait while its index builds.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX crm_accounts_search_trgm ON crm_accounts USING gin (
  (normalize(regexp_replace(normalize(lower(coalesce(nombre, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(email, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(telefono, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(ciudad, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(business_notes, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops
);

CREATE INDEX crm_contacts_search_trgm ON crm_contacts USING gin (
  (normalize(regexp_replace(normalize(lower(coalesce(name, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(email, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(phone, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops
);

CREATE INDEX crm_activities_search_trgm ON crm_activities USING gin (
  (normalize(regexp_replace(normalize(lower(coalesce(title, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(notes, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(result, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops
);

CREATE INDEX lead_notes_search_trgm ON lead_notes USING gin (
  (normalize(regexp_replace(normalize(lower(coalesce(note, '')), NFD), E'[\u0300-\u0302\u0304-\u036f]', '', 'g'), NFC)) gin_trgm_ops
);

ANALYZE crm_accounts;
ANALYZE crm_contacts;
ANALYZE crm_activities;
ANALYZE lead_notes;
