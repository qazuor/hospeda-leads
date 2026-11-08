export const REQUIRED_MCP_TABLES = Object.freeze([
  'crm_accounts','crm_contacts','leads','crm_verticals','crm_subtypes',
  'crm_account_classifications','crm_account_seller_groups','crm_account_seller_group_members',
  'crm_commercial_journal',
  {table:'crm_stages',columns:['name','display_name','active','management_type','classification','sort_order']},
  {table:'crm_management_reasons',columns:['management_type','outcome_key','reason_key','name','active']},
  {table:'users',columns:['id','display_name','role','deactivated_at']},
  {table:'lead_journal',columns:['id','lead_id','action','field_name','old_value','new_value','created_at','actor_name']}
]);
