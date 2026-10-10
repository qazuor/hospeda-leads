import { sql } from "kysely";
import type { Leads } from "./schema";

// A read projection only: leads remain the sole source of opportunity stages.
// Businesses remain visible when all their opportunities have been removed.
// Existing filters run on candidates before businesses are deduplicated.
export const businessTableSource = (includeDeleted=false) => sql<Leads>`(
  select (jsonb_populate_record(null::leads,
    coalesce(to_jsonb(l), '{}'::jsonb) || jsonb_build_object(
      'id', coalesce(l.id, -a.id), 'account_id', a.id, 'deleted_at', a.deleted_at,
      'tipo', a.tipo, 'subtipo', a.subtipo,
      'origen', coalesce(a.origin,l.origen), 'fuente_referencia', coalesce(a.source_reference,l.fuente_referencia),
      'estado', coalesce(l.estado,CASE WHEN a.review_status='filtered' THEN 'Filtrado' END),
      'suscripcion', coalesce(l.suscripcion,a.subscription_label),
      'nombre', a.nombre, 'ciudad', a.ciudad, 'telefono', a.telefono,
      'email', a.email, 'sitio_web', a.sitio_web, 'url_gmap', a.url_gmap,
      'perfil_instagram', a.perfil_instagram, 'perfil_facebook', a.perfil_facebook,
      'perfil_airbnb', a.perfil_airbnb, 'perfil_booking', a.perfil_booking,
      'perfil_turismo_entre_rios', a.perfil_turismo_entre_rios,
      'assigned_user_email', a.assigned_user_email,
      'created_at', a.created_at, 'updated_at', a.updated_at,
      'fecha_creacion', coalesce(l.fecha_creacion, a.created_at),
      'contact_name', coalesce((select c.name from crm_contacts c where c.account_id=a.id and c.deleted_at is null order by c.is_primary desc,c.id limit 1),l.contact_name),
      'fecha_proxima_accion', (select min(t.due_date) from crm_tasks t left join leads tl on tl.id=t.lead_id where t.account_id=a.id and t.status='pending' and t.deleted_at is null and (t.lead_id is null or tl.deleted_at is null)),
      'fecha_ultimo_contacto', coalesce((select max(ac.occurred_at) from crm_activities ac left join leads al on al.id=ac.lead_id where ac.account_id=a.id and ac.deleted_at is null and (ac.lead_id is null or al.deleted_at is null)),l.fecha_ultimo_contacto)

    )
  )).*
  from crm_accounts a
  left join leads l on l.account_id = a.id and l.deleted_at is null
  where a.merged_into_id is null and a.archived_at is null and (${includeDeleted} or a.deleted_at is null)
)`;
