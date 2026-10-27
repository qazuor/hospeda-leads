-- Spec 89 «Material de venta»: sales material stored in Cloudflare R2 (only object keys live here).
-- Creates new tables and one settings key. It does not read, migrate or delete crm_documents rows, does not change
-- crm_communication.maxDocumentBytes and runs no cleanups: the old library rows (library=true) stay in place, inert.
CREATE TABLE crm_sales_material_categories (
 id bigserial PRIMARY KEY,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 100),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_sales_material_categories_name ON crm_sales_material_categories(lower(btrim(name)));
CREATE TABLE crm_sales_materials (
 id uuid PRIMARY KEY,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 200),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=4000),
 kind text NOT NULL CHECK(kind IN ('deliverable','internal')),
 source text NOT NULL CHECK(source IN ('file','url')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 archived_at timestamptz, archived_by_email text,
 -- NULL until the first complete version; revision is the optimistic concurrency counter (like crm_messages.revision).
 current_version integer, revision integer NOT NULL DEFAULT 1,
 cover_key text, cover_mime text, cover_bytes integer CHECK(cover_bytes IS NULL OR cover_bytes BETWEEN 1 AND 1048576),
 created_by_email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='archived')=(archived_at IS NOT NULL))
);
CREATE INDEX crm_sales_materials_status ON crm_sales_materials(status,updated_at DESC);
-- Trigram expressions exactly match normalizeSearchSql() in src/helpers/searchSql.ts (ñ stays distinct from n).
CREATE INDEX crm_sales_materials_title_trgm ON crm_sales_materials USING gin ((normalize(regexp_replace(normalize(lower(coalesce(title,'')),NFD),E'[\u0300-\u0302\u0304-\u036f]','','g'),NFC)) gin_trgm_ops);
CREATE INDEX crm_sales_materials_description_trgm ON crm_sales_materials USING gin ((normalize(regexp_replace(normalize(lower(coalesce(description,'')),NFD),E'[\u0300-\u0302\u0304-\u036f]','','g'),NFC)) gin_trgm_ops);
CREATE TABLE crm_sales_material_category_links (
 material_id uuid NOT NULL REFERENCES crm_sales_materials(id),
 category_id bigint NOT NULL REFERENCES crm_sales_material_categories(id),
 PRIMARY KEY(material_id,category_id)
);
CREATE INDEX crm_sales_material_category_links_category ON crm_sales_material_category_links(category_id);
CREATE TABLE crm_sales_material_versions (
 id uuid PRIMARY KEY,
 material_id uuid NOT NULL REFERENCES crm_sales_materials(id),
 version integer NOT NULL CHECK(version>=1),
 url text, object_key text UNIQUE,
 file_name text, mime_type text, byte_size bigint CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 524288000), etag text,
 actor_email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(material_id,version),
 CHECK((url IS NULL)<>(object_key IS NULL))
);
-- Presigned uploads waiting to be confirmed. The abandoned-upload sweep deletes expired pending objects from R2.
CREATE TABLE crm_sales_material_uploads (
 id uuid PRIMARY KEY,
 object_key text NOT NULL UNIQUE,
 purpose text NOT NULL CHECK(purpose IN ('file','cover')),
 material_id uuid,
 declared_mime text NOT NULL, declared_bytes bigint NOT NULL CHECK(declared_bytes BETWEEN 1 AND 524288000),
 file_name text NOT NULL, actor_email text NOT NULL,
 -- `deleting` is set by the sweep while it removes the object from R2 outside any transaction; claimed_at lets a crashed sweep be retried.
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','deleting','completed','discarded')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 completed_at timestamptz, deleted_at timestamptz, claimed_at timestamptz
);
CREATE INDEX crm_sales_material_uploads_pending ON crm_sales_material_uploads(status,expires_at) WHERE status IN ('pending','deleting');
-- One row per send (per recipient and message). Created from phase F2/F3 on; the token is stored only as its sha256.
CREATE TABLE crm_sales_material_shares (
 id uuid PRIMARY KEY,
 token_hash text NOT NULL UNIQUE,
 material_id uuid NOT NULL REFERENCES crm_sales_materials(id),
 account_id bigint NOT NULL REFERENCES crm_accounts(id), original_account_id bigint NOT NULL REFERENCES crm_accounts(id),
 lead_id bigint REFERENCES leads(id) ON DELETE SET NULL, contact_id bigint REFERENCES crm_contacts(id),
 message_id uuid REFERENCES crm_messages(id) ON DELETE SET NULL,
 channel text NOT NULL CHECK(channel IN ('email','whatsapp')),
 prepared_version integer, sent_version integer,
 attach boolean NOT NULL DEFAULT false, attached_version integer,
 created_by_email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz, revoked_by_email text, revoke_reason text CHECK(revoke_reason IS NULL OR length(btrim(revoke_reason)) BETWEEN 3 AND 500),
 -- Technical access record only (owner decision §17): a counter and the last access, no IP or user agent. Never evidence that the client saw it.
 technical_access_count integer NOT NULL DEFAULT 0, last_technical_access_at timestamptz
);
CREATE INDEX crm_sales_material_shares_account ON crm_sales_material_shares(account_id,created_at DESC);
CREATE INDEX crm_sales_material_shares_message ON crm_sales_material_shares(message_id);
CREATE INDEX crm_sales_material_shares_material ON crm_sales_material_shares(material_id);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['crm_sales_material_categories','crm_sales_materials','crm_sales_material_versions','crm_sales_material_uploads','crm_sales_material_shares'] LOOP
 EXECUTE format('CREATE TRIGGER resource_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION crm_audit_resource()',t);
 -- Upload bookkeeping is not UI state: it never bumps the live domain (the material row changes in the same transaction that consumes an upload).
 IF t<>'crm_sales_material_uploads' THEN
  EXECUTE format('CREATE TRIGGER resource_live AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain(%L)',t,'communication');
 END IF;
 END LOOP; END $$;
-- The link table has a composite key (no id column), so crm_audit_resource() cannot name the row; only the live version is bumped.
-- Category changes on a material are journaled through the material row (its revision and updated_at change in the same transaction).
CREATE TRIGGER resource_live AFTER INSERT OR UPDATE OR DELETE ON crm_sales_material_category_links FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
INSERT INTO app_settings(key,value) VALUES ('crm_sales_material','{"maxUploadBytes":524288000,"maxEmailAttachmentBytes":10485760,"pendingUploadHours":24}') ON CONFLICT DO NOTHING;
