-- Classification and research belong to the business, without a sale.
ALTER TABLE crm_accounts
 ADD COLUMN tipo text,
 ADD COLUMN subtipo text,
 ADD COLUMN provincia text,
 ADD COLUMN direccion text,
 ADD COLUMN whatsapp text,
 ADD COLUMN business_notes text,
 ADD COLUMN discovery_source text,
 ADD COLUMN verification_urls text,
 ADD COLUMN verified_on text;
ALTER TABLE crm_import_batches ADD COLUMN mode text NOT NULL DEFAULT 'opportunity'
 CHECK (mode IN ('business','opportunity'));
-- Preserve existing opportunities unchanged. Only inherit unambiguous classification.
WITH classification AS (
 SELECT account_id,
 CASE WHEN count(DISTINCT nullif(btrim(tipo),''))=1 THEN min(nullif(btrim(tipo),'')) END AS tipo,
 CASE WHEN count(DISTINCT nullif(btrim(subtipo),''))=1 THEN min(nullif(btrim(subtipo),'')) END AS subtipo
 FROM leads GROUP BY account_id
)
UPDATE crm_accounts a SET tipo=c.tipo,subtipo=CASE WHEN c.tipo IS NOT NULL THEN c.subtipo END
FROM classification c WHERE a.id=c.account_id AND a.merged_into_id IS NULL;
