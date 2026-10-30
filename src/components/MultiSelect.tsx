import {MultiSelect as MantineMultiSelect,type MultiSelectProps} from '@mantine/core';
import {LAYERS} from '../helpers/layers';
import controls from './ui/CrmControls.module.css';
import styles from './MultiSelect.module.css';

/**
 * Mantine MultiSelect with the CRM field look (same height, font, colors and label as `NativeSelect`/`Input` inside a `<label>`).
 * The options open above dialogs (`LAYERS.combobox`), since it is used inside forms like «Nuevo material».
 * `allLabel` is the text shown when nothing is picked (e.g. «Todas»): it reads as a value, like the first option of a native select.
 */
export function MultiSelect({allLabel,classNames,comboboxProps,...props}:MultiSelectProps&{allLabel?:string}){
 const empty=!(props.value??props.defaultValue??[]).length;
 return <MantineMultiSelect {...props} placeholder={empty?allLabel??props.placeholder:undefined} comboboxProps={{withinPortal:true,zIndex:LAYERS.combobox,...comboboxProps}}
  classNames={{root:controls.field,label:styles.label,input:[controls.input,styles.input].join(' '),inputField:[styles.inputField,allLabel?styles.allValue:''].join(' '),dropdown:controls.dropdown,option:controls.option,...(classNames as object)}}/>;
}
