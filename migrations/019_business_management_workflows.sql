-- Product-defined business and management state model. Existing columns and
-- historical pipeline values remain intact for compatibility.
ALTER TABLE crm_accounts
  ADD COLUMN is_client boolean NOT NULL DEFAULT false,
  ADD COLUMN referred_original_owner_email text REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE leads
  ADD COLUMN management_type text CHECK (management_type IN ('main','partner','provider','editor','accompaniment')),
  ADD COLUMN referred_previous_stage text,
  ADD COLUMN referred_previous_assigned_user_email text REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE crm_stages
  ADD COLUMN management_type text CHECK (management_type IN ('main','partner','provider','editor','accompaniment')),
  ADD COLUMN display_name text,
  ADD COLUMN outcome_key text;

CREATE TABLE crm_management_reasons (
  id bigserial PRIMARY KEY,
  management_type text NOT NULL CHECK (management_type IN ('main','partner','provider','editor','accompaniment')),
  outcome_key text NOT NULL,
  reason_key text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  do_not_contact boolean NOT NULL DEFAULT false,
  requires_note boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (management_type,outcome_key,reason_key)
);

ALTER TABLE crm_pipeline_events
  ADD COLUMN management_reason_id bigint REFERENCES crm_management_reasons(id),
  ADD COLUMN management_note text;

ALTER TABLE crm_accounts ALTER COLUMN status SET DEFAULT 'new';

-- Names are stable storage keys; display_name is the user-facing label.
INSERT INTO crm_stages(name,sort_order,active,classification,historical,management_type,display_name,outcome_key) VALUES
('main:contact',10,true,'open',false,'main','Por contactar',null),
('main:contacted',20,true,'open',false,'main','Contactado',null),
('main:interested',30,true,'open',false,'main','Interesado',null),
('main:evaluating_plan',40,true,'open',false,'main','Evaluando un plan',null),
('main:won',90,true,'won',false,'main','Cerrada ganada','won'),
('main:lost',100,true,'lost',false,'main','Cerrada perdida','lost'),
('main:leandro',110,true,'open',false,'main','Derivada a Leandro',null),
('partner:contact',10,true,'open',false,'partner','Por contactar',null),
('partner:contacted',20,true,'open',false,'partner','Contactado',null),
('partner:conversation',30,true,'open',false,'partner','En conversación',null),
('partner:interest',40,true,'open',false,'partner','Interés confirmado',null),
('partner:proposal_preparing',50,true,'open',false,'partner','Propuesta en preparación',null),
('partner:proposal_sent',60,true,'open',false,'partner','Propuesta enviada',null),
('partner:negotiation',70,true,'open',false,'partner','En negociación',null),
('partner:won',90,true,'won',false,'partner','Cerrada ganada','won'),
('partner:lost',100,true,'lost',false,'partner','Cerrada perdida','lost'),
('partner:leandro',110,true,'open',false,'partner','Derivada a Leandro',null),
('provider:contact',10,true,'open',false,'provider','Por contactar',null),
('provider:contacted',20,true,'open',false,'provider','Contactado',null),
('provider:information_sent',30,true,'open',false,'provider','Información enviada',null),
('provider:interested',40,true,'open',false,'provider','Interesado en participar',null),
('provider:coordinating',50,true,'open',false,'provider','Participación coordinándose',null),
('provider:participates',90,true,'won',false,'provider','Participa','participates'),
('provider:not_participating',100,true,'lost',false,'provider','No participa','not_participating'),
('provider:leandro',110,true,'open',false,'provider','Derivada a Leandro',null),
('editor:contact',10,true,'open',false,'editor','Por contactar',null),
('editor:contacted',20,true,'open',false,'editor','Contactado',null),
('editor:information_sent',30,true,'open',false,'editor','Información enviada',null),
('editor:interested',40,true,'open',false,'editor','Interesado en colaborar',null),
('editor:coordinating',50,true,'open',false,'editor','Colaboración coordinándose',null),
('editor:collaborates',90,true,'won',false,'editor','Colabora','collaborates'),
('editor:not_collaborating',100,true,'lost',false,'editor','No colabora','not_collaborating'),
('editor:proposal_preparing',110,true,'open',false,'editor','Propuesta comercial en preparación',null),
('editor:proposal_sent',120,true,'open',false,'editor','Propuesta comercial enviada',null),
('editor:negotiation',130,true,'open',false,'editor','En negociación',null),
('editor:proposal_won',140,true,'won',false,'editor','Cerrada ganada','proposal_won'),
('editor:proposal_lost',150,true,'lost',false,'editor','Cerrada perdida','proposal_lost'),
('editor:leandro',160,true,'open',false,'editor','Derivada a Leandro',null),
('accompaniment:pending',10,true,'open',false,'accompaniment','Pendiente de iniciar',null),
('accompaniment:contacted',20,true,'open',false,'accompaniment','Contactado',null),
('accompaniment:working',30,true,'open',false,'accompaniment','Trabajando en la ficha',null),
('accompaniment:completed',90,true,'won',false,'accompaniment','Cerrada completada','completed'),
('accompaniment:not_completed',100,true,'lost',false,'accompaniment','Cerrada no completada','not_completed'),
('accompaniment:leandro',110,true,'open',false,'accompaniment','Derivada a Leandro',null)
ON CONFLICT(name) DO NOTHING;

