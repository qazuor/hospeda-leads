import React from 'react';
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {BusinessClassificationsField} from './BusinessClassificationsField';

beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
const mount=(ui:React.ReactNode)=>render(<MantineProvider>{ui}</MantineProvider>);
const settings={types:['Alojamiento','Gastronomía'],subtypes:[{id:'1',typeName:'Alojamiento',name:'Hotel'},{id:'2',typeName:'Gastronomía',name:'Restaurante'}]} as never;
describe('BusinessClassificationsField',()=>{
 it('adds, removes and caps rows at eight',()=>{const onChange=vi.fn();const value=[{tipo:'Alojamiento',subtipo:'Hotel'}];const {rerender}=mount(<BusinessClassificationsField value={value} settings={settings} onChange={onChange}/>);fireEvent.click(screen.getByRole('button',{name:'Agregar otra vertical'}));expect(onChange).toHaveBeenCalledWith([...value,{tipo:'',subtipo:null}]);rerender(<MantineProvider><BusinessClassificationsField value={Array.from({length:8},(_,i)=>({tipo:'Alojamiento',subtipo:String(i)}))} settings={settings} onChange={onChange}/>);</MantineProvider>);expect(screen.queryByRole('button',{name:'Agregar otra vertical'})).toBeNull();fireEvent.click(screen.getAllByRole('button',{name:'Quitar'})[0]);expect(onChange).toHaveBeenLastCalledWith(Array.from({length:7},(_,i)=>({tipo:'Alojamiento',subtipo:String(i+1)})));});
 it('shows an out of catalog value as historical',()=>{mount(<BusinessClassificationsField value={[{tipo:'Posada histórica',subtipo:'Hospedaje viejo'}]} settings={settings} onChange={()=>{}}/>);expect(screen.getByRole('option',{name:'Posada histórica (histórico)'})).toBeTruthy();expect(screen.getByRole('option',{name:'Hospedaje viejo (histórico)'})).toBeTruthy();});
 it('filters subtype options by each row vertical',()=>{mount(<BusinessClassificationsField value={[{tipo:'Alojamiento',subtipo:null}]} settings={settings} onChange={()=>{}}/>);expect(screen.getByRole('option',{name:'Hotel'})).toBeTruthy();expect(screen.queryByRole('option',{name:'Restaurante'})).toBeNull();});
});
