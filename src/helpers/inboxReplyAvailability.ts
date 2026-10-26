import {sql} from 'kysely';

/** Shared reply predicates for communication and inbox inbound rows. */
export function inboxReplyAvailability(repliesAvailable:boolean,isAdmin:boolean,email:string){
 const canReply=sql<boolean>`(${repliesAvailable} AND i.channel='email' AND NOT i.is_automatic
  AND NOT EXISTS (
   SELECT 1 FROM email_outbox o
   WHERE o.inbound_message_id=i.id AND o.status IN ('submitting','unknown')
  )
  AND i.status IN ('pending_review','registered') AND a.archived_at IS NULL
  AND (${isAdmin} OR (i.lead_id IS NULL AND a.assigned_user_email=${email}) OR l.assigned_user_email=${email})
  AND (i.lead_id IS NULL OR EXISTS (
   SELECT 1 FROM crm_stages s WHERE s.name=l.estado AND s.classification='open'
  ))
  AND ((NOT a.do_not_contact AND NOT EXISTS (
   SELECT 1 FROM crm_contact_restrictions r
   WHERE r.account_id=a.id AND r.lifted_at IS NULL AND r.channel IN ('email','all')
    AND ((r.contact_id=i.contact_id AND i.contact_id IS NOT NULL)
     OR (r.contact_id IS NULL AND r.lead_id IS NULL)
     OR (r.contact_id IS NULL AND r.lead_id IS NOT DISTINCT FROM i.lead_id))
  )) OR (i.received_at>=greatest(
   coalesce((SELECT max(r.created_at) FROM crm_contact_restrictions r
    WHERE r.account_id=a.id AND r.lifted_at IS NULL AND r.channel IN ('email','all')
     AND ((r.contact_id=i.contact_id AND i.contact_id IS NOT NULL)
      OR (r.contact_id IS NULL AND r.lead_id IS NULL)
      OR (r.contact_id IS NULL AND r.lead_id IS NOT DISTINCT FROM i.lead_id))),'-infinity'::timestamptz),
   CASE WHEN a.do_not_contact THEN coalesce((SELECT max(j.created_at)
    FROM crm_communication_journal j WHERE j.entity_type='business' AND j.entity_id=a.id::text
     AND j.action='do_not_contact_activated'),a.updated_at) ELSE '-infinity'::timestamptz END
  ))))`;
 const replyRestricted=sql<boolean>`(a.do_not_contact OR EXISTS (
  SELECT 1 FROM crm_contact_restrictions r
  WHERE r.account_id=a.id AND r.lifted_at IS NULL AND r.channel IN ('email','all')
   AND ((r.contact_id=i.contact_id AND i.contact_id IS NOT NULL)
    OR (r.contact_id IS NULL AND r.lead_id IS NULL)
    OR (r.contact_id IS NULL AND r.lead_id IS NOT DISTINCT FROM i.lead_id))
 ))`;
 return {canReply,replyRestricted};
}
