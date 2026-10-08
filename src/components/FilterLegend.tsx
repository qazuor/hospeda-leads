import React, { useRef, useState } from 'react';
import { ActionIcon, UnstyledButton } from '@mantine/core';
import { Check, ChevronDown, X } from 'lucide-react';
import type { AdvancedFilterGroup, AdvancedFilterRule } from '../endpoints/leads_GET.schema';
import { changeFilterRule, describeFilterRule, needsValue, operatorLabels, type FilterFieldDefinition } from '../helpers/filterRules';
import { Button } from './Button';
import { Input } from './Input';
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from './Command';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import styles from './FilterLegend.module.css';

function FilterBadge({ rule, search, fields, onChange, onRemove }: {
  rule?: AdvancedFilterRule; search?: string; fields: FilterFieldDefinition[];
  onChange: (value: string, value2?: string) => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(rule?.value ?? search ?? ''), [value2, setValue2] = useState(rule?.value2 ?? '');
  const field = rule ? fields.find(f => f.key === rule.field) : undefined;
  const label = rule ? describeFilterRule(rule, fields) : `Texto libre contiene «${search?.trim()}»`;
  const editable = !rule || !!field && needsValue(rule.operator);
  const category = field?.kind === 'category' && rule?.operator !== 'between';
  const options = field?.options ?? [];
  const choices = rule?.value && !options.some(o => o.value === rule.value) ? [{ value: rule.value, label: rule.value }, ...options] : options;
  const selected = options.find(o => o.value === rule?.value)?.label ?? rule?.value;
  const valid = !!value.trim() && (rule?.operator !== 'between' || !!value2.trim());
  const display = rule ? needsValue(rule.operator) ? rule.operator === 'between' ? `${selected} – ${rule.value2 ?? ''}` : selected : operatorLabels[rule.operator] : search?.trim();
  const content = <><span className={styles.field}>{field?.label ?? rule?.field ?? 'Búsqueda'}</span>{rule && needsValue(rule.operator) && <span className={styles.operator}>{operatorLabels[rule.operator]}</span>}<span className={styles.value}>{display}</span>{editable && <ChevronDown size={13} aria-hidden="true" />}</>;
  const trigger = <UnstyledButton className={styles.trigger} aria-label={'Cambiar valor del filtro ' + label} title={label}>{content}</UnstyledButton>;
  return <div className={styles.badge}>
    {editable ? <Popover open={open} onOpenChange={next => { if (next) { setValue(rule?.value ?? search ?? ''); setValue2(rule?.value2 ?? ''); } setOpen(next); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent transitionDuration={0} removeBackgroundAndPadding className={styles.dropdown} aria-label={rule ? 'Elegir valor de ' + (field?.label ?? rule.field) : 'Editar búsqueda aplicada'}>
        {category ? <Command key={open ? 'open' : 'closed'}>
          <CommandInput aria-label={'Buscar valores de ' + field.label} placeholder={'Buscar ' + field.label.toLocaleLowerCase('es-AR') + '…'} />
          <CommandList aria-label={'Valores de ' + field.label}><CommandEmpty>Sin valores que coincidan</CommandEmpty>{choices.map(option => <CommandItem key={option.value} value={option.value} keywords={[option.label]} data-current={option.value === rule?.value || undefined} onSelect={next => { onChange(next); setOpen(false); }}><Check size={15} aria-hidden="true" style={{ visibility: option.value === rule?.value ? 'visible' : 'hidden' }} /><span>{option.label}</span></CommandItem>)}</CommandList>
        </Command> : <form className={styles.form} onSubmit={e => { e.preventDefault(); if (!valid) return; onChange(value.trim(), rule?.operator === 'between' ? value2.trim() : undefined); setOpen(false); }}>
          <strong>{field?.label ?? 'Búsqueda'}</strong>
          <label>{rule?.operator === 'between' ? 'Desde' : 'Valor'}<Input autoFocus aria-label={rule ? 'Valor del filtro' : 'Búsqueda aplicada'} type={field?.kind === 'date' ? 'date' : 'text'} inputMode={field?.kind === 'number' ? 'numeric' : undefined} value={value} onChange={e => setValue(e.target.value)} maxLength={1000} /></label>
          {rule?.operator === 'between' && <label>Hasta<Input aria-label="Hasta del filtro" type={field?.kind === 'date' ? 'date' : 'text'} inputMode={field?.kind === 'number' ? 'numeric' : undefined} value={value2} onChange={e => setValue2(e.target.value)} /></label>}
          <div className={styles.formActions}><Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button><Button size="sm" type="submit" disabled={!valid}>Aplicar valor</Button></div>
        </form>}
      </PopoverContent>
    </Popover> : <span className={styles.staticValue} title={label}>{content}</span>}
    <ActionIcon variant="subtle" color="gray" className={styles.remove} aria-label={'Quitar filtro ' + label} title="Quitar filtro" onClick={onRemove}><X size={13} aria-hidden="true" /></ActionIcon>
  </div>;
}

export function FilterLegend({ groups, fields, search = '', onEdit, onClear, actions, extraLabels = [], onChange }: {
  groups: AdvancedFilterGroup[]; search?: string; fields: FilterFieldDefinition[]; onEdit: () => void; onClear: () => void;
  actions?: React.ReactNode; extraLabels?: string[]; onChange?: (groups: AdvancedFilterGroup[], search: string) => void;
}) {
  const legend = useRef<HTMLDivElement>(null);
  const hasFilters = !!(groups.length || search.trim() || extraLabels.length);
  const afterRemove = (next: AdvancedFilterGroup[], query: string) => { onChange?.(next, query); requestAnimationFrame(() => legend.current?.focus({ preventScroll: true })); };
  if (!hasFilters && !actions) return null;
  return <div ref={legend} tabIndex={-1} className={styles.legend}>
    <div className={styles.expression}>
      {!hasFilters && <span className={styles.empty}>Sin filtros aplicados</span>}
      {extraLabels.map((label, i) => <div key={i} className={styles.clause}>{i > 0 && <span className={styles.and}>AND</span>}<span className={styles.legacy}>{label}</span></div>)}
      {!!search.trim() && <div className={styles.clause}>{extraLabels.length > 0 && <span className={styles.and}>AND</span>}
        {onChange ? <FilterBadge search={search} fields={fields} onChange={query => onChange(groups, query)} onRemove={() => afterRemove(groups, '')} /> : <span className={styles.legacy}>Texto libre contiene «{search.trim()}»</span>}
      </div>}
      {groups.map((group, gi) => <div className={styles.clause} key={gi}>
        {(gi > 0 || !!search.trim() || extraLabels.length > 0) && <span className={styles.and}>AND</span>}
        <div className={group.rules.length > 1 ? styles.alternatives : styles.group}>{group.rules.map((rule, ri) => <React.Fragment key={ri}>
          {ri > 0 && <span className={styles.or}>OR</span>}
          {onChange ? <FilterBadge rule={rule} fields={fields} onChange={(value, value2) => onChange(changeFilterRule(groups, gi, ri, { ...rule, value, ...(rule.operator === 'between' ? { value2 } : {}) }), search)} onRemove={() => afterRemove(changeFilterRule(groups, gi, ri, null), search)} /> : <span className={styles.legacy}>{describeFilterRule(rule, fields)}</span>}
        </React.Fragment>)}</div>
      </div>)}
    </div>
    <div className={styles.actions}>{hasFilters && <Button variant="ghost" size="sm" onClick={onEdit}>Editar</Button>}{hasFilters && <Button variant="ghost" size="sm" onClick={onClear}>Limpiar</Button>}{actions}</div>
  </div>;
}
