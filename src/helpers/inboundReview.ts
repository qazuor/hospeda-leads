import {sql,type RawBuilder} from 'kysely';

/** Reply states that prove a CRM answer to a received message went out (the provider accepted it or more). */
const REPLY_EVIDENCE_STATUSES=['accepted','delivery_confirmed','replied'] as const;
const evidenceList=sql.join(REPLY_EVIDENCE_STATUSES.map(status=>sql.lit(status)));
const replies=(alias:string)=>sql`FROM crm_messages m JOIN email_outbox o ON o.id=m.outbox_id WHERE o.inbound_message_id=${sql.ref(`${alias}.id`)} AND m.status IN (${evidenceList})`;

/**
 * Spec 99 §3.5 (decision D4=A): a received message still waits for review («Por revisar») when it is `pending_review` and has
 * no CRM reply with evidence of sending. A `submitting`, `unknown` or `failed` reply does not count. Read-only: `status` never
 * changes, so answered history stops being «Por revisar» without any write. Shared by Comunicación, the Bandeja and Hoy.
 */
export function inboundAwaitingReviewSql(alias:string):RawBuilder<boolean>{
 return sql<boolean>`(${sql.ref(`${alias}.status`)}='pending_review' AND NOT EXISTS(SELECT 1 ${replies(alias)}))`;
}

/** When the first CRM reply with evidence of sending went out (null when none): the client labels «Respondido desde el CRM». */
export function inboundRepliedAtSql(alias:string):RawBuilder<Date|null>{
 return sql<Date|null>`(SELECT min(coalesce(o.sent_at,m.last_interaction_at,m.created_at)) ${replies(alias)})`;
}