INSERT INTO crm_management_reasons(management_type,outcome_key,reason_key,name,do_not_contact,requires_note) VALUES
('main','won','accepted','Aceptó sumarse',false,false),
('main','won','existing_profile','Ya tenía ficha y aceptó el plan',false,false),
('main','won','other','Otro',false,true),
('main','lost','not_interested','No le interesa',false,false),
('main','lost','no_response','No respondió',false,false),
('main','lost','other_alternative','Eligió otra alternativa',false,false),
('main','lost','not_now','No puede participar ahora',false,false),
('main','lost','do_not_contact','Pidió no ser contactado',true,false),
('main','lost','other','Otro',false,true),
('partner','won','accepted_proposal','Aceptó la propuesta',false,false),
('partner','won','accepted_plan','Aceptó un plan preestablecido',false,false),
('partner','won','other','Otro',false,true),
('partner','lost','not_interested','No le interesa',false,false),
('partner','lost','no_response','No respondió',false,false),
('partner','lost','budget','Presupuesto insuficiente',false,false),
('partner','lost','conditions','Condiciones no acordadas',false,false),
('partner','lost','do_not_contact','Pidió no ser contactado',true,false),
('partner','lost','other','Otro',false,true),
('provider','participates','accepted','Aceptó participar',false,false),
('provider','participates','other','Otro',false,true),
('provider','not_participating','not_interested','No le interesa',false,false),
('provider','not_participating','no_response','No respondió',false,false),
('provider','not_participating','no_service','No ofrece el servicio requerido',false,false),
('provider','not_participating','not_now','No puede participar ahora',false,false),
('provider','not_participating','do_not_contact','Pidió no ser contactado',true,false),
('provider','not_participating','other','Otro',false,true),
('editor','collaborates','accepted','Aceptó colaborar',false,false),
('editor','collaborates','other','Otro',false,true),
('editor','not_collaborating','not_interested','No le interesa',false,false),
('editor','not_collaborating','no_response','No respondió',false,false),
('editor','not_collaborating','not_now','No puede colaborar ahora',false,false),
('editor','not_collaborating','do_not_contact','Pidió no ser contactado',true,false),
('editor','not_collaborating','other','Otro',false,true),
('editor','proposal_won','accepted','Aceptó la propuesta',false,false),
('editor','proposal_won','other','Otro',false,true),
('editor','proposal_lost','not_interested','No le interesa',false,false),
('editor','proposal_lost','no_response','No respondió',false,false),
('editor','proposal_lost','conditions','Condiciones no acordadas',false,false),
('editor','proposal_lost','do_not_contact','Pidió no ser contactado',true,false),
('editor','proposal_lost','other','Otro',false,true),
('accompaniment','not_completed','no_response','El comercio no respondió',false,false),
('accompaniment','not_completed','missing_information','No envió la información',false,false),
('accompaniment','not_completed','stopped','Decidió no continuar',false,false),
('accompaniment','not_completed','do_not_contact','Pidió no ser contactado',true,false),
('accompaniment','not_completed','other','Otro',false,true)
ON CONFLICT(management_type,outcome_key,reason_key) DO NOTHING;

UPDATE crm_accounts SET is_client=(commercial_status='client');

