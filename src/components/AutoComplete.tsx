import { useState, useEffect, type ReactNode } from 'react';
import { Combobox, InputBase, Loader, useCombobox } from '@mantine/core';
import styles from './ui/CrmControls.module.css';

export type Option<T = unknown> = { value: string; label: ReactNode; displayText?: string; metadata?: T };
const getDisplayText = <T,>(option: Option<T>): string => option.displayText || (typeof option.label === 'string' ? option.label : option.value);
type Props<T> = { options: Option<T>[]; emptyMessage: string; value?: Option<T>; onValueChange?: (value: Option<T>) => void; inputValue: string; onInputValueChange: (value: string) => void; isLoading?: boolean; disabled?: boolean; placeholder?: string; allowFreeForm?: boolean };
export function AutoComplete<T = unknown>({ options, emptyMessage, value, onValueChange, inputValue, onInputValueChange, isLoading = false, disabled, placeholder, allowFreeForm = false }: Props<T>) {
  const [selected, setSelected] = useState(value);
  useEffect(() => { setSelected(value); }, [value]);
  const store = useCombobox({ onDropdownClose: () => store.resetSelectedOption() });
  const filtered = options.filter(option => getDisplayText(option).toLocaleLowerCase().includes(inputValue.toLocaleLowerCase()));
  return <Combobox store={store} withinPortal zIndex={435} onOptionSubmit={key => {
    const option = options.find(item => item.value === key); if (!option) return;
    setSelected(option); onInputValueChange(getDisplayText(option)); onValueChange?.(option); store.closeDropdown();
  }}>
    <Combobox.Target><InputBase value={inputValue} disabled={disabled} placeholder={placeholder} aria-label={placeholder ?? 'Seleccionar opción'}
      classNames={{ input: styles.input }} rightSection={isLoading ? <Loader size={16} /> : <Combobox.Chevron />}
      onChange={event => { if (isLoading) return; onInputValueChange(event.currentTarget.value); store.openDropdown(); store.resetSelectedOption(); }}
      onFocus={() => store.openDropdown()} onClick={() => store.openDropdown()}
      onBlur={() => { store.closeDropdown(); if (!allowFreeForm) onInputValueChange(selected ? getDisplayText(selected) : ''); }} />
    </Combobox.Target>
    <Combobox.Dropdown className={styles.dropdown}><Combobox.Options mah={300} style={{ overflowY: 'auto' }}>
      {isLoading ? <Combobox.Empty>Cargando…</Combobox.Empty> : filtered.length ? filtered.map(option => <Combobox.Option className={styles.option} key={option.value} value={option.value}>{option.label}</Combobox.Option>) : <Combobox.Empty>{emptyMessage}</Combobox.Empty>}
    </Combobox.Options></Combobox.Dropdown>
  </Combobox>;
}
