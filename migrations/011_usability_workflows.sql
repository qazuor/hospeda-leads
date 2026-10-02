-- Add stable results without interpreting historical free text or changing old stages.
ALTER TABLE crm_tasks ADD COLUMN outcome text CHECK(outcome IN ('no_answer','interested','replied','not_interested','do_not_contact','other'));
ALTER TABLE crm_activities ADD COLUMN outcome text CHECK(outcome IN ('no_answer','interested','replied','not_interested','do_not_contact','other'));
CREATE OR REPLACE FUNCTION crm_sequence_activity_stop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.deleted_at IS NULL AND NEW.lead_id IS NOT NULL AND (NEW.outcome IN ('interested','replied','not_interested','do_not_contact') OR (NEW.outcome IS NULL AND NEW.result IN ('Respondió','Interesado','No interesado','Respuesta registrada manualmente','Rechazo registrado manualmente'))) THEN
 PERFORM crm_stop_sequences(NEW.lead_id,coalesce(NEW.outcome,NEW.result)); END IF; RETURN NEW;
END $$;
DROP TRIGGER crm_sequence_activity_stop ON crm_activities;
CREATE TRIGGER crm_sequence_activity_stop AFTER INSERT OR UPDATE OF result,outcome ON crm_activities FOR EACH ROW EXECUTE FUNCTION crm_sequence_activity_stop();
-- Becoming a customer does not cancel negotiations for additional services.
CREATE OR REPLACE FUNCTION crm_sequence_account_stop() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE l record; BEGIN
 IF NEW.do_not_contact THEN FOR l IN SELECT id FROM leads WHERE account_id=NEW.id LOOP
 PERFORM crm_stop_sequences(l.id,'Negocio marcado No contactar'); END LOOP; END IF; RETURN NEW;
END $$;

ALTER TABLE crm_accounts ADD COLUMN archived_at timestamptz;
