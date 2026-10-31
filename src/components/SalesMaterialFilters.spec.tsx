import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {EMPTY_SALES_MATERIAL_FILTERS,type SalesMaterialFilters} from '../helpers/salesMaterialGroups';
import {SalesMaterialFiltersBar} from './SalesMaterialFilters';

beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const onChange=vi.fn();
const setup=(value:SalesMaterialFilters,admin=true,verticals:string[]=['Alojamiento','Gastronomía'])=>render(<MantineProvider><SalesMaterialFiltersBar admin={admin} categories={[{id:'1',name:'Folletos',active:true},{id:'2',name:'Viejos',active:false}]} verticals={verticals} value={value} onChange={onChange}/></MantineProvider>);
describe('SalesMaterialFiltersBar',()=>{
 it('shows «Limpiar filtros» only while a filter is active and resets every filter',()=>{
  setup(EMPTY_SALES_MATERIAL_FILTERS);expect(screen.queryByRole('button',{name:'Limpiar filtros'})).toBeNull();cleanup();
  setup({search:'tarifa',categoryIds:['1'],format:'pdf',status:'internal',vertical:'Alojamiento'});
  fireEvent.click(screen.getByRole('button',{name:'Limpiar filtros'}));expect(onChange).toHaveBeenCalledWith(EMPTY_SALES_MATERIAL_FILTERS);
 });
 it('changes one filter at a time and keeps the others',()=>{
  const value:SalesMaterialFilters={...EMPTY_SALES_MATERIAL_FILTERS,search:'a'};setup(value);
  fireEvent.change(screen.getByLabelText('Formato'),{target:{value:'video'}});expect(onChange).toHaveBeenLastCalledWith({...value,format:'video'});
  fireEvent.click(screen.getByLabelText('Entregables'));expect(onChange).toHaveBeenLastCalledWith({...value,status:'deliverable'});
  fireEvent.change(screen.getByLabelText('Buscar material'),{target:{value:'b'}});expect(onChange).toHaveBeenLastCalledWith({...value,search:'b'});
  fireEvent.change(screen.getByLabelText('Vertical'),{target:{value:'Gastronomía'}});expect(onChange).toHaveBeenLastCalledWith({...value,vertical:'Gastronomía'});
 });
 it('spec 102: hides «Vertical» while the catalog is empty',()=>{
  setup(EMPTY_SALES_MATERIAL_FILTERS,true,[]);expect(screen.queryByLabelText('Vertical')).toBeNull();
 });
 it('offers «Archivados» only to admins',()=>{
  setup(EMPTY_SALES_MATERIAL_FILTERS,false);expect(screen.queryByLabelText('Archivados')).toBeNull();expect(screen.getByLabelText('Internos')).toBeTruthy();cleanup();
  setup(EMPTY_SALES_MATERIAL_FILTERS,true);expect(screen.getByLabelText('Archivados')).toBeTruthy();
 });
});
