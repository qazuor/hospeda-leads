-- Tasks own planning; the historical next-action column is only a projection.
CREATE TABLE crm_work_types (
  id text PRIMARY KEY,
  name text NOT NULL CHECK(length(btrim(name))>0),
  agenda boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO crm_work_types(id,name,agenda) VALUES
('followup','Seguimiento',false),('call','Llamada',false),('message','Mensaje',false),
('meeting','Reunión',true),('visit','Visita',true),('proposal','Propuesta enviada',false),('other','Otra actividad',false);
ALTER TABLE leads ADD CONSTRAINT leads_account_identity UNIQUE(account_id,id);
CREATE TABLE crm_tasks (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES crm_accounts(id),
  lead_id bigint,
  title text NOT NULL CHECK(length(btrim(title))>0),
  description text,
  participants text NOT NULL DEFAULT '',
  contact_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(contact_ids)='array'),
  type_id text NOT NULL REFERENCES crm_work_types(id),
  assigned_user_email text REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL,
  due_date date NOT NULL,
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'media' CHECK(priority IN ('alta','media','baja')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
  result text,
  completed_at timestamptz,
  legacy boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(account_id,lead_id) REFERENCES leads(account_id,id) ON DELETE CASCADE,
  CHECK(due_at IS NULL OR (due_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date=due_date),
  CHECK((status='completed')=(completed_at IS NOT NULL)),
  UNIQUE(account_id,id)
);
CREATE UNIQUE INDEX crm_tasks_legacy_unique ON crm_tasks(lead_id) WHERE legacy;
CREATE INDEX crm_tasks_day ON crm_tasks(assigned_user_email,due_date) WHERE status='pending' AND deleted_at IS NULL;
CREATE INDEX crm_tasks_lead ON crm_tasks(lead_id);
CREATE TABLE crm_activities (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES crm_accounts(id),
  lead_id bigint,
  task_id bigint UNIQUE,
  type_id text NOT NULL REFERENCES crm_work_types(id),
  title text NOT NULL CHECK(length(btrim(title))>0),
  occurred_at timestamptz NOT NULL,
  participants text NOT NULL DEFAULT '',
  contact_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(contact_ids)='array'),
  channel text,
  result text,
  notes text,
  actor_email text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(account_id,lead_id) REFERENCES leads(account_id,id) ON DELETE SET NULL (lead_id),
  FOREIGN KEY(account_id,task_id) REFERENCES crm_tasks(account_id,id) ON DELETE SET NULL (task_id)
);
-- Keep immutable before/after snapshots separate from commercial activity cards.
CREATE TABLE crm_work_journal (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES crm_accounts(id),
  entity text NOT NULL,
  entity_id bigint NOT NULL,
  actor_email text,
  action text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_work_journal_account ON crm_work_journal(account_id,created_at);
CREATE FUNCTION crm_audit_work() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO crm_work_journal(account_id,entity,entity_id,actor_email,action,before_value,after_value)
 VALUES(COALESCE(NEW.account_id,OLD.account_id),TG_TABLE_NAME,COALESCE(NEW.id,OLD.id),
 nullif(current_setting('crm.actor_email',true),''),TG_OP,
 CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END, CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
 RETURN COALESCE(NEW,OLD);
END $$;
-- Backfill once, preserving the calendar day used by the historical UTC date inputs.
INSERT INTO crm_tasks(account_id,lead_id,title,type_id,assigned_user_email,due_date,legacy)
 SELECT account_id,id,'Seguimiento','followup',assigned_user_email,fecha_proxima_accion,true
 FROM leads WHERE fecha_proxima_accion IS NOT NULL ON CONFLICT DO NOTHING;
CREATE FUNCTION crm_project_next_action(p_lead bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE projected date; previous_flag text;
BEGIN
 IF p_lead IS NULL THEN RETURN; END IF;
 SELECT due_date INTO projected FROM crm_tasks
 WHERE lead_id=p_lead AND status='pending' AND deleted_at IS NULL
 ORDER BY due_date, COALESCE(due_at,(due_date+time '23:59:59') AT TIME ZONE 'America/Argentina/Buenos_Aires'),id LIMIT 1;
 previous_flag:=current_setting('crm.projecting',true);
 PERFORM set_config('crm.projecting','1',true);
 UPDATE leads SET fecha_proxima_accion=projected WHERE id=p_lead AND fecha_proxima_accion IS DISTINCT FROM projected;
 PERFORM set_config('crm.projecting',COALESCE(previous_flag,''),true);
END $$;
CREATE FUNCTION crm_task_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM crm_project_next_action(COALESCE(NEW.lead_id,OLD.lead_id));
 IF TG_OP='UPDATE' AND OLD.lead_id IS DISTINCT FROM NEW.lead_id THEN PERFORM crm_project_next_action(OLD.lead_id); END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER crm_task_next_action AFTER INSERT OR UPDATE OR DELETE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION crm_task_projection();
CREATE TRIGGER crm_task_audit AFTER INSERT OR UPDATE OR DELETE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION crm_audit_work();
CREATE TRIGGER crm_activity_audit AFTER INSERT OR UPDATE OR DELETE ON crm_activities FOR EACH ROW EXECUTE FUNCTION crm_audit_work();
CREATE FUNCTION crm_legacy_next_action() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('crm.projecting',true)='1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.assigned_user_email IS DISTINCT FROM OLD.assigned_user_email THEN
 UPDATE crm_tasks SET assigned_user_email=NEW.assigned_user_email,updated_at=now() WHERE lead_id=NEW.id AND legacy;
 END IF;
 IF TG_OP='INSERT' OR NEW.fecha_proxima_accion IS DISTINCT FROM OLD.fecha_proxima_accion THEN
 IF NEW.fecha_proxima_accion IS NOT NULL THEN
 UPDATE crm_tasks SET legacy=false,updated_at=now() WHERE lead_id=NEW.id AND legacy AND (status<>'pending' OR deleted_at IS NOT NULL);
 INSERT INTO crm_tasks(account_id,lead_id,title,type_id,assigned_user_email,due_date,legacy)
 VALUES(NEW.account_id,NEW.id,'Seguimiento','followup',NEW.assigned_user_email,NEW.fecha_proxima_accion,true)
 ON CONFLICT(lead_id) WHERE legacy DO UPDATE SET due_date=EXCLUDED.due_date,due_at=NULL,status='pending',completed_at=NULL,result=NULL,deleted_at=NULL,updated_at=now();
 ELSE
 UPDATE crm_tasks SET status='cancelled',completed_at=NULL,updated_at=now() WHERE lead_id=NEW.id AND legacy AND status='pending';
 END IF;
 PERFORM crm_project_next_action(NEW.id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_legacy_task AFTER INSERT OR UPDATE OF fecha_proxima_accion,assigned_user_email ON leads FOR EACH ROW EXECUTE FUNCTION crm_legacy_next_action();
-- Normalize projection without re-running the legacy adapter.
SELECT crm_project_next_action(id) FROM leads;

CREATE TRIGGER crm_tasks_live AFTER INSERT OR UPDATE OR DELETE ON crm_tasks FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_activities_live AFTER INSERT OR UPDATE OR DELETE ON crm_activities FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_work_types_live AFTER INSERT OR UPDATE OR DELETE ON crm_work_types FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
ALTER TABLE leads ADD COLUMN assigned_at timestamptz;
UPDATE leads SET assigned_at=created_at WHERE assigned_user_email IS NOT NULL;
CREATE FUNCTION crm_assignment_date() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.assigned_user_email IS DISTINCT FROM OLD.assigned_user_email THEN
 NEW.assigned_at:=CASE WHEN NEW.assigned_user_email IS NOT NULL THEN now() ELSE NULL END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_assignment_date BEFORE INSERT OR UPDATE OF assigned_user_email ON leads FOR EACH ROW EXECUTE FUNCTION crm_assignment_date();
-- Preserve manually-entered/historical contact dates while projecting real activities.
ALTER TABLE leads ADD COLUMN contact_baseline_date date;
ALTER TABLE leads ADD COLUMN contact_baseline_result text;
UPDATE leads SET contact_baseline_date=fecha_ultimo_contacto,contact_baseline_result=resultado_ultimo_contacto;
CREATE FUNCTION crm_contact_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('crm.contact_projecting',true)='1' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' OR ROW(NEW.fecha_ultimo_contacto,NEW.resultado_ultimo_contacto) IS DISTINCT FROM ROW(OLD.fecha_ultimo_contacto,OLD.resultado_ultimo_contacto) THEN
 NEW.contact_baseline_date:=NEW.fecha_ultimo_contacto; NEW.contact_baseline_result:=NEW.resultado_ultimo_contacto;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_contact_baseline BEFORE INSERT OR UPDATE OF fecha_ultimo_contacto,resultado_ultimo_contacto ON leads FOR EACH ROW EXECUTE FUNCTION crm_contact_baseline();
CREATE FUNCTION crm_project_contact(p_lead bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE candidate record; previous_flag text;
BEGIN
 IF p_lead IS NULL THEN RETURN; END IF;
 SELECT day,result INTO candidate FROM (
  SELECT contact_baseline_date AS day,contact_baseline_result AS result,NULL::timestamptz AS instant FROM leads WHERE id=p_lead AND contact_baseline_date IS NOT NULL
  UNION ALL
  SELECT (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,result,occurred_at FROM crm_activities
  WHERE lead_id=p_lead AND deleted_at IS NULL AND type_id IN ('call','message','meeting','visit','proposal')
 ) candidates ORDER BY day DESC,instant DESC NULLS LAST LIMIT 1;
 previous_flag:=current_setting('crm.contact_projecting',true); PERFORM set_config('crm.contact_projecting','1',true);
 UPDATE leads SET fecha_ultimo_contacto=candidate.day,resultado_ultimo_contacto=candidate.result
 WHERE id=p_lead AND ROW(fecha_ultimo_contacto,resultado_ultimo_contacto) IS DISTINCT FROM ROW(candidate.day,candidate.result);
 PERFORM set_config('crm.contact_projecting',COALESCE(previous_flag,''),true);
END $$;
CREATE FUNCTION crm_activity_contact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM crm_project_contact(COALESCE(NEW.lead_id,OLD.lead_id)); RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER crm_activity_contact AFTER INSERT OR UPDATE OR DELETE ON crm_activities FOR EACH ROW EXECUTE FUNCTION crm_activity_contact();

INSERT INTO app_settings(key,value) VALUES ('crm_work_followup','{"stages":["Interesado","En tratativas"],"newAssignmentDays":7}') ON CONFLICT(key) DO NOTHING;
CREATE TRIGGER crm_work_settings_live AFTER INSERT OR UPDATE ON app_settings FOR EACH ROW WHEN (NEW.key='crm_work_followup') EXECUTE FUNCTION bump_crm_live_version();
