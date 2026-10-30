-- Preserve the business archive state even when another account field is updated.
CREATE OR REPLACE FUNCTION crm_sync_client_indicator() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW.archived_at IS NOT NULL THEN NEW.status:='archived';
  ELSIF NEW.review_status='filtered' AND NEW.status='new' THEN NEW.status:='reviewed'; END IF;
  IF NEW.status='reviewed' AND NOT NEW.is_client THEN NEW.review_status:='filtered'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crm_sync_client_indicator ON crm_accounts;
CREATE TRIGGER crm_sync_client_indicator BEFORE INSERT OR UPDATE OF is_client,commercial_status,review_status,status,archived_at ON crm_accounts
FOR EACH ROW EXECUTE FUNCTION crm_sync_client_indicator();
