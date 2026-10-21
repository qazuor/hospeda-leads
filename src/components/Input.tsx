import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { Input as MantineInput } from '@mantine/core';
import styles from './ui/CrmControls.module.css';
import { useInlineInvalid } from './ui/useInlineInvalid';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, size, ...props }, ref) => {
    const invalid=useInlineInvalid<HTMLInputElement>(props);
    const [fileLabel,setFileLabel]=useState('Ningún archivo seleccionado');
    const describedBy=[props['aria-describedby'],invalid.error?invalid.errorId:undefined].filter(Boolean).join(' ')||undefined;
    // Mantine's Input overwrites aria-describedby, so the link to the inline message is applied on the node itself.
    const node=useRef<HTMLInputElement|null>(null);
    const setRef=(element:HTMLInputElement|null)=>{node.current=element;if(typeof ref==='function')ref(element);else if(ref)ref.current=element;};
    useEffect(()=>{if(describedBy)node.current?.setAttribute('aria-describedby',describedBy);else node.current?.removeAttribute('aria-describedby');},[describedBy]);
    const errorNode=invalid.error?<MantineInput.Error id={invalid.errorId} role="alert">{invalid.error}</MantineInput.Error>:null;
    if(props.type==='file')return <><div className={styles.filePicker} data-disabled={props.disabled||undefined}>
      <span aria-hidden="true" className={styles.fileButton}>Elegir archivo</span><span aria-hidden="true" className={styles.fileName}>{fileLabel}</span>
      <input {...props} ref={setRef} className={[styles.fileNative,className].filter(Boolean).join(' ')} aria-invalid={invalid.error?true:props['aria-invalid']} aria-describedby={describedBy} onInvalid={invalid.onInvalid} onBlur={invalid.onBlur} onChange={event=>{
        const files=Array.from(event.currentTarget.files??[]);setFileLabel(files.length?files.map(file=>file.name).join(', '):'Ningún archivo seleccionado');invalid.onChange(event);
      }}/>
    </div>{errorNode}</>;
    return <><MantineInput {...props} error={invalid.error} onInvalid={invalid.onInvalid} onChange={invalid.onChange} onInput={invalid.onInput} onBlur={invalid.onBlur} data-autofocus={props.autoFocus || undefined} ref={setRef}
    classNames={{ wrapper: styles.field, input: [styles.input, className].filter(Boolean).join(' ') }} />{errorNode}</>;
  },
);
Input.displayName = 'Input';
