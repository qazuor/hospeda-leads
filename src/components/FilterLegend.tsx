import React, { useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { AdvancedFilterGroup, AdvancedFilterRule } from '../endpoints/leads_GET.schema';
import { changeFilterRule, describeFilterRule, needsValue, type FilterFieldDefinition } from '../helpers/filterRules';
import { Button } from './Button';
import { Input } from './Input';
import { FilterRuleFields } from './FilterRuleFields';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import styles from './FilterBuilderDialog.module.css';

function EditableFilter({ label, rule, search, fields, onApply, onRemove }: {
  label: string; rule?: AdvancedFilterRule; search?: string; fields: FilterFieldDefinition[];
  onApply: (rule: AdvancedFilterRule | undefined, search: string) => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(rule), [draftSearch, setDraftSearch] = useState(search ?? '');
  const valid = draft ? fields.some(f => f.key === draft.field) && (!needsValue(draft.operator) || !!draft.value?.trim() && (draft.operator !== 'between' || !!draft.value2?.trim())) : !!draftSearch.trim();
  return <Popover open={open} onOpenChange={next => { if (next) { setDraft(rule ? { ...rule } : undefined); setDraftSearch(search ?? ''); } setOpen(next); }}>
    <PopoverTrigger asChild><Button variant="outline" size="sm" className={styles.filterBadge} aria-label={'Editar filtro ' + label}>{label}<Pencil size={13} aria-hidden="true" /></Button></PopoverTrigger>
    <PopoverContent transitionDuration={0} className={styles.filterPopover} aria-label={rule ? 'Editar condición de filtro' : 'Editar búsqueda aplicada'}>
      <form onSubmit={e => { e.preventDefault(); if (!valid) return; onApply(draft, draftSearch.trim()); setOpen(false); }}>
        <strong>{rule ? 'Editar condición' : 'Editar búsqueda'}</strong>
        {draft ? <FilterRuleFields labelled rule={draft} fields={fields} onChange={setDraft} /> : <label>Texto libre de búsqueda<Input autoFocus aria-label="Búsqueda aplicada" value={draftSearch} onChange={e => setDraftSearch(e.target.value)} maxLength={1000} /></label>}
        {!valid && <p className={styles.filterHelp}>Completá los valores de la condición para aplicar.</p>}
        <p className={styles.filterHelp}>Se conserva la relación AND/OR con los demás filtros.</p>
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); onRemove(); }}><Trash2 size={14} aria-hidden="true" />Quitar este filtro</Button>
        <div className={styles.filterActions}><Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button><Button size="sm" type="submit" disabled={!valid}>Aplicar condición</Button></div>
      </form>
    </PopoverContent>
  </Popover>;
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
    <div className={styles.legendExpression}>
      {!hasFilters && <span>Sin filtros aplicados</span>}
      {extraLabels.length > 0 && <div className={styles.legendGroup}>{extraLabels.map((label, i) => <span key={i} className={styles.legendRule}>{i > 0 && <span className={styles.legendAnd}>AND </span>}{label}</span>)}</div>}
      {!!search.trim() && <>{extraLabels.length > 0 && <span className={styles.legendAnd}>AND</span>}<div className={styles.legendGroup}>
        {onChange ? <EditableFilter label={'Texto libre contiene «' + search.trim() + '»'} search={search} fields={fields} onApply={(_, query) => onChange(groups, query)} onRemove={() => afterRemove(groups, '')} /> : <span className={styles.legendRule}>Texto libre contiene «{search.trim()}»</span>}
      </div></>}
      {groups.map((group, gi) => <React.Fragment key={gi}>
        {(gi > 0 || !!search.trim() || extraLabels.length > 0) && <span className={styles.legendAnd}>AND</span>}
        <div className={styles.legendGroup}>{group.rules.map((rule, ri) => <React.Fragment key={ri}>
          {ri > 0 && <span className={styles.legendOr}>OR</span>}
          {onChange ? <EditableFilter label={describeFilterRule(rule, fields)} rule={rule} fields={fields} onApply={next => { if (next) onChange(changeFilterRule(groups, gi, ri, next), search); }} onRemove={() => afterRemove(changeFilterRule(groups, gi, ri, null), search)} /> : <span className={styles.legendRule}>{describeFilterRule(rule, fields)}</span>}
        </React.Fragment>)}</div>
      </React.Fragment>)}
    </div>
    <div className={styles.legendActions}>{hasFilters && <Button variant="ghost" size="sm" onClick={onEdit}>Editar</Button>}{hasFilters && <Button variant="ghost" size="sm" onClick={onClear}>Limpiar</Button>}{actions}</div>
  </div>;
}
