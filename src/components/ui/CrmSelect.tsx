import React from 'react';
import { Select, type SelectProps, type ComboboxParsedItem } from '@mantine/core';
import { normalizeSearchText } from '../../helpers/searchText';
import styles from './CrmControls.module.css';

export function CrmSelect(props: SelectProps) {
  return <Select searchable nothingFoundMessage="Sin resultados" allowDeselect={false}
    filter={({ options, search }) => {
      const query = normalizeSearchText(search);
      return options.flatMap<ComboboxParsedItem>(option => {
        if ('group' in option) {
          const items = option.items.filter(item => normalizeSearchText(item.label).includes(query));
          return items.length ? [{ ...option, items }] : [];
        }
        return normalizeSearchText(option.label).includes(query) ? [option] : [];
      });
    }}
    {...props}
    comboboxProps={{ withinPortal: false, ...props.comboboxProps }}
    classNames={{ input: styles.input, option: styles.option, dropdown: styles.dropdown }} />;
}
