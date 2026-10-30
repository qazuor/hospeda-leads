ALTER TABLE crm_userscript_tokens ADD COLUMN last_version text CHECK (last_version IS NULL OR length(last_version) <= 20);
