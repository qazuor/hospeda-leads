-- Inbox full-text substring search. No time-ordering indexes: every inbox list aggregates or sorts after filtering, and a partial time index made the planner walk it instead of the trigram indexes (search ~10x slower on 40k+40k rows).
-- Trigram expressions exactly match normalizeSearchSql() (ñ remains distinct from n); LIKE '%term%' can use these indexes.
-- CREATE INDEX is transactional because the migration runner wraps each file in a transaction; writes to each indexed table wait while its index builds.
CREATE INDEX crm_messages_subject_inbox_trgm ON crm_messages USING gin ((normalize(regexp_replace(normalize(lower(coalesce(subject,'')),NFD),E'[\u0300-\u0302\u0304-\u036f]','','g'),NFC)) gin_trgm_ops);
CREATE INDEX crm_messages_body_inbox_trgm ON crm_messages USING gin ((normalize(regexp_replace(normalize(lower(coalesce(body,'')),NFD),E'[\u0300-\u0302\u0304-\u036f]','','g'),NFC)) gin_trgm_ops);
CREATE INDEX crm_messages_summary_inbox_trgm ON crm_messages USING gin ((normalize(regexp_replace(normalize(lower(coalesce(summary,'')),NFD),E'[\u0300-\u0302\u0304-\u036f]','','g'),NFC)) gin_trgm_ops);
CREATE INDEX crm_inbound_subject_inbox_trgm ON crm_inbound_messages USING gin ((normalize(regexp_replace(normalize(lower(coalesce(subject,'')),NFD),E'[\u0300-\u0302\u0304-\u036f]','','g'),NFC)) gin_trgm_ops);
CREATE INDEX crm_inbound_text_inbox_trgm ON crm_inbound_messages USING gin ((normalize(regexp_replace(normalize(lower(coalesce(text_body,'')),NFD),E'[\u0300-\u0302\u0304-\u036f]','','g'),NFC)) gin_trgm_ops);
