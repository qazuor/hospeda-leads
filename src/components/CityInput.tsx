import {Autocomplete,type ComboboxItem,type OptionsFilter} from '@mantine/core';
import styles from './ui/CrmControls.module.css';
import {LAYERS} from '../helpers/layers';
import {filterCityOptions} from '../helpers/catalogCity';

/**
 * Free-text city that suggests the catalog cities while typing (spec 104, 37), compared without accents or case but keeping ñ ≠ n.
 * Nothing forces a catalog value: the caller adjusts to the catalog spelling on save (`cityToSave`). Place it inside the caller's `<label>`.
 */
export function CityInput({value,onValueChange,cities,disabled,placeholder}:{value:string;onValueChange:(value:string)=>void;cities:readonly string[];disabled?:boolean;placeholder?:string}){
 const filter:OptionsFilter=({options,search})=>{const items=options as ComboboxItem[],allowed=new Set(filterCityOptions({search,cities:items.map(o=>o.label)}));return items.filter(o=>allowed.has(o.label));};
 return <Autocomplete value={value} onChange={onValueChange} data={[...new Set(cities)]} filter={filter} limit={8} disabled={disabled} placeholder={placeholder}
  comboboxProps={{withinPortal:true,zIndex:LAYERS.combobox}} classNames={{wrapper:styles.field,input:styles.input,dropdown:styles.dropdown,option:styles.option}}/>;
}
