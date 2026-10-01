-- estado remains the only current stage. Historical labels are preserved verbatim.
CREATE TABLE crm_stages (
 name text PRIMARY KEY CHECK(length(btrim(name))>0),
 sort_order integer NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT true,
 classification text NOT NULL DEFAULT 'open' CHECK(classification IN ('open','won','lost')),
 historical boolean NOT NULL DEFAULT false
);
INSERT INTO crm_stages(name,sort_order,historical)
SELECT stage_name,ordinality::int,true FROM app_settings, jsonb_array_elements_text(app_settings.value::jsonb) WITH ORDINALITY AS stages(stage_name,ordinality)
WHERE key='crm_opportunity_stages' ON CONFLICT DO NOTHING;
INSERT INTO crm_stages(name,sort_order,historical) SELECT DISTINCT estado,1000,true FROM leads WHERE estado IS NOT NULL AND btrim(estado)<>'' ON CONFLICT DO NOTHING;
-- Preserve an empty historical label too; do not normalize the opportunity itself.
ALTER TABLE crm_stages DROP CONSTRAINT crm_stages_name_check;
INSERT INTO crm_stages(name,sort_order,historical) SELECT DISTINCT estado,1000,true FROM leads WHERE estado IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO crm_stages(name,sort_order,classification) VALUES ('Ganada',100,'won'),('Perdida',110,'lost') ON CONFLICT DO NOTHING;
ALTER TABLE leads ADD CONSTRAINT leads_stage_fk FOREIGN KEY(estado) REFERENCES crm_stages(name);
ALTER TABLE leads ADD COLUMN stage_since timestamptz;
ALTER TABLE leads ADD COLUMN pipeline_revision integer NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN reactivated_from_id bigint REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE crm_accounts ADD COLUMN do_not_contact boolean NOT NULL DEFAULT false;
CREATE TABLE crm_loss_reasons(id bigserial PRIMARY KEY,name text NOT NULL UNIQUE CHECK(length(btrim(name))>0),active boolean NOT NULL DEFAULT true);
INSERT INTO crm_loss_reasons(name) VALUES ('Precio'),('No es el momento'),('Eligió otra opción'),('Sin encaje'),('Otro');
CREATE TABLE crm_objection_types(id bigserial PRIMARY KEY,name text NOT NULL UNIQUE CHECK(length(btrim(name))>0),active boolean NOT NULL DEFAULT true);
INSERT INTO crm_objection_types(name) VALUES ('Precio'),('Falta de tiempo'),('Necesita consultar'),('Dudas sobre el servicio');
CREATE TABLE crm_pipeline_events(
 id bigserial PRIMARY KEY,account_id bigint NOT NULL REFERENCES crm_accounts(id),lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
 action text NOT NULL,actor_email text,old_stage text,new_stage text,classification text,
 reason_id bigint REFERENCES crm_loss_reasons(id),comment text,recontact_date date,
 task_id bigint REFERENCES crm_tasks(id) ON DELETE SET NULL,related_lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_pipeline_events ADD CONSTRAINT crm_pipeline_event_context FOREIGN KEY(account_id,lead_id) REFERENCES leads(account_id,id) ON DELETE SET NULL (lead_id);
ALTER TABLE crm_pipeline_events ADD CONSTRAINT crm_pipeline_related_context FOREIGN KEY(account_id,related_lead_id) REFERENCES leads(account_id,id) ON DELETE SET NULL (related_lead_id);
CREATE INDEX crm_pipeline_events_lead ON crm_pipeline_events(lead_id,id DESC);
CREATE INDEX crm_pipeline_events_recontact ON crm_pipeline_events(recontact_date) WHERE reason_id IS NOT NULL;
CREATE TABLE crm_objections(
 id bigserial PRIMARY KEY,account_id bigint NOT NULL REFERENCES crm_accounts(id),lead_id bigint NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 type_id bigint NOT NULL REFERENCES crm_objection_types(id),notes text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
 deleted_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_objections ADD CONSTRAINT crm_objection_context FOREIGN KEY(account_id,lead_id) REFERENCES leads(account_id,id) ON DELETE CASCADE;
INSERT INTO app_settings(key,value) VALUES ('crm_priority_rules','[{"id":"overdue","name":"Seguimiento vencido","factor":"overdue","priority":"alta","active":true,"days":0,"stages":[]},{"id":"missing","name":"Sin seguimiento pendiente","factor":"missing_followup","priority":"media","active":true,"days":0,"stages":[]}]');
-- Guard all legacy writers as well as the pipeline endpoint.
CREATE FUNCTION crm_pipeline_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s crm_stages; actor text; role_name text; owner text;
BEGIN
 actor:=nullif(current_setting('crm.actor_email',true),'');
 IF TG_OP='UPDATE' THEN
  NEW.pipeline_revision:=OLD.pipeline_revision+1;
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  SELECT role INTO role_name FROM users WHERE email=actor;
  IF actor IS NOT NULL AND role_name IS DISTINCT FROM 'admin' AND OLD.assigned_user_email IS DISTINCT FROM actor THEN
   RAISE EXCEPTION 'Solo podés cambiar etapas de tus oportunidades asignadas';
  END IF;
 ELSE
  -- Unknown imported labels are retained as open historical values, never inferred outcomes.
  IF NEW.estado IS NOT NULL THEN INSERT INTO crm_stages(name,sort_order,active,historical) VALUES(NEW.estado,1000,false,true) ON CONFLICT DO NOTHING; END IF;
 END IF;
 IF NEW.estado IS NULL THEN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Elegí una etapa activa'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO s FROM crm_stages WHERE name=NEW.estado FOR SHARE;
 IF TG_OP='UPDATE' AND NOT s.active THEN RAISE EXCEPTION 'Etapa desactivada'; END IF;
 IF s.classification='lost' AND nullif(current_setting('crm.loss_reason',true),'') IS NULL THEN
  RAISE EXCEPTION 'Para cerrar perdida usá el pipeline y elegí un motivo';
 END IF;
 IF s.classification='lost' THEN
  PERFORM id FROM crm_loss_reasons WHERE id=nullif(current_setting('crm.loss_reason',true),'')::bigint AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Motivo desactivado'; END IF;
 END IF;
 NEW.stage_since:=now();
 RETURN NEW;
END $$;
CREATE TRIGGER crm_pipeline_guard BEFORE INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION crm_pipeline_guard();
CREATE FUNCTION crm_pipeline_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  previous:=OLD.estado;
 END IF;
 INSERT INTO crm_pipeline_events(account_id,lead_id,action,actor_email,old_stage,new_stage,classification,reason_id,comment,recontact_date)
 SELECT NEW.account_id,NEW.id,'stage',nullif(current_setting('crm.actor_email',true),''),previous,NEW.estado,classification,
 CASE WHEN classification='lost' THEN nullif(current_setting('crm.loss_reason',true),'')::bigint END,
 nullif(current_setting('crm.loss_comment',true),''),CASE WHEN classification='lost' THEN nullif(current_setting('crm.recontact',true),'')::date END
 FROM crm_stages WHERE name=NEW.estado;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_pipeline_audit AFTER INSERT OR UPDATE OF estado ON leads FOR EACH ROW EXECUTE FUNCTION crm_pipeline_audit();
CREATE FUNCTION crm_pipeline_catalog_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Usá baja lógica'; END IF;
 IF NEW.name<>OLD.name OR NEW.classification<>OLD.classification THEN RAISE EXCEPTION 'Nombre y clasificación son inmutables; creá otra etapa'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_stages_guard BEFORE UPDATE OR DELETE ON crm_stages FOR EACH ROW EXECUTE FUNCTION crm_pipeline_catalog_guard();
CREATE FUNCTION crm_objection_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO crm_pipeline_events(account_id,lead_id,action,actor_email,metadata)
 VALUES(NEW.account_id,NEW.lead_id,'objection',nullif(current_setting('crm.actor_email',true),''),jsonb_build_object('before',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,'after',to_jsonb(NEW)));
 RETURN NEW;
END $$;
CREATE TRIGGER crm_objection_audit AFTER INSERT OR UPDATE ON crm_objections FOR EACH ROW EXECUTE FUNCTION crm_objection_audit();
CREATE TRIGGER crm_stages_live AFTER INSERT OR UPDATE OR DELETE ON crm_stages FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_reasons_live AFTER INSERT OR UPDATE OR DELETE ON crm_loss_reasons FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_objection_types_live AFTER INSERT OR UPDATE OR DELETE ON crm_objection_types FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_objections_live AFTER INSERT OR UPDATE OR DELETE ON crm_objections FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_pipeline_events_live AFTER INSERT OR UPDATE OR DELETE ON crm_pipeline_events FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TABLE crm_pipeline_config_journal(id bigserial PRIMARY KEY,entity text NOT NULL,actor_email text,before_value jsonb,after_value jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION crm_pipeline_config_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='app_settings' THEN
  IF NEW.key<>'crm_priority_rules' THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO crm_pipeline_config_journal(entity,actor_email,before_value,after_value) VALUES(TG_TABLE_NAME,nullif(current_setting('crm.actor_email',true),''),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER crm_stages_config_audit AFTER INSERT OR UPDATE ON crm_stages FOR EACH ROW EXECUTE FUNCTION crm_pipeline_config_audit();
CREATE TRIGGER crm_reasons_config_audit AFTER INSERT OR UPDATE ON crm_loss_reasons FOR EACH ROW EXECUTE FUNCTION crm_pipeline_config_audit();
CREATE TRIGGER crm_types_config_audit AFTER INSERT OR UPDATE ON crm_objection_types FOR EACH ROW EXECUTE FUNCTION crm_pipeline_config_audit();
CREATE TRIGGER crm_rules_config_audit AFTER INSERT OR UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION crm_pipeline_config_audit();
CREATE FUNCTION crm_catalog_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Usá baja lógica'; END IF;
 IF NEW.name<>OLD.name THEN RAISE EXCEPTION 'Nombre histórico inmutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_reasons_guard BEFORE UPDATE OR DELETE ON crm_loss_reasons FOR EACH ROW EXECUTE FUNCTION crm_catalog_history_guard();
CREATE TRIGGER crm_types_guard BEFORE UPDATE OR DELETE ON crm_objection_types FOR EACH ROW EXECUTE FUNCTION crm_catalog_history_guard();
