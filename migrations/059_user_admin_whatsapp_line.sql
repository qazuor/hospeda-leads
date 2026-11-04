ALTER TABLE users ADD COLUMN whatsapp_phone text;
ALTER TABLE users ADD CONSTRAINT users_whatsapp_phone_check CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^[0-9]{8,15}$');
ALTER TABLE users ADD COLUMN deactivated_at timestamptz;
