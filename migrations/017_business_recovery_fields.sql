-- Durable business attributes; values are recovered only by a reviewed procedure.
-- No historical data or journals are rewritten during deploy.
ALTER TABLE crm_accounts
 ADD COLUMN origin text,
 ADD COLUMN source_reference text,
 ADD COLUMN review_status text CHECK(review_status IS NULL OR review_status='filtered'),
 ADD COLUMN subscription_label text;
