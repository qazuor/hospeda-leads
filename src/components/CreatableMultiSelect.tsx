import {useId,useRef,useState} from 'react';
import {Combobox,Pill,PillsInput,useCombobox} from '@mantine/core';
import {strictComparisonName} from '../helpers/dataNormalization';
import {LAYERS} from '../helpers/layers';
import controls from './ui/CrmControls.module.css';
import styles from './MultiSelect.module.css';

/** An option of {@link CreatableMultiSelect}. */
export type CreatableOption={value:string;label:string};
const CREATE='\u0000create';
/**
 * Spec 102 D6: one control that searches, picks and creates (Mantine `Combobox` + `PillsInput`, the documented pattern for a creatable
 * multiselect), with the look of {@link MultiSelect}. Typing filters (accent-insensitive, ñ distinct from n, like the rest of the search);
 * without an exact match the last option is `createLabel(text)`. Creating shows `creatingLabel`, blocks another attempt and leaves the new
 * option chosen; an error stays below the control with the text intact. `onCreate` does the server call and returns the new option.
 * `compareKey` must be the server's comparison (so «Crear» is never offered for a name the server rejects); `unavailable` lists names that exist
 * but cannot be picked (deactivated), shown with their reason instead of «Crear».
 */
export function CreatableMultiSelect({label,data,value,onChange,onCreate,createLabel,creatingLabel,disabled=false,minCreateLength=2,maxCreateLength=100,nothingFoundMessage='No hay opciones con ese nombre',placeholder,compareKey=strictComparisonName,unavailable=[]}:{compareKey?:(text:string)=>string;unavailable?:readonly {label:string;reason:string}[];label:string;data:readonly CreatableOption[];value:readonly string[];onChange:(next:string[])=>void;onCreate:(name:string)=>Promise<CreatableOption>;createLabel:(text:string)=>string;creatingLabel:string;disabled?:boolean;minCreateLength?:number;maxCreateLength?:number;nothingFoundMessage?:string;placeholder?:string}){
 const id=useId(),combobox=useCombobox({onDropdownClose:()=>combobox.resetSelectedOption()});
 const [search,setSearch]=useState(''),[creating,setCreating]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 const text=search.trim(),key=compareKey(text);
 const chosen=value.map(v=>data.find(o=>o.value===v)??{value:v,label:v});
 const visible=data.filter(o=>!value.includes(o.value)&&(!key||compareKey(o.label).includes(key)));
 const exact=data.some(o=>compareKey(o.label)===key),blocked=key?unavailable.find(u=>compareKey(u.label)===key):undefined;
 const canCreate=text.length>=minCreateLength&&text.length<=maxCreateLength&&!exact&&!blocked;
 const off=disabled||creating;
 async function create(){
  if(lock.current)return;lock.current=true;setCreating(true);setError('');
  try{const created=await onCreate(text);onChange([...value.filter(v=>v!==created.value),created.value]);setSearch('');}
  catch(e){setError(e instanceof Error?e.message:'No se pudo crear.');}
  finally{lock.current=false;setCreating(false);}
 }
 function submit(option:string){
  if(option===CREATE){combobox.closeDropdown();void create();return;}
  onChange([...value,option]);setSearch('');setError('');
 }
 const remove=(v:string)=>onChange(value.filter(x=>x!==v));
 return <div className={controls.field}>
  <Combobox store={combobox} onOptionSubmit={submit} withinPortal zIndex={LAYERS.combobox} classNames={{dropdown:controls.dropdown,option:controls.option}}>
   <Combobox.DropdownTarget>
    <PillsInput id={id} label={label} disabled={off} onClick={()=>{if(!off)combobox.openDropdown()}} classNames={{label:styles.label,input:[controls.input,styles.input].join(' ')}}>
     <Pill.Group>
      {chosen.map(o=><Pill key={o.value} withRemoveButton={!off} removeButtonProps={{'aria-label':`Quitar ${o.label}`,'aria-hidden':false,tabIndex:0}} onRemove={()=>remove(o.value)}>{o.label}</Pill>)}
      <Combobox.EventsTarget>
       <PillsInput.Field className={styles.inputField} value={search} disabled={off} maxLength={maxCreateLength} placeholder={chosen.length?undefined:placeholder}
        onFocus={()=>combobox.openDropdown()} onBlur={()=>combobox.closeDropdown()}
        onChange={e=>{setSearch(e.currentTarget.value);setError('');combobox.openDropdown();combobox.updateSelectedOptionIndex();}}
        onKeyDown={e=>{if(e.key==='Backspace'&&!search&&value.length){e.preventDefault();remove(value[value.length-1]);}}}/>
      </Combobox.EventsTarget>
     </Pill.Group>
    </PillsInput>
   </Combobox.DropdownTarget>
   <Combobox.Dropdown>
    <Combobox.Options>
     {visible.map(o=><Combobox.Option key={o.value} value={o.value}>{o.label}</Combobox.Option>)}
     {canCreate&&<Combobox.Option value={CREATE}>{createLabel(text)}</Combobox.Option>}
     {blocked&&<Combobox.Empty>{blocked.reason}</Combobox.Empty>}
     {!visible.length&&!canCreate&&!blocked&&<Combobox.Empty>{nothingFoundMessage}</Combobox.Empty>}
    </Combobox.Options>
   </Combobox.Dropdown>
  </Combobox>
  {creating&&<span role="status" className={styles.label}>{creatingLabel}</span>}
  {error&&<span role="alert">{error}</span>}
 </div>;
}
