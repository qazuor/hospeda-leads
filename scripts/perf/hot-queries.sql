-- SQL snapshots for representative hot paths. Real SQL captured via log_statement=all on the synthetic DB (parameters inlined as literals). Refresh from local synthetic query logs when schema/query plans change.
-- query: business projection count
select count(distinct "account_id") as "count" from (
	  select (jsonb_populate_record(null::leads,
	    coalesce(to_jsonb(l), '{}'::jsonb) || jsonb_build_object(
	      'id', coalesce(l.id, -a.id), 'account_id', a.id, 'deleted_at', a.deleted_at,
	      'tipo', a.tipo, 'subtipo', a.subtipo,
	      'origen', coalesce(a.origin,l.origen), 'fuente_referencia', coalesce(a.source_reference,l.fuente_referencia),
	      'estado', l.estado,
	      'business_status', a.status,
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
	  )).*, a.status AS business_status
	  from crm_accounts a
	  left join leads l on l.account_id = a.id and l.deleted_at is null
	  where a.merged_into_id is null and a.archived_at is null and (false or a.deleted_at is null)
	) as "leads" where "deleted_at" is null;
-- query: business projection page
select * from (select distinct on ("account_id") * from (
	  select (jsonb_populate_record(null::leads,
	    coalesce(to_jsonb(l), '{}'::jsonb) || jsonb_build_object(
	      'id', coalesce(l.id, -a.id), 'account_id', a.id, 'deleted_at', a.deleted_at,
	      'tipo', a.tipo, 'subtipo', a.subtipo,
	      'origen', coalesce(a.origin,l.origen), 'fuente_referencia', coalesce(a.source_reference,l.fuente_referencia),
	      'estado', l.estado,
	      'business_status', a.status,
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
	  )).*, a.status AS business_status
	  from crm_accounts a
	  left join leads l on l.account_id = a.id and l.deleted_at is null
	  where a.merged_into_id is null and a.archived_at is null and (false or a.deleted_at is null)
	) as "leads" where "deleted_at" is null order by "account_id", "id" asc) as "leads" order by "nombre" asc, "id" desc limit '50' offset '0';
-- query: distinct cities
SELECT DISTINCT ciudad FROM crm_accounts WHERE deleted_at IS NULL AND archived_at IS NULL AND merged_into_id IS NULL;
-- query: work day pending (today bucket)
select "t".*, "a"."nombre" as "account_name", "a"."ciudad" as "city", "l"."opportunity_name" from "crm_tasks" as "t" inner join "crm_accounts" as "a" on "a"."id" = "t"."account_id" left join "leads" as "l" on "l"."id" = "t"."lead_id" where "t"."deleted_at" is null and ("t"."lead_id" is null or "l"."deleted_at" is null) and "a"."deleted_at" is null and "t"."assigned_user_email" = 'admin@example.com' and "t"."status" = 'pending' and t.due_date = '2026-10-20' and ("t"."due_at" is null or "t"."due_at" >= '2026-10-20 06:45:58.091+00') order by CASE WHEN t.status='pending' THEN 0 ELSE 1 END, "t"."due_date", "t"."due_at", "t"."id" limit '25' offset '0';
-- query: work day overdue bucket
select "t".*, "a"."nombre" as "account_name", "a"."ciudad" as "city", "l"."opportunity_name" from "crm_tasks" as "t" inner join "crm_accounts" as "a" on "a"."id" = "t"."account_id" left join "leads" as "l" on "l"."id" = "t"."lead_id" where "t"."deleted_at" is null and ("t"."lead_id" is null or "l"."deleted_at" is null) and "a"."deleted_at" is null and "t"."assigned_user_email" = 'admin@example.com' and "t"."status" = 'pending' and (t.due_date < '2026-10-20' or "t"."due_at" < '2026-10-20 06:45:58.091+00') order by CASE WHEN t.status='pending' THEN 0 ELSE 1 END, "t"."due_date", "t"."due_at", "t"."id" limit '25' offset '0';
-- query: work day activity feed
select "t".*, "a"."nombre" as "account_name", "a"."ciudad" as "city" from "crm_activities" as "t" inner join "crm_accounts" as "a" on "a"."id" = "t"."account_id" left join "leads" as "l" on "l"."id" = "t"."lead_id" where "t"."deleted_at" is null and ("t"."lead_id" is null or "l"."deleted_at" is null) and "a"."deleted_at" is null and ("t"."actor_email" = 'admin@example.com' or exists (select "id" from "crm_tasks" where "crm_tasks"."id" = "t"."task_id" and "crm_tasks"."assigned_user_email" = 'admin@example.com') or "l"."assigned_user_email" = 'admin@example.com' or ("t"."lead_id" is null and "a"."assigned_user_email" = 'admin@example.com')) order by "t"."occurred_at" desc, "t"."id" desc limit '100' offset '0';
-- query: server user session lookup
SELECT s.id AS session_id, s.created_at, s.last_accessed, u.id, u.email, u.display_name, u.full_name, u.role, u.avatar_url
FROM sessions AS s INNER JOIN users AS u ON s.user_id = u.id
WHERE s.id = '00000000-0000-0000-0000-000000000000' LIMIT 1;
-- query: app settings live version contention observation
SELECT * FROM pg_stat_user_tables WHERE relname = 'app_settings';
