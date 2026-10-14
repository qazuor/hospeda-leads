-- Record state changes at the database boundary so every write path is covered,
-- including business status updates caused by management stage triggers.
CREATE FUNCTION crm_audit_business_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  changes_before jsonb := '{}'::jsonb;
  changes_after jsonb := '{}'::jsonb;
  actor text := nullif(current_setting('crm.actor_email',true),'');
  origin text := coalesce(nullif(current_setting('crm.state_change_origin',true),''),'direct');
  cause text := nullif(current_setting('crm.state_change_cause',true),'');
  journal_action text := 'business_state_changed';
  changed boolean := false;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    changes_before := changes_before || jsonb_build_object('status',OLD.status);
    changes_after := changes_after || jsonb_build_object('status',NEW.status);
    changed := true;
  END IF;
  IF NEW.recontact_at IS DISTINCT FROM OLD.recontact_at THEN
    changes_before := changes_before || jsonb_build_object('recontact_at',OLD.recontact_at);
    changes_after := changes_after || jsonb_build_object('recontact_at',NEW.recontact_at);
    changed := true;
  END IF;
  IF NEW.is_client IS DISTINCT FROM OLD.is_client THEN
    changes_before := changes_before || jsonb_build_object('is_client',OLD.is_client);
    changes_after := changes_after || jsonb_build_object('is_client',NEW.is_client);
    changed := true;
  END IF;
  IF NEW.commercial_status IS DISTINCT FROM OLD.commercial_status THEN
    changes_before := changes_before || jsonb_build_object('commercial_status',OLD.commercial_status);
    changes_after := changes_after || jsonb_build_object('commercial_status',NEW.commercial_status);
    changed := true;
  END IF;
  IF NEW.do_not_contact IS DISTINCT FROM OLD.do_not_contact THEN
    changes_before := changes_before || jsonb_build_object('do_not_contact',OLD.do_not_contact);
    changes_after := changes_after || jsonb_build_object('do_not_contact',NEW.do_not_contact);
    changed := true;
  END IF;
  IF NEW.referred_to_leandro IS DISTINCT FROM OLD.referred_to_leandro THEN
    changes_before := changes_before || jsonb_build_object('referred_to_leandro',OLD.referred_to_leandro);
    changes_after := changes_after || jsonb_build_object('referred_to_leandro',NEW.referred_to_leandro);
    changed := true;
  END IF;

  IF changed THEN
    IF OLD.commercial_status IS DISTINCT FROM NEW.commercial_status AND NEW.commercial_status='client' THEN
      journal_action := 'converted_to_client';
    ELSIF OLD.commercial_status IS DISTINCT FROM NEW.commercial_status AND NEW.commercial_status='prospect' THEN
      journal_action := 'client_unmarked';
    ELSIF OLD.do_not_contact IS DISTINCT FROM NEW.do_not_contact THEN
      journal_action := 'contact_policy';
    ELSIF OLD.referred_to_leandro IS DISTINCT FROM NEW.referred_to_leandro THEN
      journal_action := 'leandro_referral_changed';
    ELSIF OLD.status IS DISTINCT FROM NEW.status OR OLD.recontact_at IS DISTINCT FROM NEW.recontact_at THEN
      journal_action := 'business_status_changed';
    ELSIF OLD.is_client IS DISTINCT FROM NEW.is_client THEN
      journal_action := CASE WHEN NEW.is_client THEN 'client_marked' ELSE 'client_unmarked' END;
    END IF;
    INSERT INTO crm_commercial_journal(account_id,action,actor_email,actor_name,metadata)
    SELECT NEW.id,journal_action,actor,
      coalesce(u.display_name,actor,'Sistema'),
      jsonb_build_object('before',changes_before,'after',changes_after,'origin',origin,'cause',cause)
    FROM (SELECT 1) seed LEFT JOIN users u ON u.email=actor;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER crm_business_state_journal
AFTER UPDATE OF status,recontact_at,is_client,commercial_status,do_not_contact,referred_to_leandro
ON crm_accounts FOR EACH ROW EXECUTE FUNCTION crm_audit_business_state();

-- A status projected from an opportunity is still attributed to the actor, but
-- marked as derived so the journal distinguishes it from a direct status edit.
CREATE OR REPLACE FUNCTION crm_sync_business_management_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  account_key bigint;
  previous_origin text := current_setting('crm.state_change_origin',true);
  previous_cause text := current_setting('crm.state_change_cause',true);
BEGIN
  account_key:=coalesce(NEW.account_id,OLD.account_id);
  PERFORM set_config('crm.state_change_origin','automatic',true);
  PERFORM set_config('crm.state_change_cause','management_change',true);
  UPDATE crm_accounts a SET status=CASE
    WHEN a.archived_at IS NOT NULL THEN 'archived'
    WHEN EXISTS(SELECT 1 FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=account_key AND l.deleted_at IS NULL AND s.classification='open') THEN 'in_management'
    WHEN a.status='in_management' THEN 'no_follow_up_scheduled'
    ELSE a.status END,updated_at=now()
  WHERE a.id=account_key;
  PERFORM set_config('crm.state_change_origin',coalesce(previous_origin,''),true);
  PERFORM set_config('crm.state_change_cause',coalesce(previous_cause,''),true);
  RETURN coalesce(NEW,OLD);
END $$;
