-- Trigram indexes for the management columns of Ctrl+K "Gestiones" and the business list free search (`q=`).
-- Both searches now match each table on its own (idSetSearchSql in src/helpers/searchSql.ts), so every searched
-- column needs an index on the exact normalizeSearchSql() expression, like migration 032.
-- leads: nombre, opportunity_name, service_interest (Gestiones); opportunity_name, contact_name, origen (business list).
-- crm_accounts.origin: the business list searches coalesce(a.origin, l.origen); 032 does not cover origin.
-- Plain CREATE INDEX (the migration runner wraps each file in a transaction, so CONCURRENTLY is not possible):
-- writes to leads and crm_accounts wait while each index builds. pg_trgm already exists (032).
CREATE INDEX leads_search_trgm ON leads USING gin (
  (normalize(regexp_replace(normalize(lower(coalesce(nombre, '')), NFD), E'[̀-̂̄-ͯ]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(opportunity_name, '')), NFD), E'[̀-̂̄-ͯ]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(service_interest, '')), NFD), E'[̀-̂̄-ͯ]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(contact_name, '')), NFD), E'[̀-̂̄-ͯ]', '', 'g'), NFC)) gin_trgm_ops,
  (normalize(regexp_replace(normalize(lower(coalesce(origen, '')), NFD), E'[̀-̂̄-ͯ]', '', 'g'), NFC)) gin_trgm_ops
);

CREATE INDEX crm_accounts_origin_search_trgm ON crm_accounts USING gin (
  (normalize(regexp_replace(normalize(lower(coalesce(origin, '')), NFD), E'[̀-̂̄-ͯ]', '', 'g'), NFC)) gin_trgm_ops
);

ANALYZE leads;
ANALYZE crm_accounts;
