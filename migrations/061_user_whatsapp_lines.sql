CREATE FUNCTION users_whatsapp_phones_valid(phones text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT cardinality(phones) <= 5
    AND NOT EXISTS (SELECT 1 FROM unnest(phones) AS items(phone) WHERE phone IS NULL OR phone !~ '^[0-9]{8,15}$')
    AND cardinality(phones) = (SELECT count(DISTINCT phone)::int FROM unnest(phones) AS items(phone))
$$;

ALTER TABLE users ADD COLUMN whatsapp_phones text[] NOT NULL DEFAULT '{}';
UPDATE users SET whatsapp_phones = ARRAY[whatsapp_phone] WHERE whatsapp_phone IS NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_whatsapp_phones_check CHECK (users_whatsapp_phones_valid(whatsapp_phones));
-- `whatsapp_phone` stays until a later migration: during the rolling deploy the previous container still reads it.
COMMENT ON COLUMN users.whatsapp_phone IS 'Deprecated by whatsapp_phones (migration 061); drop in a later migration.';
