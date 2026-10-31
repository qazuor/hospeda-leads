import {describe,it,expect} from 'vitest';
import {Kysely,PostgresAdapter,PostgresIntrospector,PostgresQueryCompiler} from 'kysely';
import {CONTACT_EVIDENCE_OUTCOMES,CONTACT_EVIDENCE_STATUSES,lastContactByAccountSql,contactEvidenceEventPredicate,isContactEvidence} from './contactEvidence';
const k=new Kysely<unknown>({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>({init:async()=>{},acquireConnection:async()=>{throw new Error('unused')},beginTransaction:async()=>{},commitTransaction:async()=>{},rollbackTransaction:async()=>{},releaseConnection:async()=>{},destroy:async()=>{}}),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()}});
describe('contact evidence',()=>{
 it('walks every outcome and status from section 4',()=>{
  const outcomes=['no_answer','interested','later','replied','not_interested','do_not_contact','other','delivered','needs_help','awaiting_confirmation','care_completed'];
  const statuses=['manual_sent','accepted','delivery_confirmed','replied','rejected','draft','cancelled','voided','whatsapp_opened','instagram_opened','manual_pending','manual_not_done','submitting','unknown','failed'];
  expect(CONTACT_EVIDENCE_OUTCOMES).toEqual(outcomes.filter(x=>x!=='no_answer'));
  expect(CONTACT_EVIDENCE_STATUSES).toEqual(['manual_sent','accepted','delivery_confirmed','replied','rejected']);
  for(const status of statuses)expect(CONTACT_EVIDENCE_STATUSES.includes(status as typeof CONTACT_EVIDENCE_STATUSES[number])).toBe(['manual_sent','accepted','delivery_confirmed','replied','rejected'].includes(status));
  for(const outcome of outcomes)expect(isContactEvidence({kind:'activity',outcome})).toBe(outcome!=='no_answer');
  for(const status of statuses)expect(isContactEvidence({kind:'message',status})).toBe(['manual_sent','accepted','delivery_confirmed','replied','rejected'].includes(status));
  for(const status of ['pending_review','registered','dismissed','voided']){
   expect(isContactEvidence({kind:'inbound',status,isAutomatic:false})).toBe(['pending_review','registered'].includes(status));
   expect(isContactEvidence({kind:'inbound',status,isAutomatic:true})).toBe(false);
  }
  expect(isContactEvidence({kind:'activity',outcome:null})).toBe(true);
  expect(isContactEvidence({kind:'activity',outcome:null,messageStatus:'no_linked_message'})).toBe(true);expect(isContactEvidence({kind:'activity',outcome:'no_answer',messageStatus:'no_linked_message'})).toBe(false);
  expect(isContactEvidence({kind:'activity',outcome:null,messageStatus:null})).toBe(false);
  for(const status of ['manual_sent','accepted','delivery_confirmed','replied','rejected'])expect(isContactEvidence({kind:'activity',outcome:null,messageStatus:status})).toBe(true);
  for(const status of ['draft','cancelled','voided','whatsapp_opened','instagram_opened','manual_pending','manual_not_done','submitting','unknown','failed'])expect(isContactEvidence({kind:'activity',outcome:'replied',messageStatus:status})).toBe(false);
  expect(isContactEvidence({kind:'activity',outcome:'replied',messageStatus:null})).toBe(false);
  expect(isContactEvidence({kind:'activity',outcome:null,messageStatus:'voided'})).toBe(false);
  const predicate=contactEvidenceEventPredicate().compile(k).sql;
  expect(predicate).toContain('outcome IS NULL');expect(predicate).toContain("kind='inbound'");expect(predicate).not.toContain("kind='communication'");
 });
 it('builds a set based aggregate with linked and legacy activity rules',()=>{
  const query=lastContactByAccountSql().compile(k);
  expect(query.sql).toContain('UNION ALL');expect(query.sql).toContain('crm_communication_responses');
  expect(query.sql).toContain("status IN ('pending_review','registered')");expect(query.sql).toContain('GROUP BY account_id');
  expect(query.sql).toContain('i.is_automatic=false');expect(query.sql).toContain('outcome IS NULL');expect(query.sql).toContain('no_answer');
  expect(query.sql).toContain('LEFT JOIN crm_messages');expect(query.sql).not.toContain('NOT EXISTS');expect(query.sql).not.toMatch(/SELECT[^)]*task_id\s*=\s*t\.id/is);
  expect(query.sql).not.toContain('whatsapp_opened');
 });
});
