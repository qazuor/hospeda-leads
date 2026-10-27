-- Spec 89 F2 review: counted visits to a public share link (technical_access_count / last_technical_access_at) are technical noise.
-- They must not write actor-less rows to crm_resource_journal (they would show in the business history) nor bump the live version
-- (they would wake every CRM tab). INSERT and DELETE keep the 046 behaviour; UPDATE fires only when something other than the two counters changed
-- (revoke, sent_version, attach, ...). A WHEN clause cannot reference OLD/NEW on a statement-level trigger, so the UPDATE live trigger is row-level.
DROP TRIGGER resource_audit ON crm_sales_material_shares;
DROP TRIGGER resource_live ON crm_sales_material_shares;
CREATE TRIGGER resource_audit AFTER INSERT OR DELETE ON crm_sales_material_shares FOR EACH ROW EXECUTE FUNCTION crm_audit_resource();
CREATE TRIGGER resource_audit_update AFTER UPDATE ON crm_sales_material_shares FOR EACH ROW
 WHEN ((to_jsonb(OLD)-'technical_access_count'-'last_technical_access_at') IS DISTINCT FROM (to_jsonb(NEW)-'technical_access_count'-'last_technical_access_at'))
 EXECUTE FUNCTION crm_audit_resource();
CREATE TRIGGER resource_live AFTER INSERT OR DELETE ON crm_sales_material_shares FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE TRIGGER resource_live_update AFTER UPDATE ON crm_sales_material_shares FOR EACH ROW
 WHEN ((to_jsonb(OLD)-'technical_access_count'-'last_technical_access_at') IS DISTINCT FROM (to_jsonb(NEW)-'technical_access_count'-'last_technical_access_at'))
 EXECUTE FUNCTION bump_crm_live_domain('communication');
