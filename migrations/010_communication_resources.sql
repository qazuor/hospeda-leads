-- No delivery or reply is inferred for historical messages.
CREATE TABLE crm_contact_restrictions (
 id bigserial PRIMARY KEY, account_id bigint NOT NULL REFERENCES crm_accounts(id),
 contact_id bigint REFERENCES crm_contacts(id), lead_id bigint,
 channel text NOT NULL CHECK(channel IN ('email','whatsapp','all')), reason text NOT NULL,
 actor_email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 lifted_at timestamptz, lifted_by text, lift_reason text,
 CHECK(contact_id IS NOT NULL OR lead_id IS NOT NULL)
);
CREATE TABLE crm_sequences (
 id bigserial PRIMARY KEY, name text NOT NULL, scope text NOT NULL,
 steps jsonb NOT NULL CHECK(jsonb_typeof(steps)='array'), active boolean NOT NULL DEFAULT true,
 owner_email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm_sequence_runs (
 id uuid PRIMARY KEY, account_id bigint NOT NULL REFERENCES crm_accounts(id),
 original_account_id bigint NOT NULL REFERENCES crm_accounts(id), lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
 contact_id bigint REFERENCES crm_contacts(id), sequence_id bigint REFERENCES crm_sequences(id),
 snapshot jsonb NOT NULL, owner_email text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','cancelled','stopped','completed')),
 reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_sequence_one_active ON crm_sequence_runs(lead_id,coalesce(contact_id,0)) WHERE status IN ('active','paused');
CREATE TABLE crm_messages (
 id uuid PRIMARY KEY, account_id bigint NOT NULL REFERENCES crm_accounts(id), original_account_id bigint NOT NULL REFERENCES crm_accounts(id),
 lead_id bigint REFERENCES leads(id) ON DELETE SET NULL, contact_id bigint REFERENCES crm_contacts(id),
 channel text NOT NULL CHECK(channel IN ('email','whatsapp')), recipient text NOT NULL, recipient_name text NOT NULL DEFAULT '',
 subject text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', html_body text, text_body text,
 template_snapshot jsonb, owner_email text NOT NULL, activity_id bigint REFERENCES crm_activities(id),
 outbox_id bigint UNIQUE REFERENCES email_outbox(id), run_id uuid REFERENCES crm_sequence_runs(id), step_index integer,
 task_id bigint REFERENCES crm_tasks(id), status text NOT NULL DEFAULT 'draft',
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,step_index),
 CHECK(status IN ('draft','whatsapp_opened','manual_sent','submitting','accepted','delivery_confirmed','failed','unknown','replied','rejected','cancelled'))
);
ALTER TABLE email_outbox ADD COLUMN request_key uuid UNIQUE;
CREATE INDEX email_outbox_message_id ON email_outbox(message_id);
CREATE TABLE crm_email_events (
 fingerprint text PRIMARY KEY, message_id text NOT NULL, recipient text NOT NULL,
 event text NOT NULL, occurred_at timestamptz NOT NULL, payload jsonb NOT NULL,
 outbox_id bigint REFERENCES email_outbox(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm_document_categories (id bigserial PRIMARY KEY,name text NOT NULL UNIQUE,active boolean NOT NULL DEFAULT true);
CREATE TABLE crm_documents (
 id uuid PRIMARY KEY, title text NOT NULL, type text NOT NULL, owner_email text NOT NULL,
 account_id bigint REFERENCES crm_accounts(id), original_account_id bigint REFERENCES crm_accounts(id),
 lead_id bigint REFERENCES leads(id) ON DELETE SET NULL, activity_id bigint REFERENCES crm_activities(id) ON DELETE SET NULL,
 library boolean NOT NULL DEFAULT false, category_id bigint REFERENCES crm_document_categories(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','archived')),
 approved_by text, approved_at timestamptz, deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm_document_versions (
 id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES crm_documents(id), version integer NOT NULL,
 url text, file_data text, file_name text, mime_type text, byte_size integer,
 sha256 text, expires_on date, actor_email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_id,version), CHECK((url IS NULL)<>(file_data IS NULL)),
 CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 2097152)
);
CREATE TABLE crm_resource_journal (
 id bigserial PRIMARY KEY, entity text NOT NULL, entity_id text NOT NULL, actor_email text,
 action text NOT NULL, before_value jsonb, after_value jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION crm_audit_resource() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO crm_resource_journal(entity,entity_id,actor_email,action,before_value,after_value)
 VALUES(TG_TABLE_NAME,COALESCE(NEW.id,OLD.id)::text,nullif(current_setting('crm.actor_email',true),''),TG_OP,
 CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD)-'file_data' END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW)-'file_data' END);
 RETURN COALESCE(NEW,OLD); END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['crm_contact_restrictions','crm_sequences','crm_sequence_runs','crm_messages','crm_documents','crm_document_versions','crm_document_categories'] LOOP
 EXECUTE format('CREATE TRIGGER resource_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION crm_audit_resource()',t);
 EXECUTE format('CREATE TRIGGER resource_live AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version()',t);
 END LOOP; END $$;
INSERT INTO app_settings(key,value) VALUES ('crm_communication','{"recentContactHours":72,"maxDocumentBytes":2097152}') ON CONFLICT DO NOTHING;
-- Adapt existing attachment references without modifying their original values.
INSERT INTO crm_documents(id,title,type,owner_email,account_id,original_account_id,lead_id)
 SELECT md5('legacy-document-'||id)::uuid,'Adjunto histórico #'||id,'adjunto',coalesce(assigned_user_email,'legacy'),account_id,account_id,id
 FROM leads WHERE nullif(btrim(archivo_adjunto),'') IS NOT NULL;
INSERT INTO crm_document_versions(id,document_id,version,url,actor_email)
 SELECT md5('legacy-version-'||id)::uuid,md5('legacy-document-'||id)::uuid,1,archivo_adjunto,'legacy'
 FROM leads WHERE nullif(btrim(archivo_adjunto),'') IS NOT NULL;
-- Stop only pending work generated by sequences; ordinary tasks remain intact.
CREATE FUNCTION crm_stop_sequences(p_lead bigint,p_reason text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 UPDATE crm_sequence_runs SET status='stopped',reason=p_reason,updated_at=now() WHERE lead_id=p_lead AND status IN ('active','paused');
 UPDATE crm_tasks SET status='cancelled',result=p_reason,completed_at=NULL,updated_at=now()
 WHERE status='pending' AND id IN (SELECT task_id FROM crm_messages m JOIN crm_sequence_runs r ON r.id=m.run_id WHERE r.lead_id=p_lead AND r.status='stopped');
 UPDATE crm_messages SET status='cancelled',updated_at=now() WHERE lead_id=p_lead AND status='draft' AND run_id IN (SELECT id FROM crm_sequence_runs WHERE status='stopped');
 END $$;
CREATE FUNCTION crm_sequence_lead_stop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.deleted_at IS NOT NULL OR NEW.estado IN ('Respondió','No interesado') OR EXISTS(SELECT 1 FROM crm_stages WHERE name=NEW.estado AND classification IN ('won','lost')) THEN
 PERFORM crm_stop_sequences(NEW.id,'Respuesta, rechazo, cierre o baja de oportunidad'); END IF; RETURN NEW; END $$;
CREATE TRIGGER crm_sequence_lead_stop AFTER UPDATE OF estado,deleted_at ON leads FOR EACH ROW EXECUTE FUNCTION crm_sequence_lead_stop();
CREATE FUNCTION crm_sequence_account_stop() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE l record; BEGIN
 IF NEW.do_not_contact OR NEW.commercial_status='client' THEN FOR l IN SELECT id FROM leads WHERE account_id=NEW.id LOOP
 PERFORM crm_stop_sequences(l.id,'No contactar o conversión a cliente'); END LOOP; END IF; RETURN NEW; END $$;
CREATE TRIGGER crm_sequence_account_stop AFTER UPDATE OF do_not_contact,commercial_status ON crm_accounts FOR EACH ROW EXECUTE FUNCTION crm_sequence_account_stop();
CREATE TABLE crm_document_links (
 id bigserial PRIMARY KEY,document_id uuid NOT NULL REFERENCES crm_documents(id),
 account_id bigint NOT NULL REFERENCES crm_accounts(id),original_account_id bigint NOT NULL REFERENCES crm_accounts(id),
 lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,activity_id bigint REFERENCES crm_activities(id) ON DELETE SET NULL,
 actor_email text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_document_link_unique ON crm_document_links(document_id,account_id,coalesce(lead_id,0),coalesce(activity_id,0));
CREATE TRIGGER resource_audit AFTER INSERT ON crm_document_links FOR EACH ROW EXECUTE FUNCTION crm_audit_resource();
CREATE TRIGGER resource_live AFTER INSERT ON crm_document_links FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE FUNCTION crm_sequence_activity_stop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.result IN ('Respondió','Interesado','No interesado','Respuesta registrada manualmente','Rechazo registrado manualmente') AND NEW.deleted_at IS NULL THEN PERFORM crm_stop_sequences(NEW.lead_id,NEW.result); END IF; RETURN NEW; END $$;
CREATE TRIGGER crm_sequence_activity_stop AFTER INSERT OR UPDATE OF result ON crm_activities FOR EACH ROW EXECUTE FUNCTION crm_sequence_activity_stop();
ALTER TABLE crm_document_versions ADD COLUMN approved_by text;
ALTER TABLE crm_document_versions ADD COLUMN approved_at timestamptz;
-- Keep legacy attachment edits accessible without rewriting the original reference.
CREATE FUNCTION crm_adapt_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE did uuid; next_version integer;
BEGIN
 IF nullif(btrim(NEW.archivo_adjunto),'') IS NULL OR (TG_OP='UPDATE' AND NEW.archivo_adjunto IS NOT DISTINCT FROM OLD.archivo_adjunto) THEN RETURN NEW; END IF;
 did:=md5('legacy-document-'||NEW.id)::uuid;
 INSERT INTO crm_documents(id,title,type,owner_email,account_id,original_account_id,lead_id)
 VALUES(did,'Adjunto histórico #'||NEW.id,'adjunto',coalesce(NEW.assigned_user_email,'legacy'),NEW.account_id,NEW.account_id,NEW.id) ON CONFLICT DO NOTHING;
 SELECT coalesce(max(version),0)+1 INTO next_version FROM crm_document_versions WHERE document_id=did;
 INSERT INTO crm_document_versions(id,document_id,version,url,actor_email)
 VALUES(md5('legacy-version-'||NEW.id||'-'||next_version)::uuid,did,next_version,NEW.archivo_adjunto,coalesce(nullif(current_setting('crm.actor_email',true),''),'legacy'));
 UPDATE crm_documents SET status='draft',approved_at=NULL,approved_by=NULL,updated_at=now() WHERE id=did;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_adapt_attachment AFTER INSERT OR UPDATE OF archivo_adjunto ON leads FOR EACH ROW EXECUTE FUNCTION crm_adapt_attachment();
CREATE INDEX crm_messages_lead ON crm_messages(lead_id,created_at);
CREATE INDEX crm_messages_account ON crm_messages(account_id,updated_at);
CREATE INDEX crm_restrictions_active ON crm_contact_restrictions(account_id,contact_id,lead_id) WHERE lifted_at IS NULL;
CREATE INDEX crm_documents_account ON crm_documents(account_id) WHERE deleted_at IS NULL;
CREATE INDEX crm_document_links_account ON crm_document_links(account_id);
CREATE INDEX crm_email_events_outbox ON crm_email_events(outbox_id,occurred_at);
CREATE INDEX crm_email_outbox_correlation ON email_outbox(trim(both '<>' from message_id),lower(recipient_email));