-- Keep legacy pipeline writes intact, but let the typed management guard own
-- validation for the new per-type stage catalogs.
CREATE OR REPLACE FUNCTION crm_pipeline_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s crm_stages; actor text; role_name text;
BEGIN
  actor:=nullif(current_setting('crm.actor_email',true),'');
  IF TG_OP='UPDATE' THEN
    NEW.pipeline_revision:=OLD.pipeline_revision+1;
    IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
    SELECT role INTO role_name FROM users WHERE email=actor;
    IF actor IS NOT NULL AND role_name IS DISTINCT FROM 'admin' AND OLD.assigned_user_email IS DISTINCT FROM actor
       AND coalesce(current_setting('crm.refer_management',true),'false')<>'true'
       AND coalesce(current_setting('crm.close_related_management',true),'false')<>'true' THEN
      RAISE EXCEPTION 'Solo podés cambiar etapas de tus oportunidades asignadas';
    END IF;
  ELSIF NEW.management_type IS NULL AND NEW.estado IS NOT NULL THEN
    INSERT INTO crm_stages(name,sort_order,active,historical) VALUES(NEW.estado,1000,false,true) ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.estado IS NULL THEN
    IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Elegí una etapa activa'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO s FROM crm_stages WHERE name=NEW.estado FOR SHARE;
  IF TG_OP='UPDATE' AND NOT s.active THEN RAISE EXCEPTION 'Etapa desactivada'; END IF;
  IF NEW.management_type IS NULL AND s.classification='lost' AND nullif(current_setting('crm.loss_reason',true),'') IS NULL THEN
    RAISE EXCEPTION 'Para cerrar perdida usá el pipeline y elegí un motivo';
  END IF;
  IF NEW.management_type IS NULL AND s.classification='lost' THEN
    PERFORM id FROM crm_loss_reasons WHERE id=nullif(current_setting('crm.loss_reason',true),'')::bigint AND active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Motivo desactivado'; END IF;
  END IF;
  NEW.stage_since:=now();
  RETURN NEW;
END $$;

CREATE FUNCTION crm_sync_client_indicator() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.is_client := NEW.is_client OR NEW.commercial_status='client';
    NEW.status := coalesce(NEW.status,CASE WHEN NEW.review_status='filtered' THEN 'reviewed' ELSE 'new' END);
  ELSIF NEW.is_client IS DISTINCT FROM OLD.is_client THEN
    NEW.commercial_status := CASE WHEN NEW.is_client THEN 'client' ELSE 'prospect' END;
    NEW.client_since := CASE WHEN NEW.is_client THEN coalesce(NEW.client_since,now()) ELSE NULL END;
  ELSIF NEW.commercial_status IS DISTINCT FROM OLD.commercial_status THEN
    NEW.is_client := NEW.commercial_status='client';
    NEW.client_since := CASE WHEN NEW.is_client THEN coalesce(NEW.client_since,now()) ELSE NULL END;
  END IF;
  IF NEW.review_status='filtered' AND NEW.status='new' THEN NEW.status:='reviewed'; END IF;
  IF NEW.status='reviewed' AND NOT NEW.is_client THEN NEW.review_status:='filtered'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_sync_client_indicator BEFORE INSERT OR UPDATE OF is_client,commercial_status,review_status,status ON crm_accounts
FOR EACH ROW EXECUTE FUNCTION crm_sync_client_indicator();

