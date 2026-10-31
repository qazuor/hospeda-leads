import React,{useState} from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {CrmTimeInput} from './CrmTimeInput';
import {CrmDateInput} from './CrmDateInput';

beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
});
afterEach(cleanup);

function Time({initial='',required=false,max,maxMessage,withLimitToggle=false}:{initial?:string;required?:boolean;max?:string;maxMessage?:string;withLimitToggle?:boolean}){
 const [value,setValue]=useState(initial),[limited,setLimited]=useState(true);
 return <MantineProvider><form><label>Hora<CrmTimeInput label="Hora" value={value} onValueChange={setValue} required={required} max={limited?max:undefined} maxMessage={maxMessage}/></label><output data-testid="value">{value}</output>{withLimitToggle&&<button type="button" onClick={()=>setLimited(false)}>Otro día</button>}</form></MantineProvider>;
}
const hours=()=>screen.getByLabelText('Hora') as HTMLInputElement;
const minutes=()=>screen.getByRole('spinbutton',{name:'Minutos'}) as HTMLInputElement;

describe('CrmTimeInput (spec 104 §3.10, 33)',()=>{
 it('shows 15:00 in 24 h, never «03:00 PM»',()=>{
  render(<Time initial="15:00"/>);
  expect([hours().value,minutes().value]).toEqual(['15','00']);
  expect(document.body.textContent).not.toMatch(/PM|AM/);
 });
 it('reports HH:mm once hours and minutes are typed',()=>{
  render(<Time/>);
  fireEvent.change(hours(),{target:{value:'15'}});fireEvent.change(minutes(),{target:{value:'30'}});
  expect(screen.getByTestId('value').textContent).toBe('15:30');
 });
 it('an empty required time says «Completá este dato.» in Spanish instead of the native bubble',()=>{
  render(<Time required/>);
  act(()=>{hours().checkValidity();});
  expect(screen.getByRole('alert').textContent).toBe('Completá este dato.');
 });
 it('a time after the maximum is invalid with the caller message',()=>{
  render(<Time initial="15:00" max="14:05" maxMessage="No puede ser posterior a hoy 14:05."/>);
  expect(hours().validity.customError).toBe(true);
  act(()=>{hours().checkValidity();});
  expect(screen.getByRole('alert').textContent).toBe('No puede ser posterior a hoy 14:05.');
 });
});

describe('CrmTimeInput when the limit changes (review LOW)',()=>{
 it('the «posterior» message goes away when the date changes and the limit no longer applies',()=>{
  render(<Time initial="15:00" max="14:05" maxMessage="No puede ser posterior a hoy 14:05." withLimitToggle/>);
  act(()=>{hours().checkValidity();});
  expect(screen.getByRole('alert').textContent).toBe('No puede ser posterior a hoy 14:05.');
  fireEvent.click(screen.getByRole('button',{name:'Otro día'}));
  expect(hours().validity.valid).toBe(true);
  expect(screen.queryByRole('alert')).toBeNull();
 });
});

describe('CrmDateInput validation',()=>{
 it('an empty required date says «Completá este dato.» instead of «Please fill out this field.»',()=>{
  render(<MantineProvider><form><label>Fecha<CrmDateInput required value="" onValueChange={()=>{}}/></label></form></MantineProvider>);
  const input=screen.getByLabelText('Fecha') as HTMLInputElement;
  act(()=>{input.checkValidity();});
  expect(screen.getByRole('alert').textContent).toBe('Completá este dato.');
 });
});
