import {forwardRef} from 'react';
import {DateInput,MonthPickerInput,type DateInputProps} from '@mantine/dates';
import styles from './CrmControls.module.css';

/** Parse display text without timezone conversion; callers keep ISO calendar days. */
export function parseCalendarInput(text:string):string|null {
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  const local=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if(!iso&&!local)return null;
  const [year,month,day]=iso?iso.slice(1).map(Number):[Number(local![3]),Number(local![2]),Number(local![1])];
  const date=new Date(0);date.setUTCHours(0,0,0,0);date.setUTCFullYear(year,month-1,day);
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day
    ?`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
}
type Props=Omit<DateInputProps,'value'|'defaultValue'|'onChange'|'min'|'max'> & {
  value:string;onValueChange:(value:string)=>void;min?:string;max?:string;
};
export const CrmDateInput=forwardRef<HTMLInputElement,Props>(({value,onValueChange,className,min,max,...props},ref)=><DateInput
  {...props} ref={ref} value={value||null} onChange={next=>onValueChange(next??'')}
  minDate={min||undefined} maxDate={max||undefined} locale="es" valueFormat="DD/MM/YYYY" dateParser={parseCalendarInput}
  ariaLabels={{nextMonth:"Mes siguiente",previousMonth:"Mes anterior",nextYear:"Año siguiente",previousYear:"Año anterior",nextDecade:"Década siguiente",previousDecade:"Década anterior",monthLevelControl:"Elegir mes",yearLevelControl:"Elegir año"}}
  placeholder={props.placeholder??'dd/mm/aaaa'} data-autofocus={props.autoFocus||undefined}
  popoverProps={{zIndex:430,floatingStrategy:'fixed'}}
  classNames={{wrapper:styles.field,input:[styles.input,className].filter(Boolean).join(' ')}}/>
);
CrmDateInput.displayName='CrmDateInput';

export function CrmMonthInput({value,onValueChange,required}:{value:string;onValueChange:(value:string)=>void;required?:boolean}) {
  return <MonthPickerInput required={required} value={value?value+'-01':null} onChange={next=>onValueChange(next?.slice(0,7)??'')}
    aria-label="Mes" locale="es" valueFormat="MMMM YYYY" monthsListFormat="MMMM" nextLabel="Año siguiente" previousLabel="Año anterior" popoverProps={{zIndex:430,floatingStrategy:'fixed'}}
    classNames={{wrapper:styles.field,input:styles.input}}/>;
}
