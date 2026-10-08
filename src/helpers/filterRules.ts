import type { AdvancedFilterGroup, AdvancedFilterRule } from '../endpoints/leads_GET.schema';

export type FilterFieldKind = 'category' | 'text' | 'date' | 'boolean' | 'number' | 'notes';
export type FilterFieldDefinition = { key: AdvancedFilterRule['field']; label: string; kind: FilterFieldKind; options?: { value: string; label: string }[] };
export const operatorLabels: Record<AdvancedFilterRule['operator'], string> = {
  eq: 'es', neq: 'no es', contains: 'contiene', not_contains: 'no contiene', empty: 'sin valor', not_empty: 'con valor',
  gte: 'mayor o igual', lte: 'menor o igual', between: 'entre', before: 'antes de', after: 'después de', on: 'en la fecha', is_true: 'sí', is_false: 'no',
};
export function operatorsFor(kind: FilterFieldKind): AdvancedFilterRule['operator'][] {
  if (kind === 'category') return ['eq', 'neq', 'empty', 'not_empty'];
  if (kind === 'date') return ['on', 'before', 'after', 'between', 'empty', 'not_empty'];
  if (kind === 'boolean') return ['is_true', 'is_false'];
  if (kind === 'number') return ['eq', 'gte', 'lte', 'between'];
  return ['contains', 'not_contains', 'eq', 'neq', 'empty', 'not_empty'];
}
export const needsValue = (operator: AdvancedFilterRule['operator']) => !['empty', 'not_empty', 'is_true', 'is_false'].includes(operator);
export const makeRule = (field: FilterFieldDefinition): AdvancedFilterRule => ({ field: field.key, operator: operatorsFor(field.kind)[0], value: '', value2: '' });
/** Replace/remove one alternative without flattening the surrounding AND/OR expression. */
export function changeFilterRule(groups: AdvancedFilterGroup[], groupIndex: number, ruleIndex: number, next: AdvancedFilterRule | null): AdvancedFilterGroup[] {
  return groups.flatMap((group, index) => {
    if (index !== groupIndex) return [group];
    const rules = group.rules.flatMap((rule, i) => i !== ruleIndex ? [rule] : next ? [next] : []);
    return rules.length ? [{ rules }] : [];
  });
}
export function describeFilterRule(rule: AdvancedFilterRule, fields: FilterFieldDefinition[]) {
  const field = fields.find(f => f.key === rule.field);
  const value = field?.options?.find(o => o.value === rule.value)?.label ?? rule.value ?? '';
  const label = `${field?.label ?? rule.field} ${operatorLabels[rule.operator]}`;
  return !needsValue(rule.operator) ? label : rule.operator === 'between' ? `${label} ${value} y ${rule.value2 ?? ''}` : `${label} ${value}`;
}
