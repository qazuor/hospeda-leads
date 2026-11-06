import React from 'react';
import {NativeSelect} from './NativeSelect';
import type {SettingsOutput} from '../endpoints/settings_GET.schema';

export type BusinessClassification={tipo:string;subtipo:string|null};
type Props={value:BusinessClassification[];settings?:SettingsOutput;disabled?:boolean;onChange:(value:BusinessClassification[])=>void;max?:number};
/** Editable business vertical/subtype pairs. Values outside the live catalog stay visible until changed. */
export function BusinessClassificationsField({value,settings,disabled=false,onChange,max=8}:Props){
 const update=(index:number,pair:BusinessClassification)=>onChange(value.map((item,i)=>i===index?pair:item));
 return <div style={{display:'grid',gap:12}}>
  {value.map((pair,index)=>{
   const subtypes=settings?.subtypes.filter(item=>item.typeName===pair.tipo)??[];
   const historicalType=!settings||!settings.types.includes(pair.tipo),historicalSubtype=!!pair.subtipo&&(!settings||!subtypes.some(item=>item.name===pair.subtipo));
   return <div key={index} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr) auto',gap:8,alignItems:'end'}}>
    <label>Vertical<NativeSelect disabled={disabled} value={pair.tipo} onChange={event=>update(index,{tipo:event.target.value,subtipo:null})}><option value="">Sin clasificar</option>{historicalType&&<option value={pair.tipo}>{pair.tipo}{settings?' (histórico)':''}</option>}{(settings?.types??[]).map(item=><option key={item}>{item}</option>)}</NativeSelect></label>
    <label>Subtipo<NativeSelect disabled={disabled||!pair.tipo} value={pair.subtipo??''} onChange={event=>update(index,{...pair,subtipo:event.target.value||null})}><option value="">Sin asignar</option>{historicalSubtype&&<option value={pair.subtipo!}>{pair.subtipo}{settings?' (histórico)':''}</option>}{subtypes.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}</NativeSelect></label>
    {value.length>1&&<button type="button" disabled={disabled} onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Quitar</button>}
   </div>;
  })}
  {value.length<max&&<button type="button" disabled={disabled} onClick={()=>onChange([...value,{tipo:'',subtipo:null}])}>Agregar otra vertical</button>}
 </div>;
}
