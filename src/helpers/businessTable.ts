import { sql } from "kysely";
import type { Leads } from "./schema";
import { idSetSearchSql } from "./searchSql";

// Columns of the leads table in table order. The business projection returns
// exactly these columns plus business_status; scripts/test-commercial.ts
// fails when the leads table gains or loses a column without updating this list.
export const BUSINESS_PROJECTION_LEAD_COLUMNS=["id","nombre","tipo","subtipo","ciudad","estado","suscripcion","email","telefono","sitio_web","url_gmap","perfil_instagram","perfil_facebook","perfil_airbnb","perfil_booking","perfil_turismo_entre_rios","origen","quien_cargo","asignado_a","fecha_creacion","fecha_ultimo_contacto","medio_contacto_preferido","resultado_ultimo_contacto","prioridad","fecha_proxima_accion","fuente_referencia","cliente_potencial_recurrente","archivo_adjunto","notas","creado_por","created_at","updated_at","contact_name","deleted_at","deleted_by_user_id","deleted_by_email","deleted_by_name","assigned_user_email","commercial_profile","account_id","opportunity_name","primary_contact_id","service_interest","estimated_close_date","assigned_at","contact_baseline_date","contact_baseline_result","stage_since","pipeline_revision","reactivated_from_id","creation_request_key","creation_request_hash","management_type","referred_previous_stage","referred_previous_assigned_user_email","whatsapp","contact_phone","contact_email"] as const;

// Business values override the management row; every other column comes from the lead.
// Date overrides keep the former jsonb_populate_record semantics: a timestamptz
// becomes its calendar day in the session time zone.
const BUSINESS_OVERRIDES:Readonly<Partial<Record<typeof BUSINESS_PROJECTION_LEAD_COLUMNS[number],string>>>={
  id:"coalesce(l.id, -a.id)",account_id:"a.id",deleted_at:"a.deleted_at",tipo:"a.tipo",subtipo:"a.subtipo",
  origen:"coalesce(a.origin,l.origen)",fuente_referencia:"coalesce(a.source_reference,l.fuente_referencia)",
  suscripcion:"coalesce(l.suscripcion,a.subscription_label)",nombre:"a.nombre",ciudad:"a.ciudad",telefono:"a.telefono",
  email:"a.email",whatsapp:"a.whatsapp",contact_phone:"pc.phone",contact_email:"pc.email",sitio_web:"a.sitio_web",url_gmap:"a.url_gmap",perfil_instagram:"a.perfil_instagram",perfil_facebook:"a.perfil_facebook",
  perfil_airbnb:"a.perfil_airbnb",perfil_booking:"a.perfil_booking",perfil_turismo_entre_rios:"a.perfil_turismo_entre_rios",
  assigned_user_email:"a.assigned_user_email",created_at:"a.created_at",updated_at:"a.updated_at",
  fecha_creacion:"coalesce(l.fecha_creacion, a.created_at)::date",
  contact_name:"coalesce(pc.name,l.contact_name)",
  fecha_proxima_accion:"nt.due_date",
  fecha_ultimo_contacto:"coalesce(la.occurred_at,l.fecha_ultimo_contacto)::date",
};

/** One [column, SQL expression] pair per leads column, in table order. */
export const businessProjectionColumns=()=>BUSINESS_PROJECTION_LEAD_COLUMNS.map(column=>[column,BUSINESS_OVERRIDES[column]??`l.${column}`] as const);
const projectedColumns=businessProjectionColumns().map(([column,expression])=>`${expression} as ${column}`).join(", ");

// A read projection only: leads remain the sole source of opportunity stages.
// Businesses remain visible when all their opportunities have been removed.
// Existing filters run on candidates before businesses are deduplicated.
// Plain columns and set-based aggregates (no composite expansion, no correlated
// subqueries): filters, sort and count reuse each row's values, computed once.
export const businessTableSource = (includeDeleted=false) => sql<Leads>`(
  select ${sql.raw(projectedColumns)}, a.status AS business_status
  from crm_accounts a
  left join leads l on l.account_id = a.id and l.deleted_at is null
  left join (select distinct on (c.account_id) c.account_id, c.name, c.phone, c.email from crm_contacts c where c.deleted_at is null order by c.account_id, c.is_primary desc, c.id) pc on pc.account_id = a.id
  left join (select t.account_id, min(t.due_date) as due_date from crm_tasks t left join leads tl on tl.id=t.lead_id where t.status='pending' and t.deleted_at is null and (t.lead_id is null or tl.deleted_at is null) group by t.account_id) nt on nt.account_id = a.id
  left join (select ac.account_id, max(ac.occurred_at) as occurred_at from crm_activities ac left join leads al on al.id=ac.lead_id where ac.deleted_at is null and (ac.lead_id is null or al.deleted_at is null) group by ac.account_id) la on la.account_id = a.id
  where a.merged_into_id is null and a.archived_at is null and (${includeDeleted} or a.deleted_at is null)
)`;

/**
 * Free search (`q=`) of the business list over the projection aliased `leads`: the same matches as managementSearchSql
 * (leads_GET.ts: nombre, opportunity name, contact name, email, telefono, ciudad, origen, phone and the management's notes)
 * applied to the projection, but each column is read from its own table so the trigram indexes apply.
 * Each source mirrors BUSINESS_OVERRIDES: contact_name is coalesce(pc.name,l.contact_name), origen is coalesce(a.origin,l.origen).
 * scripts/test-search.ts compares it with the joined predicate on every projection row.
 */
export const businessSearchSql = (query: string) => idSetSearchSql([
  // nombre, email, telefono, ciudad and a.origin (a non-null origin wins the coalesce); telefono also as a phone number.
  { key: "leads.account_id", from: sql`crm_accounts s`, id: "s.id", columns: ["s.nombre", "s.email", "s.telefono", "s.ciudad", "s.origin"], phoneColumns: ["s.telefono"] },
  // The primary contact (the pc row of the projection) supplies contact_name when the business has any active contact.
  { key: "leads.account_id", from: sql`crm_contacts s`, id: "s.account_id", where: sql<boolean>`s.deleted_at is null and s.id = (select c.id from crm_contacts c where c.account_id = s.account_id and c.deleted_at is null order by c.is_primary desc, c.id limit 1)`, columns: ["s.name"] },
  { key: "leads.id", from: sql`leads s`, id: "s.id", columns: ["s.opportunity_name"] },
  // Without an active contact, the management's own contact_name.
  { key: "leads.id", from: sql`leads s`, id: "s.id", where: sql<boolean>`not exists (select 1 from crm_contacts c where c.account_id = s.account_id and c.deleted_at is null)`, columns: ["s.contact_name"] },
  // Without a business origin, the management's origen.
  { key: "leads.id", from: sql`leads s join crm_accounts sa on sa.id = s.account_id`, id: "s.id", where: sql<boolean>`sa.origin is null`, columns: ["s.origen"] },
  { key: "leads.id", from: sql`lead_notes s`, id: "s.lead_id", columns: ["s.note"], phoneColumns: ["s.note"] },
], query);
