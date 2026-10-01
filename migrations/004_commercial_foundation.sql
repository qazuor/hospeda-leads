CREATE TABLE crm_accounts (
  id bigserial PRIMARY KEY,
  source_lead_id bigint UNIQUE,
  nombre text NOT NULL,
  ciudad text,
  telefono text,
  email text,
  sitio_web text,
  url_gmap text,
  perfil_instagram text,
  perfil_facebook text,
  perfil_airbnb text,
  perfil_booking text,
  perfil_turismo_entre_rios text,
  assigned_user_email text REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL,
  commercial_status text NOT NULL DEFAULT 'prospect' CHECK (commercial_status IN ('prospect','client')),
  client_since timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm_contacts (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES crm_accounts(id),
  source_lead_id bigint UNIQUE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  position text,
  phone text,
  email text,
  preferred_channel text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id,id)
);
CREATE UNIQUE INDEX crm_contacts_one_primary ON crm_contacts(account_id) WHERE is_primary AND deleted_at IS NULL;
ALTER TABLE leads ADD COLUMN account_id bigint REFERENCES crm_accounts(id);
ALTER TABLE leads ADD COLUMN opportunity_name text;
ALTER TABLE leads ADD COLUMN primary_contact_id bigint;
ALTER TABLE leads ADD COLUMN service_interest text;
ALTER TABLE leads ADD COLUMN estimated_close_date date;
ALTER TABLE leads ADD CONSTRAINT leads_contact_account_fk FOREIGN KEY(account_id,primary_contact_id) REFERENCES crm_contacts(account_id,id);
CREATE INDEX leads_account_idx ON leads(account_id);

INSERT INTO crm_accounts(source_lead_id,nombre,ciudad,telefono,email,sitio_web,url_gmap,perfil_instagram,perfil_facebook,perfil_airbnb,perfil_booking,perfil_turismo_entre_rios,assigned_user_email,created_at,updated_at)
SELECT id,nombre,ciudad,telefono,email,sitio_web,url_gmap,perfil_instagram,perfil_facebook,perfil_airbnb,perfil_booking,perfil_turismo_entre_rios,assigned_user_email,created_at,updated_at FROM leads
ON CONFLICT(source_lead_id) DO NOTHING;
UPDATE leads l SET account_id=a.id FROM crm_accounts a WHERE a.source_lead_id=l.id AND l.account_id IS NULL;
INSERT INTO crm_contacts(account_id,source_lead_id,name,phone,email,preferred_channel,is_primary,deleted_at)
SELECT account_id,id,contact_name,telefono,email,medio_contacto_preferido,true,deleted_at FROM leads WHERE nullif(btrim(contact_name),'') IS NOT NULL
ON CONFLICT(source_lead_id) DO NOTHING;
UPDATE leads l SET primary_contact_id=c.id FROM crm_contacts c WHERE c.source_lead_id=l.id AND c.deleted_at IS NULL;
ALTER TABLE leads ALTER COLUMN account_id SET NOT NULL;

