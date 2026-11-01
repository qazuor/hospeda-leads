-- Spec 102 block 4 (owner decisions D3-D5, 31/10/2026): the verticals a sales material applies to, as catalog names (`crm_verticals.name`).
-- An empty array means «all verticals», which is what every material meant before this column existed, so existing rows keep their
-- behaviour (material never had a vertical: nothing to migrate). Names are validated by the server on write (no foreign key: the catalog
-- is not renamed from the app, decision 38). No data is written; the audit and live-version triggers of crm_sales_materials (046) cover it.
ALTER TABLE crm_sales_materials ADD COLUMN verticals text[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(verticals) <= 20);
