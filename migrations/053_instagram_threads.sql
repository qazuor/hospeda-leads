-- Spec 97 §5.1 (owner, 29/10/2026): where each Instagram chat lives for the Hospeda account. The user script learns the web thread id
-- (`/direct/t/<id>/`) from a chat whose header proves the other participant, so «Abrir Instagram» lands on the chat page next time.
-- Keyed by the viewing Hospeda account and the other username, never by business: a thread is with an Instagram account and several
-- businesses can share a username. Navigation metadata, not a business fact: no history entry. Stale threads are deleted
-- (compare-and-delete on thread_id), not flagged. Nothing is backfilled.
CREATE TABLE crm_instagram_threads(
  viewer_username text NOT NULL CHECK (viewer_username ~ '^[a-z0-9._]{1,30}$'),
  username text NOT NULL CHECK (username ~ '^[a-z0-9._]{1,30}$'),
  thread_id text NOT NULL CHECK (thread_id ~ '^[0-9]{1,40}$'),
  proof text NOT NULL CHECK (proof IN ('header','seller')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  verified_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (viewer_username, username)
);
