ALTER TABLE users
  ADD COLUMN full_name text,
  ADD COLUMN phone text,
  ADD COLUMN sex text,
  ADD COLUMN sender_email text;

ALTER TABLE users
  ADD CONSTRAINT users_sender_email_hospeda_check
  CHECK (sender_email IS NULL OR lower(sender_email) ~ '^[^@]+@hospeda\.com\.ar$');

UPDATE users AS u
SET sender_email = s.value
FROM app_settings AS s
WHERE s.key = 'brevo_user_sender_email:' || u.id::text
  AND s.value <> ''
  AND lower(s.value) ~ '^[^@]+@hospeda\.com\.ar$'
  AND u.sender_email IS NULL;
