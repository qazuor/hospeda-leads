import {describe,it,expect} from 'vitest';
import {BUSINESS_PROJECTION_LEAD_COLUMNS,businessProjectionColumns} from './businessTable';

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
    expect(byAlias.fecha_ultimo_contacto).toBe('coalesce(la.occurred_at,l.fecha_ultimo_contacto)::date');
  });
});
