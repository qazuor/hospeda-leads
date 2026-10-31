import {useEffect,useRef} from 'react';
import {Input as MantineInput} from '@mantine/core';
import {TimePicker} from '@mantine/dates';
import styles from './CrmControls.module.css';
import {useInlineInvalid} from './useInlineInvalid';

/** Props of `CrmTimeInput`: the value is an Argentina wall time `HH:mm` (or '' while empty or incomplete). */
export type CrmTimeInputProps={
 value:string;onValueChange:(value:string)=>void;required?:boolean;disabled?:boolean;
 /** Accessible name of the hours segment (the visible label text); the minutes segment is «Minutos». */
 label:string;
 /** Latest allowed time `HH:mm`; a later value is invalid with `maxMessage` (the seller fixes it, it is never clamped silently). */
 max?:string;maxMessage?:string;
};

/**
 * Time field in 24 h (spec 104, 33) over Mantine's `TimePicker`: hours and minutes are two numeric segments, so the browser language never
 * turns «15:00» into «03:00 PM». The caller shows the visible label; `label` names the hours segment (the label text around two segments would read «Hora : 00»).
 * Validation shows the Spanish inline message of `useInlineInvalid` instead of the native bubble.
 */
export function CrmTimeInput({value,onValueChange,required,disabled,label,max,maxMessage}:CrmTimeInputProps){
 const hours=useRef<HTMLInputElement>(null);
 const invalid=useInlineInvalid<HTMLInputElement>({});
 const late=!!(value&&max&&value>max);
 const reset=useRef(invalid.reset),refresh=useRef(invalid.refresh);reset.current=invalid.reset;refresh.current=invalid.refresh;
 // A new limit (the date changed) re-reads a message already shown, so «posterior a hoy…» does not stay after it stopped applying.
 useEffect(()=>{hours.current?.setCustomValidity(late?maxMessage??`No puede ser posterior a las ${max}.`:'');refresh.current(hours.current);},[late,max,maxMessage]);
 useEffect(()=>{if(!hours.current?.validity.customError)reset.current(hours.current);},[value]);
 const segment={required,onInvalid:invalid.onInvalid,onBlur:invalid.onBlur,'aria-invalid':invalid.error?true:undefined,'aria-describedby':invalid.error?invalid.errorId:undefined};
 return <><TimePicker format="24h" value={value} onChange={onValueChange} disabled={disabled} hoursRef={hours} hoursInputLabel={label} minutesInputLabel="Minutos"
  hoursInputProps={segment} minutesInputProps={segment} error={invalid.error?true:undefined}
  classNames={{wrapper:styles.field,input:styles.input}}/>
  {invalid.error&&<MantineInput.Error id={invalid.errorId} role="alert">{invalid.error}</MantineInput.Error>}</>;
}
