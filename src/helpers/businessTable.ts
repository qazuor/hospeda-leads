import { sql } from "kysely";
import type { Leads } from "./schema";

// A read projection only: leads remain the sole source of opportunity stages.
// A candidate is an opportunity (active by default), or a business that has never had one.
// Existing filters run on candidates before businesses are deduplicated.
export const businessTableSource = (includeDeleted=false) => sql<Leads>`(
  select (jsonb_populate_record(null::leads,
    coalesce(to_jsonb(l), '{}'::jsonb) || jsonb_build_object(
      'id', coalesce(l.id, -a.id), 'account_id', a.id,
      'nombre', a.nombre, 'ciudad', a.ciudad, 'telefono', a.telefono,
      'email', a.email, 'sitio_web', a.sitio_web, 'url_gmap', a.url_gmap,
      'perfil_instagram', a.perfil_instagram, 'perfil_facebook', a.perfil_facebook,
      'perfil_airbnb', a.perfil_airbnb, 'perfil_booking', a.perfil_booking,
      'perfil_turismo_entre_rios', a.perfil_turismo_entre_rios,
      'assigned_user_email', a.assigned_user_email,
      'created_at', a.created_at, 'updated_at', a.updated_at,
      'fecha_creacion', coalesce(l.fecha_creacion, a.created_at)
    )
  )).*
  from crm_accounts a
  left join leads l on l.account_id = a.id and (${includeDeleted} or l.deleted_at is null)
  where l.id is not null or (
    not exists (select 1 from leads history where history.account_id = a.id)
    and not exists (select 1 from lead_journal history where history.account_id = a.id)
  )
)`;
