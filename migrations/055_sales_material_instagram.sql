-- Spec 98 §5.1 (owner, 29/10/2026): sales material links on Instagram drafts. The message stays `crm_messages.channel='social'` with
-- `destination_detail='instagram'`; the share records `instagram` (D1: `social` also covers manual «Red social» logs, which never carry
-- material). Widens the CHECK created inline by 046; no data is written and every existing row satisfies the new CHECK.
ALTER TABLE crm_sales_material_shares DROP CONSTRAINT crm_sales_material_shares_channel_check;
ALTER TABLE crm_sales_material_shares ADD CONSTRAINT crm_sales_material_shares_channel_check
  CHECK (channel IN ('email','whatsapp','instagram'));
