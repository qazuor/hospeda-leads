-- Spec 95: a cover generated in the browser (image, video frame, first PDF page) is marked automatic so a new version
-- replaces it, while a cover uploaded by hand always wins. Existing covers were all uploaded by hand: false is correct.
ALTER TABLE crm_sales_materials ADD COLUMN cover_auto boolean NOT NULL DEFAULT false;
ALTER TABLE crm_sales_materials ADD CONSTRAINT crm_sales_materials_cover_auto_check CHECK(NOT cover_auto OR cover_key IS NOT NULL);
