ALTER TABLE crm_sales_materials ADD COLUMN internal_note text NOT NULL DEFAULT '' CHECK(length(internal_note)<=4000);
UPDATE crm_sales_materials SET internal_note=description,description='' WHERE description<>'';
