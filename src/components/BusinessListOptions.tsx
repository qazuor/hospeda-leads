import React from 'react';
import {BUSINESS_COLUMNS,type ListPreferences} from '../helpers/businessListPreferences';
import {Button} from './Button';
export function BusinessListOptions({value,onChange}:{value:ListPreferences;onChange:(v:ListPreferences)=>void}){
 const change=(patch:Partial<ListPreferences>)=>onChange({...value,...patch});
 return <details><summary>Campos, orden y columnas fijas</summary><p>Nombre y Abrir siempre están disponibles. La fijación funciona en tabla de escritorio y deja espacio para desplazarte.</p>
 <div style={{display:'grid',gap:12}}>{[...value.columns,...BUSINESS_COLUMNS.map(c=>c.key).filter(k=>!value.columns.includes(k))].map(key=>{const index=value.columns.indexOf(key);const label=BUSINESS_COLUMNS.find(c=>c.key===key)!.label;return <div key={key} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
 <label><input type="checkbox" checked={index>=0} disabled={key==='nombre'} onChange={()=>change({columns:index>=0?value.columns.filter(k=>k!==key):[...value.columns,key]})}/>{label}</label>
 {index>=0&&<><Button size="sm" variant="outline" aria-label={'Subir '+label} disabled={index===0} onClick={()=>{const columns=[...value.columns];[columns[index-1],columns[index]]=[columns[index],columns[index-1]];change({columns});}}>↑</Button><Button size="sm" variant="outline" aria-label={'Bajar '+label} disabled={index===value.columns.length-1} onClick={()=>{const columns=[...value.columns];[columns[index],columns[index+1]]=[columns[index+1],columns[index]];change({columns});}}>↓</Button>
 <label>Ancho de {label}<input aria-label={'Ancho de '+label} type="number" min={100} max={600} value={value.widths[key]??160} style={{width:75}} onChange={e=>change({widths:{...value.widths,[key]:Math.max(100,Math.min(600,Number(e.target.value)))}})}/></label>
 <label>Fijar {label}<select value={value.pins[key]??''} onChange={e=>{const pins={...value.pins};if(e.target.value)pins[key]=e.target.value as 'left'|'right';else delete pins[key];change({pins});}}><option value="">Sin fijación</option><option value="left">Izquierda</option><option value="right">Derecha</option></select></label></>}
 </div>;})}</div></details>;
}
