-- Spec 101 blocks 3 and 4 (owner decisions D1–D4, 31/10/2026). Additive only: no existing row is rewritten.
-- D1/D2: new links are /m/<slug>-<4 characters>. The slug is stored per link and required on lookup. Links sent before this migration keep
-- public_slug NULL and their 43-character token, which is still accepted without a slug.
ALTER TABLE crm_sales_material_shares ADD COLUMN public_slug text
  CHECK (public_slug IS NULL OR (length(public_slug) BETWEEN 1 AND 40 AND public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
-- D3/D4: «Abrir directo», chosen by the admin per material and read when the link is opened (it also affects links already sent).
-- Existing materials keep showing the page.
ALTER TABLE crm_sales_materials ADD COLUMN open_direct boolean NOT NULL DEFAULT false;
-- D1 hard limits: unknown tokens or wrong slugs per client (IPv4 address, or IPv6 /64) in the last hour. Only the sha256 of the client key is
-- stored (no IP in clear, like the technical access record). Rows older than an hour are deleted by the server as it goes.
CREATE TABLE crm_sales_material_share_attempts (
 id bigserial PRIMARY KEY,
 client_hash text NOT NULL CHECK (client_hash ~ '^[0-9a-f]{64}$'),
 attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_sales_material_share_attempts_client ON crm_sales_material_share_attempts(client_hash,attempted_at);
CREATE INDEX crm_sales_material_share_attempts_at ON crm_sales_material_share_attempts(attempted_at);
