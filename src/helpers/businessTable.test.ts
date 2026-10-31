import {describe,it,expect} from 'vitest';
import {Kysely,PostgresAdapter,PostgresIntrospector,PostgresQueryCompiler} from 'kysely';
import {BUSINESS_PROJECTION_LEAD_COLUMNS,businessProjectionColumns,businessTableSource} from './businessTable';

const k=new Kysely<unknown>({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>({init:async()=>{},acquireConnection:async()=>{throw new Error('unused')},beginTransaction:async()=>{},commitTransaction:async()=>{},rollbackTransaction:async()=>{},releaseConnection:async()=>{},destroy:async()=>{}}),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()}});

describe('business projection columns',()=>{
  const expressions=businessProjectionColumns();
  it('selects every leads column once, in table order',()=>{
    expect(expressions.map(([alias])=>alias)).toEqual([...BUSINESS_PROJECTION_LEAD_COLUMNS]);
    expect(new Set(BUSINESS_PROJECTION_LEAD_COLUMNS).size).toBe(BUSINESS_PROJECTION_LEAD_COLUMNS.length);
  });
  it('takes business fields from the account and management fields from the lead',()=>{
    const byAlias=Object.fromEntries(expressions);
    expect(byAlias.id).toBe('coalesce(l.id, -a.id)');
    expect(byAlias.nombre).toBe('a.nombre');
    expect(byAlias.deleted_at).toBe('a.deleted_at');
    expect(byAlias.estado).toBe('l.estado');
    expect(byAlias.management_type).toBe('l.management_type');
    expect(byAlias.contact_name).toBe('coalesce(pc.name,l.contact_name)');
    expect(byAlias.fecha_ultimo_contacto).toBe('coalesce(lc.occurred_at,l.fecha_ultimo_contacto)::date');
  });
  it('uses the shared evidence aggregate instead of every activity timestamp',()=>{
    const query=businessTableSource().compile(k).sql;
    const parameters=businessTableSource().compile(k).parameters.flatMap(value=>Array.isArray(value)?value:[value]);
  expect(query).toContain('crm_messages');
  expect(query).toContain('LEFT JOIN crm_messages');
  expect(query).not.toContain('NOT EXISTS');
  expect(query).not.toContain('FROM crm_messages linked WHERE linked.activity_id');
    expect(parameters).toContain('manual_sent');
    expect(query).not.toContain('max(ac.occurred_at)');
  });
});
