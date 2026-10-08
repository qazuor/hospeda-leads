import React, { createContext, useContext, useState } from 'react';
import { Box, Combobox, useCombobox } from '@mantine/core';
import { Search } from 'lucide-react';
import { normalizeSearchText } from '../helpers/searchText';
import styles from './Command.module.css';

interface ItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> { value: string; keywords?: string[]; disabled?: boolean; onSelect?: (value: string) => void }
const Context = createContext({ query: '', count: 0, setQuery: (_query: string) => {} });
const text = (children: React.ReactNode): string => React.Children.toArray(children).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : React.isValidElement<{ children?: React.ReactNode }>(child) ? text(child.props.children) : '').join(' ');
const matches = (item: ItemProps, query: string) => normalizeSearchText([item.value, ...(item.keywords ?? []), text(item.children)].join(' ')).includes(normalizeSearchText(query));
function collect(children: React.ReactNode): ItemProps[] {
  return React.Children.toArray(children).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? child.type === CommandItem ? [child.props as ItemProps] : collect(child.props.children) : []);
}
export const Command = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { label?: string }>(({ children, className, label, ...props }, ref) => {
  const [query, setQuery] = useState(''); const items = collect(children); const filtered = items.filter(item => matches(item, query));
  const store = useCombobox({ defaultOpened: true });
  return <Context.Provider value={{ query, count: filtered.length, setQuery: next => { setQuery(next); store.resetSelectedOption(); } }}>
    <Combobox store={store} onOptionSubmit={value => items.find(item => item.value === value)?.onSelect?.(value)}>
      <Box {...props} ref={ref} aria-label={label} className={[styles.command, className].filter(Boolean).join(' ')}>{children}</Box>
    </Combobox>
  </Context.Provider>;
});
export const CommandInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { onValueChange?: (value: string) => void }>(({ onValueChange, onChange, value, className, ...props }, ref) => {
  const ctx = useContext(Context);
  return <Combobox.Search {...props} ref={ref} value={value ?? ctx.query} data-autofocus aria-label={props['aria-label'] ?? props.placeholder ?? 'Buscar opciones'}
    leftSection={<Search size={16} />} classNames={{ input: className }}
    onChange={event => { ctx.setQuery(event.currentTarget.value); onValueChange?.(event.currentTarget.value); onChange?.(event); }} />;
});
export const CommandList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <Combobox.Options {...props} ref={ref} className={[styles.commandList, className].filter(Boolean).join(' ')} />);
export const CommandEmpty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => useContext(Context).count ? null : <Combobox.Empty {...props} ref={ref} />);
export const CommandItem = React.forwardRef<HTMLDivElement, ItemProps>(({ keywords, onSelect, className, ...props }, ref) => {
  const ctx = useContext(Context); if (!matches({ ...props, keywords }, ctx.query)) return null;
  return <Combobox.Option {...props} ref={ref} className={[styles.commandItem, className].filter(Boolean).join(' ')} />;
});