CREATE FUNCTION crm_management_stage_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st crm_stages; reason_id bigint; actor text; actor_role text; account crm_accounts;
BEGIN
  IF NEW.management_type IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO st FROM crm_stages WHERE name=NEW.estado AND management_type=NEW.management_type;
  IF NOT FOUND OR NOT st.active THEN RAISE EXCEPTION 'La etapa no corresponde a este tipo de gestión'; END IF;
  IF TG_OP='INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado THEN
    SELECT * INTO account FROM crm_accounts WHERE id=NEW.account_id FOR UPDATE;
    IF account.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Restaurá el negocio de Papelera antes de iniciar una gestión'; END IF;
    IF (account.archived_at IS NOT NULL OR account.status='archived')
       AND coalesce(current_setting('crm.unrefer_management',true),'false')<>'true' THEN
      RAISE EXCEPTION 'Desarchivá el negocio antes de iniciar o modificar una gestión';
    END IF;
    IF TG_OP='INSERT' AND account.do_not_contact THEN RAISE EXCEPTION 'Este negocio está marcado como No contactar'; END IF;
    IF TG_OP='INSERT' AND account.status NOT IN ('reviewed','in_management','no_follow_up_scheduled','recontact') THEN
      RAISE EXCEPTION 'Revisá el negocio antes de iniciar una gestión';
    END IF;
    IF TG_OP='UPDATE' AND (SELECT classification FROM crm_stages WHERE name=OLD.estado) IN ('won','lost') AND st.classification='open' THEN
      actor:=nullif(current_setting('crm.actor_email',true),'');
      SELECT role INTO actor_role FROM users WHERE email=actor;
      IF actor_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo un administrador puede reabrir una gestión cerrada'; END IF;
    END IF;
    reason_id:=nullif(current_setting('crm.management_reason_id',true),'')::bigint;
    IF st.classification IN ('won','lost') THEN
      IF st.outcome_key='completed' THEN
        reason_id:=NULL;
      ELSIF reason_id IS NULL THEN
        RAISE EXCEPTION 'Elegí el motivo de cierre';
      ELSE
        PERFORM 1 FROM crm_management_reasons r WHERE r.id=reason_id AND r.management_type=NEW.management_type AND r.outcome_key=st.outcome_key AND r.active;
        IF NOT FOUND THEN RAISE EXCEPTION 'El motivo no corresponde al resultado de cierre'; END IF;
        IF EXISTS(SELECT 1 FROM crm_management_reasons r WHERE r.id=reason_id AND r.requires_note) AND nullif(btrim(current_setting('crm.management_note',true)),'') IS NULL THEN
          RAISE EXCEPTION 'Agregá una nota para el motivo Otro';
        END IF;
      END IF;
    END IF;
    NEW.stage_since:=now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_management_stage_guard BEFORE INSERT OR UPDATE OF estado,management_type ON leads
FOR EACH ROW EXECUTE FUNCTION crm_management_stage_guard();

CREATE OR REPLACE FUNCTION crm_pipeline_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous text; st crm_stages; reason_id bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  previous:=OLD.estado;
 ELSIF NEW.estado IS NULL THEN
  RETURN NEW;
 END IF;
 SELECT * INTO st FROM crm_stages WHERE name=NEW.estado;
 IF NEW.management_type IS NOT NULL THEN
  reason_id:=nullif(current_setting('crm.management_reason_id',true),'')::bigint;
  INSERT INTO crm_pipeline_events(account_id,lead_id,action,actor_email,old_stage,new_stage,classification,management_reason_id,management_note,recontact_date)
  VALUES(NEW.account_id,NEW.id,'stage',nullif(current_setting('crm.actor_email',true),''),previous,NEW.estado,st.classification,reason_id,nullif(current_setting('crm.management_note',true),''),nullif(current_setting('crm.recontact',true),'')::date);
 ELSE
  INSERT INTO crm_pipeline_events(account_id,lead_id,action,actor_email,old_stage,new_stage,classification,reason_id,comment,recontact_date)
  VALUES(NEW.account_id,NEW.id,'stage',nullif(current_setting('crm.actor_email',true),''),previous,NEW.estado,st.classification,nullif(current_setting('crm.loss_reason',true),'')::bigint,nullif(current_setting('crm.loss_comment',true),''),nullif(current_setting('crm.recontact',true),'')::date);
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION crm_sync_business_management_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_key bigint;
BEGIN
  account_key:=coalesce(NEW.account_id,OLD.account_id);
  UPDATE crm_accounts a SET status=CASE
    WHEN a.archived_at IS NOT NULL THEN 'archived'
    WHEN EXISTS(SELECT 1 FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=account_key AND l.deleted_at IS NULL AND s.classification='open') THEN 'in_management'
    WHEN a.status='in_management' THEN 'no_follow_up_scheduled'
    ELSE a.status END,updated_at=now()
  WHERE a.id=account_key;
  RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER crm_sync_business_management_status AFTER INSERT OR UPDATE OF estado,deleted_at ON leads
FOR EACH ROW EXECUTE FUNCTION crm_sync_business_management_status();
CREATE TRIGGER crm_sync_business_management_status_delete AFTER DELETE ON leads
FOR EACH ROW EXECUTE FUNCTION crm_sync_business_management_status();

CREATE TRIGGER crm_management_reasons_live AFTER INSERT OR UPDATE OR DELETE ON crm_management_reasons
FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
