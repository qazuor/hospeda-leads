import {sql,type RawBuilder} from 'kysely';

/** Every completed activity outcome except an unanswered attempt. */
export const CONTACT_EVIDENCE_OUTCOMES=['interested','later','replied','not_interested','do_not_contact','other','delivered','needs_help','awaiting_confirmation','care_completed'] as const;
/** Message states that prove communication took place. */
export const CONTACT_EVIDENCE_STATUSES=['manual_sent','accepted','delivery_confirmed','replied','rejected'] as const;
/** Set based latest-contact aggregate for the business projection. */
export function lastContactByAccountSql():RawBuilder<unknown>{
 return sql`(SELECT account_id,max(at) AS occurred_at FROM (
  SELECT m.account_id,coalesce(m.last_interaction_at,m.created_at) AS at FROM crm_messages m LEFT JOIN leads ml ON ml.id=m.lead_id
   WHERE m.status=ANY(${[...CONTACT_EVIDENCE_STATUSES]}::text[]) AND (m.lead_id IS NULL OR ml.deleted_at IS NULL)
  UNION ALL
  SELECT r.account_id,r.occurred_at AS at FROM crm_communication_responses r LEFT JOIN leads rl ON rl.id=r.lead_id WHERE r.lead_id IS NULL OR rl.deleted_at IS NULL
  UNION ALL
  SELECT i.account_id,i.received_at AS at FROM crm_inbound_messages i LEFT JOIN leads il ON il.id=i.lead_id WHERE i.status IN ('pending_review','registered') AND i.is_automatic=false AND (i.lead_id IS NULL OR il.deleted_at IS NULL)
  UNION ALL
  SELECT a.account_id,a.occurred_at AS at FROM crm_activities a LEFT JOIN leads al ON al.id=a.lead_id LEFT JOIN crm_messages am ON am.activity_id=a.id
   WHERE a.deleted_at IS NULL AND (a.lead_id IS NULL OR al.deleted_at IS NULL) AND (
    (am.id IS NULL AND (a.outcome IS NULL OR a.outcome<>'no_answer')) OR (am.id IS NOT NULL AND am.status=ANY(${[...CONTACT_EVIDENCE_STATUSES]}::text[]))
   )
 ) evidence GROUP BY account_id)`;
}

/** Shared predicate for the history event CTE; only inbound message rows provide inbound evidence. */
export function contactEvidenceEventPredicate():RawBuilder<unknown>{
 return sql`(
  (kind='message' AND message_status=ANY(${[...CONTACT_EVIDENCE_STATUSES,'userscript_sent','instagram_sent']}::text[]))
  OR (kind='inbound' AND message_status IN ('pending_review','registered'))
  OR (kind='activity' AND ((message_status IS NOT NULL AND message_status=ANY(${[...CONTACT_EVIDENCE_STATUSES,'userscript_sent','instagram_sent']}::text[])) OR (message_status='no_linked_message' AND outcome IS NOT NULL AND outcome<>'no_answer') OR (message_status='no_linked_message' AND outcome IS NULL)))
  OR kind='response'
 )`;
}

export const contactEvidenceStatuses=CONTACT_EVIDENCE_STATUSES;
export const contactEvidenceOutcomes=CONTACT_EVIDENCE_OUTCOMES;
/**
 * Pure mirror of section 4, used to table-test every event boundary. For an activity, `messageStatus` follows the history SQL:
 * omitted or `'no_linked_message'` means no linked message; `null` means a linked message that is hidden (draft, cancelled, voided).
 */
export function isContactEvidence(event:{kind:'message';status:string}|{kind:'inbound';status:string;isAutomatic:boolean}|{kind:'activity';outcome:string|null;messageStatus?:string|null}|{kind:'response'}):boolean{
 if(event.kind==='message')return (CONTACT_EVIDENCE_STATUSES as readonly string[]).includes(event.status);
 if(event.kind==='inbound')return !event.isAutomatic&&['pending_review','registered'].includes(event.status);
 if(event.kind==='response')return true;
 if(event.messageStatus!==undefined&&event.messageStatus!=='no_linked_message')return event.messageStatus!==null&&(CONTACT_EVIDENCE_STATUSES as readonly string[]).includes(event.messageStatus);
 return event.outcome==null||(CONTACT_EVIDENCE_OUTCOMES as readonly string[]).includes(event.outcome);
}
