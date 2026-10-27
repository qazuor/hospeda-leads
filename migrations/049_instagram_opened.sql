-- Spec 92: an Instagram chat opened from the composer is recorded as `instagram_opened` (envío no confirmado) until
-- Meta's echo or the seller confirms it. Same list as 042 plus the new status; no new columns.
ALTER TABLE crm_messages DROP CONSTRAINT crm_messages_status_check;
ALTER TABLE crm_messages ADD CONSTRAINT crm_messages_status_check CHECK(status IN (
  'draft','whatsapp_opened','instagram_opened','manual_pending','manual_sent','manual_no_contact','manual_not_done',
  'submitting','accepted','delivery_confirmed','failed','unknown','replied','rejected','cancelled','voided'
));
