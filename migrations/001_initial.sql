CREATE TYPE lead_priority AS ENUM ('alta','media','baja');
CREATE TYPE user_role AS ENUM ('user','admin');

CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE authorized_emails (
  id bigserial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crm_cities (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crm_subtypes (
  id bigserial PRIMARY KEY,
  type_name text,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(type_name,name)
);

CREATE TABLE crm_verticals (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_url text,
  role user_role NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE user_passwords (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  last_accessed timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE login_attempts (
  id serial PRIMARY KEY,
  email varchar NOT NULL,
  attempted_at timestamp DEFAULT CURRENT_TIMESTAMP,
  success boolean DEFAULT false
);

CREATE TABLE leads (
  id bigserial PRIMARY KEY,
  nombre text NOT NULL,
  tipo text,
  subtipo text,
  ciudad text,
  estado text,
  suscripcion text,
  email text,
  telefono text,
  sitio_web text,
  url_gmap text,
  perfil_instagram text,
  perfil_facebook text,
  perfil_airbnb text,
  perfil_booking text,
  perfil_turismo_entre_rios text,
  origen text,
  quien_cargo text,
  asignado_a text,
  fecha_creacion date,
  fecha_ultimo_contacto date,
  medio_contacto_preferido text,
  resultado_ultimo_contacto text,
  prioridad lead_priority,
  fecha_proxima_accion date,
  fuente_referencia text,
  cliente_potencial_recurrente boolean NOT NULL DEFAULT false,
  archivo_adjunto text,
  notas text,
  creado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  contact_name text,
  deleted_at timestamptz,
  deleted_by_user_id integer,
  deleted_by_email text,
  deleted_by_name text,
  assigned_user_email text REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL,
  commercial_profile text
);

CREATE TABLE lead_notes (
  id bigserial PRIMARY KEY,
  lead_id bigint NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  note text NOT NULL,
  author text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lead_journal (
  id bigserial PRIMARY KEY,
  lead_id bigint,
  lead_name text NOT NULL,
  actor_user_id integer,
  actor_email text,
  actor_name text NOT NULL,
  action text NOT NULL,
  field_name text,
  old_value text,
  new_value text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  lead_city text,
  lead_type text
);

CREATE TABLE message_templates (
  id bigserial PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  name text NOT NULL,
  subject text,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  vertical text,
  commercial_profile text,
  UNIQUE(channel,name)
);

CREATE TABLE email_outbox (
  id bigserial PRIMARY KEY,
  lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
  template_id bigint REFERENCES message_templates(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  sender_email text NOT NULL,
  sender_name text NOT NULL,
  reply_to_email text,
  reply_to_name text,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  message_id text,
  last_error text,
  requested_by_user_id integer,
  requested_by_email text,
  requested_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX leads_asignado_idx ON leads(asignado_a);
CREATE INDEX leads_assigned_user_email_idx ON leads(assigned_user_email);
CREATE INDEX leads_ciudad_idx ON leads(ciudad);
CREATE INDEX leads_commercial_profile_idx ON leads(commercial_profile);
CREATE INDEX leads_deleted_at_idx ON leads(deleted_at);
CREATE INDEX leads_estado_idx ON leads(estado);
CREATE INDEX leads_nombre_idx ON leads USING gin(to_tsvector('simple',coalesce(nombre,'')));
CREATE INDEX leads_prioridad_idx ON leads(prioridad);
CREATE INDEX leads_proxima_accion_idx ON leads(fecha_proxima_accion);
CREATE INDEX leads_tipo_idx ON leads(tipo);
CREATE INDEX lead_notes_lead_idx ON lead_notes(lead_id);
CREATE INDEX lead_notes_lead_id_created_at_idx ON lead_notes(lead_id,created_at DESC);
CREATE INDEX lead_journal_actor_email_idx ON lead_journal(actor_email,created_at DESC);
CREATE INDEX lead_journal_created_idx ON lead_journal(created_at DESC);
CREATE INDEX lead_journal_lead_city_idx ON lead_journal(lead_city,created_at DESC);
CREATE INDEX lead_journal_lead_created_idx ON lead_journal(lead_id,created_at DESC);
CREATE INDEX lead_journal_lead_type_idx ON lead_journal(lead_type,created_at DESC);
CREATE INDEX message_templates_target_idx ON message_templates(channel,vertical,commercial_profile) WHERE active=true;
CREATE INDEX email_outbox_lead_idx ON email_outbox(lead_id,created_at DESC);
CREATE INDEX email_outbox_status_idx ON email_outbox(status,created_at DESC);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX login_attempts_cleanup_idx ON login_attempts(attempted_at) WHERE attempted_at IS NOT NULL;
CREATE INDEX login_attempts_email_fail_idx ON login_attempts(lower(email),attempted_at DESC) WHERE success=false;

CREATE OR REPLACE FUNCTION bump_crm_live_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO app_settings(key,value,updated_at)
  VALUES ('crm_live_version',extract(epoch from clock_timestamp())::text,clock_timestamp())
  ON CONFLICT(key) DO UPDATE
    SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at;
  RETURN NULL;
END;
$$;

CREATE TRIGGER leads_live_version AFTER INSERT OR UPDATE OR DELETE ON leads FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER lead_notes_live_version AFTER INSERT OR UPDATE OR DELETE ON lead_notes FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER lead_journal_live_version AFTER INSERT OR UPDATE OR DELETE ON lead_journal FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER message_templates_live_version AFTER INSERT OR UPDATE OR DELETE ON message_templates FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_cities_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_cities FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_subtypes_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_subtypes FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_verticals_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_verticals FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER authorized_emails_live_version AFTER INSERT OR UPDATE OR DELETE ON authorized_emails FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER users_live_version AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER email_outbox_live_version AFTER INSERT OR UPDATE OR DELETE ON email_outbox FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();

INSERT INTO app_settings(key,value) VALUES
  ('crm_live_version',extract(epoch from clock_timestamp())::text),
  ('brevo_sender_name','Hospeda'),
  ('brevo_sender_email','notificaciones@hospeda.com.ar'),
  ('brevo_reply_to_email','contacto@hospeda.com.ar')
ON CONFLICT(key) DO NOTHING;
