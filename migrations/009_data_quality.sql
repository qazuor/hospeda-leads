ALTER TABLE crm_accounts ADD COLUMN merged_into_id bigint REFERENCES crm_accounts(id);
ALTER TABLE crm_accounts ADD COLUMN merged_at timestamptz;
ALTER TABLE crm_accounts ADD CONSTRAINT crm_merge_identity CHECK (merged_into_id IS NULL OR merged_into_id<>id);
CREATE INDEX crm_accounts_merge ON crm_accounts(merged_into_id);
-- Context references remain checked at commit during the atomic identity move.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conrelid::regclass AS tbl,conname FROM pg_constraint WHERE contype='f' AND conrelid IN ('leads'::regclass,'crm_tasks'::regclass,'crm_activities'::regclass,'crm_pipeline_events'::regclass,'crm_objections'::regclass) LOOP
 EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',c.tbl,c.conname);
 END LOOP;
END $$;
ALTER TABLE crm_pipeline_events ADD COLUMN original_account_id bigint REFERENCES crm_accounts(id);
UPDATE crm_pipeline_events SET original_account_id=account_id;
CREATE FUNCTION crm_event_origin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.original_account_id:=NEW.account_id; RETURN NEW; END $$;
CREATE TRIGGER crm_event_origin BEFORE INSERT ON crm_pipeline_events FOR EACH ROW EXECUTE FUNCTION crm_event_origin();
CREATE TABLE crm_import_batches (
 id uuid PRIMARY KEY, fingerprint text NOT NULL UNIQUE, owner_email text NOT NULL,
 source text NOT NULL, source_url text, obtained_at timestamptz,
 rows jsonb NOT NULL, status text NOT NULL DEFAULT 'review' CHECK(status IN ('review','completed')),
 result jsonb, decisions jsonb, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE crm_data_evidence (
 id bigserial PRIMARY KEY, account_id bigint NOT NULL REFERENCES crm_accounts(id), original_account_id bigint NOT NULL REFERENCES crm_accounts(id),
 contact_id bigint REFERENCES crm_contacts(id), lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
 field text NOT NULL, original_value text, normalized_value text, source text NOT NULL, source_url text,
 obtained_at timestamptz, verified_at timestamptz,
 validity text NOT NULL CHECK(validity IN ('valid','invalid','ambiguous','missing','unverified')),
 observations text NOT NULL DEFAULT '', batch_id uuid REFERENCES crm_import_batches(id), actor_email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_evidence_account ON crm_data_evidence(account_id,field,id DESC);
CREATE TABLE crm_account_merges (
 id bigserial PRIMARY KEY, source_id bigint NOT NULL UNIQUE REFERENCES crm_accounts(id), destination_id bigint NOT NULL REFERENCES crm_accounts(id),
 actor_email text NOT NULL, reason text NOT NULL, snapshot jsonb NOT NULL, selections jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings(key,value) VALUES('crm_data_quality','{"maxRows":250,"maxFileBytes":2097152}') ON CONFLICT DO NOTHING;
CREATE FUNCTION crm_account_family(p_id bigint) RETURNS SETOF bigint LANGUAGE sql STABLE AS $$
 WITH RECURSIVE family(id) AS (SELECT p_id UNION ALL SELECT a.id FROM crm_accounts a JOIN family f ON a.merged_into_id=f.id) SELECT id FROM family
$$;
CREATE FUNCTION crm_active_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='crm_accounts' THEN
  IF TG_OP='UPDATE' AND OLD.merged_into_id IS NOT NULL THEN RAISE EXCEPTION 'Negocio fusionado: abrí el destino'; END IF;
  RETURN NEW;
 END IF;
 PERFORM id FROM crm_accounts WHERE id=NEW.account_id AND merged_into_id IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Negocio fusionado: abrí el destino'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_accounts_active_guard BEFORE UPDATE ON crm_accounts FOR EACH ROW EXECUTE FUNCTION crm_active_account_guard();
CREATE TRIGGER crm_leads_active_guard BEFORE INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION crm_active_account_guard();
CREATE TRIGGER crm_contacts_active_guard BEFORE INSERT OR UPDATE ON crm_contacts FOR EACH ROW EXECUTE FUNCTION crm_active_account_guard();
CREATE TRIGGER crm_tasks_active_guard BEFORE INSERT OR UPDATE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION crm_active_account_guard();
CREATE TRIGGER crm_activities_active_guard BEFORE INSERT OR UPDATE ON crm_activities FOR EACH ROW EXECUTE FUNCTION crm_active_account_guard();
CREATE TRIGGER crm_objections_active_guard BEFORE INSERT OR UPDATE ON crm_objections FOR EACH ROW EXECUTE FUNCTION crm_active_account_guard();
CREATE TRIGGER crm_evidence_live AFTER INSERT ON crm_data_evidence FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_import_live AFTER INSERT OR UPDATE ON crm_import_batches FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_merge_live AFTER INSERT ON crm_account_merges FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
