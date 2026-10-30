-- Spec 97 §15 (owner, 29/10/2026, option 1): badges in Instagram's conversation list. The list rows carry no thread id and no username, only the
-- display name, so the user script stores the display name the chat header showed when it proved the chat. Nullable: rows learned before this
-- migration, or proofs without a readable name, have none and get no badge. Trimmed, single-spaced, at most 100 characters.
ALTER TABLE crm_instagram_threads
  ADD COLUMN display_name text NULL
  CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 100 AND display_name = btrim(display_name) AND display_name !~ '\s{2}' AND display_name !~ '[[:cntrl:]]'));
