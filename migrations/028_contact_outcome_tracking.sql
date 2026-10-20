-- Decision 2B (U-19): contacts left without "¿Cómo salió?" stay pending in Hoy.
-- Only contacts from this moment on are tracked, so historical messages never flood the list. History is not rewritten.
INSERT INTO app_settings(key,value) VALUES ('crm_contact_outcome_since',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ON CONFLICT(key) DO NOTHING;
