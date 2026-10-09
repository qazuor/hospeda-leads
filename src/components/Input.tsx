import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Input as MantineInput } from '@mantine/core';
import styles from './ui/CrmControls.module.css';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, size, ...props }, ref) => {
    const [fileLabel,setFileLabel]=useState('Ningún archivo seleccionado');
    if(props.type==='file')return <div className={styles.filePicker} data-disabled={props.disabled||undefined}>
      <span aria-hidden="true" className={styles.fileButton}>Elegir archivo</span><span aria-hidden="true" className={styles.fileName}>{fileLabel}</span>
      <input {...props} ref={ref} className={[styles.fileNative,className].filter(Boolean).join(' ')} onChange={event=>{
        const files=Array.from(event.currentTarget.files??[]);setFileLabel(files.length?files.map(file=>file.name).join(', '):'Ningún archivo seleccionado');props.onChange?.(event);
      }}/>
    </div>;
    return <MantineInput {...props} data-autofocus={props.autoFocus || undefined} ref={ref}
    classNames={{ wrapper: styles.field, input: [styles.input, className].filter(Boolean).join(' ') }} />;
  },
);
Input.displayName = 'Input';
