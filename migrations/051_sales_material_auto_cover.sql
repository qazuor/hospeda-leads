-- Spec 95: how a material got its cover. `auto`: generated in the browser (a new version replaces it); `manual`: uploaded by hand, or
-- never set (legacy rows, no key: an automatic cover may still be generated); `none`: the admin removed it, and that choice is kept.
-- A manual choice (upload or removal) always wins over an automatic cover. Existing rows were all manual or never set: 'manual' is correct.
ALTER TABLE crm_sales_materials ADD COLUMN cover_mode text NOT NULL DEFAULT 'manual';
ALTER TABLE crm_sales_materials ADD CONSTRAINT crm_sales_materials_cover_mode_check CHECK(
 cover_mode IN ('manual','auto','none') AND (cover_mode<>'auto' OR cover_key IS NOT NULL) AND (cover_mode<>'none' OR cover_key IS NULL)
);
