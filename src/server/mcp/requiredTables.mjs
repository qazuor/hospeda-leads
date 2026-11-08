export const REQUIRED_MCP_TABLES = Object.freeze([
  'crm_accounts','crm_contacts','leads','crm_verticals','crm_subtypes',
  'crm_account_classifications','crm_account_seller_groups','crm_account_seller_group_members',
  'crm_commercial_journal',
  {table:'crm_tasks',columns:['id','account_id','lead_id','title','type_id','assigned_user_email','due_date','due_at','status','deleted_at']},
  {table:'crm_work_types',columns:['id','name']},
  {table:'crm_messages',columns:['id','account_id','lead_id','contact_id','channel','status','last_interaction_at','created_at','last_actor_email','text_body','body']},
  {table:'crm_communication_responses',columns:['id','account_id','lead_id','contact_id','channel','category','summary','exact_text','other_detail','actor_email','occurred_at']},
  {table:'crm_inbound_messages',columns:['id','account_id','lead_id','contact_id','channel','status','received_at','subject','text_body','attachments']},
  {table:'crm_stages',columns:['name','display_name','active','management_type','classification','sort_order']},
  {table:'crm_management_reasons',columns:['management_type','outcome_key','reason_key','name','active']},
  {table:'users',columns:['id','display_name','role','deactivated_at','email']},
  {table:'lead_journal',columns:['id','lead_id','action','field_name','old_value','new_value','created_at','actor_name']}
]);
