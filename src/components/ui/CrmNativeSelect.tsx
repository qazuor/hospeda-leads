import React from 'react';
import { NativeSelect, type NativeSelectProps } from '@mantine/core';
import styles from './CrmControls.module.css';

/** Keep native option/keyboard semantics where search is unnecessary. */
export const CrmNativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(function CrmNativeSelect(props, ref) {
  return <NativeSelect {...props} ref={ref} classNames={{ input: styles.input }} />;
});