CREATE TABLE crm_commercial_journal (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES crm_accounts(id),
  contact_id bigint REFERENCES crm_contacts(id),
  action text NOT NULL,
  actor_email text,
  actor_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_commercial_journal_account_idx ON crm_commercial_journal(account_id,created_at);
ALTER TABLE lead_journal ADD COLUMN account_id bigint REFERENCES crm_accounts(id);
UPDATE lead_journal j SET account_id=l.account_id FROM leads l WHERE l.id=j.lead_id;
CREATE INDEX lead_journal_account_idx ON lead_journal(account_id,created_at);
CREATE FUNCTION crm_journal_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_id IS NULL THEN SELECT account_id INTO NEW.account_id FROM leads WHERE id=NEW.lead_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_journal_account_link BEFORE INSERT ON lead_journal FOR EACH ROW EXECUTE FUNCTION crm_journal_account();

-- Legacy lead business fields remain a transactionally maintained projection.
CREATE FUNCTION crm_lead_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.account_id IS NULL THEN
    SELECT id INTO NEW.account_id FROM crm_accounts WHERE source_lead_id=NEW.id;
    IF NEW.account_id IS NULL THEN
    INSERT INTO crm_accounts(source_lead_id,nombre,ciudad,telefono,email,sitio_web,url_gmap,perfil_instagram,perfil_facebook,perfil_airbnb,perfil_booking,perfil_turismo_entre_rios,assigned_user_email)
    VALUES(NEW.id,NEW.nombre,NEW.ciudad,NEW.telefono,NEW.email,NEW.sitio_web,NEW.url_gmap,NEW.perfil_instagram,NEW.perfil_facebook,NEW.perfil_airbnb,NEW.perfil_booking,NEW.perfil_turismo_entre_rios,NEW.assigned_user_email) RETURNING id INTO NEW.account_id;
    END IF;
  ELSIF TG_OP='INSERT' THEN
    SELECT nombre,ciudad,telefono,email,sitio_web,url_gmap,perfil_instagram,perfil_facebook,perfil_airbnb,perfil_booking,perfil_turismo_entre_rios
    INTO NEW.nombre,NEW.ciudad,NEW.telefono,NEW.email,NEW.sitio_web,NEW.url_gmap,NEW.perfil_instagram,NEW.perfil_facebook,NEW.perfil_airbnb,NEW.perfil_booking,NEW.perfil_turismo_entre_rios FROM crm_accounts WHERE id=NEW.account_id;
  ELSIF pg_trigger_depth()=1 AND ROW(NEW.nombre,NEW.ciudad,NEW.telefono,NEW.email,NEW.sitio_web,NEW.url_gmap,NEW.perfil_instagram,NEW.perfil_facebook,NEW.perfil_airbnb,NEW.perfil_booking,NEW.perfil_turismo_entre_rios)
      IS DISTINCT FROM ROW(OLD.nombre,OLD.ciudad,OLD.telefono,OLD.email,OLD.sitio_web,OLD.url_gmap,OLD.perfil_instagram,OLD.perfil_facebook,OLD.perfil_airbnb,OLD.perfil_booking,OLD.perfil_turismo_entre_rios) THEN
    UPDATE crm_accounts SET nombre=NEW.nombre,ciudad=NEW.ciudad,telefono=NEW.telefono,email=NEW.email,sitio_web=NEW.sitio_web,url_gmap=NEW.url_gmap,perfil_instagram=NEW.perfil_instagram,perfil_facebook=NEW.perfil_facebook,perfil_airbnb=NEW.perfil_airbnb,perfil_booking=NEW.perfil_booking,perfil_turismo_entre_rios=NEW.perfil_turismo_entre_rios,updated_at=now() WHERE id=NEW.account_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_lead_account_link BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION crm_lead_account();
CREATE TRIGGER crm_lead_account_update AFTER UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION crm_lead_account();
CREATE FUNCTION crm_account_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE leads SET nombre=NEW.nombre,ciudad=NEW.ciudad,telefono=NEW.telefono,email=NEW.email,sitio_web=NEW.sitio_web,url_gmap=NEW.url_gmap,perfil_instagram=NEW.perfil_instagram,perfil_facebook=NEW.perfil_facebook,perfil_airbnb=NEW.perfil_airbnb,perfil_booking=NEW.perfil_booking,perfil_turismo_entre_rios=NEW.perfil_turismo_entre_rios,updated_at=now()
  WHERE account_id=NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_account_projection_sync AFTER UPDATE OF nombre,ciudad,telefono,email,sitio_web,url_gmap,perfil_instagram,perfil_facebook,perfil_airbnb,perfil_booking,perfil_turismo_entre_rios ON crm_accounts FOR EACH ROW EXECUTE FUNCTION crm_account_projection();

INSERT INTO app_settings(key,value) VALUES('crm_opportunity_stages','["Cargado","Filtrado","1er contacto","En tratativas","Suscripto","Promocionado a Leandro","Rechazado","No interesado","Re contactar mas adelante"]') ON CONFLICT(key) DO NOTHING;
-- Reuse the existing Live Mode function for the new commercial tables.

CREATE TRIGGER crm_accounts_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_accounts FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_contacts_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_contacts FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_commercial_journal_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_commercial_journal FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();

CREATE FUNCTION crm_lead_person() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE person_id bigint; has_primary boolean;
BEGIN
  IF nullif(btrim(NEW.contact_name),'') IS NOT NULL THEN
    PERFORM id FROM crm_accounts WHERE id=NEW.account_id FOR UPDATE;
    SELECT EXISTS(SELECT 1 FROM crm_contacts WHERE account_id=NEW.account_id AND is_primary AND deleted_at IS NULL) INTO has_primary;
    INSERT INTO crm_contacts(account_id,source_lead_id,name,phone,email,preferred_channel,is_primary,deleted_at)
    VALUES(NEW.account_id,NEW.id,NEW.contact_name,NEW.telefono,NEW.email,NEW.medio_contacto_preferido,NOT has_primary,NEW.deleted_at)
    ON CONFLICT(source_lead_id) DO NOTHING RETURNING id INTO person_id;
    IF NEW.primary_contact_id IS NULL AND NEW.deleted_at IS NULL AND person_id IS NOT NULL THEN
      UPDATE leads SET primary_contact_id=person_id WHERE id=NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_lead_person_link AFTER INSERT ON leads FOR EACH ROW EXECUTE FUNCTION crm_lead_person();
