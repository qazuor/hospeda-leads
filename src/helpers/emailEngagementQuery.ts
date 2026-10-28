import {sql} from 'kysely';
import type {Executor} from './communicationService';
import {sanitizeEngagementLinks,type EmailEngagement} from './emailEngagement';

type Row={outboxId:string;deliveredAt:Date|null;firstOpenedAt:Date|null;openCount:number;firstProxyOpenedAt:Date|null;proxyOpenCount:number;firstClickedAt:Date|null;clickCount:number;links:string[]|null;spamAt:Date|null;lastEventAt:Date|null};

/**
 * Spec 93 §2.5: the Brevo events of the loaded emails, aggregated in ONE query by `outbox_id` (index
 * `crm_email_events_outbox (outbox_id, occurred_at)`, migration 010). Brevo may send both `opened` and `unique_opened` for
 * the first opening, so a count is `max(count(opened), min(count(unique_opened), 1))`; proxied opens are counted apart.
 * Read-only: the raw payload never leaves the server, clicked links are sanitized to text.
 */
export async function emailEngagementByOutbox(e:Executor,{outboxIds}:{outboxIds:readonly string[]}):Promise<Record<string,EmailEngagement>>{
 const ids=[...new Set(outboxIds.filter(id=>/^[1-9]\d*$/.test(id)))];
 if(!ids.length)return {};
 const rows=(await sql<Row>`SELECT outbox_id::text AS "outboxId",
  min(occurred_at) FILTER (WHERE event='delivered') AS "deliveredAt",
  min(occurred_at) FILTER (WHERE event IN ('opened','unique_opened')) AS "firstOpenedAt",
  greatest(count(*) FILTER (WHERE event='opened'),least(count(*) FILTER (WHERE event='unique_opened'),1))::int AS "openCount",
  min(occurred_at) FILTER (WHERE event IN ('proxy_open','unique_proxy_open')) AS "firstProxyOpenedAt",
  greatest(count(*) FILTER (WHERE event='proxy_open'),least(count(*) FILTER (WHERE event='unique_proxy_open'),1))::int AS "proxyOpenCount",
  min(occurred_at) FILTER (WHERE event='click') AS "firstClickedAt",
  count(*) FILTER (WHERE event='click')::int AS "clickCount",
  (array_agg(payload->>'link' ORDER BY occurred_at) FILTER (WHERE event='click' AND payload->>'link' IS NOT NULL))[1:20] AS links,
  min(occurred_at) FILTER (WHERE event='spam') AS "spamAt",
  max(occurred_at) AS "lastEventAt"
  FROM crm_email_events WHERE outbox_id=ANY(${ids}::bigint[]) GROUP BY outbox_id`.execute(e)).rows;
 return Object.fromEntries(rows.map(({outboxId,links,...row})=>[outboxId,{...row,clickedLinks:sanitizeEngagementLinks({links:links??[]})}]));
}
