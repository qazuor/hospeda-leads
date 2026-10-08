import { describe, expect, it } from 'vitest';
import { changeFilterRule, describeFilterRule } from './filterRules';
import type { AdvancedFilterGroup } from '../endpoints/leads_GET.schema';

const groups: AdvancedFilterGroup[] = [
  { rules: [{ field: 'ciudad', operator: 'eq', value: 'Colón' }, { field: 'ciudad', operator: 'eq', value: 'Concordia' }] },
  { rules: [{ field: 'tipo', operator: 'eq', value: 'Alojamientos' }] },
];
describe('editing applied filter expressions', () => {
  it('replaces one OR alternative without changing other groups or mutating the source', () => {
    const rule = { field: 'ciudad', operator: 'neq', value: 'Victoria' } as const;
    expect(changeFilterRule(groups, 0, 1, rule)).toEqual([{ rules: [groups[0].rules[0], rule] }, groups[1]]);
    expect(groups[0].rules[1].value).toBe('Concordia');
  });
  it('removes an alternative and drops only the block emptied by removal', () => {
    expect(changeFilterRule(groups, 0, 0, null)).toEqual([{ rules: [groups[0].rules[1]] }, groups[1]]);
    expect(changeFilterRule(groups, 1, 0, null)).toEqual([groups[0]]);
  });
  it('shows catalog labels, ranges and conditions with no value', () => {
    expect(describeFilterRule({ field: 'assignedUserEmail', operator: 'eq', value: 'a@example.com' }, [{ key: 'assignedUserEmail', kind: 'category', label: 'Responsable', options: [{ value: 'a@example.com', label: 'Ana' }] }])).toBe('Responsable es Ana');
    expect(describeFilterRule({ field: 'id', operator: 'between', value: '1', value2: '9' }, [])).toBe('id entre 1 y 9');
    expect(describeFilterRule({ field: 'ciudad', operator: 'empty' }, [{ key: 'ciudad', kind: 'category', label: 'Ciudad' }])).toBe('Ciudad sin valor');
  });
});
