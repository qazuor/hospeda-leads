import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {useState} from 'react';
import {CreatableMultiSelect,type CreatableOption} from './CreatableMultiSelect';

beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));Element.prototype.scrollIntoView=vi.fn();});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const DATA:CreatableOption[]=[{value:'1',label:'Promoción'},{value:'2',label:'Folletos'},{value:'3',label:'Niños'}];
function Harness({onCreate,initial=[]}:{onCreate:(name:string)=>Promise<CreatableOption>;initial?:string[]}){
 const [value,setValue]=useState<string[]>(initial),[data,setData]=useState(DATA);
 return <MantineProvider env="test"><CreatableMultiSelect label="Categorías" data={data} value={value} onChange={setValue} createLabel={t=>`Crear categoría «${t}»`} creatingLabel="Creando categoría…" onCreate={async name=>{const created=await onCreate(name);setData(d=>[...d,created]);return created;}}/><output data-testid="value">{value.join(',')}</output></MantineProvider>;
}
const field=()=>screen.getByLabelText('Categorías') as HTMLInputElement;
const type=(text:string)=>{fireEvent.focus(field());fireEvent.change(field(),{target:{value:text}});};
const options=()=>screen.queryAllByRole('option').map(o=>o.textContent);
describe('CreatableMultiSelect',()=>{
 it('filters accent-insensitively and picks an option',async()=>{
  render(<Harness onCreate={vi.fn()}/>);type('promo');
  await waitFor(()=>expect(options()).toEqual(['Promoción','Crear categoría «promo»']));
  fireEvent.click(screen.getByRole('option',{name:'Promoción'}));
  expect(screen.getByTestId('value').textContent).toBe('1');expect(field().value).toBe('');
 });
 it('offers to create only without an exact match (accents fold, ñ stays distinct)',async()=>{
  render(<Harness onCreate={vi.fn()}/>);
  type('promocion');await waitFor(()=>expect(options()).toEqual(['Promoción']));
  type('  FOLLETOS ');await waitFor(()=>expect(options()).toEqual(['Folletos']));
  type('Ninos');await waitFor(()=>expect(options()).toEqual(['Crear categoría «Ninos»']));
  type('x');await waitFor(()=>expect(options()).toEqual([]));
 });
 it('creates the category, shows progress, blocks a second attempt and leaves it chosen',async()=>{
  let finish:(o:CreatableOption)=>void=()=>{};
  const onCreate=vi.fn(()=>new Promise<CreatableOption>(resolve=>{finish=resolve;}));
  render(<Harness onCreate={onCreate} initial={['2']}/>);type(' Tarifas 2027 ');
  const create=await screen.findByRole('option',{name:'Crear categoría «Tarifas 2027»'});
  fireEvent.click(create);
  expect(await screen.findByText('Creando categoría…')).toBeTruthy();expect(field().disabled).toBe(true);
  fireEvent.click(create);expect(onCreate).toHaveBeenCalledTimes(1);expect(onCreate).toHaveBeenCalledWith('Tarifas 2027');
  finish({value:'9',label:'Tarifas 2027'});
  await waitFor(()=>expect(screen.getByTestId('value').textContent).toBe('2,9'));
  expect(field().value).toBe('');expect(screen.queryByText('Creando categoría…')).toBeNull();
 });
 it('keeps what was typed and shows the error when creating fails',async()=>{
  const onCreate=vi.fn().mockRejectedValue(new Error('Ya existe una categoría con ese nombre.'));
  render(<Harness onCreate={onCreate}/>);type('Tarifas');
  fireEvent.click(await screen.findByRole('option',{name:'Crear categoría «Tarifas»'}));
  expect((await screen.findByRole('alert')).textContent).toBe('Ya existe una categoría con ese nombre.');
  expect(field().value).toBe('Tarifas');expect(screen.getByTestId('value').textContent).toBe('');
 });
 it('never offers to create a name that exists but is unavailable (e.g. deactivated) and says why',async()=>{
  render(<MantineProvider env="test"><CreatableMultiSelect label="Categorías" data={DATA} value={[]} onChange={vi.fn()} onCreate={vi.fn()} createLabel={t=>`Crear categoría «${t}»`} creatingLabel="Creando…" unavailable={[{label:'Videos viejos',reason:'«Videos viejos» está desactivada: reactivala en Configuración.'}]}/></MantineProvider>);
  type('videos  VIEJOS');
  await waitFor(()=>expect(screen.getByText('«Videos viejos» está desactivada: reactivala en Configuración.')).toBeTruthy());
  expect(options()).toEqual([]);
 });
 it('uses the given comparison key for matches',async()=>{
  render(<MantineProvider env="test"><CreatableMultiSelect label="Categorías" data={[{value:'1',label:'Tarifas-2027'}]} value={[]} onChange={vi.fn()} onCreate={vi.fn()} createLabel={t=>`Crear categoría «${t}»`} creatingLabel="Creando…" compareKey={t=>t.trim().toLowerCase()}/></MantineProvider>);
  type('tarifas 2027');await waitFor(()=>expect(options()).toEqual(['Crear categoría «tarifas 2027»']));
 });
 it('removes a chosen value from its pill and with Backspace on an empty field',async()=>{
  render(<Harness onCreate={vi.fn()} initial={['1','2']}/>);
  fireEvent.click(screen.getByRole('button',{name:'Quitar Promoción'}));
  expect(screen.getByTestId('value').textContent).toBe('2');
  fireEvent.keyDown(field(),{key:'Backspace'});
  expect(screen.getByTestId('value').textContent).toBe('');
 });
});
