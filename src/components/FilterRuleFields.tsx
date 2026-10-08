import type { ReactNode } from 'react';
import type { AdvancedFilterRule } from '../endpoints/leads_GET.schema';
import { makeRule, needsValue, operatorsFor, operatorLabels, type FilterFieldDefinition } from '../helpers/filterRules';
import { Input } from './Input';
import { NativeSelect } from './NativeSelect';

export function FilterRuleFields({ rule, fields, onChange, labelled = false }: { rule: AdvancedFilterRule; fields: FilterFieldDefinition[]; onChange: (rule: AdvancedFilterRule) => void; labelled?: boolean }) {
  const field = fields.find(f => f.key === rule.field);
  if (!field) return <p role="alert">Este campo ya no está disponible. Podés quitar la condición.</p>;
  const options = operatorsFor(field.kind);
  const wrap = (label: string, control: ReactNode) => labelled ? <label>{label}{control}</label> : control;
  const inputType = field.kind === 'date' ? 'date' : 'text';
  return <>
    {wrap('Campo', <NativeSelect aria-label="Campo del filtro" value={rule.field} onChange={e => { const next = fields.find(f => f.key === e.target.value); if (next) onChange(makeRule(next)); }}>{fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</NativeSelect>)}
    {wrap('Condición', <NativeSelect aria-label="Condición del filtro" value={rule.operator} onChange={e => { const operator = e.target.value as AdvancedFilterRule['operator']; onChange({ ...rule, operator, value: needsValue(operator) ? rule.value : '', value2: operator === 'between' ? rule.value2 : '' }); }}>
      {!options.includes(rule.operator) && <option value={rule.operator}>{operatorLabels[rule.operator]}</option>}{options.map(o => <option key={o} value={o}>{operatorLabels[o]}</option>)}
    </NativeSelect>)}
    {needsValue(rule.operator) && wrap(rule.operator === 'between' ? 'Desde' : 'Valor', field.kind === 'category' ? <NativeSelect aria-label="Valor del filtro" value={rule.value ?? ''} onChange={e => onChange({ ...rule, value: e.target.value })}>
      <option value="">Elegir valor…</option>{rule.value && !field.options?.some(o => o.value === rule.value) && <option value={rule.value}>{rule.value}</option>}{field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </NativeSelect> : <Input aria-label="Valor del filtro" type={inputType} inputMode={field.kind === 'number' ? 'numeric' : undefined} value={rule.value ?? ''} onChange={e => onChange({ ...rule, value: e.target.value })} placeholder="Valor…" />)}
    {rule.operator === 'between' && wrap('Hasta', <Input aria-label="Hasta del filtro" type={inputType} inputMode={field.kind === 'number' ? 'numeric' : undefined} value={rule.value2 ?? ''} onChange={e => onChange({ ...rule, value2: e.target.value })} />)}
  </>;
}
